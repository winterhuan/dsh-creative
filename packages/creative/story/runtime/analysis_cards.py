"""Inspect bounded source ranges and persist verified chapter cards."""

import hashlib
import os
from pathlib import Path
import re
import tempfile


PLOT_TYPES = {"转折点", "信息揭示", "冲突", "解决", "铺垫", "行动", "对话", "状态变化"}
TONES = {"紧张", "轻松", "悲伤", "热血", "爽", "甜", "温馨", "恐怖", "压抑", "其他"}


def _version(path):
    stat = path.stat()
    return [str(value) for value in (stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)]


def _source(path):
    path = Path(path)
    if not path.is_absolute() or not path.is_file():
        raise ValueError("source must be an absolute path to a file")
    before = _version(path)
    data = path.read_bytes()
    if before != _version(path):
        raise ValueError("source changed while reading; run analysis inspect again")
    # Match native read's LF boundaries; Unicode separators remain inside a line.
    lines = data.decode("utf-8-sig").split("\n")
    if lines[-1] == "":
        lines.pop()
    return hashlib.sha256(data).hexdigest(), before, [line.removesuffix("\r") for line in lines]


def _output(workspace, title):
    workspace = Path(workspace)
    if not workspace.is_absolute() or not workspace.is_dir():
        raise ValueError("workspace must be an absolute directory")
    if not isinstance(title, str) or not title.strip() or title != title.strip() or title in {".", ".."} or re.search(r"[\\/:\x00]", title):
        raise ValueError("title must be a single source title")
    workspace = workspace.resolve()
    output = workspace / "拆文库" / title
    for path in (output.parent, output, output / "章节"):
        if path.is_symlink() or (path.exists() and not path.is_dir()):
            raise ValueError(f"analysis output must be a real directory: {path}")
    return output


def _chapters(document, line_count, output):
    if not isinstance(document, dict):
        raise ValueError("input must be a JSON object")
    chapters = document.get("chapters")
    if not isinstance(chapters, list) or not 1 <= len(chapters) <= 4:
        raise ValueError("a batch requires 1 to 4 chapters")
    result = []
    seen = set()
    for item in chapters:
        if not isinstance(item, dict):
            raise ValueError("each chapter must provide a number, title and source line range")
        number, start, end = (item.get(key) for key in ("chapter", "start_line", "end_line"))
        if any(type(value) is not int for value in (number, start, end)) or number < 1 or not 1 <= start <= end <= line_count:
            raise ValueError("chapter numbers and source line ranges must be positive and within the source")
        if number in seen or any(start <= previous["end_line"] and end >= previous["start_line"] for previous in result):
            raise ValueError("chapter numbers and source line ranges must not overlap")
        title = _text(item.get("title"), "chapter title", 160)
        seen.add(number)
        path = output / "章节" / f"第{number:03d}章_摘要.md"
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise ValueError(f"chapter output must be a regular file: {path}")
        result.append({"chapter": number, "title": title, "start_line": start, "end_line": end,
                       "path": str(path), "exists": path.exists()})
    replace = document.get("replace", [])
    if not isinstance(replace, list) or any(type(number) is not int or number not in seen for number in replace):
        raise ValueError("replace must name chapters in this batch")
    return result, replace


def inspect(workspace, title, source, document):
    """Return actual source identity, validated ranges and existing outputs; never write."""
    output = _output(workspace, title)
    digest, version, lines = _source(source)
    chapters, replace = _chapters(document, len(lines), output)
    return {"source": str(source), "source_sha256": digest, "source_version": version,
            "output_dir": str(output), "chapters": chapters, "replace": replace}


def _text(value, name, maximum):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f"{name} must be nonempty text of at most {maximum} characters")
    return " ".join(value.split())


