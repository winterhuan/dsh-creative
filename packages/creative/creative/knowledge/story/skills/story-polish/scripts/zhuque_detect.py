#!/usr/bin/env python3
"""Check one chapter file with the Tencent Zhuque AIGC text detector.

The whole file is sent to Zhuque through Tencent Cloud EdgeOne Makers. Every
returned segment is mapped back to file lines, and the verdict is computed the
way the Zhuque web page computes it. The chapter file is never modified.

The API key is read from MAKERS_API_KEY; inside DSH it is injected by
creative_produce_run (entry story-zhuque) and is never passed as an argument.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Sequence

SCHEMA = "story-zhuque-detect/v1"
ENDPOINT = "https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify"
KEY_ENV = "MAKERS_API_KEY"
TIMEOUT_SECONDS = 60
# The web page refuses texts under 350 characters; keep the same floor so both
# channels judge comparable input.
MIN_CHARS = 350
# One call is billed per character, so a whole book passed by mistake would
# consume a large share of the monthly free quota.
DEFAULT_MAX_CHARS = 20_000
DEFAULT_TARGET = 0.5

LABELS = {0: "human", 1: "ai", 2: "suspected"}
VERDICT_TEXT = {
    "green": "人工创作特征显著",
    "yellow": "人工创作特征较弱",
    "red": "未发现明显的人工创作特征",
}
VERDICT_COLOR = {"green": "绿", "yellow": "黄", "red": "红"}
LABEL_TEXT = {"human": "人工", "ai": "AI", "suspected": "疑似", "unknown": "未知"}

EXIT_PASS = 0
EXIT_BELOW_TARGET = 1
EXIT_INPUT = 2
EXIT_CREDENTIAL = 3
EXIT_SERVICE = 4


class DetectError(Exception):
    """A failure reported as a structured error instead of a traceback."""

    def __init__(self, code: str, message: str, exit_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.exit_code = exit_code


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise DetectError("invalid_arguments", message, EXIT_INPUT)


def counted_chars(text: str) -> int:
    """Count characters the way the Zhuque web page does.

    Whitespace separates tokens; a token of ASCII letters counts as one word,
    and any other token counts one per character.
    """
    return sum(1 if re.fullmatch(r"[A-Za-z]+", token) else len(token) for token in text.split())


def ai_percent(ratio: float) -> float:
    return round(ratio * 10_000) / 100


def verdict_of(ratio: float) -> str:
    percent = ai_percent(ratio)
    if percent >= 100:
        return "red"
    if percent >= 50:
        return "yellow"
    return "green"


def read_chapter(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError as exc:
        raise DetectError("file_not_found", f"{path}: file not found", EXIT_INPUT) from exc
    except (OSError, UnicodeError) as exc:
        raise DetectError("file_unreadable", f"{path}: {exc}", EXIT_INPUT) from exc
    return text.replace("\r\n", "\n").replace("\r", "\n")


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def excerpt(segment: str) -> str:
    flat = " ".join(segment.split())
    if len(flat) <= 40:
        return flat
    return f"{flat[:24]}……{flat[-12:]}"


def locate(text: str, segment: dict[str, Any]) -> tuple[int, int] | None:
    """Find a segment in the submitted text; positions are [start, length]."""
    body = segment.get("text")
    position = segment.get("position")
    if isinstance(position, list) and len(position) == 2 and all(isinstance(value, int) for value in position):
        start, length = position
        if 0 <= start and 0 < length and start + length <= len(text):
            if not isinstance(body, str) or text[start:start + length] == body:
                return start, length
    if isinstance(body, str) and body != "":
        start = text.find(body)
        if start >= 0:
            return start, len(body)
    return None


def segment_view(text: str, segment: dict[str, Any]) -> dict[str, Any]:
    raw_label = segment.get("label")
    label = LABELS.get(raw_label, "unknown") if isinstance(raw_label, int) else "unknown"
    conf = segment.get("conf")
    view: dict[str, Any] = {
        "order": segment.get("order"),
        "label": label,
        "conf": conf if isinstance(conf, (int, float)) else None,
    }
    found = locate(text, segment)
    if found is None:
        body = segment.get("text")
        view.update({"start": None, "length": None, "lines": None, "excerpt": excerpt(body) if isinstance(body, str) else ""})
        return view
    start, length = found
    chunk = text[start:start + length]
    # A segment that ends on blank lines still belongs to the paragraph before them.
    last = start + len(chunk.rstrip()) - 1 if chunk.strip() else start
    view.update({
        "start": start,
        "length": length,
        "lines": [line_of(text, start + len(chunk) - len(chunk.lstrip())), line_of(text, last)],
        "excerpt": excerpt(chunk),
    })
    return view


def number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DetectError("invalid_response", f"Zhuque response field {field} is not a number", EXIT_SERVICE)
    return float(value)


def classify(text: str, key: str) -> tuple[dict[str, Any], str | None]:
    body = json.dumps({"text": text, "is_merge": False}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8")
            request_id = response.headers.get("X-Makers-Models-Id")
    except urllib.error.HTTPError as exc:
        raise http_error(exc) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise DetectError("network_error", f"unable to reach Zhuque: {reason}", EXIT_SERVICE) from exc
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise DetectError("invalid_response", "Zhuque returned a non-JSON response", EXIT_SERVICE) from exc
    if not isinstance(data, dict):
        raise DetectError("invalid_response", "Zhuque returned a non-object response", EXIT_SERVICE)
    if data.get("status") != "success":
        message = data.get("msg") or f"status {data.get('status')!r}"
        raise DetectError("service_error", f"Zhuque did not succeed: {message}", EXIT_SERVICE)
    return data, request_id


def http_error(exc: urllib.error.HTTPError) -> DetectError:
    message = f"HTTP {exc.code}"
    try:
        payload = json.loads(exc.read().decode("utf-8", "replace"))
        detail = payload.get("error", {}) if isinstance(payload, dict) else {}
        if isinstance(detail, dict) and isinstance(detail.get("message"), str):
            message = f"HTTP {exc.code}: {detail['message']}"
    except (OSError, ValueError):
        pass
    finally:
        exc.close()
    if exc.code in (401, 403):
        return DetectError("auth_failed", message, EXIT_CREDENTIAL)
    if exc.code == 429:
        return DetectError("rate_limited", message, EXIT_SERVICE)
    if exc.code == 400:
        return DetectError("invalid_request", message, EXIT_INPUT)
    return DetectError("service_error", message, EXIT_SERVICE)


def build_report(file: str, text: str, target: float, data: dict[str, Any], request_id: str | None) -> dict[str, Any]:
    ratio = number(data.get("ratio_confidence"), "ratio_confidence")
    labels = data.get("labels_ratio")
    segments = data.get("segment_labels")
    if not isinstance(labels, dict) or not isinstance(segments, list) or not all(isinstance(item, dict) for item in segments):
        raise DetectError("invalid_response", "Zhuque response is missing labels_ratio or segment_labels", EXIT_SERVICE)
    verdict = verdict_of(ratio)
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
    billed = data.get("makers_models_usage") if isinstance(data.get("makers_models_usage"), dict) else {}
    softmax = data.get("softmax_confidence")
    return {
        "schema": SCHEMA,
        "ok": True,
        "file": file,
        "chars": len(text),
        "counted_chars": counted_chars(text),
        "request_id": request_id,
        "ai_ratio": ratio,
        "ai_percent": ai_percent(ratio),
        "verdict": verdict,
        "verdict_text": VERDICT_TEXT[verdict],
        "target": target,
        "pass": ratio < target,
        "labels_ratio": {name: labels.get(str(code), 0) for code, name in LABELS.items()},
        "softmax_confidence": softmax if isinstance(softmax, (int, float)) else None,
        "segments": [segment_view(text, segment) for segment in segments],
        "usage": {"model_tokens": usage.get("total_tokens"), "billed_tokens": billed.get("total_tokens")},
    }


def render_text(report: dict[str, Any]) -> str:
    counts = {name: 0 for name in LABEL_TEXT}
    for segment in report["segments"]:
        counts[segment["label"]] += 1
    lines = [
        f"朱雀检测：{report['file']}（{report['counted_chars']} 字）",
        f"AI 浓度 {report['ai_percent']:g}%（{VERDICT_COLOR[report['verdict']]}：{report['verdict_text']}），"
        f"目标 < {ai_percent(report['target']):g}%：{'通过' if report['pass'] else '未通过'}",
        f"片段：AI {counts['ai']} 段 / 疑似 {counts['suspected']} 段 / 人工 {counts['human']} 段",
    ]
    for segment in report["segments"]:
        where = "位置未对上" if segment["lines"] is None else f"第{segment['lines'][0]}-{segment['lines'][1]}行"
        conf = "-" if segment["conf"] is None else f"{segment['conf']:.4f}"
        lines.append(f"  #{segment['order']} {LABEL_TEXT[segment['label']]} {conf} {where} {segment['excerpt']}")
    lines.append(f"消耗 {report['usage']['billed_tokens']} token（请求 {report['request_id']}）")
    return "\n".join(lines) + "\n"


def write_stdout(text: str) -> None:
    # Protocol output is UTF-8 regardless of the console code page.
    sys.stdout.buffer.write(text.encode("utf-8"))
    sys.stdout.buffer.flush()


def write_report(path: Path, report: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except OSError as exc:
        raise DetectError("report_unwritable", f"{path}: {exc}", EXIT_INPUT) from exc


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = Parser(description="Check one chapter file with Tencent Zhuque AIGC text detection.")
    parser.add_argument("file", help="chapter file to check (UTF-8)")
    parser.add_argument("--json", action="store_true", help="print the report as JSON")
    parser.add_argument("--out", help="also write the JSON report to this path")
    parser.add_argument("--target", type=float, default=DEFAULT_TARGET,
                        help="pass when the AI ratio is below this value (default 0.5, the web page's green verdict)")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS,
                        help="refuse longer files instead of spending quota (default 20000)")
    args = parser.parse_args(argv)
    if not 0 < args.target <= 1:
        raise DetectError("invalid_arguments", "--target must be greater than 0 and at most 1", EXIT_INPUT)
    if args.max_chars < MIN_CHARS:
        raise DetectError("invalid_arguments", f"--max-chars must be at least {MIN_CHARS}", EXIT_INPUT)
    return args


def run(argv: Sequence[str] | None) -> tuple[dict[str, Any], int, argparse.Namespace | None]:
    args: argparse.Namespace | None = None
    file = ""
    try:
        args = parse_args(argv)
        file = args.file
        text = read_chapter(Path(args.file))
        count = counted_chars(text)
        if count < MIN_CHARS:
            raise DetectError("text_too_short", f"{count} characters; Zhuque needs at least {MIN_CHARS}", EXIT_INPUT)
        if len(text) > args.max_chars:
            raise DetectError(
                "text_too_long",
                f"{len(text)} characters exceeds --max-chars {args.max_chars}; check one chapter per call",
                EXIT_INPUT,
            )
        key = os.environ.get(KEY_ENV, "").strip()
        if key == "":
            raise DetectError(
                "missing_credential",
                f"{KEY_ENV} is not configured; run through creative_produce_run entry story-zhuque",
                EXIT_CREDENTIAL,
            )
        data, request_id = classify(text, key)
        report = build_report(file, text, args.target, data, request_id)
        return report, EXIT_PASS if report["pass"] else EXIT_BELOW_TARGET, args
    except DetectError as exc:
        error = {"schema": SCHEMA, "ok": False, "file": file, "error": {"code": exc.code, "message": str(exc)}}
        return error, exc.exit_code, args


def main(argv: Sequence[str] | None = None) -> int:
    report, status, args = run(argv)
    if report["ok"] and args is not None and args.out:
        try:
            write_report(Path(args.out), report)
        except DetectError as exc:
            report = {"schema": SCHEMA, "ok": False, "file": report["file"],
                      "error": {"code": exc.code, "message": str(exc)}}
            status = exc.exit_code
    if args is not None and not args.json and report["ok"]:
        write_stdout(render_text(report))
    elif args is not None and not args.json:
        write_stdout(f"朱雀检测失败（{report['error']['code']}）：{report['error']['message']}\n")
    else:
        write_stdout(json.dumps(report, ensure_ascii=False) + "\n")
    return status


if __name__ == "__main__":
    sys.exit(main())
