"""Bounded, read-only queries over the existing tracking state and chapter records."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

QUERY_MAX_BYTES = 16_384
STATE_SOURCE = "追踪/_tracking-state.json"
KINDS = ("characters", "foreshadow", "author-timeline", "reader-timeline", "chapter")
FILTERS = ("all", "open", "due", "overdue", "unscheduled", "resolved")


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def source_path(project: Path, relative: str, tracking: Any) -> Path:
    path = project / relative
    tracking.require(path.resolve().is_relative_to(project.resolve()), f"source leaves selected project: {relative}")
    return path


def matches_foreshadow(row: dict[str, Any], selection: str, chapter: int) -> bool:
    due = row["planned_resolution_chapter"]
    if selection == "all":
        return True
    if selection == "resolved":
        return row["status"] == "已回收"
    if row["status"] != "已埋":
        return False
    return (selection == "open" or (selection == "unscheduled" and due is None)
            or (selection == "due" and due is not None and due <= chapter)
            or (selection == "overdue" and due is not None and due < chapter))


def project_query(project: Path, tracking: Any, *, kind: str | None = None, search: str = "",
                  selection: str = "all", chapter: int | None = None, offset: int = 0,
                  limit: int = 20, expected_revision: int | None = None) -> dict[str, Any]:
    """Read a single state revision. Pagination never rewrites state or silently drops an oversized item."""
    tracking.require(project.is_dir(), "project directory does not exist")
    tracking.require(kind is None or kind in KINDS, "unsupported query kind")
    tracking.require(selection in FILTERS, "unsupported foreshadow filter")
    tracking.require(kind == "foreshadow" or selection == "all", "--filter requires --kind foreshadow")
    tracking.require(offset >= 0 and 1 <= limit <= 50, "offset must be nonnegative and limit must be 1..50")
    tracking.require(chapter is None or chapter > 0, "chapter must be positive")
    tracking.require(kind != "chapter" or chapter is not None, "--kind chapter requires --chapter")
    path = source_path(project, STATE_SOURCE, tracking)
    source_path(project, "追踪/.tracking-commit.lock", tracking)
    tracking.require(not tracking.project_commit_in_progress(project), "tracking commit is in progress; retry the query after it finishes")
    if not path.exists():
        tracking.require(expected_revision is None, "tracking state disappeared; restart the query")
        return {"schema": "story-project-query/v1", "initialized": False, "source": STATE_SOURCE}
    original = path.read_bytes()
    state = tracking.normalize_state(json.loads(original.decode("utf-8")))
    revision = state["state_revision"]
    tracking.require(expected_revision is None or revision == expected_revision,
                     "tracking revision changed; restart the query from offset 0")
    through = state["last_committed_chapter"]
    at_chapter = chapter if chapter is not None else through + 1
    base = {"schema": "story-project-query/v1", "initialized": True, "source": STATE_SOURCE,
            "book_title": state["book_title"], "state_revision": revision,
            "state_sha256": hashlib.sha256(original).hexdigest(), "through_chapter": through,
            "imported_through_chapter": state["imported_through_chapter"]}
    if kind is None:
        hooks = list(state["foreshadow"].values())
        result = {**base, "next_chapter": through + 1, "context": state["context"],
                  "counts": {"characters": len(state["characters"]), "foreshadow": len(hooks),
                             "open": sum(matches_foreshadow(row, "open", at_chapter) for row in hooks),
                             "due": sum(matches_foreshadow(row, "due", at_chapter) for row in hooks),
                             "overdue": sum(matches_foreshadow(row, "overdue", at_chapter) for row in hooks),
                             "unscheduled": sum(matches_foreshadow(row, "unscheduled", at_chapter) for row in hooks),
                             "timeline": len(state["timeline"])}}
    else:
        rows: list[dict[str, Any]] = []
        missing: list[str] = []
        if kind == "characters":
            rows = [{"name": name, **row, "source": f"追踪/角色状态/{name}.md"}
                    for name, row in sorted(state["characters"].items())]
        elif kind == "foreshadow":
            importance = {"高": 0, "中": 1, "低": 2}
            rows = [{**row, "source": "追踪/伏笔.md"} for row in state["foreshadow"].values()
                    if matches_foreshadow(row, selection, at_chapter)]
            rows.sort(key=lambda row: (row["planned_resolution_chapter"] or float("inf"),
                                       importance[row["importance"]], row["id"]))
        elif kind in {"author-timeline", "reader-timeline"}:
            field = "objective_fact" if kind == "author-timeline" else "reader_knowledge"
            source = "追踪/时间线/作者真相.md" if kind == "author-timeline" else "追踪/时间线/读者已知.md"
            for row in sorted(state["timeline"].values(), key=lambda row: (row["first_recorded_chapter"], row["id"])):
                rows.append({key: row[key] for key in ("id", "story_time", field, "reveal_status", "reveal_chapter",
                                                        "characters", "first_recorded_chapter", "updated_chapter")}
                            | {"source": source})
        else:
            tracking.require(at_chapter <= through, "chapter is beyond committed tracking")
            relative = tracking.delta_path(Path("追踪"), at_chapter).as_posix()
            delta = source_path(project, relative, tracking)
            if delta.exists():
                payload = delta.read_bytes()
                tracking.require(len(payload) <= tracking.DELTA_MAX_BYTES, f"chapter record exceeds byte limit: {relative}")
                rows = [{"chapter": at_chapter, "content": payload.decode("utf-8"), "source": relative}]
            else:
                missing = [relative]
        needle = search.casefold().strip()
        if needle:
            rows = [row for row in rows if needle in json.dumps(row, ensure_ascii=False).casefold()]
        result = {**base, "kind": kind, "at_chapter": at_chapter, "filter": selection, "search": search,
                  "total": len(rows), "offset": offset, "items": [], "omitted": len(rows),
                  "next_offset": None, "missing_sources": missing}
        for row in rows[offset:offset + limit]:
            result["items"].append(row)
            count = len(result["items"])
            result["omitted"] = len(rows) - count
            result["next_offset"] = offset + count if offset + count < len(rows) else None
            if len(encoded(result)) > QUERY_MAX_BYTES:
                result["items"].pop()
                tracking.require(bool(result["items"]), "one result exceeds query byte budget; read its source directly")
                break
        count = len(result["items"])
        result["omitted"] = len(rows) - count
        result["next_offset"] = offset + count if offset + count < len(rows) else None
    tracking.require(len(encoded(result)) <= QUERY_MAX_BYTES, "query exceeds byte budget; narrow its scope")
    tracking.require(not tracking.project_commit_in_progress(project) and path.read_bytes() == original, "tracking changed during query; restart from offset 0")
    return result
