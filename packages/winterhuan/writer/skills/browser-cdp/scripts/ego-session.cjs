/**
 * Ego transport — the shared browser backend for Writer collectors.
 *
 * Runs `ego-browser nodejs` with an argument array (no shell) and delivers the
 * program through UTF-8 stdin. Every invocation emits exactly one result
 * envelope carrying a per-invocation marker; other output on either stream is
 * diagnostics. The transport validates the envelope before returning data, and
 * keeps the TaskSpace recoverable when an invocation leaves the browser in an
 * unknown state.
 *
 * Usage:
 *   const { createSession, createRunStore, sleep, getArg } = require("./ego-session.cjs");
 *   const session = createSession({ spaceName: "writer qidian scan" });
 *   session.open(url);
 *   const data = session.evalJSON(jsExpression);
 *   session.end();                       // finishes only when cleanup is safe
 *
 * The embedded runtime is ESM with a different cwd and no inherited shell
 * environment, so inputs are serialized into the generated script and file
 * paths handed to the browser must be absolute.
 */

"use strict";

const { spawnSync } = require("child_process");
const { randomUUID } = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

/** Envelope schema version; bump when the result contract changes. */
const ENVELOPE_VERSION = 1;
/** Envelope field locating the result among diagnostics. */
const MARKER_FIELD = "marker";
/** Default inline result ceiling in UTF-8 bytes. */
const MAX_INLINE_BYTES = 4 * 1024 * 1024;
/** Default result-file ceiling in bytes. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** Default per-invocation timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 120000;
/** Directory name for run checkpoints under the project root. */
const RUN_ROOT = path.join(".writer", "browser-runs");

/**
 * Transport failure. `code` classifies the cause; `details` carries the
 * browser-side flags or the recovered diagnostics.
 */
class EgoTransportError extends Error {
  constructor(message, code, cause, details) {
    super(message);
    this.name = "EgoTransportError";
    this.code = code || "UNKNOWN";
    if (cause) this.cause = cause;
    if (details) this.details = details;
  }
}

/** Launcher name; WRITER_EGO_BINARY overrides it for tests and wrappers. */
function resolveBinary() {
  if (process.env.WRITER_EGO_BINARY) return process.env.WRITER_EGO_BINARY;
  return process.platform === "win32" ? "ego-browser.exe" : "ego-browser";
}

/**
 * Build the wrapper program. It attaches the TaskSpace, selects a usable page,
 * runs `body`, and emits exactly one envelope. `body` ends by calling
 * `__ok(data)` or throws. `attach` overrides the task expression (handoff
 * recovery passes `takeOverTaskSpace(id)`).
 */
function buildScript(opts) {
  const { spaceRef, body, marker, opId, runId, resultFile, maxInlineBytes, attach } = opts;
  const spaceArg = typeof spaceRef === "number" ? String(spaceRef) : JSON.stringify(String(spaceRef));
  const attachExpr = attach || `taskSpace(${spaceArg})`;
  return `
const task = await ${attachExpr};
const __managed = await task.pages();
const page = __managed.length ? __managed[0] : await task.newPage();
const __marker = ${JSON.stringify(marker)};
async function __emit(outcome, data, error, dataFile) {
  const env = {
    ${MARKER_FIELD}: __marker,
    v: ${ENVELOPE_VERSION},
    opId: ${JSON.stringify(opId)},
    runId: ${JSON.stringify(runId)},
    spaceId: task.spaceId,
    page: page.label,
    outcome: outcome,
  };
  if (data !== undefined) env.data = data;
  if (error) env.error = error;
  if (dataFile) env.dataFile = dataFile;
  console.log(JSON.stringify(env));
}
function __ok(data) { return __emit("ok", data); }
try {
  ${body}
} catch (e) {
  const info = {
    message: String((e && e.message) || e).slice(0, 2000),
    code: String((e && (e.code || e.name)) || "Error").slice(0, 80),
  };
  // Safety-stop facts decide whether a retry or cleanup is safe; keep each on
  // its own so a caller never reads a stopped run as a completed one.
  for (const key of ["executionStopped", "pageResponsive", "mayHaveLateEffects"]) {
    if (e && typeof e[key] === "boolean") info[key] = e[key];
  }
  await __emit("error", undefined, info);
}
`;
}

/**
 * Build a body that evaluates a page-context expression, then either inlines
 * the result or spills it to `resultFile` when the UTF-8 size exceeds the cap.
 */
