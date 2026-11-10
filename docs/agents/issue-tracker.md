# Issue tracker: GitHub

English | [中文](issue-tracker.zh.md)

## Summary

Track parent-repository tasks and specifications in GitHub Issues for `winterhuan/dsh-creative`. Use `gh` with an explicit `--repo winterhuan/dsh-creative` so entering a plugin submodule cannot redirect a parent task. Plugin-specific work follows the owning repository's conventions; confirm its target before publishing there.

## Contents

- [Issue operations](#issue-operations)
- [Relationships and wayfinding](#relationships-and-wayfinding)
- [Pull requests](#pull-requests)

<a id="issue-operations"></a>

## Issue operations

When a skill says “publish to the issue tracker”, create an issue in the selected repository. When it says “fetch the relevant ticket”, read that issue and its comments. The setup selects a destination; publishing messages still requires authorization from the user or an explicitly invoked skill.

Use `gh repo view --json nameWithOwner` to check the current repository. Prepare multiline bodies in a file and use `--body-file`; preserve existing content when editing.

| Operation | Command for this parent repository |
| --- | --- |
| Read | `gh issue view <number> --repo winterhuan/dsh-creative --json number,title,body,labels,comments` |
| List | `gh issue list --repo winterhuan/dsh-creative --state open --json number,title,labels` |
| Create | `gh issue create --repo winterhuan/dsh-creative --title "..." --body-file <file>` |
| Edit body | `gh issue edit <number> --repo winterhuan/dsh-creative --body-file <file>` |
| Comment | `gh issue comment <number> --repo winterhuan/dsh-creative --body-file <file>` |
| Apply or remove label | `gh issue edit <number> --repo winterhuan/dsh-creative --add-label "..."` or `--remove-label "..."` |
| Close | `gh issue close <number> --repo winterhuan/dsh-creative` |

Post any required closing explanation as a separate comment before closing, including when the issue is already closed. Use the [triage mapping](triage-labels.md) for state labels. Resolve an ambiguous issue/PR number before acting.

<a id="relationships-and-wayfinding"></a>

## Relationships and wayfinding

Prefer GitHub native sub-issues and issue dependencies when supported. Check the installed CLI help before using relationship flags. The inspected `gh 2.86.0` does not expose `--parent` or `--blocked-by`; use a verified GitHub API operation or the text fallback below. API relationship operations use numeric issue database IDs, not issue numbers or node IDs.

With the text fallback, place `Part of #<parent>` at the start of a child issue and add its link to the parent's task list. Record `Blocked by: #<number>, #<number>` near the start of a dependent issue. It becomes startable when every blocker is closed.

When a wayfinding skill is explicitly invoked, the map is one issue labelled `wayfinder:map`; child issues use `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`. Create those labels only when needed. Select the first open, unassigned child in map order with no open blockers. Claim it by assigning the driving developer before work. Resolve it with an answer comment, close it, then add a concise answer and link to the map's decisions. Retrieve further pages when a listing is incomplete.

<a id="pull-requests"></a>

## Pull requests

**PRs as a request surface: no.** External PRs do not enter the issue triage queue. Change this flag explicitly if that workflow is adopted.
