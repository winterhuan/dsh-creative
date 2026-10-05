---
name: dsh-pre-push-checks
description: Use before committing, pushing, or claiming checks pass in the dsh-creative repository, to select the smallest tests and checks that cover the outgoing diff without reflexively running every gate.
---

# dsh-creative pre-commit checks

Select the narrowest evidence that would fail for the change you are about to commit or push. This repository has no CI and no git hooks: the commands you run are the only evidence that exists, and nothing else will catch what you skip.

## Inspect the outgoing change

```sh
git status --short --branch
git diff --stat HEAD
```

A change that moves or renames files also affects the configuration that names those paths: `pnpm-workspace.yaml`, the three root `tsconfig` aggregates, `tsdown.config.ts`, `vitest.config.ts`, the `clean` script, each package's `tsconfig` `extends` and `references`, and each `package.json` `repository.directory`.

## Select relevant evidence

| The change touches | Run |
|---|---|
| Package source or tests | the owning Vitest file, then `pnpm test` when a shared contract changed |
| Host source that Client source imports | `pnpm run typecheck` — the Client face compiles against the Host face's generated declarations |
| A `@Remote` method, `TypertRemoteService`, or `bindTypertRemote` | `pnpm run build:host`, which regenerates the typert artifacts the Client face consumes |
| Client browser code | `pnpm run build`, then load the plugin in a real dsh (HANDOFF.md section 5) — unit tests do not cover browser behavior |
| `package.json`, `exports`, `cordis.patch.yml`, or build configuration | `pnpm run build`, then install into a profile and check the synthesized configuration |
| Markdown, Agent Notes, or README contracts | `pnpm run doc-sync` |
| Client UI copy, exported JSDoc, or a new type assertion | `pnpm run hygiene` |
| Repository scripts under `scripts/` | `pnpm run typecheck`, which includes `tsconfig.scripts.json` |
| A DSH dependency version | the full sequence plus a real-dsh install (HANDOFF.md section 9) |

Pass Vitest file and name filters directly after the script name; do not insert a standalone `--`, which reaches Vitest and can disable `-t` filtering:

```sh
pnpm test packages/creative/short-drama/tests/produce-tool.spec.ts -t 'rotates'
```

Check the reported test count before treating a filtered run as evidence.

Client specs (`*.client.spec.ts(x)`) load DSH client source from the `upstream/` submodule, so they need `git submodule update --init`. Builds and type checks do not.

## Do not repeat passing checks

`pnpm run typecheck` already builds the Host face; running `pnpm run build:host` again before it proves nothing. A full `pnpm test` after a focused run that covered the change adds no evidence about that change.

## Full local rehearsal

Run everything only when the change spans the repository so broadly that no narrower set is credible, or when the user asks:

```sh
pnpm run typecheck && pnpm run build && pnpm test && pnpm run doc-sync && pnpm run hygiene
```

## Handle failures

Fix or explain a failure before committing; do not commit and hope it is unrelated. Report what you ran and what it said, naming any check you chose not to run. An unverified browser behavior is unverified, whatever the unit tests say.

If a failure looks environment-specific, prove it: record the exact command and mismatch, and confirm the relevant non-platform evidence. `python3` must be present for the knowledge-script tests, and `all_proxy` in this environment makes curl reach a local dsh only with `--noproxy '*'`.

## Commit and push

Stage by path. Another session may be working in the same worktree, so `git add -A` and `git commit -a` can carry someone else's files into your commit:

```sh
git add <your paths>
git diff --cached --stat
```

Read that listing before committing. This repository has no remote configured; a push requires the user to add one first.