function buildEvaluateBody(js, resultFile, maxInlineBytes) {
  return `
const __value = await page.evaluate(${JSON.stringify(js)});
const __ser = JSON.stringify(__value);
if (__ser !== undefined && Buffer.byteLength(__ser, "utf8") > ${maxInlineBytes}) {
  const fs = await import("node:fs/promises");
  const __tmp = ${JSON.stringify(resultFile + ".tmp")};
  await fs.mkdir(${JSON.stringify(path.dirname(resultFile))}, { recursive: true });
  await fs.writeFile(__tmp, __ser, "utf8");
  await fs.rename(__tmp, ${JSON.stringify(resultFile)});
  await __emit("ok", undefined, undefined, ${JSON.stringify(resultFile)});
} else {
  await __ok(__value);
}
`;
}

/** Scan captured streams for the single envelope carrying `marker`. */
function extractEnvelope(stdout, stderr, marker) {
  const found = [];
  for (const stream of [stdout, stderr]) {
    for (const line of String(stream || "").split("\n")) {
      const text = line.trim();
      if (!text.startsWith("{")) continue;
      let obj;
      try {
        obj = JSON.parse(text);
      } catch {
        continue;
      }
      if (obj && typeof obj === "object" && obj[MARKER_FIELD] === marker) found.push(obj);
    }
  }
  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new EgoTransportError(`duplicate result envelopes (${found.length}) for one invocation`, "DUPLICATE");
  }
  return found[0];
}

/** Collect non-envelope lines as bounded diagnostics for error reports. */
function diagnostics(stdout, stderr, marker, limit) {
  const lines = [];
  for (const stream of [stdout, stderr]) {
    for (const line of String(stream || "").split("\n")) {
      const text = line.trim();
      if (!text) continue;
      if (text.startsWith("{")) {
        try {
          const obj = JSON.parse(text);
          if (obj && obj[MARKER_FIELD] === marker) continue;
        } catch {
          /* not JSON; keep as diagnostic */
        }
      }
      lines.push(text);
      if (lines.length >= limit) return lines.join("\n");
    }
  }
  return lines.join("\n");
}

/**
 * Validate one envelope against this invocation. Rejects before any data is
 * read, so a stale, foreign, or partially-written result cannot pass as this
 * call's output.
 */
function validateEnvelope(envelope, expected) {
  const fail = (message, code, details) => {
    throw new EgoTransportError(message, code, undefined, details);
  };
  if (envelope.v !== ENVELOPE_VERSION) {
    fail(`unsupported envelope version ${JSON.stringify(envelope.v)} (expected ${ENVELOPE_VERSION})`, "INCOMPATIBLE_ENVELOPE");
  }
  if (envelope.opId !== expected.opId) {
    fail(`envelope opId ${JSON.stringify(envelope.opId)} does not match ${JSON.stringify(expected.opId)}`, "MISMATCHED_ENVELOPE");
  }
  if (envelope.runId !== expected.runId) {
    fail("envelope runId does not match this run", "MISMATCHED_ENVELOPE");
  }
  if (envelope.outcome !== "ok" && envelope.outcome !== "error") {
    fail(`unknown envelope outcome ${JSON.stringify(envelope.outcome)}`, "INVALID_ENVELOPE");
  }
  if (envelope.spaceId != null && !Number.isInteger(envelope.spaceId)) {
    fail("envelope spaceId is not an integer", "INVALID_ENVELOPE");
  }
}

/** Run one coordinator-owned TaskSpace, one invocation at a time. */
class EgoSession {
  constructor(options) {
    const opts = options || {};
    this.runId = opts.runId || randomUUID();
    const baseName = opts.spaceName || "writer scan";
    // A unique suffix keeps a previously handed-off (user-owned) space from
    // blocking taskSpace(name); resuming by numeric id does not use the name.
    this.spaceName = opts.spaceNameUnique === false ? baseName : `${baseName} ${this.runId.slice(0, 16)}`;
    this.spaceId = typeof opts.spaceId === "number" ? opts.spaceId : null;
    this.binary = opts.binary || resolveBinary();
    this.timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.maxInlineBytes = opts.maxInlineBytes || MAX_INLINE_BYTES;
    this.maxFileBytes = opts.maxFileBytes || MAX_FILE_BYTES;
    this.resultDir = opts.resultDir || path.join(os.tmpdir(), "writer-ego", this.runId);
    this.page = null;
    this.handedOff = false;
    this.uncertain = false;
    this.neverAttached = false;
    this._ended = null;
  }

