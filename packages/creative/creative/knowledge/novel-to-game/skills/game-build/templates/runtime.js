import { initial, choices, step } from './rules.js'
let state = initial(1)
let events = []
const mode = document.body.dataset.template
const board = document.querySelector('#board')
const canvas = document.querySelector('canvas')
function render() {
  document.querySelector('#status').textContent = `第 ${state.turn + 1} 回合 · 体力 ${state.energy} · 线索 ${state.progress}/6`
  document.querySelector('#story').textContent = state.phase === 'ended' ? ({ discovery: '你找到了遗失的证据，回到城门。', exhausted: '体力耗尽。守卫关闭城门，行动失败。', missed: '时间已到，你还缺少关键线索。' })[state.outcome] : '在四个回合内找到六点线索，且不要耗尽体力。调查较稳妥，突进有风险，休整会花时间。'
  board.replaceChildren(...choices(state).map(choice => {
    const button = document.createElement('button')
    button.dataset.action = choice.id
    button.textContent = choice.label
    button.onclick = () => act(choice.id)
    return button
  }))
  if (mode === 'canvas') {
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#102538'; ctx.fillRect(0, 0, 720, 220)
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < state.progress ? '#edbf6b' : '#39516b'
      ctx.fillRect(30 + i * 110, 70 + Math.sin(i) * 25, 60, 70)
    }
  }
}
function act(id) {
  const next = step(state, id)
  if (next === state) return false
  events.push({ turn: next.turn, action: id, before: { ...state }, after: { ...next } })
  state = next; render(); return true
}
function reset(seed = state.seed) { state = initial(seed); events = []; render() }
document.querySelector('[data-action=restart]').onclick = () => reset()
document.querySelector('[data-action=save]').onclick = () => { localStorage.setItem('novel-game-save', JSON.stringify({ state, events })); document.querySelector('#saved').textContent = '已保存' }
document.querySelector('[data-action=load]').onclick = () => { const saved = localStorage.getItem('novel-game-save'); if (saved) { const value = JSON.parse(saved); state = value.state; events = value.events; render() } }
window.__GAME_QA__ = { snapshot: () => JSON.parse(JSON.stringify({ state, events })), reset, actions: () => choices(state), act }
render()
