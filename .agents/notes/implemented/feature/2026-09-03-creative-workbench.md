# Agent Note: Creative workbench, bundled knowledge and skill viewer

Status: implemented

English | [中文](2026-09-03-creative-workbench.zh.md)

## Problem

Fiction, short-drama, interactive-game and video-recap workflows share source material, project files and paid production, but their original tools assumed independent runtimes and dashboards. Separate implementations cannot reliably share DSH permissions, Session history, cancellation or project identity. The workbench must also distinguish an unsaved draft from disk state, a preparation request from an executing job, and human-only skill browsing from model-visible skill loading.

## Decision

Creative is one four-domain plugin built on DSH's existing agents, tools, filesystem, settings and jobs, presented in the right Sidebar. A separate, optional read-only skill viewer inspects the Session's skill composition without invoking a tool or resuming an Agent.

The [four-domain plugin proposal](../../implemented/architecture/2026-09-30-creative-four-domain-plugins.md) revisits package and page composition while retaining this note's DSH ownership, authorization and project-file contracts.

<a id="composition-and-knowledge"></a>
### Composition and knowledge

[`dsh-creative`](../../../../packages/creative/creative/README.md) injects only `skills` and `tools`; its `/creative` routes register in a separate `webServer` plus `typert` scope, so headless compositions keep Skills, Roles and production tools without Web services. Registrations follow plugin disposal. No runtime-invariant companion is published: file, request and job checks run inside the operations they authorize.

The `story`, `short-drama`, `novel-to-game` and `video-recap` providers keep domain discovery names through the Creative aggregate; each provider belongs to its independently installable domain package. Each `SKILL.md` owns its description and complete body; a provider only prepends shared DSH integration instructions, which resolve workflow names and `$name` or `/name` references to `skill` loads. Provider tests hold every discovered description to the 500-character catalog limit. The bundled Skills, Roles and scripts address only DSH, and a test rejects references to other agent hosts or a separate dashboard.

Seven packaged Role files supply professional instructions to actual native subagents or Team members. The [native collaboration decision](2026-10-01-creative-role-agents.md) removes the custom Role executor and role-owned model/tool policies. A delegated task supplies the Role path and the domain resource root; native read loads the requested material. Workflow stages remain Skills, not extra Agent types.

Novel Skills share one packaged script runtime under `knowledge/story/scripts/` behind skill-local entry files. JavaScript runs as ESM; a missing executable, malformed findings or inconsistent exit status block chapter delivery instead of counting as a passed check. Copying one novel Skill directory alone therefore omits the runtime, while shared video scripts are copied from `knowledge/video-recap/runtime/` and checked for byte equality. Episode composition and media review require the packaged video tree. Author-memory receipts, chapter tracking, required references and quality checks remain inside the writing workflows.

Knowledge manifests are descriptive catalogs of Skills, Roles and optional notes. They hold no commit pins, schema counters, generation times, per-file hashes or change categories; loading reads packaged files directly and Git owns content history.

Research uses the native web tools, and a browser-dependent source returns to the caller instead of requiring a fixed debugging port. The internal browser reference drives `agent-browser --engine lightpanda` for interaction and `lightpanda fetch` for one-off reads, with a named session and cleanup per task. Lightpanda supplies neither a user Chrome profile nor the visual rendering game QA needs. Cover generation requires an image or authenticated HTTP capability that is actually available, not an invented production entry.

<a id="workspace-and-sidebar"></a>
### Workspace and Sidebar

Four independent domain pages contribute to `sidebar.right.pane.tab`. The Sidebar owns placement, resizing, splitting, floating, fullscreen and visibility; Conversation retains the transcript and composer. Story and drama own their file redirects; other files use ordinary preview. Creative composes installation without an aggregate page.

The game plugin owns the `creative-game` page and its independent `creative.game.v1` Session store.

