#!/usr/bin/env node
/**
 * Fake ego-browser launcher for transport tests.
 *
 * Records argv and stdin to WRITER_FAKE_EGO_RECORD, then behaves according to
 * WRITER_FAKE_EGO_MODE. The envelope marker is read from the incoming script so
 * the fake answers the marker the transport generated.
 *
 * Modes: ok | stderr-ok | no-envelope | duplicate | browser-error | crash |
 *        bad-version | wrong-op | wrong-run | unknown-outcome | nonzero-ok |
 *        spill | timeout
 */
"use strict";

const fs = require("fs");

let stdin = "";
try {
  stdin = fs.readFileSync(0, "utf8");
} catch {
  stdin = "";
}

const recordPath = process.env.WRITER_FAKE_EGO_RECORD;
if (recordPath) {
  fs.writeFileSync(recordPath, JSON.stringify({ argv: process.argv.slice(2), stdin }), "utf8");
}

const mode = process.env.WRITER_FAKE_EGO_MODE || "ok";
const marker = (stdin.match(/const __marker = "([^"]+)"/) || [])[1] || "unknown-marker";
const opId = (stdin.match(/opId: "([^"]+)"/) || [])[1] || "";
const runId = (stdin.match(/runId: "([^"]+)"/) || [])[1] || "";

function envelope(extra) {
  return JSON.stringify({
    marker,
    v: 1,
    opId,
    runId,
    spaceId: 42,
    page: "p1",
    outcome: "ok",
    data: { echoed: true },
    ...extra,
  }) + "\n";
}

switch (mode) {
  case "ok":
    process.stdout.write(envelope());
    break;
  case "stderr-ok":
    process.stderr.write("diagnostic line\n");
    process.stderr.write(envelope());
    break;
  case "no-envelope":
    process.stderr.write("some diagnostic\nanother line\n");
    break;
  case "duplicate":
    process.stdout.write(envelope());
    process.stdout.write(envelope());
    break;
  case "browser-error":
    process.stdout.write(
      envelope({
        outcome: "error",
        data: undefined,
        error: { message: "boom", code: "SafetyTimeout", executionStopped: false, mayHaveLateEffects: true },
      })
    );
    process.exit(1);
  case "crash":
    process.exit(1);
  case "bad-version":
    process.stdout.write(envelope({ v: 99 }));
    break;
  case "wrong-op":
    process.stdout.write(envelope({ opId: "someone-else" }));
    break;
  case "wrong-run":
    process.stdout.write(envelope({ runId: "another-run" }));
    break;
  case "unknown-outcome":
    process.stdout.write(envelope({ outcome: "partial" }));
    break;
  case "nonzero-ok":
    process.stdout.write(envelope());
    process.exit(1);
  case "spill": {
    const file = (stdin.match(/fs\.rename\([^)]*?("(?:[^"\\]|\\.)*")\)/) || [])[1];
    const target = file ? JSON.parse(file) : null;
    if (!target) {
      process.stderr.write("spill mode could not find the result path\n");
      process.exit(2);
    }
    fs.mkdirSync(require("path").dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify({ spilled: true }), "utf8");
    process.stdout.write(envelope({ data: undefined, dataFile: target }));
    break;
  }
  default:
    process.stderr.write(`unknown mode ${mode}\n`);
    process.exit(2);
}
