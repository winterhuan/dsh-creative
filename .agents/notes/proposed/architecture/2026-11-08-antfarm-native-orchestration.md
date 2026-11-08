# Agent Note: Antfarm native execution and collaboration boundaries

Status: proposed

English | [中文](2026-11-08-antfarm-native-orchestration.zh.md)

The [team runtime decision](../../implemented/architecture/2026-11-08-antfarm-team-workflow-runtime.md) records the implemented portion. This proposal remains active for external acceptance and native convergence conditions; [coverage](../../../../plugins/dsh-antfarm/PARITY.md) distinguishes implemented capabilities from verified outcomes.

## Problem

Antfarm needs enforced independent verification, bounded retries, recoverable business progress, and owned worktrees. Native workflow and Agent Teams offer overlapping execution and presentation machinery, but replacing a component based on its name can lose these guarantees or add a second executor and task board. The [implemented decision](../../implemented/architecture/2026-11-08-antfarm-reimplementation.md) owns the current v2 implementation; this proposal defines native convergence and collaboration boundaries without changing runtime behavior.

The comparison uses DSH `dsh-v0.2.2-rc.1` source and existing test assertions. It is a design review, not a new native workflow or Team acceptance run.

The [team-workflow delivery plan](2026-11-08-antfarm-team-workflow-plan.md) owns product scope, role handoffs, candidate acceptance, and implementation phases. This note retains the executor, persistence, and Team integration conditions.

## Proposal

Keep Antfarm responsible for a coding Run: resolved recipe, accepted business checkpoints, verification and retry policy, and worktree lifecycle. DSH remains responsible for child execution, jobs, session transcripts, permissions, and subprocesses. A Run is identified independently of the initiating Session's Team. Preserve one authoritative business state and one execution owner.

### Native capability boundaries