Story and drama independently retain editor buffers, conflicts and selections; drama also retains production preparation. Complete listings may remove clean deleted buffers but retain dirty drafts; partial listings cannot prove deletion. Saves use the last acknowledged CAS version. Old combined state is neither migrated nor read.

Game and video previews load on domain entry and may restart after a remount. A project's first video fills an empty preview; later versions require user selection. Closing the page neither cancels production nor discards drafts. Styles load once through the Client module.

<a id="project-and-file-ownership"></a>
### Project and file ownership

The [shared parser](../../../../packages/creative/creative/src/project-path.ts) recognizes root projects, direct book directories, `长篇|短篇/<book>`, standalone stories and game and video entries within the supported discovery depths. Full project and episode paths address metadata, selections, drafts and asset filters, so repeated names such as `EP001` or `SHOT-001` are never global identities. Chapter bodies, required outlines and tracking files must belong to the same project. Short-story setup is visible from its first standard document, and the editor puts prose and outlines first for both chapter directories and standalone stories. Post-write tracking reminders are logged, model-visible context.

Workspace requests accept loopback or the `trustedHosts` configured and validated at load. Host operations enforce extension allowlists and resolved filesystem containment, including symlinks. Text saves use `FsVersion` compare-and-swap. A listing counts at most 1,000 eligible creator files and sets `truncated` only after observing another eligible file, so exactly 1,000 files remain complete; the warning offers no pagination. Dependency directories, Python caches, hidden directories and video working areas count toward neither this limit nor game-preview freshness.

The Session filesystem provider owns media bytes. Direct Host streaming requires explicit provider mappings of the root and file before and after Host realpath resolution, plus containment and size checks; matching path strings and sizes alone are insufficient. Otherwise reads go through the provider, bounded to 256 MiB per media file and supporting RFC 9110 byte ranges. Game previews run in a script-only sandbox under a CSP on distinct loopback origins, and their QA record requires an authenticated browser run and matching build/evidence bytes to read as Current.

Creative keeps these HTTP routes because the generic `workspaceFiles` Remote has no CAS write and does not cover the domain-filtered inventory, project summaries, editor limit, Range media, video preflight or CSP-isolated game preview. The live tool-argument projection still drives pre-settlement editor previews; file observation could replace only the later invalidation signal.

<a id="production-requests-and-jobs"></a>
### Production requests and jobs

`creative_production` projects workbench intents and is concurrency-safe; it never edits creator documents or authorizes paid generation. A card's `ProductionRequestId`, the preparation's `SessionRequestId` and the execution's framework `JobId` stay distinct, and a binding requires a real Session-owned job and its `startedAt` epoch. Composition uses the confirmed `episode-compose` adapter and its returned background binding. Native results keep bindings in metadata and compact JSON, PTC keeps the JSON in its dispatch event, and the Conversation projection reads these logged results without a new history stream or Session format.

Story and drama independently retain editor buffers, conflicts and selections; drama also retains production preparation. Complete listings may remove clean deleted buffers but retain dirty drafts; partial listings cannot prove deletion. Saves use the last acknowledged CAS version. Old combined state is neither migrated nor read.

Execution state comes only from the Session's rows in the DSH `jobs` store, watched through `jobs.watchRows`; until that watch starts, job cards show loading. Historical unbound requests stay requests, and a bound job missing after a Host restart is unavailable, not completed or restarted. One card may own several jobs, and ended-job counts, Turns, files or estimated percentages never establish that planned output succeeded. Foreground results keep exit code, timeout, signal and bounded output separately; a nonzero or unknown exit code fails production.

The stop route requires a Session-owned job and its exact `jobId` and `startedAt`, rejects a stale reference, then calls `jobs.kill`. An admitted request without a job has no stop action. Stopping neither cancels the conversation nor consumes output; framework kill semantics mark terminal delivery reported without injecting a model-visible result, and the [background-job display decision](../../../../upstream/.agents/notes/implemented/feature/2026-08-08-web-background-job-display.md) owns that control feed.