  /** Space reference: numeric id once known, else the unique name. */
  _spaceRef() {
    return this.spaceId != null ? this.spaceId : this.spaceName;
  }

  /** Absolute result path for one invocation. */
  _resultFile(opId) {
    return path.join(this.resultDir, `${opId}.json`);
  }

  /** Reject a result path outside this session's result directory. */
  _assertOwnedResultPath(file) {
    const root = path.resolve(this.resultDir);
    const target = path.resolve(String(file));
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new EgoTransportError(`result file escapes the session directory: ${file}`, "RESULT_FILE");
    }
    return target;
  }

  /** Run one wrapper program and return the validated business data. */
  _invoke(body, opId, attach, { allowHandoff = false, allowUncertain = false } = {}) {
    if (this.handedOff && !allowHandoff) {
      throw new EgoTransportError("TaskSpace was handed to the user; take it over explicitly before browser operations", "HANDED_OFF");
    }
    if (this.uncertain && !allowUncertain) {
      throw new EgoTransportError("browser outcome is uncertain; inspect and explicitly recover the TaskSpace before further operations", "OUTCOME_UNKNOWN");
    }
    if (this.neverAttached) {
      throw new EgoTransportError("ego-browser was not launched; this session cannot issue browser operations", "NOT_ATTACHED");
    }
    if (this._ended) {
      throw new EgoTransportError("session has ended", "SESSION_ENDED");
    }
    const marker = `op-${randomUUID()}`;
    const id = opId || marker;
    const resultFile = this._resultFile(id);
    const script = buildScript({
      spaceRef: this._spaceRef(),
      body,
      marker,
      opId: id,
      runId: this.runId,
      resultFile,
      maxInlineBytes: this.maxInlineBytes,
      attach,
    });

    const res = spawnSync(this.binary, ["nodejs"], {
      input: script,
      encoding: "utf8",
      timeout: this.timeoutMs,
      maxBuffer: this.maxFileBytes,
      windowsHide: true,
    });

    if (res.error) {
      // The launcher never started, so no TaskSpace was attached.
      if (res.error.code === "ETIMEDOUT") {
        this.uncertain = true;
        this.neverAttached = false;
        throw new EgoTransportError(
          `ego-browser timed out after ${this.timeoutMs} ms; the browser may still be running`,
          "TIMEOUT",
          res.error
        );
      }
      // ENOBUFS and other failures can occur after launch; only explicit
      // executable lookup/permission failures establish that nothing ran.
      this.neverAttached = ["ENOENT", "EACCES", "ENOEXEC"].includes(res.error.code);
      this.uncertain = !this.neverAttached;
      throw new EgoTransportError(
        `ego-browser process failed (${this.binary}): ${res.error.message}. ` +
          "Install ego-lite, or set WRITER_EGO_BINARY to the launcher path.",
        "SPAWN",
        res.error
      );
    }

    let envelope;
    try {
      envelope = extractEnvelope(res.stdout, res.stderr, marker);
    } catch (err) {
      this.uncertain = true;
      throw err;
    }

    if (!envelope) {
      this.uncertain = true;
      const diag = diagnostics(res.stdout, res.stderr, marker, 40);
      throw new EgoTransportError(
        `ego-browser returned no result envelope (exit ${res.status}` +
          `${res.signal ? `, signal ${res.signal}` : ""}); the browser may still be running. ` +
          `Diagnostics:\n${diag || "(none)"}`,
        "NO_ENVELOPE"
      );
    }

    try {
      validateEnvelope(envelope, { opId: id, runId: this.runId });
    } catch (err) {
      this.uncertain = true;
      throw err;
    }

    if (envelope.spaceId != null) this.spaceId = envelope.spaceId;
    if (typeof envelope.page === "string") this.page = envelope.page;

    if (res.status !== 0 && envelope.outcome === "ok") {
      // A non-zero exit contradicts a success envelope; never return the data.
      this.uncertain = true;
      throw new EgoTransportError(
        `ego-browser exited ${res.status} while reporting success; result discarded`,
        "NONZERO_EXIT"
      );
    }

    if (envelope.outcome === "error") {
      const e = envelope.error || {};
      // A browser failure requires explicit reconciliation before a collector
      // can issue another navigation or discard the page.
      this.uncertain = true;
      throw new EgoTransportError(e.message || "browser-side error", e.code || "BROWSER", undefined, e);
    }

    if (envelope.dataFile) {
      try {
        return this._readResultFile(envelope.dataFile);
      } catch (error) {
        this.uncertain = true;
        throw error;
      }
    }
    return envelope.data;
  }

  /** Read, validate, and remove a spilled result file. */
  _readResultFile(file) {
    const target = this._assertOwnedResultPath(file);
    let stat;
    try {
      stat = fs.statSync(target);
    } catch (err) {
      throw new EgoTransportError(`result file missing: ${target}`, "RESULT_FILE", err);
    }
    if (stat.size > this.maxFileBytes) {
      throw new EgoTransportError(`result file too large (${stat.size} bytes): ${target}`, "OVERSIZE");
    }
    const raw = fs.readFileSync(target, "utf8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new EgoTransportError(`result file is not valid JSON: ${target}`, "RESULT_FILE", err);
    }
    try {
      fs.unlinkSync(target);
    } catch {
      /* cleanup failure must not hide a validated result */
    }
    return data;
  }

  /** Navigate the current page. Returns `{ url }` after load. */
  open(url) {
    const body = `await page.goto(${JSON.stringify(String(url))});\nawait __ok({ url: await page.url() });\n`;
    return this._invoke(body);
  }

  /** Evaluate a page-context expression string; returns the raw value. */
  evaluate(js) {
    const body = buildEvaluateBody(String(js), this._resultFile(`eval-${randomUUID()}`), this.maxInlineBytes);
    return this._invoke(body);
  }

  /** Evaluate an expression that yields JSON; parses it, tolerating double encoding. */
  evalJSON(js) {
    return parseJSONResult(this.evaluate(js));
  }

  /** Scroll `times` viewport heights, waiting `intervalMs` between steps. */
  scroll(times, intervalMs) {
    const n = Math.max(0, Number(times) || 0);
    const wait = Math.max(0, Number(intervalMs) || 0);
    for (let i = 0; i < n; i++) {
      this.evaluate("window.scrollBy(0, window.innerHeight)");
      if (wait && i < n - 1) sleep(wait);
    }
  }

  /** Report ownership and pages without changing state. */
  inspect() {
    const body = `const pages = await task.pages();
const infos = [];
for (const p of pages) { infos.push({ label: p.label, url: await p.url() }); }
await __ok({ spaceId: task.spaceId, ownership: task.ownership, pages: infos });`;
    return this._invoke(body, undefined, undefined, { allowUncertain: true });
  }

  /** Hand control to the user (login, CAPTCHA) and pause this run. */
  handOff() {
    const body = `await task.handOff(); await __ok({ handedOff: true, spaceId: task.spaceId });`;
    const result = this._invoke(body);
    this.handedOff = true;
    return result;
  }

  /**
   * Take control back after the user acted on a handed-off space.
   * Requires the numeric space id printed by the earlier handOff.
   */
  takeOver() {
    if (this.spaceId == null) {
      throw new EgoTransportError(
        "takeOver requires a numeric spaceId; construct the session with { spaceId } from the handOff output",
        "NO_SPACE_ID"
      );
    }
    const body = `const pages = await task.pages();
const infos = [];
for (const p of pages) { infos.push({ label: p.label, url: await p.url() }); }
await __ok({ spaceId: task.spaceId, ownership: task.ownership, pages: infos });`;
    const result = this._invoke(body, undefined, `takeOverTaskSpace(${this.spaceId})`, { allowHandoff: true });
    this.handedOff = false;
    return result;
  }

  /** Clear an uncertain state only after the caller verified that execution
   * stopped and the inspected page is safe to continue. */
  recover({ executionStopped, pageResponsive }) {
    if (executionStopped !== true || pageResponsive !== true || this.handedOff || this._ended) {
      throw new EgoTransportError("recovery requires stopped execution, a responsive page, and agent control", "RECOVERY_REQUIRED");
    }
    this.uncertain = false;
  }

  /** Finish the task; `keep` lists page labels to retain for the user. */
  finish(keep) {
    const keepList = Array.isArray(keep) ? keep : [];
    const body = `const r = await task.finish({ keep: ${JSON.stringify(keepList)} }); await __ok(r || { finished: true });`;
    return this._invoke(body);
  }

  /**
   * End the run and, when the Space was retained, print how to resume it.
   * A handed-off run already printed its own guidance, so it stays quiet.
   */
  endAndReport(tag) {
    const result = this.end();
    if (result.finished || result.reason === "handed-off" || result.reason === "never-attached") return result;
    const where = this.spaceId == null ? "" : `（Space ${this.spaceId}）`;
    const resume = this.spaceId == null ? "--space <id>" : `--space ${this.spaceId}`;
    console.error(
      `[${tag}] 浏览器现场已保留${where}：${result.reason}。` +
        `先核实页面状态，再用 ${resume} 续接或人工处理；不要直接重跑覆盖。`
    );
    return result;
  }

  /**
   * End this run with the safe cleanup policy. Finishes only when the browser
   * state is known; a handed-off, uncertain, or never-attached run retains its
   * Space so a later `--space <id>` can inspect or resume it.
   */
  end() {
    if (this._ended) return this._ended;
    if (this.neverAttached) {
      this._ended = { finished: false, retained: false, reason: "never-attached" };
      return this._ended;
    }
    if (this.handedOff) {
      this._ended = { finished: false, retained: true, reason: "handed-off" };
      return this._ended;
    }
    if (this.uncertain) {
      this._ended = { finished: false, retained: true, reason: "uncertain" };
      return this._ended;
    }
    try {
      this.finish();
      this._ended = { finished: true, retained: false, reason: "finished" };
    } catch (error) {
      this.uncertain = true;
      this._ended = { finished: false, retained: true, reason: "finish-failed", error };
    }
    return this._ended;
  }
}

