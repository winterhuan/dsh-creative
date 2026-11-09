# Agent Note: Original Antfarm agents and storage on DSH

Status: implemented

English | [中文](2026-11-08-antfarm-original-agents-and-storage.zh.md)

## Problem

Antfarm users need the original workflow method, role identities and recoverable execution on DSH. Matching stage names does not preserve its agent instructions, text output protocol or SQLite recovery semantics. A DSH capability preset also cannot represent an identity with its own persona and external memory.

## Decision

The behavioral baseline is snarktank/antfarm 0.5.1. The bundle ships its three original workflow definitions and AGENTS.md, SOUL.md and IDENTITY.md resources unchanged. An Antfarm agent is a stable workflow-qualified identity with its own persona, role policy, optional skills, model and workspace. Every attempt creates a fresh native DSH Session using the shared standard composition. No Antfarm role presets are registered.

The system-prompt extension associates persona with the reserved attempt Session before activation, following DS-Bot's separation of persistent identity from runtime Session. Visible tools and actual dispatch enforce the original role policy using native tool names. Available declared skills enter the persona; unavailable optional skills are disclosed to the child, following original provisioning. Installed persona resources update only after their identity is claimed, and conflicting local edits remain intact. Conversation history stays fresh; workspace files and Git progress carry external memory.

Native replies use explicit `STATUS: done|retry|failed` to distinguish success, verification rejection and execution failure; success also requires the step’s `expects` text. Single-step rejection stops the run for recovery after correction, while story verification retains automatic retries. Execution failures and malformed replies consume existing budgets. Recovery guidance and previous failure feedback enter subsequent input, and persona variables resolve from claim context. Unchanged templates retain and load local learning; differing concurrent changes to templates and workspace files prevent overwrite. This adaptation retains original resources and learning without introducing a general retry graph.

Original antfarm.db runs, steps and stories own business state. SQL transactions commit admission, claim, text output/context, story verification, retries and resume. DSH owner, attempt and host associations use additional integration tables. Exact claimant IDs reject late results; events.jsonl is best-effort observation and never reconstructs SQL state. Single-step failure directives remain original metadata rather than a general retry graph.

DSH Jobs and model-free polling own dispatch. An identity permits one active native attempt across runs. Original role deadlines feed single-step abandonment or story retry only after child teardown succeeds. The fifth single-step abandonment fails the run, and resume preserves consumed story retries. Cancellation and shutdown await exact activation disposal; failed teardown leaves an interrupted, uncertain attempt. Startup does not replay crash-open work, and explicit recovery guidance is required before its effects can repeat. Referenced story verifiers and exhausted verification remain reachable, correcting original predecessor/recovery stalls.

Native management surfaces project these records directly. Revision-bound project/user overrides retain original YAML and resource references; admitted runs retain immutable definitions. Shared agent workspaces stay retained, and completed loop progress is archived. Prior DSH JSONL runs remain attributable, complete-prefix, inspection-only records; no migration, cleanup or replay changes their bytes.

The [initial runtime](../../archived/architecture/2026-11-08-antfarm-reimplementation.md) and [team runtime](../../archived/architecture/2026-11-08-antfarm-team-workflow-runtime.md) preserve historical rationale. Their preset and journal-authority decisions are superseded. Their ownership, cancellation, path/revision and historical-data concerns are implemented by this adapter. The obsolete native-convergence and expanded-team proposals are removed; current external validation gaps belong to [PARITY](../../../../plugins/dsh-antfarm/PARITY.md).

## Alternatives considered

**One preset per role.** Presets configure the DSH harness and do not represent persistent Antfarm identities. They expose internal roles as user-facing modes and lose the original persona organization.

**Keep JSONL authority behind SQLite.** This retains a second state machine with different recovery semantics. Original business rows and transitions must own progress; historical journals remain inspection-only.

**Use native Workflow or Agent Team as business state.** These services do not implement the original Antfarm tables and worker protocol. Wrapping each attempt adds execution ownership while retaining the business driver. DSH supplies execution without replacing the method.

**Adopt DS-Bot's whole product.** Its identity-to-session separation is useful, but persistent chat, group coordination and state.json differ from Antfarm's fresh attempts and SQLite execution.

**Enforce independent candidate, GitHub and artifact acceptance.** These checks change original worker-reported completion semantics and require a separate product contract. The original personas remain responsible for their declared tests and PR actions; a successful reply is a reported result.

**Automatically rerun interrupted attempts.** A child can act before SQL completion commits. Neither deadlines nor a fresh Session prove those effects absent; reconciliation remains explicit.

## Consequences

Original resources, SQL transitions, identities, retries and native lifecycle share one execution path. Custom original-format workflows use the same loader and management protections. Extra research/writing templates, structured-result contracts, retry grants, artifact snapshots and per-run cleanup are absent. Stable workspaces preserve original external memory while giving up per-run checkout isolation.

Shell and skill access remain governed by deployment permissions; direct tool restrictions do not make them read-only. Explicit recovery can repeat effects, so neither SQLite nor native Sessions guarantee exactly-once execution. Webhooks are best-effort and separate from SQL acceptance.

[Tests](../../../../plugins/dsh-antfarm/tests/) cover original resources, SQL state, stale results, cancellation, timeout/teardown, persona conflicts, optional skills, progress and historical preservation. Isolated DSH Web acceptance completes all three workflows with twenty distinct native Sessions and Bash calls, using a deterministic adapter. Real-model quality, live GitHub delivery, other platforms and publication need separate evidence; [PARITY](../../../../plugins/dsh-antfarm/PARITY.md#acceptance-scope) owns that scope.