The [finished-episode decision](2026-09-27-short-drama-finished-episode.md) owns coherent document snapshots, Python structural diagnostics, media validation and output manifests. The [game evidence decision](2026-09-27-novel-to-game-playability-evidence.md) owns Chrome QA and attestation; the [video delivery decision](2026-09-27-video-recap-delivery-and-compliance.md) owns local drafts, measured delivery evidence and the shared media runtime.

<a id="production-and-credentials"></a>
### Paid production and credentials

`creative_produce_run` executes a closed set of drama, voiceover, recap, game QA, diagnostic and Zhuque entries through the DSH shell, with argument quoting, workspace resolution and sandbox policy. It is not concurrency-safe because calls can spend money, and missing execution services fail when called. Drama requires a prepared, explicitly confirmed `job_id` and a matching adapter; replacement job JSON and extra arguments are rejected, and exactly `argv: ["--selftest"]` selects offline diagnostics that accept no job, stdin or production binding. Foreground and background calls share one runner: under the project lock, `production_tool.py` checks the job and its unused receipt, snapshots confirmed inputs, consumes the confirmation before provider execution, validates staged outputs, publishes them and writes the ledger. Preparation and confirmation share the document-specific `CREATOR_SOURCE_ENTRIES` mapping, so storyboard `SHOT-` image jobs stay valid while cross-modality bindings fail.

Agnes uses the same runner, confirmation and settings as the other adapters. Its video model resolves an unset or blank value to the free `agnes-video-2.5-flash`, and explicit configuration can select the billed `agnes-video-2.5`. Before consuming a receipt or writing an attempt, the runner compiles the confirmed snapshot with the adapter's request compiler, so local model, parameter and reference errors keep their diagnostic and an unused confirmation. The provider child compiles the same snapshot again, which keeps the adapter's stdin format at the cost of a second bounded read. Submission, polling and download failures keep the single-use rule.

Video entries run one script with one rotated key environment under Skill-enforced creator confirmation rather than the drama receipt and ledger; recap invokes the executable `recap.py`. The recap entry also dispatches explicit local drafts and bounded short-drama media review; paid picture analysis requires creator confirmation. Standalone full-video understanding still has no separate entry. The `story-zhuque` entry sends one chapter to Tencent EdgeOne Makers for AIGC detection, returns text or JSON and can write a JSON report; it never modifies the chapter, receives only `MAKERS_API_KEY` and needs no production confirmation.

The `creative-produce` profile stores six production-provider credential references, a separate Zhuque reference and non-secret runtime settings; key literals live in the credentials store. References resolve per call to canonical adapter variables, so a reference named `AGNES_POOL` can supply `AGNES_API_KEY`. Secrets travel only through the child environment and private pool stdin, never command text, model arguments or ambient `process.env`, and ordinary `bash` does not receive them. Comma-separated references and newline-separated stored keys form pools. Each call rotates its starting key; one drama run receives at most sixteen distinct keys and switches only after an initial-submission HTTP 401, 403 or 429 from the same URL tagged `submission_rejected`. Accepted requests, polling, downloads and uncertain failures never resubmit automatically, and the runner bounds attempts and waiting by its own timeout.

`creative_produce_status` reports non-secret provider and Zhuque credential presence through the same profile and credential lookup as execution, without starting a subprocess or consuming a confirmation. A scrubbed shell does not see the credential store, so Skills check missing keys with this tool and run configured Agnes image jobs through `creative_produce_run` with `adapter: agnes-image`. The production settings card stages non-secret edits together and reads all seven credential references at once, keeping each response tied to the reference it describes so a rename cannot publish an older result. Secret drafts start blank, blank means no write, and bulk key text stays in its dialog until saved. Plugin configuration seeds the profile, user settings override it, and advanced video tuning stays in validated environment options.

<a id="adaptation-and-source-material"></a>
### Adaptation and source material