/** Parse a collector JSON result, tolerating a double-encoded string. */
function parseJSONResult(raw) {
  if (raw === undefined || raw === null || raw === "" || raw === "ERR") {
    throw new EgoTransportError("browser returned no JSON result", "EMPTY");
  }
  try {
    let parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        /* single-encoded string is fine */
      }
    }
    return parsed;
  } catch (error) {
    throw new EgoTransportError(`browser returned invalid JSON: ${String(raw).slice(0, 160)}`, "INVALID_JSON", error);
  }
}

/** Create a coordinator session for one collection goal. */
function createSession(options) {
  return new EgoSession(options);
}

// ---------------------------------------------------------------------------
// Run checkpoints
// ---------------------------------------------------------------------------

/** Stable JSON for comparing resumed run parameters. */
function stableParams(params) {
  const sort = (value) => {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = sort(value[key]);
      return out;
    }
    return value;
  };
  return JSON.stringify(sort(params || {}));
}

/** Filesystem-safe batch key. */
function batchFileName(key) {
  const name = String(key).replace(/[^A-Za-z0-9._-]+/g, "_");
  if (!name) throw new EgoTransportError("batch key is empty after sanitizing", "BAD_KEY");
  return `${name}.json`;
}

/**
 * Checkpoint store for one run: an atomic, per-batch record under
 * `.writer/browser-runs/<run-id>/`. A batch is committed only after its data
 * was validated, and a resumed run must match the original parameters and
 * parser revision.
 */
