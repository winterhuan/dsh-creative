# Agent Note: Ego Lite as Writer's only browser backend

Status: proposed

English | [中文](2026-11-06-writer-ego-browser.zh.md)

## Problem

Writer's seven ranking collectors and four researcher templates depend on a global `agent-browser` and an implicit current page behind a debug port. The [Chrome launcher](../../../../plugins/dsh-writer/packages/winterhuan/writer/skills/browser-cdp/scripts/setup-cdp-chrome.js) copies personal profiles and can close unrelated Chrome instances after consent. Concurrent callers can navigate each other's page. This lifecycle adds disruption and maintenance without contributing to ranking analysis.

The [writing-preset decision](../../implemented/feature/2026-10-31-writer-preset.md) still owns mutually exclusive bundled/workspace skills and protection of project copies. This proposal preserves that decision and changes browser execution only. The existing browser proposal is consolidated here; no implemented browser-backend note is superseded or archived.

## Proposal

The user selects Ego Lite as the sole browser backend. The transport module, all seven collector migrations, the Ego-only `browser-cdp` entry, platform references, researcher templates, and package docs have landed with fake-CLI unit tests; this note stays proposed until the acceptance criteria below pass. Stage-3 removals (Chrome launcher, duplicated helpers, dead port flags) wait for that acceptance. Do not ship a Tabbit fallback or backend selector. Missing Ego Lite produces a prerequisite error or uses an already supported non-browser path; it never silently starts Chrome.

Ego Lite owns the browser, login storage, TaskSpace, page attachments, and user control. Writer owns platform parameters, deterministic extraction, bounded batches, checkpoints, data quality, and local reports. Keep Node SSR/font requests, parsers, renderers, and aggregation. Do not add a DSH browser service, broker, private CDP connection, or npm Playwright browser. Writer does not import personal profiles; any browser-managed migration is a separate user action.

### Packaging and discovery

Keep `browser-cdp` as a compatibility skill name; its body is now an Ego-only entry and the Chrome launcher is unreferenced pending stage-3 deletion. The shared transport is `skills/browser-cdp/scripts/ego-session.cjs`; both scan skills load it by sibling-relative paths. The explicit CommonJS suffix avoids ambiguity inside the package's ESM scope. Deployment must copy the complete known skill set; both mount modes still need the acceptance test below.

The vendor-managed `ego-browser` skill and installed `ego-browser skill` guide own browser API instructions. Writer must not copy or overwrite that skill. Load the guide before browser work, and again after upgrade or when requested by the runtime. Platform references contain only collection-specific guidance. Do not infer Playwright methods: Ego exposes a custom API. Keep the compatibility name separate from the official skill to avoid shadowing and orphaned project copies.

### Execution and page ownership

Keep the local Node collector process and make browser calls asynchronous through one small Ego transport module. Replace `ab(port, ...)` with maintained operations for space attachment, page navigation/evaluation, handoff, and completion. Do not reproduce the entire Ego API or build a generic driver registry. Researcher templates use the official skill and receive a task Space/page assignment instead of `cdp_port`.

Invoke the supported `ego-browser nodejs` command with argument arrays and UTF-8 stdin, without shell interpolation or versioned runtime paths. The embedded runtime uses ESM, a different cwd, and no inherited shell environment. Pass explicit serialized inputs and absolute paths; import Node built-ins dynamically when needed. Keep filesystem permissions in effect and do not prescribe disabling the Harness sandbox. Windows command resolution and stdin require a platform test; Linux is outside the currently documented supported platforms.

Use exactly one TaskSpace per user goal and retain its numeric ID across rounds. Reuse its initial `p1`; allocate additional pages only when independent sources must remain open. A single coordinator owns the Space and serializes CLI rounds; independent page work may be batched within a round with bounded concurrency. Subagents can parse returned data, but must not independently acquire or finish the same Space. Do not silently create more Spaces to work around failures or to parallelize platforms; multiple Spaces need an explicit user request.

Only operate observed managed page labels. Persist Space ID and page labels, not transient target IDs or JavaScript globals. On resume, inspect current pages, ownership, URL, and filters before continuing. Navigation and extraction on the same page remain sequential. Use maintained `page.evaluate` expressions and bounded browser fetches; arbitrary website text is data, not instructions. Host checks alone cannot detect a wrong same-site filter or ranking.