Skills route novel-to-drama through the export package, novel-to-game through novel analysis, and drama-to-video through copies from `制作成果/` into `sources/`; a standalone short story is read directly. The exporter writes numerically ordered chapter text to `原著.txt` and a `章节映射.json` of zero-based `[start, end)` line spans, source paths and SHA-256 hashes. Duplicate numbers, non-chapter files, missing headings and number mismatches fail instead of silently corrupting citations. Export carries only text and the map, not style or tracking data without a consumer.

`改编谱系.jsonl` is an append-only ledger at the workspace root, written at adaptation intake with source fingerprints and decisions. Files hash by bytes and directories by a sorted path-and-hash listing; targets may not exist yet, and a pure delivery copy may carry no decision. The ledger stays outside the pipeline-owned `SOURCE_BIBLE`, which keeps game QA evidence immutable. There is no drama-to-game intake: adaptations of one IP share the original novel rather than treating compressed screenplay material as game-design source.

<a id="read-only-skill-viewer"></a>
### Read-only skill viewer

[`dsh-skill-viewer`](../../../../packages/skill/skill-viewer/README.md) owns the Session-addressed `skillViewer` Remote namespace. `listDetails` returns user-invocable entries with source and provider metadata, marking incomplete provider observations `stale`; `get` returns the verbatim loaded body and a JSON-safe resource base. Resolution uses `sessionQuery`: the live Agent's preset-scoped registry, or a cold Session's recorded-preset scope, with global fallback. No Agent resumes, and these human-only reads write no Session event or model context.

[`dsh-client-ui-skill-viewer`](../../../../packages/client/ui-skill-viewer/README.md) adds the sidebar-footer action and modal, with per-Session caches of successful reads and single-flight requests. Preset switches and connection resets invalidate the caches; changing Sessions selects that Session's data. The `@winterhuan/dsh-skill-viewer` bundle installs both plugins, and because `dsh-api-remotes` mounts only harness namespaces, the client plugin mounts the generated `skillViewer` Remote contribution itself. The composer `skills` namespace is unchanged. The viewer has no watch, so reopening does not refresh changed content, and Session replay does not reconstruct browsing.

The viewer fills the available viewport height, with a searchable catalog beside the reader on wide screens and one pane with a fixed Back control on narrow ones. Opening selects the first matching skill with metadata expanded. Only the catalog and reader scroll, the header stays visible, and selecting a skill or reference resets the reader to its start. Local files under a provider's `references/` directory open in the same reader without model tools. Host reads reject traversal, hidden paths, links and non-text content, and configurable entry and byte budgets report truncation. Reference reads are cancelled when their view is left, while skill bodies and listings keep their Session caches.

<a id="localization"></a>
### Localization

Workbench chrome uses the typed `creative` locale namespace with key-identical Chinese and English fragments and explicit translator props; plugin settings copy belongs to `settings.plugins`, and the client i18n check has no Creative exemption. Production diagnostics use message keys and parameters. Video stages, artifact labels and preview roles translate from codes, with a Host-label fallback for unknown video stages.

Workspace names, creator-protocol identifiers and production prompts stay zh-Hans regardless of browser locale. Operational route errors and runtime failures also stay zh-Hans until a stable error-code taxonomy supports render-time translation. Pure parsers do not localize their results.

## Alternatives considered

**Separate domain packages, upstream dashboards or external Role runtimes.** Each duplicates release, route, permission, Session and cancellation ownership, while adaptations cross domains. Split store slices when domain lifecycle state grows, or settings namespaces when one card is not enough; neither needs four applications or another server.

**Runtime Skill rewrites or generated replacement workflows.** Several instruction owners make file edits ineffective, and shared integration text suffices without weakening professional task divisions, artifact formats or quality requirements. Shared media code has one runtime owner and checked distribution copies; cross-tree episode composition requires the complete package.