class RunStore {
  constructor(options) {
    const opts = options;
    this.root = path.resolve(opts.root || RUN_ROOT);
    if (typeof opts.runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(opts.runId)) {
      throw new EgoTransportError("run id must contain only letters, digits, underscores, or hyphens", "BAD_RUN_ID");
    }
    this.runId = opts.runId;
    this.params = opts.params || {};
    this.parserRevision = opts.parserRevision || "";
    this.dir = path.join(this.root, this.runId);
    this.batchDir = path.join(this.dir, "batches");
  }

  /** Create directories and write the manifest for a new run. */
  init() {
    fs.mkdirSync(this.batchDir, { recursive: true });
    const manifest = {
      version: 1,
      runId: this.runId,
      params: this.params,
      parserRevision: this.parserRevision,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(this.dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    return this;
  }

  /** Whether this run already committed `key`. */
  has(key) {
    return fs.existsSync(path.join(this.batchDir, batchFileName(key)));
  }

  /** Read one committed batch, or `undefined` when absent. */
  get(key) {
    const file = path.join(this.batchDir, batchFileName(key));
    if (!fs.existsSync(file)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new EgoTransportError(`checkpoint is not valid JSON: ${file}`, "BAD_CHECKPOINT", error);
    }
  }

  /** Commit one validated batch atomically. */
  commit(key, value) {
    const file = path.join(this.batchDir, batchFileName(key));
    const tmp = `${file}.tmp`;
    fs.mkdirSync(this.batchDir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value), "utf8");
    fs.renameSync(tmp, file);
    return file;
  }

  /** Committed batch keys, in file order. */
  keys() {
    if (!fs.existsSync(this.batchDir)) return [];
    return fs
      .readdirSync(this.batchDir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length))
      .sort();
  }
}

