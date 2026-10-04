#!/usr/bin/env python3
"""Query project continuity and measure, check, and commit story chapters."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Sequence


def _load_local_module(name: str, filename: str) -> Any:
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"TOOL_UNAVAILABLE: {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


core = _load_local_module("story_wordcount_core", "wordcount_core.py")
for _name in dir(core):
    if not _name.startswith("_"):
        globals()[_name] = getattr(core, _name)

CHAPTER_CHECK_SCHEMA = "story-chapter-check/v1"
CHAPTER_ERROR_SCHEMA = "story-chapter-error/v1"


class CliArgumentError(ValueError):
    pass


class StructuredArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliArgumentError(message)


def _tracking_module() -> Any:
    return _load_local_module("story_tracking_for_storyctl", "tracking_commit.py")


def _tracking_call(function: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return function(*args, **kwargs)
    except Exception as exc:
        if exc.__class__.__name__ == "TrackingError":
            raise WordcountError(str(exc)) from exc
        raise


def _json_line(payload: dict[str, Any]) -> None:
    rendered = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    # Windows runners may expose a cp1252 console even when callers explicitly
    # consume UTF-8.  Write protocol output as bytes so JSON never depends on
    # the host console code page.
    sys.stdout.buffer.write(rendered.encode("utf-8"))
    sys.stdout.buffer.flush()


def _read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise WordcountError(f"unable to read {label}: {exc}") from exc
    require(isinstance(value, dict), f"{label} must be an object")
    return value


def _json_findings(output: str) -> list[dict[str, Any]] | None:
    try:
        value = json.loads(output)
    except json.JSONDecodeError:
        return None
    findings = value.get("findings") if isinstance(value, dict) else None
    if not isinstance(findings, list) or any(
        not isinstance(finding, dict) or finding.get("severity") not in ("blocking", "advisory")
        for finding in findings
    ):
        return None
    return findings


def _run_quality_check(
    node: str, script: Path, args: list[str], source: str, blocking: list[dict[str, Any]],
) -> subprocess.CompletedProcess[str] | None:
    if not script.is_file():
        blocking.append({"type": "TOOL_UNAVAILABLE", "source": source, "message": f"missing {script.name}"})
        return None
    try:
        completed = subprocess.run(
            [node, str(script), *args],
            text=True, encoding="utf-8", capture_output=True, check=False,
        )
    except (OSError, UnicodeError) as exc:
        blocking.append({"type": "TOOL_ERROR", "source": source, "message": f"unable to execute {script.name}: {exc}"})
        return None
    if completed.returncode not in {0, 1} or (
        completed.returncode == 1 and (not completed.stdout.strip() or completed.stderr.strip())
    ):
        blocking.append({
            "type": "TOOL_ERROR", "source": source,
            "message": f"{script.name} exited {completed.returncode}: {(completed.stderr or completed.stdout).strip()}",
        })
        return None
    return completed


def check_blocking_quality(outline: Path, body: Path, project: Path | None = None) -> dict[str, Any]:
    node = os.environ.get("DSH_STORY_NODE") or shutil.which("node")
    if node is None:
        return {
            "status": "fail",
            "blocking_findings": [{"type": "TOOL_UNAVAILABLE", "message": "node is required for quality checks"}],
            "advisories": [],
        }
    root = Path(__file__).parent
    blocking: list[dict[str, Any]] = []
    advisories: list[dict[str, Any]] = []
    for name, script in (
        ("ai-pattern", "check-ai-patterns.js"),
        ("degeneration", "check-degeneration.js"),
    ):
        completed = _run_quality_check(
            node, root / script, ["--check", "--json", "--fail-on=blocking", str(body)], name, blocking,
        )
        if completed is None:
            continue
        findings = _json_findings(completed.stdout)
        if findings is None:
            blocking.append({"type": "TOOL_ERROR", "source": name, "message": f"invalid JSON findings from {script}"})
            continue
        expected_status = 1 if any(finding["severity"] == "blocking" for finding in findings) else 0
        if completed.returncode != expected_status:
            blocking.append({"type": "TOOL_ERROR", "source": name, "message": f"exit status disagrees with findings from {script}"})
        for finding in findings:
            row = {"source": name, **finding}
            (blocking if finding.get("severity") == "blocking" else advisories).append(row)

    completed = _run_quality_check(
        node, root / "normalize-punctuation.js",
        ["--check", *([] if project is None else ["--project", str(project)]), str(body)], "punctuation", blocking,
    )
    if completed is not None and completed.returncode == 1:
        advisories.append(
            {"source": "punctuation", "type": "PUNCTUATION_REVIEW", "message": completed.stdout.strip()}
        )

    completed = _run_quality_check(
        node, root / "check-outline-copy.js", ["--outline", str(outline), str(body)], "outline-copy", blocking,
    )
    if completed is not None and completed.returncode == 1:
        advisories.append(
            {"source": "outline-copy", "type": "OUTLINE_COPY_REVIEW", "message": completed.stdout.strip()}
        )
    return {
        "status": "fail" if blocking else "pass",
        "blocking_findings": blocking,
        "advisories": advisories,
    }


def check_outline_readiness(outline: Path) -> dict[str, Any]:
    report = _load_local_module("story_outline_contract", "check_outline_contract.py").verify(outline)
    return {"status": "pass" if report["ok"] else "fail", "failures": report["failures"]}


def chapter_check(project: Path, chapter: int) -> dict[str, Any]:
    tracking = _tracking_module()
    state = _tracking_call(tracking.load_state, project)
    snapshot = chapter_source_snapshot(project, chapter)
    outline, body_path = snapshot["paths"]["outline"], snapshot["paths"]["body"]
    try:
        target = target_from_outline(snapshot["contents"]["outline"].decode("utf-8"))
        body = snapshot["contents"]["body"].decode("utf-8")
    except UnicodeError as exc:
        raise WordcountError(f"unable to decode chapter files: {exc}") from exc
    length = evaluate_wordcount(body, target, chapter=chapter)
    outline_readiness = check_outline_readiness(outline)
    quality = check_blocking_quality(outline, body_path, project)
    length_ok = length["status"] in {"internal_pass", "borderline"}
    if outline_readiness["status"] != "pass" or quality["status"] != "pass" or length["status"] == "invalid":
        actions: list[str] = []
    elif length_ok:
        actions = ["commit"]
    elif length["status"] == "over":
        actions = ["compress-once", "accept-current-length", "revise-outline-or-target", "discard"]
    else:
        actions = ["accept-current-length", "revise-outline-or-target", "discard"]
    require_chapter_sources_unchanged(project, chapter, snapshot)
    require(_tracking_call(tracking.load_state, project)["state_revision"] == state["state_revision"],
            "tracking state changed during check; reload context and check again")
    compression = None
    if length["status"] == "over" and quality["status"] == "pass":
        actual = length["actual"]
        compression = {
            "mode": "single_pass_remove_only",
            "remove_to_internal_band": {
                "min": actual - length["internal_band"]["max"],
                "max": actual - length["internal_band"]["min"],
            },
            "remove_to_user_band": {
                "min": actual - length["user_band"]["max"],
                "max": actual - length["user_band"]["min"],
            },
        }
    return {
        "schema": CHAPTER_CHECK_SCHEMA,
        "chapter": chapter,
        "length": length,
        "outline_readiness": outline_readiness,
        "quality": quality,
        "compression": compression,
        "state_revision": state["state_revision"],
        **chapter_source_digests(snapshot),
        "tracking_committed": state["last_committed_chapter"] >= chapter,
        "next_chapter_started": state["last_committed_chapter"] > chapter,
        "available_actions": actions,
    }


def chapter_commit(project: Path, chapter: int, input_path: Path, *, accept_current_length: bool) -> dict[str, Any]:
    checked = chapter_check(project, chapter)
    require(checked["outline_readiness"]["status"] == "pass", "outline readiness findings must be fixed before commit")
    require(checked["quality"]["status"] == "pass", "blocking quality findings must be fixed before commit")
    length_status = checked["length"]["status"]
    in_user_band = length_status in {"internal_pass", "borderline"}
    if accept_current_length:
        require(length_status in {"under", "over"}, "accept-current-length requires a valid out-of-band chapter")
        resolution = "accepted_current_length"
    else:
        require(in_user_band, "chapter length is outside the user band; use accept-current-length or revise it")
        resolution = "within_user_band"
    document = _read_json_object(input_path, "tracking transaction")
    require(document.get("chapter") == chapter, "tracking transaction chapter does not match command")
    require("wordcount" not in document, "tracking transaction must not provide wordcount")
    require(document.get("expected_state_revision") == checked["state_revision"],
            "tracking state changed since this transaction was prepared")
    digests = {name: checked[name] for name in ("body_sha256", "outline_sha256")}
    validate_expected_source_digests(document, digests)
    # Bind this check to the locked transaction even on the ordinary direct path.
    document.update({f"expected_{name}": value for name, value in digests.items()})
    document["wordcount"] = build_project_wordcount_record(project, chapter, resolution=resolution)
    tracking = _tracking_module()
    state = _tracking_call(tracking.apply_transaction, project, document)
    checked["tracking_committed"] = state["last_committed_chapter"] >= chapter
    checked["next_chapter_started"] = state["last_committed_chapter"] > chapter
    checked["wordcount"] = state["wordcount_records"].get(str(chapter))
    return checked


def _build_parser() -> StructuredArgumentParser:
    parser = StructuredArgumentParser(prog="storyctl.py")
    commands = parser.add_subparsers(dest="command", required=True)
    project = commands.add_parser("project", help="read-only continuity status and focused queries")
    project_commands = project.add_subparsers(dest="project_command", required=True)
    for command in ("status", "query"):
        subparser = project_commands.add_parser(command)
        subparser.add_argument("--project", type=Path, required=True)
        subparser.add_argument("--revision", type=int, help="reject a changed revision while paging")
        if command == "query":
            subparser.add_argument("--kind", required=True, choices=("characters", "foreshadow", "author-timeline", "reader-timeline", "chapter"))
            subparser.add_argument("--search", default="")
            subparser.add_argument("--filter", default="all", choices=("all", "open", "due", "overdue", "unscheduled", "resolved"))
            subparser.add_argument("--chapter", type=int, help="due-date reference; required for a chapter record")
            subparser.add_argument("--offset", type=int, default=0)
            subparser.add_argument("--limit", type=int, default=20)
    wordcount = commands.add_parser("wordcount")
    wordcount_commands = wordcount.add_subparsers(dest="wordcount_command", required=True)
    for command in ("measure", "check", "checkpoint"):
        subparser = wordcount_commands.add_parser(command)
        subparser.add_argument("--file", required=True)
        subparser.add_argument("--chapter")
        subparser.add_argument("--case-id")
        if command != "measure":
            subparser.add_argument("--target", required=True)
    chapter = commands.add_parser("chapter")
    chapter_commands = chapter.add_subparsers(dest="chapter_command", required=True)
    for command in ("check", "commit", "accept-current-length"):
        subparser = chapter_commands.add_parser(command)
        subparser.add_argument("--project", type=Path, required=True)
        subparser.add_argument("--chapter", type=int, required=True)
        if command != "check":
            subparser.add_argument("--input", type=Path, required=True)
    return parser


def _wordcount_command(args: argparse.Namespace) -> int:
    try:
        body = Path(args.file).read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        result = (
            {"schema": MEASUREMENT_SCHEMA, "metric": METRIC, "chapter": args.chapter, "case_id": args.case_id,
             "actual": None, "status": "invalid", "invalid_reason": "INVALID_FILE"}
            if args.wordcount_command == "measure"
            else invalid_wordcount_result("INVALID_FILE", chapter=args.chapter, case_id=args.case_id)
        )
        _json_line(result)
        return 2
    if args.wordcount_command == "measure":
        result = measure_wordcount(body, chapter=args.chapter, case_id=args.case_id)
    elif args.wordcount_command == "checkpoint":
        try:
            result = checkpoint_wordcount(body, args.target, chapter=args.chapter, case_id=args.case_id)
        except WordcountError:
            result = invalid_wordcount_result("INVALID_TARGET", chapter=args.chapter, case_id=args.case_id)
    else:
        result = evaluate_wordcount(body, args.target, chapter=args.chapter, case_id=args.case_id)
    _json_line(result)
    return 2 if result.get("status") == "invalid" else 0


def main(argv: Sequence[str] | None = None) -> int:
    raw = list(argv) if argv is not None else sys.argv[1:]
    try:
        args = _build_parser().parse_args(raw)
    except CliArgumentError as exc:
        payload = (
            {"schema": "story-project-error/v1" if raw[:1] == ["project"] else CHAPTER_ERROR_SCHEMA,
             "error_code": "INVALID_ARGUMENT", "message": str(exc)}
            if raw[:1] in (["chapter"], ["project"]) else invalid_wordcount_result("INVALID_ARGUMENT", case_id=str(exc))
        )
        _json_line(payload)
        return 2
    if args.command == "wordcount":
        return _wordcount_command(args)
    if args.command == "project":
        try:
            query = _load_local_module("story_project_query", "project_query.py")
            options = ({"kind": args.kind, "search": args.search, "selection": args.filter,
                        "chapter": args.chapter, "offset": args.offset, "limit": args.limit}
                       if args.project_command == "query" else {})
            result = _tracking_call(query.project_query, args.project, _tracking_module(),
                                    expected_revision=args.revision, **options)
        except (WordcountError, OSError, UnicodeError, ValueError) as exc:
            _json_line({"schema": "story-project-error/v1", "error_code": "QUERY_FAILED", "message": str(exc)})
            return 2
        _json_line(result)
        return 0
    try:
        if args.chapter_command == "check":
            result = chapter_check(args.project, args.chapter)
        else:
            result = chapter_commit(
                args.project, args.chapter, args.input,
                accept_current_length=args.chapter_command == "accept-current-length",
            )
    except (WordcountError, OSError, UnicodeError) as exc:
        _json_line({"schema": CHAPTER_ERROR_SCHEMA, "error_code": "CHECK_FAILED", "message": str(exc)})
        return 2
    _json_line(result)
    return 2 if result["outline_readiness"]["status"] != "pass" or result["quality"]["status"] != "pass" else 0


if __name__ == "__main__":
    raise SystemExit(main())