**Hash manifests, a manifest generator, whole-tree fork labels or Cordis vendoring rules.** None verifies packaged knowledge at runtime; each duplicates Git or hides the small local diff behind a whole-tree label. Dropping the catalogs would lose useful Skill and Role inventories. A future external downloader needs its own integrity record.

**A second Conversation workspace, per-file or per-domain Creative pages, or Chat DOM reparenting.** Automatic opening and retained preview DOM offer continuity but need another layout, breakpoint and lifecycle policy. Independent pages duplicate project coordination state, and DOM takeover bypasses slot mounting, scrolling and accessibility. Persistent drafts, not uninterrupted previews, provide continuity.

**Persisted save locks, or resetting locks on mount.** Persistence cannot prove a request survived a refresh, and a reset on remount admits duplicate writes. Session-scoped transient locks match the real operation lifetime.

**Unbounded scans, a client-inferred cap or lexical-only file checks.** Recursive discovery turns every reload into an expensive crawl, and returning a count duplicates the limit in the client. Symlinks and identical remote and Host path names require explicit authorization regardless of parsing or listing completeness.

**A separate queue mirror, or production through the Conversation composer service.** The durable Inbox projection already carries the Host-addressed pending occurrences that the standard QueueDock uses, so a mirror would restore duplicate state. The workbench must persist its own `ProductionRequestId` and prompt before dispatch, while the composer owns editor drafts and attachments; sharing the Session submission lifecycle is enough.

**A persisted call-id set, or running calls rebuilt from the timeline or a copied legacy builder.** Session sequence already supplies a monotonic cursor, while a call-id set grows with history. Formal Chat tool nodes already carry the assembled running or settled tree, and another derivation would add a third tool-lifecycle representation.

**A second scheduler, or execution inferred from prose, Turns, files or percentages.** Concurrent requests and background work make those observations ambiguous, and a duplicated running-state table invents restart recovery. Logged bindings plus the DSH job registry keep intent without claiming execution that does not exist.

**Prompt-only drama confirmation, projection as authorization, or whole-run retries.** None binds spending atomically to confirmed inputs and verified publication, and restarting after acceptance can spend twice. Skipping SHOT confirmation removes the creator checkpoint, duplicating key frames in image-prompt files splits source truth, and copying the executor into a shim hides the shared document and modality rule.

**Mandatory selection of the free model, or model validation only during preparation.** A free default allows key-only Agnes setup while keeping paid selection explicit. Standalone preparation cannot see DSH's execution configuration, whereas the runtime check sees the resolved model and confirmed bytes together; checking only after consuming the confirmation would lose the receipt to an input that never reaches the provider.

**Secrets in settings, shell prefixes or the process-wide environment.** Settings are shared and rendered, command text is logged, and ambient mutation races Sessions and defeats credential scrubbing. Explicit references with per-call forwarding keep ownership with the producing call.

**Teaching the drama indexer sharded intake, guessing non-numeric chapter order, or extending `SOURCE_BIBLE` with lineage.** Export keeps the indexer's single-file span model and independently citable chapters. Guessing prologue or extra order corrupts citations and needs an explicit order manifest instead. Style passthrough needs a consumer, and pipeline-source immutability must not depend on adaptation bookkeeping.

**Extending the composer namespace, browsing through the `skill` tool, or reading Host files in the client.** Composer consumers do not need viewer payloads, and tool reads would log model-visible entries for human browsing. Direct file reads bypass preset layers, custom providers and invocation policy and expose Host paths. A watch or invoke-from-viewer action belongs in the viewer namespace if it is ever needed.

**Keeping an i18n exemption, or translating model prompts and Host errors as UI chrome.** An exemption leaves copy unowned, and translating prompts by browser locale changes model behavior. Translating Host errors needs stable codes rather than guesses about protocol text.

## Verification