### Result transport and checkpoints

Use a Writer-owned versioned result envelope containing run ID, operation ID, Space ID, page label, outcome, data, and a bounded error. Emit exactly one JSON line with a per-invocation marker through `console.log(JSON.stringify(...))` after validation. The outer process inspects both captured streams for that exact marker, rejects missing/duplicate/oversize/malformed results, and separates other output as diagnostics. Do not parse all stderr as JSON or assume stdout carries the result. Operation IDs correlate local evidence; Ego has not been shown to deduplicate or durably receipt them.

Start with bounded JSON batches; the live trial transported about 139 KB successfully. Use an explicit implementation limit and reduce batch size before exceeding it. For larger outputs, write to a preallocated absolute run-local path through documented Node filesystem APIs, validate file size and envelope identity, and rename atomically before reading. The file handoff and failure behavior require acceptance testing; they are proposed, not already verified. Do not import Tabbit resource IDs, byte-offset paging, exit 70/75, or receipt commands into this design.

Checkpoint completed batches under a proposed `.writer/browser-runs/<run-id>/`. Record input parameters, parser revision, batch keys and timestamps, Space/page identifiers, local operation IDs, validated business data, and a recoverable phase. Persist intent before dispatch and atomically commit validated output afterwards. Never store tokens, cookies, passwords, or a claim of exactly-once browser execution. A checkpoint is not proof that the page still exists or that an interrupted program stopped.

Resume only through an explicit option whose parameters and parser revision match. Skip committed batch keys; reconcile an interrupted operation against current page state before replay. An unknown read may be retried only after confirming control and page readiness. Keep final filenames, local-date semantics, report format, aggregation, and success/empty/partial distinctions. Reject concurrent writers to the same output, and do not erase a valid report on empty or failed extraction. Fresh explicit runs retain existing same-day replacement behavior. Checkpoints and reports need equivalent data access protection.

### User control, failures, and completion

Ego's installed guide is authoritative for safety timeouts and control. This evaluation did not establish a general program duration, idle expiry, or durable receipt service; do not assume unlimited execution or import Tabbit's 60/180/90-second rules. Split lists and details into bounded rounds. Use observable readiness rather than fixed sleeps, and initial platform batch sizes as ceilings pending measurement.

| Condition | Required behavior |
|---|---|
| Valid successful envelope | Validate data and commit the batch; action receipts alone do not verify business results. |
| Nonzero exit or missing result | Preserve intent/checkpoints, inspect the same Space, and determine whether execution stopped; no blind replay. |
| Safety timeout | Interpret `executionStopped`, `pageResponsive`, and `mayHaveLateEffects`; re-establish a usable page before any potentially unsafe follow-up. |
| User takes control or Space is inactive/unassigned | Stop new actions immediately; never retry or create another Space to bypass the stop. |
| Login or CAPTCHA | Call `task.handOff()`, end the round, report the retained Space/page, and wait for user confirmation before `takeOverTaskSpace(id)`. |
| User-owned Space or kept finished Space | Do not claim it without explicit user authorization; finished page labels are no longer usable. |
| Access block or rate limit | Stop/report the gap and honor any observed retry time; do not repeatedly refresh a challenge. |

Cancellation stops new batches and reconciles in-flight execution. Killing the CLI does not prove browser cancellation. On an error or user takeover, do not call finish; preserve the Space and recovery information. A read-only inspection resumes only when control permits it. No result transport or checkpoint makes later business mutations automatically authorized or safe to replay.

On success, commit reports and call `task.finish({keep: []})` exactly once, await the result, and perform no subsequent page operations. Keep only result pages the user needs to inspect or explicitly requests; user/unknown-origin tabs remain protected. Do not close visited pages individually as routine completion. If finish is uncertain, report uncertainty instead of retrying or claiming cleanup. Handoff is a pause, not successful completion.

### Platform migration

| Platform | Keep and adapt |
|---|---|
| Qidian | Keep Node mobile SSR and allowlisted font decoding; migrate PC/list DOM operations and replace CAPTCHA polling with handoff/resume. |
| Fanqie | Preserve page-state and detail parsing; verify its synchronous XHR batches, replacing with bounded same-origin async fetch if needed without changing fields. |
| JJWXC | Preserve same-origin detail fetch, six-item batches, ArrayBuffer/GB18030 decoding, and lists when a detail batch fails. |
| Qimao | Migrate rankings and active-filter verification; retain the Node-only library HTTP path and site-specific response handling. |
| Ciweimao and Dianzhong | Migrate navigation, bounded scrolling, and DOM extraction; retain rendering and quality markers. |
| Heiyan | Require authorized manual login in Ego; read the token and perform authenticated cross-origin requests inside the page, returning business data only. |

