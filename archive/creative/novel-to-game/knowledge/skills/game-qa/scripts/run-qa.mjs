/** Chrome CDP evidence runner. The Host supplies a private signing key for accepted runs. */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, mkdtemp, rm, readdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, relative, extname, join } from 'node:path'
import { createHash, createHmac, randomUUID } from 'node:crypto'

const root = await realpath(resolve(process.argv[2] ?? '.'))
const workspace = await realpath(resolve(process.env.DSH_GAME_QA_WORKSPACE ?? process.cwd()))
const qa = join(root, 'qa')
const app = await realpath(join(root, 'build/app'))
if (!relative(workspace, app) || relative(workspace, app).startsWith('..')) throw new Error('Game must be inside the Session workspace')
await mkdir(qa, { recursive: true })
const plan = JSON.parse(await readFile(join(qa, 'plan.json'), 'utf8'))
if (!Array.isArray(plan.inputs) || !plan.inputs.length || plan.inputs.length > 200 || !Array.isArray(plan.outcomes) || !plan.outcomes.length || !Number.isInteger(plan.minTurns) || plan.minTurns < 1) throw new Error('QA plan requires inputs, outcomes and positive minTurns')
const prefix = `/novel-to-game/preview/workspace/${Buffer.from(process.env.DSH_GAME_QA_SESSION ?? 'qa').toString('base64url')}/${Buffer.from(relative(workspace, root)).toString('base64url')}/`
const directives = JSON.parse(await readFile(new URL('./preview-policy.json', import.meta.url), 'utf8'))
const failures = []
const served = new Set()
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname
    if (!path.startsWith(prefix)) throw new Error('Preview requests must use relative URLs')
    const file = await realpath(join(app, decodeURIComponent(path.slice(prefix.length))))
    if (relative(app, file).startsWith('..')) throw new Error('Resource leaves build/app')
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.wav': 'audio/wav' }[extname(file)] ?? 'application/octet-stream'
    response.writeHead(200, { 'content-type': mime, 'content-security-policy': directives.map(rule => rule.replaceAll('$assets', `http://127.0.0.1:${server.address().port}/novel-to-game/preview/`)).join('; '), 'cache-control': 'no-store' })
    served.add(relative(app, file))
    response.end(await readFile(file))
  } catch (error) {
    failures.push(String(error.message))
    response.writeHead(404); response.end()
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const userData = await mkdtemp(join(tmpdir(), 'dsh-game-chrome-'))
const chrome = process.env.CHROME_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${userData}`, 'about:blank'], { stdio: 'ignore' })
let launchError
child.on('error', error => { launchError = error })
let socket
let serial = 0
const pending = new Map()
const checks = Object.fromEntries(['launch', 'render', 'input', 'coreLoop', 'outcome', 'restart'].map(name => [name, 'NOT_RUN']))
const evidence = []
const runId = randomUUID()
const command = ['node', 'game-qa/scripts/run-qa.mjs', relative(workspace, root)]
const trace = []
async function artifact(name, bytes) {
  const file = join(qa, `${runId}-${name}`)
  await writeFile(file, bytes)
  const item = { path: relative(workspace, file).split('\\').join('/'), sha256: createHash('sha256').update(bytes).digest('hex') }
  evidence.push(item)
  return item
}
function send(method, params = {}) {
  const id = ++serial
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }, 10000)
    pending.set(id, { resolve: result => { clearTimeout(timeout); resolve(result) }, reject: error => { clearTimeout(timeout); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function waitUntil(predicate) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('Browser did not become ready')
}
async function click(selector) {
  const box = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e || e.disabled) return null; const r=e.getBoundingClientRect(); return r.width && r.height ? {x:r.x+r.width/2,y:r.y+r.height/2} : null })()`)
  if (!box) throw new Error(`Input target is missing or disabled: ${selector}`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...box })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...box })
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}
let buildFiles = []
async function digestFiles(directory) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const file = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...await digestFiles(file))
    else if (entry.isFile()) result.push({ path: relative(workspace, file).split('\\').join('/'), sha256: createHash('sha256').update(await readFile(file)).digest('hex') })
    else throw new Error('Build must contain regular files and directories')
  }
  return result.sort((a,b) => a.path.localeCompare(b.path))
}
try {
  buildFiles = await digestFiles(app)
  const planDigest = createHash('sha256').update(await readFile(join(qa, 'plan.json'))).digest('hex')
  let port
  await waitUntil(async () => {
    if (launchError) throw new Error(`Install Chrome or set CHROME_PATH: ${launchError.message}`)
    try { port = (await readFile(join(userData, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; return !!port } catch { return false }
  })
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const waiter = pending.get(message.id); pending.delete(message.id)
      if (message.error) waiter?.reject(new Error(message.error.message)); else waiter?.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown' || message.method === 'Network.loadingFailed' || (message.method === 'Log.entryAdded' && message.params.entry.level === 'error')) failures.push(JSON.stringify(message))
  }
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${prefix}index.html` })
  await waitUntil(() => evaluate('document.readyState === "complete" && !!window.__GAME_QA__'))
  await evaluate(`window.__GAME_QA__.reset(${JSON.stringify(plan.seed ?? 1)})`)
  const initial = await evaluate('window.__GAME_QA__.snapshot()')
  checks.launch = 'PASS'
  const clip = await evaluate('(() => {const e=document.querySelector("canvas"); if(!e) return null; const r=e.getBoundingClientRect(); return r.width && r.height ? {x:r.x,y:r.y,width:r.width,height:r.height,scale:1} : null})()')
  const screenshot = () => send('Page.captureScreenshot', clip ? { clip } : {})
  const before = Buffer.from((await screenshot()).data, 'base64')
  await artifact('before.png', before)
  for (const input of plan.inputs) {
    if (typeof input.selector !== 'string') throw new Error('Every input requires a click selector')
    await click(input.selector)
    trace.push({ input, snapshot: await evaluate('window.__GAME_QA__.snapshot()') })
  }
  const final = trace.at(-1).snapshot
  const after = Buffer.from((await screenshot()).data, 'base64')
  await artifact('after.png', after)
  checks.render = !before.equals(after) && failures.length === 0 ? 'PASS' : 'FAIL'
  checks.input = final.events.length > initial.events.length ? 'PASS' : 'FAIL'
  checks.coreLoop = final.state.turn >= plan.minTurns && checks.input === 'PASS' ? 'PASS' : 'FAIL'
  checks.outcome = final.state.phase === 'ended' && plan.outcomes.includes(final.state.outcome) ? 'PASS' : 'FAIL'
  await click(plan.restartSelector ?? '[data-action="restart"]')
  const restarted = await evaluate('window.__GAME_QA__.snapshot()')
  checks.restart = JSON.stringify(restarted.state) === JSON.stringify(initial.state) ? 'PASS' : 'FAIL'
  trace.push({ restart: restarted })
  try {
  const strategies = []
  for (const strategy of ['default', 'greedy', 'random']) {
    for (let seed = 1; seed <= 5; seed++) {
      strategies.push(await evaluate(`(() => {
        const qa=window.__GAME_QA__; qa.reset(${seed}); let rng=${seed}; const actions=[];
        for(let i=0;i<100 && qa.snapshot().state.phase!=='ended';i++) {
          const choices=qa.actions(); if(!choices.length) break;
          rng=(Math.imul(rng,1664525)+1013904223)>>>0;
          const action=${JSON.stringify(strategy)}==='greedy' ? [...choices].sort((a,b)=>b.value-a.value)[0] : ${JSON.stringify(strategy)}==='random' ? choices[rng%choices.length] : choices[0];
          qa.act(action.id); actions.push(action.id);
        }
        return {strategy:${JSON.stringify(strategy)},seed:${seed},actions,terminal:qa.snapshot().state};
      })()`))
    }
  }
  const successRates = Object.fromEntries(['default', 'greedy', 'random'].map(strategy => [strategy, strategies.filter(run => run.strategy === strategy && run.terminal.outcome === plan.outcomes[0]).length / 5]))
  const best = Math.max(...Object.values(successRates))
  await artifact('strategies.json', Buffer.from(JSON.stringify({ runs: strategies, successRates, dominantStrategies: Object.keys(successRates).filter(strategy => successRates[strategy] === best && Object.values(successRates).some(value => value < best)), divergentTerminals: new Set(strategies.map(run => run.terminal.outcome)).size > 1, reachableOutcomes: [...new Set(strategies.map(run => run.terminal.outcome))], unobservedOutcomes: plan.outcomes.filter(outcome => !strategies.some(run => run.terminal.outcome === outcome)), advisory: 'Five seeds per strategy; unobserved outcomes are not proven unreachable. The first planned outcome is the strategy success target.' }, null, 2)))

  } catch (error) {
    await artifact('strategies.json', Buffer.from(JSON.stringify({ status: 'unavailable', reason: String(error.message), advisory: true })))
  }
  if (JSON.stringify(buildFiles) !== JSON.stringify(await digestFiles(app))) throw new Error('Build changed during QA')
  if (planDigest !== createHash('sha256').update(await readFile(join(qa, 'plan.json'))).digest('hex')) throw new Error('QA plan changed during run')
  buildFiles.push({ path: relative(workspace, join(qa, 'plan.json')).split('\\').join('/'), sha256: planDigest })
} catch (error) {
  failures.push(String(error.message))
  for (const name in checks) if (checks[name] === 'NOT_RUN') checks[name] = 'FAIL'
} finally {
  socket?.close()
  child.kill('SIGTERM')
  await Promise.race([new Promise(resolve => child.once('close', resolve)), new Promise(resolve => setTimeout(resolve, 3000))])
  if (child.exitCode === null) child.kill('SIGKILL')
  await new Promise(resolve => server.close(resolve))
  await rm(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
if (failures.length) checks.launch = 'FAIL'
await artifact('trace.json', Buffer.from(JSON.stringify({ command, trace, failures, served: [...served] }, null, 2)))
const status = Object.values(checks).every(value => value === 'PASS') ? 'PASS' : 'FAIL'
const record = { schema: 2, driver: 'chrome-cdp-v1', status, checks, buildFiles, evidence, completeRun: { id: runId, command, exitCode: status === 'PASS' ? 0 : 1, testedRuntime: 'Chrome', prefix }, limitations: [{ scope: 'playability', reason: 'Strategy outcomes are advisory; blind play requires a separate agent and attached transcript.' }], suites: Object.fromEntries(Object.entries(checks).map(([name,status]) => [name,{command,exitCode:status==='PASS'?0:1,evidence:evidence.map(item=>item.path)}])) }
const payload = JSON.stringify(record)
const signature = process.env.DSH_GAME_QA_KEY ? createHmac('sha256', process.env.DSH_GAME_QA_KEY).update(payload).digest('hex') : null
await writeFile(join(qa, 'blind-play-request.md'), `Play the Studio preview of ${relative(workspace, root)} for at most five minutes. Do not read the source or design documents, QA plan, or strategy report. Use only visible controls. Report the goal you inferred, meaningful choices, why you won or lost, and confusing feedback. Save your exact prompt and action transcript with screenshots; write qa/blind-play.json with prompt_path, transcript_path, observations and limitations. This is subjective feedback, not a mechanical check.\n`)
await writeFile(join(qa, 'verification.json'), JSON.stringify({ ...record, attestation: { payload, signature } }, null, 2)+'\n')
console.log(JSON.stringify({ status, checks, failures }))
process.exitCode = status === 'PASS' ? 0 : 1