The [Creative tests](../../../../packages/creative/creative/tests/) cover provider bodies, the host-reference check on bundled knowledge, shared scripts, project classification, symlink and media-provider isolation, exact listing limits, draft reconciliation and disposal. [Loader composition](../../../../packages/creative/creative/tests/loader-composition.spec.ts) proves headless registration without Web services. Video-preflight tests cover probe mapping, the Python fallback and the 30-second cache; native-hook tests pin logged tracking reminders after successful prose writes and their absence after failure or denial.

[Production runner tests](../../../../packages/creative/creative/tests/produce-contract.spec.ts) run the bundled Python path with offline fixtures, checking canonical credentials, confirmation, immutable inputs, retries and output publication. Agnes video cases cover the free default, explicit paid selection, three image references and an unchanged confirmation after local rejection with no attempt or network call. Exporter self-tests reconstruct chapter spans and reject invalid inputs, and a 20-chapter cross-check against `novel_index.py` keeps all 20 chapters; lineage self-tests cover round trips and six invalid inputs. Storyboard confirmation also has recorded evidence from a six-case SHOT, IMG and MOTION by image and video matrix and one real prepare-to-confirm run, but that matrix is not a committed regression suite.

Focused Client tests cover Inbox mapping, exact `rpcId` correlation in `next-turn`, exclusion of `next-step`, projection absence, withdrawal confined to the exact occurrence, thrown and rejected prompt dispatch, sequence ordering, one-time initial application, incremental application above the cursor, remount without repeated navigation, rejection of retired persisted fields, multiple jobs on one request, and running-root derivation from Chat nodes, including nested PTC mutations, fast settlement and hidden rows.

The [viewer Host tests](../../../../packages/skill/skill-viewer/tests/) include real Loader composition and disposal, and the [client tests](../../../../packages/client/ui-skill-viewer/tests/) exercise registration, the panel and Session-scoped request caching. Locale checks verify dictionary parity and the absence of a Creative exemption.

A recorded macOS x86_64 smoke run with `agent-browser 0.37.0` and `Lightpanda 1.0.0-nightly.9231+b21ec6085` covers Markdown extraction, snapshots, Chinese input, clicks, selector waits, stdin and base64 JavaScript, Cookie and localStorage retention across pages, and fresh state after close and reopen. HTTPS extraction succeeds, HTTP 404 with `--fail-on-http-error` exits 22, and Chrome profiles are rejected. `agent-browser 0.26.0` times out connecting to the same engine, so accepting `--engine` does not prove compatibility.

This repository has no recorded-session snapshot or Web end-to-end harness. Representative skill loading, workbench interaction, production bindings, reload, targeted stop and Host restart remain unverified in a browser.

## Consequences

Creative uses one DSH composition and the existing Session format. Model-visible Skills, Roles, tools and post-write reminders stay logged; human-only viewer reads deliberately do not. Bundled knowledge increases clone and package size, and on-demand distribution remains possible without changing provider discovery.

Remote filesystem reads do not stage packaged scripts into a remote shell, so deployments must mount or copy those resources. Sidebar tab lifetime does not preserve preview runtime. A cancelled or interrupted drama run may leave a consumed receipt and unresolved running ledger state; neither that receipt nor an unmatched process-local job is reused or restarted automatically.

Inbox rows cross the Remote as JSON-safe data and need the same narrow typed cast as current Conversation consumers; exact `source.kind` and `rpcId` checks keep withdrawal away from unrelated messages. Workbench records written with retired fields are not recovered, so those requests must be prepared again. A hidden running call still renders in the transcript but no longer contributes workbench mutations.

Video keeps Skill-enforced confirmation rather than the drama receipt and ledger. Non-numeric chapter ordering, style passthrough and viewer watches remain absent. Creative keeps its own read and invalidation code until the standard Workspace Files APIs can take over a complete responsibility without losing CAS, bounds, remote-filesystem behavior or preview security. Provider fixtures and Session replays do not establish live availability, billing behavior, site-specific browser compatibility or generated-media quality.