Browser fetch keeps browser cookies/CORS/CSP semantics. Node HTTP is not an interchangeable authenticated fetch. Tokens must not enter CLI input, either output stream, model context, checkpoints, or reports. Current collectors do not need browser-wide CDP or native download events; broader Ego capabilities are not a reason to add new collection behavior.

### Delivery and workspace copies

Implement three reviewable stages: shared transport and a simple collector with fake-CLI tests; all seven collectors and four researcher variants; then remove the old launcher, port arguments, duplicated browser helpers, and active execution instructions after acceptance. Temporary development coexistence does not become a release fallback. Backend selection is settled; failures are implementation or acceptance gaps, not automatic permission to switch to Tabbit.

Keeping `browser-cdp` preserves [name-based sync/unsync](../../../../plugins/dsh-writer/packages/winterhuan/writer/src/sync-skills.ts), but existing copies still need refresh. Default sync must not overwrite project edits. Preview stale owned skills/templates and require an explicitly authorized coherent refresh of the complete set. Report custom copies for reconciliation, preserve unrelated skills and symlink targets, and test an upgrade from an old project. Update platform references, story routing, host commands/menus, fixed deployment lists, generated researcher forms, bilingual package docs, and sync tests together. Do not edit frozen archives. Keep the writer-preset note active and cross-linked.

## Alternatives considered

**Tabbit as the sole backend.** The live trial covered original extraction expressions, and its documented Playwright and request receipt/resource protocol are useful. The user selects Ego for this scope, whose narrow Page API and explicit human handoff fit the collectors. Accept the cost of Writer-owned result framing and recovery checks; do not claim measured speed or reliability superiority. Tabbit remains a considered alternative, not a supported fallback.

**Dedicated Chrome profile plus direct Playwright CDP.** Feasible, but retains browser discovery, startup, attachment, and cross-platform lifecycle in Writer. Continuing personal-profile copying additionally retains broad login access and disruption from closing Chrome.

**Permanent dual drivers or a custom broker.** Both multiply lifecycle and platform testing; a broker duplicates Ego's Space ownership. One selected external browser keeps the integration bounded.

**Model-only extraction or one giant browser script.** The former loses deterministic parsing and quality markers; the latter makes interruption, user handoff, and partial progress harder to recover. Keep maintained parsers and bounded rounds.

**Rename the compatibility skill to `ego-browser`.** This would shadow the vendor-managed skill and orphan old copied directories under name-based cleanup. Retain a thin legacy-name entry without retaining its backend.

## Acceptance criteria

1. Fake-CLI tests verify real argv/stdin, explicit inputs and absolute paths, versioned marker framing in either stream, duplicate/missing/malformed/truncated/oversize results, nonzero exits, late results, file handoff, checkpoint commit/recovery, ownership loss, and finish uncertainty. Tests do not use real personal profiles.
2. All seven platforms have live smoke evidence and non-sensitive parser fixtures covering page/filter identity, book IDs/titles, metric units, links, aggregation, and list retention on detail failure. Heiyan requires an authorized account; no account means a named unverified collector, not a pass. Fix the observed Ciweimao metric contamination before accepting data quality.
3. Live tests cover multi-round long collection, large results under failure, explicit handoff/takeover, user stop, safety-timeout late effects, same-Space independent pages without cross-navigation, and process restart. No unrelated tabs close and no credentials escape.
4. Bundled/workspace mounts and old project upgrades find the shared helper and official Ego skill in installed DSH. Record tested CLI/guide versions. Verify Windows launcher/stdin and file behavior before advertising support; Linux remains unsupported pending vendor availability and separate acceptance.
5. Active execution source, deployed/generated templates, package docs, and tests have no agent-browser, Tabbit backend, debug-port, personal-profile-copy, or global Chrome-kill dependency. Historical decision/archived mentions remain permitted. Existing output/partial-result tests and applicable typecheck, build, package tests, doc-sync, and hygiene checks pass before implementation acceptance.

