#!/usr/bin/env python3
"""Deterministic chapter checks and guarded tracking commits for the packaged CLI."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

_RUNTIME = Path(__file__).resolve().parent
if str(_RUNTIME) not in sys.path:
    sys.path.insert(0, str(_RUNTIME))

import check_outline_contract
import tracking_commit
import wordcount_core as core

for _name in dir(core):
    if not _name.startswith("_"):
        globals()[_name] = getattr(core, _name)

CHAPTER_CHECK_SCHEMA = "story-chapter-check/v1"


def _tracking_call(function: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return function(*args, **kwargs)
    except tracking_commit.TrackingError as exc:
        raise WordcountError(str(exc)) from exc


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
    report = check_outline_contract.verify(outline)
    return {"status": "pass" if report["ok"] else "fail", "failures": report["failures"]}


def chapter_check(project: Path, chapter: int) -> dict[str, Any]:
    state = _tracking_call(tracking_commit.load_state, project)
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
    require(_tracking_call(tracking_commit.load_state, project)["state_revision"] == state["state_revision"],
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
    state = _tracking_call(tracking_commit.apply_transaction, project, document)
    checked["tracking_committed"] = state["last_committed_chapter"] >= chapter
    checked["next_chapter_started"] = state["last_committed_chapter"] > chapter
    checked["wordcount"] = state["wordcount_records"].get(str(chapter))
    return checked


if __name__ == "__main__":  # pragma: no cover - the CLI dispatcher imports this module
    raise SystemExit("storyctl.py is an internal module; run the packaged dsh-story CLI")
