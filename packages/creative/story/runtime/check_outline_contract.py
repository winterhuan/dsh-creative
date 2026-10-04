#!/usr/bin/env python3
"""Check outline structure, sharing chapter paths and targets with submission.

Exit 0 means ready, 1 means structural findings (including a missing outline),
and 2 means invalid arguments or an ambiguous chapter path. These checks do not
judge whether the outlined actions or consequences make a good story.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path
from typing import Any

_CORE_SPEC = importlib.util.spec_from_file_location("story_outline_wordcount", Path(__file__).with_name("wordcount_core.py"))
if _CORE_SPEC is None or _CORE_SPEC.loader is None:
    raise RuntimeError("unable to load wordcount core")
core = importlib.util.module_from_spec(_CORE_SPEC)
_CORE_SPEC.loader.exec_module(core)

# The outline template lives in references/long/workflow-setup.md.
FIELDS = (
    "核心事件", "字数目标", "字数口径", "阶段位置", "单元ID/位置", "目标情绪",
    "读者期待", "主角目标", "主要阻碍", "关键选择", "代价或后果", "局部兑现", "章尾问题",
    "章节定位", "本章结构公式", "章首钩子", "爽点", "本章禁止提前释放", "契约风险",
)
SUBSECTIONS = ("内容概括", "情节安排", "人物关系和出场顺序", "情节细化")
FIVE_ACT = ("起因", "发展", "转折", "高潮", "结尾")
INTENT_FIELDS = ("目标情绪", "读者期待", "主角目标", "主要阻碍", "关键选择", "代价或后果", "局部兑现", "章尾问题")


def field_pattern(name: str) -> str:
    return rf"^\s*[-*+]\s*\*{{0,2}}{re.escape(name)}\*{{0,2}}[ \t]*[：:]"


def report(file: Path, checks: list[dict[str, Any]]) -> dict[str, Any]:
    failures = [check for check in checks if not check["ok"]]
    return {
        "schema_version": 1,
        "verifier": "story-long-write.outline-contract",
        "file": str(file.absolute()),
        "ok": not failures,
        "checks": checks,
        "failures": failures,
        "repair_scope": [
            {key: failure[key] for key in ("id", "file", "evidence", "expected", "references", "repair")}
            for failure in failures
        ],
    }


def verify(file: Path) -> dict[str, Any]:
    file = Path(file)
    checks: list[dict[str, Any]] = []

    def check(identifier: str, ok: bool, evidence: str, expected: str, repair: str) -> None:
        checks.append({
            "id": identifier, "ok": ok, "severity": "blocking", "file": file.name,
            "evidence": evidence, "expected": expected,
            "references": ["references/long/workflow-setup.md", "references/long/artifact-protocols.md"],
            "repair": repair,
        })

    try:
        text = file.read_bytes().decode("utf-8-sig")
        readable = bool(text.strip())
        evidence = "文件存在且非空" if readable else "文件为空"
    except (OSError, UnicodeError) as error:
        text, readable, evidence = "", False, str(error)
    check(
        "outline.readable", readable, evidence, "细纲文件存在且非空",
        "章节准备阶段先核实工程与同章文件；细纲缺失时按已确认卷纲和当前事实补建本章，检查通过后再启动写手，不改动同批其他章。",
    )
    if not readable:
        return report(file, checks)

    missing = [field for field in FIELDS if not re.search(field_pattern(field), text, re.MULTILINE)]
    check(
        "outline.required-fields", not missing,
        f"缺字段：{'、'.join(missing)}" if missing else f"{len(FIELDS)} 个字段齐全",
        f"按权威模板列出全部字段：{'、'.join(FIELDS)}；值未知时写 [待补充]，不杜撰剧情",
        "只补报告里缺的字段行；确实还定不下来的写 [待补充]，不为补字段新增副线或人物关系。",
    )

    hollow = []
    for field in INTENT_FIELDS:
        match = re.search(field_pattern(field) + r"[ \t]*(.*)$", text, re.MULTILINE)
        if match:
            value = re.sub(r"\[(?:待补充|待定|TODO)\]|\{[^}]*\}|待补充|待定|TODO|TBD|___", "", match[1], flags=re.IGNORECASE)
            if not re.sub(r"[\s、，,。;；]", "", value):
                hollow.append(field)
    check(
        "outline.intent-fields-substantive", not hollow,
        f"只有占位符，没有实际内容：{'、'.join(hollow)}" if hollow else "读者价值与场景执行字段都有实际内容",
        "写清目标情绪、读者期待、主角目标、主要阻碍、关键选择、代价或后果、局部兑现和章尾问题；这些字段不接受 [待补充]",
        "只补报告列出的执行字段；若当前剧情无法给出具体答案，先修细纲，不让正文代为发明独立剧情。",
    )

    missing = [sub for sub in SUBSECTIONS if not re.search(rf"^#{{3,4}}\s*{sub}", text, re.MULTILINE)]
    check(
        "outline.subsections", not missing,
        f"缺小节：{'、'.join(missing)}" if missing else "四个小节齐全",
        "包含 内容概括 / 情节安排 / 人物关系和出场顺序 / 情节细化 四个小节",
        "只补缺失的小节标题及其条目，不重写已成立的内容。",
    )
    missing = [act for act in FIVE_ACT if not re.search(field_pattern(act), text, re.MULTILINE)]
    check(
        "outline.five-act", not missing,
        f"五段式缺：{'、'.join(missing)}" if missing else "五段式齐全",
        "内容概括写全 起因 / 发展 / 转折 / 高潮 / 结尾",
        "只补缺的那一段，不改其余四段。",
    )

    header = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("|") and line.endswith("|"):
            cells = [cell.replace("**", "").replace("`", "").strip() for cell in line[1:-1].split("|")]
            if len(cells) == 4 and cells[0] in ("#", "序号"):
                header = cells
                break
    check(
        "outline.plotpoint-table", header is not None and "功能标签" in header[2] and "执行边界" in header[3],
        f"表头：{' | '.join(header)}" if header else "未找到 | # | 情节点 | 功能标签 | 执行边界 | 表头",
        "情节细化使用四列表格：# / 情节点（谁做了什么） / 功能标签 / 执行边界",
        "只把情节点序列改成四列表格，逐点补功能标签与执行边界；不增删情节点本身。",
    )

    try:
        target = core.target_from_outline(text)
        target_ok = 500 <= target <= 20000
        evidence = f"字数目标：{target}；字数口径 {core.METRIC}：true"
    except core.WordcountError as error:
        target_ok, evidence = False, str(error)
    check(
        "outline.wordcount-target", target_ok, evidence,
        f"字数目标为 500-20000 的正整数，并声明 字数口径：{core.METRIC}",
        "只补字数目标或字数口径行，不调整情节安排。",
    )
    return report(file, checks)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--project", type=Path)
    parser.add_argument("--chapter", type=int)
    parser.add_argument("files", nargs="*", type=Path)
    args = parser.parse_args()
    if args.project is not None or args.chapter is not None:
        if args.project is None or args.chapter is None or args.chapter < 1 or args.files:
            parser.error("use --project and --chapter together, with a positive chapter and no file paths")
        try:
            core.require(args.project.is_dir(), f"project directory is missing: {args.project}")
            files = [core.find_chapter_file(args.project / "大纲", args.chapter, outline=True, allow_missing=True)]
        except (core.WordcountError, OSError) as error:
            sys.stderr.buffer.write(f"{error}\n".encode("utf-8"))
            return 2
    else:
        if not args.files:
            parser.error("provide outline paths or --project and --chapter")
        files = args.files
    reports = [verify(file) for file in files]
    sys.stdout.buffer.write((json.dumps(reports[0] if len(reports) == 1 else reports, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return 0 if all(result["ok"] for result in reports) else 1


if __name__ == "__main__":
    raise SystemExit(main())
