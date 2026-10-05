#!/usr/bin/env python3
"""Public command dispatcher for the packaged dsh-story CLI."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any

sys.dont_write_bytecode = True

import author_memory_commit as memory
import check_outline_contract as outline
import export_novel_txt as exporter
import project_query as queries
import record_lineage as lineage
import storyctl
import tracking_commit as tracking
import wordcount_core as words
import zhuque_detect as zhuque

RUNTIME = Path(__file__).resolve().parent
RESERVED_BOOKS = frozenset({"长篇", "短篇", "拆文库", "正文", "大纲", "设定", "追踪", "对标", "参考资料"})
EXIT_HELP = "Exit codes: 0 success, 1 check findings, 2 invalid input, 3 execution failure. Zhuque also uses 4 for service errors. Results are JSON."


class CliError(ValueError):
    def __init__(self, message: str, code: str = "INVALID_ARGUMENT", exit_code: int = 2):
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise CliError(message)


def emit(value: Any) -> None:
    sys.stdout.buffer.write((json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8"))
    sys.stdout.buffer.flush()


def workspace_path(raw: Path) -> Path:
    path = raw.resolve()
    if not path.is_dir():
        raise CliError(f"workspace directory does not exist: {raw}")
    return path


def book_path(workspace: Path, name: str, *, create: bool = False) -> Path:
    if (not name or name != name.strip() or name.startswith(".") or name in RESERVED_BOOKS
            or any(character in name for character in "/\\:\0")):
        raise CliError("--book must be one work name, not a path, category, or shared library")
    path = workspace / name
    if path.resolve() != path or path.resolve().parent != workspace:
        raise CliError("book must be a real direct child of the selected workspace")
    if path.exists() and not path.is_dir():
        raise CliError(f"book is not a directory: {path}")
    if not path.exists() and not create:
        raise CliError(f"book directory does not exist: {path}")
    # These are the roots used by the internal chapter and tracking operations.
    for child in ("正文", "大纲", "设定", "追踪"):
        if not (path / child).resolve().is_relative_to(path):
            raise CliError(f"book resource leaves the selected work: {child}")
    file_path(path / "设定/写作检查.json", path, output=True)
    return path


def file_path(raw: Path, project: Path | None = None, *, output: bool = False) -> Path:
    project = project.resolve() if project is not None else None
    path = ((project / raw) if project is not None and not raw.is_absolute() else raw).resolve()
    if project is not None and not path.is_relative_to(project):
        raise CliError(f"file leaves selected book: {raw}")
    if not output and not path.is_file():
        raise CliError(f"file does not exist: {path}")
    return path


def read_object(path: Path) -> dict[str, Any]:
    value = json.loads(file_path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise CliError("input JSON must be an object")
    return value


def contained_tree(root: Path, directory: Path) -> None:
    """Protect generated views and existing transaction files from symlink escapes."""
    for path in (directory, *directory.rglob("*")):
        if not path.resolve().is_relative_to(root):
            raise CliError(f"resource leaves selected scope: {path}")


def node_command(script: str, arguments: list[str]) -> subprocess.CompletedProcess[str]:
    node = os.environ.get("DSH_STORY_NODE") or shutil.which("node")
    if not node:
        raise CliError("Node is unavailable; run the packaged dsh-story launcher", "TOOL_UNAVAILABLE", 3)
    try:
        result = subprocess.run([node, str(RUNTIME / script), *arguments],
                                text=True, encoding="utf-8", capture_output=True, check=False)
    except OSError as error:
        raise CliError(f"cannot execute {script}: {error}", "TOOL_UNAVAILABLE", 3) from error
    if result.returncode not in (0, 1):
        raise CliError(f"{script} failed ({result.returncode}): {(result.stderr or result.stdout).strip()}",
                       "EXECUTION_FAILED", 3)
    if result.stderr:
        sys.stderr.write(result.stderr)
    return result


def snapshot(project: Path, chapter: int, *, outline_only: bool = False) -> dict[str, Any]:
    project = project.resolve()
    state_file = project / "追踪/_tracking-state.json"
    lock = project / "追踪/.tracking-commit.lock"
    file_path(state_file, project)
    file_path(lock, project, output=True)
    if tracking.project_commit_in_progress(project):
        raise CliError("tracking commit is in progress; retry after it finishes")
    before = state_file.read_bytes()
    state = tracking.normalize_state(json.loads(before.decode("utf-8")))
    if outline_only:
        outline_path = words.find_chapter_file(project / "大纲", chapter, outline=True)
        body_path = words.find_chapter_file(project / "正文", chapter, outline=False, allow_missing=True)
        files = {"outline": outline_path}
        def collect() -> dict[str, Any]:
            versions = {}
            for name, path in files.items():
                stat = path.stat()
                versions[name] = (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
            return {"paths": files, "versions": versions, "contents": {name: path.read_bytes() for name, path in files.items()}}
        source = collect()
        words.require(source == collect(), "outline changed while collecting source identity")
    else:
        source = words.chapter_source_snapshot(project, chapter)
        outline_path, body_path = source["paths"]["outline"], source["paths"]["body"]
    for path in source["paths"].values():
        file_path(path, project)
    file_path(body_path, project, output=True)
    if outline_only:
        words.require(source == collect(), "outline changed during source identity check")
    else:
        words.require_chapter_sources_unchanged(project, chapter, source)
    words.require(not tracking.project_commit_in_progress(project) and state_file.read_bytes() == before,
                  "tracking changed during source identity check")
    return {"schema": "story-chapter-snapshot/v1", "chapter": chapter,
            "body_path": str(body_path), "outline_path": str(outline_path),
            "state_revision": state["state_revision"], **words.chapter_source_digests(source),
            "file_versions": {name: [str(part) for part in version] for name, version in source["versions"].items()}}


def build_parser() -> Parser:
    parser = Parser(prog="dsh-story", description=__doc__, epilog=EXIT_HELP)
    families = parser.add_subparsers(dest="command", required=True)
    actions = {
        "project": ("init", "status", "query", "check"),
        "outline": ("check",), "chapter": ("check", "snapshot", "commit", "accept-current-length"),
        "short": ("plan-check", "delivery-check"), "text": ("count", "check", "normalize"),
        "memory": ("init", "query", "record", "commit", "check"),
        "analysis": ("inspect", "write-cards"), "export": ("txt",), "lineage": ("record",),
        "detect": ("zhuque",),
    }
    for family, names in actions.items():
        subcommands = families.add_parser(family).add_subparsers(dest="action", required=True)
        for action in names:
            sub = subcommands.add_parser(action, epilog=(
                "Exit codes: 0 below target, 1 at/above target, 2 invalid input, 3 missing credential or execution failure, 4 service error. Detection is advisory, not a delivery gate."
                if family == "detect" else EXIT_HELP))
            sub.add_argument("--json", action="store_true", help="emit the structured JSON result")
            if family != "text":
                sub.add_argument("--workspace", type=Path, required=True, help="existing workspace; never inferred from the current directory")
            if family in {"project", "outline", "chapter", "short", "export", "detect"}:
                sub.add_argument("--book", required=True, help="one direct-child work name, not a path")
            if family == "project" and action == "init":
                sub.add_argument("--kind", choices=("long", "short"), required=True)
                sub.add_argument("--input", type=Path, help="long-form tracking initialization JSON; omission creates only directories")
            if family == "project" and action in {"query", "status"}:
                sub.add_argument("--revision", type=int, help="reject a different tracking revision while paging")
            if family == "project" and action == "query":
                sub.add_argument("--kind", required=True, choices=queries.KINDS)
                sub.add_argument("--search", default="")
                sub.add_argument("--filter", default="all", choices=queries.FILTERS)
                sub.add_argument("--chapter", type=int, help="due-date reference; required for a chapter-record query")
                sub.add_argument("--offset", type=int, default=0)
                sub.add_argument("--limit", type=int, default=20)
            if family in {"outline", "chapter"}:
                sub.add_argument("--chapter", type=int, required=True)
            if family == "chapter" and action in {"commit", "accept-current-length"}:
                sub.add_argument("--input", type=Path, required=True, help="tracking transaction JSON")
            if family == "chapter" and action == "snapshot":
                sub.add_argument("--outline-only", action="store_true", help="capture the prepared outline before a body exists")
            if family == "short" and action == "delivery-check":
                for option in ("min-chars", "max-chars", "sections"):
                    sub.add_argument(f"--{option}", type=int, required=True)
            if family == "text":
                sub.add_argument("--file", type=Path, action="append" if action != "count" else "store", required=True,
                                 help="explicit file; with --book, relative paths are inside that book; repeat for multi-file check/normalize")
                sub.add_argument("--workspace", type=Path)
                sub.add_argument("--book")
                if action == "count":
                    sub.add_argument("--target", help="positive target for visible_chars_v1; omitted means measurement only")
                    sub.add_argument("--checkpoint", action="store_true", help="report remaining length from --target")
                    sub.add_argument("--chapter", type=int)
                    sub.add_argument("--case-id")
                if action == "check":
                    sub.add_argument("--outline", type=Path, help="optional outline for copy diagnostics")
                if action == "normalize":
                    sub.add_argument("--apply", action="store_true", help="write changes; omitted means check only")
                    sub.add_argument("--policy", choices=("preserve", "normalize-narration"))
                    sub.add_argument("--quote-mode", choices=("keep", "ascii", "yan"), default="keep")
            if family == "memory":
                if action in {"record", "commit"}:
                    sub.add_argument("--input", type=Path, required=True)
                if action == "query":
                    sub.add_argument("--kind", action="append", choices=memory.KINDS)
                    sub.add_argument("--book", help="preference scope filter; does not select a project")
                    sub.add_argument("--genre")
                    sub.add_argument("--workflow")
            if family == "analysis":
                sub.add_argument("--title", required=True, help="one source title inside the workspace analysis library")
                sub.add_argument("--source", type=Path, required=True, help="explicit source text; may be outside the workspace")
                sub.add_argument("--input", type=Path, required=True, help="batch selection or cards JSON")
            if family == "export":
                sub.add_argument("--out-dir", type=Path, required=True, help="explicit export destination")
            if family == "lineage":
                for option in ("from-domain", "from-path", "to-domain", "to-path"):
                    sub.add_argument(f"--{option}", required=True)
                sub.add_argument("--decision", action="append", default=[])
                sub.add_argument("--by", default="agent")
            if family == "detect":
                sub.add_argument("--file", type=Path, required=True, help="chapter path relative to the selected book, or an absolute path inside it")
                sub.add_argument("--out", type=Path, help="optional JSON report inside the selected book")
                sub.add_argument("--target", type=float, default=zhuque.DEFAULT_TARGET,
                                 help="AI ratio threshold in (0, 1], default 0.5")
                sub.add_argument("--max-chars", type=int, default=zhuque.DEFAULT_MAX_CHARS,
                                 help="refuse longer inputs without calling the service, default 20000")
    return parser


def text_command(args: argparse.Namespace, project: Path | None) -> tuple[dict[str, Any], int]:
    if args.action == "count":
        body = file_path(args.file, project).read_text(encoding="utf-8")
        if args.checkpoint and args.target is None:
            raise CliError("--checkpoint requires --target")
        method = words.checkpoint_wordcount if args.checkpoint else words.evaluate_wordcount
        result = (words.measure_wordcount(body, chapter=args.chapter, case_id=args.case_id) if args.target is None
                  else method(body, args.target, chapter=args.chapter, case_id=args.case_id))
        return result, 2 if result.get("status") == "invalid" else 0
    files = [file_path(path, project) for path in args.file]
    scope = [] if project is None else ["--project", str(project)]
    if args.action == "normalize":
        before = {str(path): path.read_bytes() for path in files}
        options = ([] if args.apply else ["--check"]) + scope + ["--quote-mode", args.quote_mode]
        if args.policy is not None:
            options += ["--policy", args.policy]
        checked = node_command("normalize-punctuation.js", [*options, *map(str, files)])
        changed = [str(path) for path in files if path.read_bytes() != before[str(path)]]
        return {"schema": "story-text-normalize/v1", "applied": args.apply, "changed_files": changed,
                "diagnostics": checked.stdout.strip().splitlines()}, checked.returncode
    reports = {}
    for name, script in (("patterns", "check-ai-patterns.js"), ("degeneration", "check-degeneration.js")):
        checked = node_command(script, ["--check", "--json", "--fail-on=blocking", *map(str, files)])
        reports[name] = json.loads(checked.stdout)
    punctuation = node_command("normalize-punctuation.js", ["--check", *scope, *map(str, files)])
    advisories = punctuation.stdout.strip().splitlines()
    if args.outline is not None:
        copied = node_command("check-outline-copy.js", ["--outline", str(file_path(args.outline, project)), *map(str, files)])
        if copied.returncode:
            advisories.extend(copied.stdout.strip().splitlines())
    blocking = [finding for report in reports.values() for finding in report["findings"] if finding["severity"] == "blocking"]
    return {"schema": "story-text-check/v1", "ok": not blocking, "reports": reports, "advisories": advisories}, 1 if blocking else 0


def run(args: argparse.Namespace) -> tuple[dict[str, Any], int]:
    workspace = workspace_path(args.workspace) if args.workspace is not None else None
    project = None
    if args.command in {"project", "outline", "chapter", "short", "export", "detect"}:
        project = book_path(workspace, args.book, create=args.command == "project" and args.action == "init")
    if args.command == "text":
        if bool(args.workspace) != bool(args.book):
            raise CliError("use --workspace and --book together when scoping a text operation")
        if args.book:
            project = book_path(workspace, args.book)
        return text_command(args, project)
    if args.command == "project":
        if args.action == "init":
            if args.kind == "short" and args.input is not None:
                raise CliError("short initialization does not accept long-form tracking input")
            document = read_object(args.input) if args.input is not None else None
            if document is not None:
                contained_tree(project, project / "追踪")
                tracking.normalize_initial_document(document)
                if tracking.state_path(project).exists():
                    raise CliError("tracking state already exists; initialization never overwrites it")
            created = not project.exists()
            project.mkdir(exist_ok=True)
            if args.kind == "long":
                for directory in ("正文", "大纲", "设定"):
                    (project / directory).mkdir(exist_ok=True)
            state = tracking.initialize(project, document) if document is not None else None
            return {"schema": "story-project-init/v1", "book": args.book, "project": str(project), "kind": args.kind,
                    "initialized": tracking.state_path(project).exists(), "created": created,
                    **({"last_committed_chapter": state["last_committed_chapter"], "state_revision": state["state_revision"]} if state else {})}, 0
        if args.action == "check":
            contained_tree(project, project / "追踪")
            state = tracking.check_project(project)
            return {"last_committed_chapter": state["last_committed_chapter"], "state_revision": state["state_revision"]}, 0
        options = ({"kind": args.kind, "search": args.search, "selection": args.filter, "chapter": args.chapter,
                    "offset": args.offset, "limit": args.limit} if args.action == "query" else {})
        return queries.project_query(project, tracking, expected_revision=args.revision, **options), 0
    if args.command in {"outline", "chapter"}:
        if args.chapter < 1:
            raise CliError("--chapter must be positive")
        if args.command == "outline":
            path = words.find_chapter_file(project / "大纲", args.chapter, outline=True, allow_missing=True)
            file_path(path, project, output=True)
            report = outline.verify(path)
            return report, 0 if report["ok"] else 1
        if args.action == "snapshot":
            return snapshot(project, args.chapter, outline_only=args.outline_only), 0
        for directory, is_outline in (("大纲", True), ("正文", False)):
            path = words.find_chapter_file(project / directory, args.chapter, outline=is_outline)
            file_path(path, project)
        if args.action == "check":
            result = storyctl.chapter_check(project, args.chapter)
            return result, 0 if result["outline_readiness"]["status"] == result["quality"]["status"] == "pass" else 1
        contained_tree(project, project / "追踪")
        return storyctl.chapter_commit(project, args.chapter, file_path(args.input),
                                       accept_current_length=args.action == "accept-current-length"), 0
    if args.command == "short":
        for name in ("正文.md",) if args.action == "delivery-check" else ("设定.md", "小节大纲.md"):
            file_path(Path(name), project, output=True)
        script = "check-phase2-contract.js" if args.action == "plan-check" else "check-delivery-contract.js"
        options = []
        if args.action == "delivery-check":
            if not 0 < args.min_chars <= args.max_chars <= 9_007_199_254_740_991 or not 0 < args.sections <= 9_007_199_254_740_991:
                raise CliError("short delivery requires 0 < min-chars <= max-chars and positive sections within Number.MAX_SAFE_INTEGER")
            options = ["--min-chars", str(args.min_chars), "--max-chars", str(args.max_chars), "--sections", str(args.sections)]
        result = node_command(script, ["--json", *options, str(project)])
        return json.loads(result.stdout), result.returncode
    if args.command == "memory":
        contained_tree(workspace, memory.memory_root(workspace))
        if args.action == "query":
            return memory.command_query(workspace, args.kind, args.book, args.genre, args.workflow), 0
        if args.action in {"record", "commit"}:
            return getattr(memory, f"command_{args.action}")(workspace, file_path(args.input)), 0
        return getattr(memory, f"command_{args.action}")(workspace), 0
    if args.command == "analysis":
        import analysis_cards
        method = analysis_cards.inspect if args.action == "inspect" else analysis_cards.write_cards
        result = method(workspace, args.title, file_path(args.source), read_object(args.input))
        return result, 1 if result.get("failed") else 0
    if args.command == "export":
        contained_tree(project, project / "正文")
        return exporter.export_novel(project, args.out_dir.resolve()), 0
    if args.command == "lineage":
        file_path(workspace / lineage.LEDGER_NAME, workspace, output=True)
        return lineage.record_edge(workspace, from_domain=args.from_domain, from_path=args.from_path,
                                   to_domain=args.to_domain, to_path=args.to_path, decisions=args.decision, by=args.by), 0
    if args.command == "detect":
        source = file_path(args.file, project)
        output = file_path(args.out, project, output=True) if args.out is not None else None
        report, code, _ = zhuque.run([str(source), "--json", "--target", str(args.target), "--max-chars", str(args.max_chars)])
        if report["ok"] and output is not None:
            try:
                zhuque.write_report(output, report)
            except zhuque.DetectError as error:
                raise CliError(str(error), "REPORT_WRITE_FAILED", 3) from error
        return report, code
    raise CliError("unsupported command")


def main(argv: list[str] | None = None) -> int:
    raw = sys.argv[1:] if argv is None else argv
    try:
        result, code = run(build_parser().parse_args(raw))
    except (ValueError, OSError, UnicodeError) as error:
        code = error.exit_code if isinstance(error, CliError) else 3 if isinstance(error, OSError) else 2
        error_code = error.code if isinstance(error, CliError) else "EXECUTION_FAILED" if code == 3 else "INVALID_INPUT"
        emit({"schema": "story-cli-error/v1", "ok": False, "command": " ".join(raw[:2]),
              "error_code": error_code, "message": str(error)})
        sys.stderr.write(f"dsh-story: {error}\n")
        return code
    emit(result)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