| Native capability | Consequence for Antfarm |
|---|---|
| [Workflow script execution](../../../../upstream/packages/workflow/workflow-ptc/src/runtime.ts) supports `agent`, `parallel`, and per-item `pipeline`. | A trusted script can express retries and verification. `passed: false` is business data, and a `null` stage result does not stop later stages; acceptance must be explicit. |
| [Workflow host](../../../../upstream/packages/workflow/workflow-ptc/src/host.ts) owns the PTC process and child cleanup. | Its current request captures parent cwd, omits role presets and preallocated child identity, and provides no awaitable checkpoint binding. It cannot execute the existing Run contract unchanged. |
| [Workflow tool records](../../../../upstream/packages/workflow/tool-workflow/src/types.ts) persist display facts. | Run and child history can survive restart; script state, accepted outputs, retries, and repair position cannot be recovered from those records. |
| [Team service](../../../../upstream/packages/experimental/agent-team/src/types.ts) owns continuable members, direct messages, and shared tasks. | Reuse it for actual peer collaboration. Team membership, task completion, and message acceptance do not certify an Antfarm checkpoint. |
| [Team task transitions](../../../../upstream/packages/experimental/agent-team/src/task-board.ts) provide CAS and dependency checks. | Implementation, verification, and final acceptance have different meanings. A claimed task may be completed by its owner; the native board does not enforce independent verification. |
| [Session event compatibility](../../../../upstream/packages/core/session/src/known-event-types.ts) uses a fixed required-event set. | An external Antfarm plugin cannot introduce required checkpoint events by declaration merging. [Plugin records](../../../../upstream/packages/core/session/README.md#write-experimental-plugin-records) forbid external callers and promise only best-effort migration retention. |

### Composition on the current release

Keep the current direct native `subagents.startActivation` call, complete checkpoint journal, and read-only Runs transport until the missing public contracts exist. Do not add a PTC workflow around each attempt, a YAML-specific replacement for the generic WorkflowEngine, or synthetic native workflow events. These changes would retain the business driver while adding execution owners.

Team collaboration belongs to an explicitly enabled native Team layer in the deployment profile; Antfarm does not require a Team dependency. The root Lead may launch an Antfarm Run and wait for its result. A few fixed teammates may perform research or other separately assigned work through native messages and tasks. Antfarm attempt children remain fresh, preset-specific, structured-output workers outside the Team roster. They cannot launch Runs. Native teammate tools inherit the Lead's cwd and composition; a task description does not change cwd or role composition, or establish filesystem isolation. Deployment permissions and sandbox settings govern actual checkout access.

Keep native Team UI for members and collaboration tasks, and Antfarm Runs UI for verified progress, recovery, and output disposition. Do not mirror every story or checkpoint into Team tasks. Native Team names and member limits are shared by all Runs in one root Session, so creating a teammate for every attempt would consume permanent roster entries. A Team task associated with a Run remains an ordinary coordination record; Run completion and Team task updates are separate commits, with no automatic completion synchronization in this proposal.

Headless callers must await Run completion rather than treat a Job receipt as completion. [Headless shutdown](../../../../upstream/packages/bundle/headless/src/index.ts) waits for the Agent and subagents, then exits; it does not wait for arbitrary jobs. Owner cancellation must stop and drain execution before cleanup.

### Run execution and authority

The Lead starts a recipe in an owned worktree. The Run driver durably records each attempt identity before starting a native preset activation. A developer's result enters independent verification in a fresh child; only accepted verification advances the story checkpoint. Rejection supplies feedback to bounded repair, and exhaustion records a failed or blocked result according to the recipe. Resume starts from the last accepted checkpoint and requires explicit reconciliation of an unmatched attempt. The Lead waits for the final Run result before reporting completion or separately updating a Team task.

### Conditions for replacing the executor

Evaluate a native WorkflowEngine-backed Run only when public execution contracts provide all of the following: a run-owned cwd without changing the initiating Session; validated role preset selection and attempt deadlines; an awaitable pre-start operation that reserves and durably records child identity; and a trusted, awaitable checkpoint operation whose failure stops further children. Resume must receive the saved recipe and accepted checkpoint, and execute only unaccepted work.

Antfarm would retain business validation and checkpoint policy while native workflow owns the script and child lifetimes. This must replace the current execution owner. Compare the removed driver machinery with generated script logic, bindings, validation, and teardown together; moving the same business loop into a script alone is insufficient. Native observation events remain presentation facts, never durability barriers.

### Conditions for replacing persistence and transport

Evaluate native Session persistence and shared projections only after DSH provides a supported downstream state contract with required retention, cold reading, version handling, and independent fork ownership. Type augmentation and an external-state closure in a projection are insufficient. Current projection definitions fold Session events and cannot push an independent journal into the shared store.

The new driver must await a participating durability barrier and stop after a flush failure. [Session flush](../../../../upstream/packages/core/session/src/index.ts) returns whether a durability listener participated; successful resolution with no listener is insufficient. Append-time projection publication precedes flush, so live UI must not certify durability before that barrier. A successful migration could remove the independent file writer, directory validation, run-file lease, scans, polling, dedicated read Remote, and its generation adapter. It must not retain a second journal to synchronize.

## Alternatives considered

**Use only native workflow scripts and presets now.** This removes the YAML interpreter but gives up the existing role composition, worktree execution context, pre-start identity checkpoint, and restart recovery. It is suitable for one-shot workflows if those losses are accepted, not an equivalent replacement.

**Use Team tasks as the entire Run state.** Team has no Run worktree or verification verdict, and completing or reopening a task does not implement checkpoint recovery or invalidate already completed dependent work. Encoding checkpoints in task descriptions conflates independent authoritative records.

**Create an independent root Team per Run.** A dedicated root could own the worktree cwd and isolate its roster, but adds root Session creation, cold recovery, navigation, and teardown. Team roles still inherit one composition, and native spawn requests do not accept role presets or structured output. Defer until persistent peer collaboration inside the Run is a product requirement.

**Write custom required Session events or experimental plugin records now.** Unknown required events break native cold reading. The experimental record writer excludes external plugins and does not provide required checkpoint retention. Retain the independent business journal.

**Wrap each Antfarm attempt in native workflow.** The outer driver still owns checkpoints and repair while the inner engine adds script compilation, a PTC process, and cancellation ownership. Reuse must remove an executor, not surround it.

## Acceptance criteria

- On the pinned release, native Team Lead composition can invoke one Antfarm Run; ordinary attempt children receive no Team membership or Antfarm controls. Team members' checkout access remains governed by deployment permissions and sandbox settings.
- The existing verification, retry, uncertain recovery, single-driver admission, and clean-only worktree tests remain effective. `completed` means the Run's checks passed, not that a Team member reported task completion.
- Headless acceptance explicitly waits for the final Run result and proves cancellation drains children before exit. Web acceptance distinguishes native Team coordination from Run verification and preserves native child navigation.
- Any native executor replacement proves preset/cwd/deadline fidelity, checkpoint-before-start, failure-before-next-child, cancellation during startup, and restart after a child finishes before checkpoint acceptance. Only one executor remains.
- Any persistence replacement proves cold replay, flush failure, zero-listener refusal, foreign ownership, ordinary forks, concurrent writers, and version compatibility before deleting the independent journal and read transport.
- No source under `upstream/` is changed by this proposal. New upstream contracts and a dependency upgrade require separate implementation and version validation.

## Risks

Native Team is experimental and its shared checkout requires explicit coordination; write scopes are advisory. Combining services by default would add policy and prompt cost without adding Run guarantees. Required upstream contracts may not be accepted, so convergence conditions must not become a second speculative framework in Antfarm.

Restoring from a checkpoint may repeat effects after the last accepted state. Neither Team messaging nor native workflow changes that limitation. Persistence and executor replacements must preserve that explicit uncertainty rather than silently claim exactly-once execution.