/**
 * Open or create a run store. `resume` must name an existing run whose
 * parameters and parser revision match; otherwise this throws instead of
 * silently mixing two collections.
 */
function openRunStore(options) {
  const opts = options || {};
  const root = opts.root || RUN_ROOT;
  const parserRevision = opts.parserRevision || "";
  if (opts.resume) {
    const store = new RunStore({ root, runId: opts.resume, parserRevision });
    const manifestFile = path.join(store.dir, "manifest.json");
    if (!fs.existsSync(manifestFile)) {
      throw new EgoTransportError(`no checkpoint for run ${opts.resume} under ${store.root}`, "NO_RUN");
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    } catch (error) {
      throw new EgoTransportError(`run manifest is not valid JSON: ${manifestFile}`, "BAD_CHECKPOINT", error);
    }
    if (manifest.parserRevision !== parserRevision) {
      throw new EgoTransportError(
        `run ${opts.resume} was recorded with parser revision ${JSON.stringify(manifest.parserRevision)}; ` +
          `this build is ${JSON.stringify(parserRevision)}`,
        "PARSER_MISMATCH"
      );
    }
    if (stableParams(manifest.params) !== stableParams(opts.params)) {
      throw new EgoTransportError(
        `run ${opts.resume} was recorded with different parameters; start a fresh run instead`,
        "PARAM_MISMATCH"
      );
    }
    store.params = manifest.params;
    return store;
  }
  const runId = opts.runId || `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  return new RunStore({ root, runId, params: opts.params, parserRevision }).init();
}

// ---------------------------------------------------------------------------
// Non-browser utilities
// ---------------------------------------------------------------------------

/** Wait `ms` milliseconds without a system sleep command. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** JSON-encode a value for embedding inside a page-eval expression. */
function safeStr(val) {
  return JSON.stringify(String(val));
}

/** Parse a `--x v` or `--x=v` argument. */
function getArg(args, name) {
  const i = args.indexOf(name);
  if (i >= 0) return i + 1 < args.length ? args[i + 1] : null;
  const prefix = `${name}=`;
  const inline = args.find((arg) => String(arg).startsWith(prefix));
  return inline === undefined ? null : String(inline).slice(prefix.length);
}

/** Local-calendar date stamp (YYYYMMDD) for output filenames. */
function localDateStamp(date) {
  const d = date instanceof Date ? date : new Date();
  return `${String(d.getFullYear()).padStart(4, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Run a scraper entrypoint and turn empty or partial output into a
 * machine-readable CLI status: 1 when nothing was written, 2 when some target
 * failed or the report is partial.
 */
function runCli(main, label) {
  Promise.resolve()
    .then(main)
    .then((result) => {
      const outcome = Number.isInteger(result)
        ? { planned: result, written: result, failed: 0, partial: false, partialReasons: [] }
        : result;
      if (!outcome || !Number.isInteger(outcome.written) || outcome.written < 1) {
        throw new Error("no output was written");
      }
      const failed = Number.isInteger(outcome.failed) ? outcome.failed : 0;
      const planned = Number.isInteger(outcome.planned) ? outcome.planned : outcome.written + failed;
      const reasons = Array.isArray(outcome.partialReasons) ? outcome.partialReasons.filter(Boolean).map(String) : [];
      if (outcome.partial || failed > 0) {
        const details = [`wrote ${outcome.written}/${planned}`];
        if (failed > 0) details.push(`failed ${failed}`);
        details.push(...reasons);
        console.error(`${label} partial: ${details.join("; ")}`);
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      const message = error && error.message ? error.message : String(error);
      console.error(`${label} failed: ${message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  EgoSession,
  EgoTransportError,
  RunStore,
  createSession,
  openRunStore,
  parseJSONResult,
  buildScript,
  buildEvaluateBody,
  validateEnvelope,
  extractEnvelope,
  sleep,
  safeStr,
  getArg,
  localDateStamp,
  runCli,
  ENVELOPE_VERSION,
  MAX_INLINE_BYTES,
  RUN_ROOT,
};