def _render(card, chapter, lines):
    if not isinstance(card, dict) or card.get("chapter") != chapter["chapter"]:
        raise ValueError("card must identify this chapter")
    title = _text(card.get("title"), "card title", 160)
    if title != chapter["title"]:
        raise ValueError("card title differs from the inspected chapter")
    summary = _text(card.get("summary"), "summary", 300)
    if len(summary) < 100:
        raise ValueError("summary must be 100 to 300 characters")
    events, characters, points = (card.get(key) for key in ("key_events", "characters", "turning_points"))
    if not isinstance(events, list) or len(events) > 5:
        raise ValueError("key_events must contain at most 5 actual events")
    if not isinstance(characters, list) or len(characters) > 30:
        raise ValueError("characters must contain at most 30 appearing people")
    if not isinstance(points, list) or len(points) > 8:
        raise ValueError("turning_points must contain at most 8 actual anchors")
    body = [f"## 第{chapter['chapter']}章 {title}", "", f"**概要**：{summary}", "", "**关键事件**："]
    body.extend(f"{index}. {_text(event, 'event', 500)}" for index, event in enumerate(events, 1))
    if not events:
        body.append("无独立事件。")
    body.extend(["", "**出场人物**："])
    for person in characters:
        if not isinstance(person, dict) or person.get("importance") not in {"major", "supporting", "minor"}:
            raise ValueError("characters must name appearing people and their importance")
        body.append(f"- {_text(person.get('name'), 'character name', 80)}（{person['importance']}）")
    if not characters:
        body.append("无出场人物。")
    body.extend(["", "**转折锚点**："])
    excerpt = "\n".join(lines[chapter["start_line"] - 1:chapter["end_line"]])
    for index, point in enumerate(points, 1):
        if not isinstance(point, dict) or point.get("type") not in PLOT_TYPES or point.get("tone") not in TONES:
            raise ValueError("a turning point requires a plot type and tone")
        locator = _text(point.get("locator"), "locator", 500)
        location = re.fullmatch(r"L(\d+)(?:-L?(\d+))?", locator)
        if location:
            first, last = int(location[1]), int(location[2] or location[1])
            located = chapter["start_line"] <= first <= last <= chapter["end_line"]
        else:
            located = point["locator"].strip() in excerpt
        if not located:
            raise ValueError("anchor locator must quote this chapter or name lines within its inspected range")
        body.append(f"{index}. **{_text(point.get('title'), 'anchor title', 15)}**：类型{point['type']} | "
                    f"{_text(point.get('event'), 'anchor event', 500)} | 基调：{point['tone']} | 原文定位：{locator}")
    if not points:
        body.append("无转折锚点。")
    return ("\n".join(body) + "\n").encode("utf-8")


def write_cards(workspace, title, source, document):
    """Write each valid card independently; require inspected source identity and explicit replacements."""
    output = _output(workspace, title)
    digest, version, lines = _source(source)
    chapters, replace = _chapters(document, len(lines), output)
    if document.get("source", str(source)) != str(source) or document.get("source_sha256") != digest or document.get("source_version") != version:
        raise ValueError("source identity changed or is missing; run analysis inspect again")
    cards = document.get("cards")
    if not isinstance(cards, list) or len(cards) > 4:
        raise ValueError("cards must contain at most 4 extracted chapter cards")
    numbers = [card.get("chapter") if isinstance(card, dict) else None for card in cards]
    expected = {chapter["chapter"] for chapter in chapters}
    if any(type(number) is not int or number not in expected for number in numbers) or len(set(numbers)) != len(numbers):
        raise ValueError("cards must identify unique chapters from the inspected batch")
    by_number = dict(zip(numbers, cards))
    failed = document.get("failed", [])
    if not isinstance(failed, list) or any(not isinstance(item, dict) or type(item.get("chapter")) is not int
                                        or item["chapter"] not in expected or not isinstance(item.get("reason"), str)
                                        for item in failed):
        raise ValueError("failed must list chapter numbers and extraction failure reasons")
    failures = {item["chapter"]: item["reason"] for item in failed}
    result = {"written": [], "failed": [], "skipped": []}
    for chapter in sorted(chapters, key=lambda item: item["chapter"]):
        number, path = chapter["chapter"], Path(chapter["path"])
        item = {"chapter": number, "path": str(path)}
        temporary = None
        try:
            if path.exists() and number not in replace:
                result["skipped"].append({**item, "reason": "existing file is not in replace"})
                continue
            if number not in by_number:
                raise ValueError(failures.get(number) or "no extracted card for this chapter")
            content = _render(by_number[number], chapter, lines)
            _output(workspace, title)
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".story-card-", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            current_digest, current_version, _ = _source(source)
            if (current_digest, current_version) != (digest, version):
                raise ValueError("source changed before publication; run analysis inspect again")
            _output(workspace, title)
            if path.is_symlink() or (path.exists() and not path.is_file()):
                raise ValueError("chapter output must be a regular file")
            if number in replace:
                os.replace(temporary, path)
            else:
                # Atomic publication refuses a file created since inspection.
                os.link(temporary, path)
            if path.read_bytes() != content:
                raise ValueError("published card changed before verification")
            result["written"].append({**item, "bytes": len(content)})
        except FileExistsError:
            result["skipped"].append({**item, "reason": "existing file is not in replace"})
        except (OSError, ValueError) as error:
            result["failed"].append({**item, "reason": str(error)})
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return result