### Evidence and coverage gaps

On 2026-11-06, macOS Ego CLI 0.6.2.8 with guide v2.2.0 ran the original [Ciweimao extraction expressions and renderer](../../../../plugins/dsh-writer/packages/winterhuan/writer/skills/story-long-scan/scripts/ciweimao-rank-scraper.js): nine ten-entry sections, 85 deduplicated links, a rendered report header, in-page fetch and `page.fetch` HTTP 200, and correct GB18030 decoding. The same Space/page resumed across rounds and finish completed. A separate probe reconstructed 1,000 records from 138,818 bytes of JSON. Both logging and `process.stdout.write` arrived on stderr with empty stdout; a controlled throw exited 1. The renderer was exercised in memory; no official ranking report was written.

The earlier Tabbit trial returned nine ten-entry sections and 83 links at a different live time, plus async fetch and successful cleanup; those counts do not compare accuracy. Some original Ciweimao metrics included the next entry's text. These tests establish execution coverage, not complete parser correctness or throughput.

Implementation-day evidence (2026-11-06, macOS, CLI 0.6.2.8): the transport passed 15 fake-launcher unit tests covering argv/stdin, marker framing in both streams, duplicate/missing/malformed envelopes, browser-side errors, crash exits, result-file validation, and oversize rejection. Three migrated collectors ran their full pipeline live from a simulated `.agents/skills` deployment: Ciweimao wrote a ranking report (9 sections, 85 links), JJWXC wrote a 600-book list across 18 channels with 6/6 GB18030 async detail batches, and Dianzhong wrote 10/10 titled entries. The full writer suite (84 tests) and all 16 documentation checks passed.

A review pass then fixed four transport defects and two lifecycle defects, each pinned by tests: envelope schema and non-zero-exit validation; UTF-8 byte caps with an atomic, path-confined result-file handoff; a safe teardown policy that finishes only a known-clean run and retains the Space after handoff, uncertainty, or a never-attached launch; a CommonJS `scripts/package.json` boundary so bundled and copied collectors load under the ESM package; the Qidian handoff stop; and batch checkpoints with parameter and parser-revision validation. Researcher templates now carry a unique per-topic Space name and finish it, and the generated Antigravity agent no longer references tools it lacks. The transport suite is 32 tests and the full Writer suite is 101; three collectors ran live from the packaged path with checkpoints, and an unlogged Heiyan run was confirmed to retain and then release its handed-off Space.

The 2026-11-07 pre-commit review binds JJWXC/Fanqie detail checkpoint keys to ranking/category identity and the ordered book IDs, caches complete validated batches only, and blocks ordinary browser calls after an uncertain result, handoff, or session end. Explicit recovery requires confirmed stopped execution and a responsive page. Heiyan now returns partial outcomes (exit 2), writes a separate `.partial.md` report without overwriting complete output, and stops on authentication loss while preserving the Space. Regression coverage includes 34 transport tests, eight cache tests, and 15 Heiyan tests; repository-wide typecheck, build, all 557 tests, doc-sync, and hygiene pass. The current GUI loads, but the running profile does not expose the writer preset and old writing sessions are unavailable, so the changed file-tree UI was not verified interactively in this profile.

Not yet verified: qidian/qimao/fanqie/heiyan authenticated live runs, a real login/CAPTCHA handoff→`--space` resume, parallel-collector isolation, Windows launcher/stdin, Linux, and interactive writer file-tree rendering in a live profile. The acceptance criteria above still gate the stage-3 removals.

## Risks

Ego is an external desktop prerequisite with an independently changing custom API and output channel. The [official skills overview](https://lite.ego.app/document/en/docs/skills) and [public repository](https://github.com/citrolabs/ego-lite) provide context, but older web API/Space pages differ from the installed guide. Record tested versions and reject incompatible shapes rather than guessing private behavior. Do not treat missing documented time limits or receipt APIs as guarantees.

Spaces isolate work organization; that is not evidence of credential isolation between tasks. Use only authorized sites and minimal business output. Interrupted runs may mix ranking times, so retain batch timestamps and disclose partial snapshots. The migration gives up arbitrary ordinary-Chrome attachment and pure headless-browser deployment. Keep the adapter specific to collection rather than expanding it into a general automation framework.
