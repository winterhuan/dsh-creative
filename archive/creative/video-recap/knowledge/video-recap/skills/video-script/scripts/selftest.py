#!/usr/bin/env python3
"""Offline self-test for narration preflight budget gating.

Focuses on the delivery-and-compliance rule: narration that would be truncated
past `budget * 1.25` must FAIL preflight (`over_length_before_tts`) before any
paid TTS call, while a line that fits its slot stays clean.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from narration_lint import lint_narration

MINIMUM_PYTHON = (3, 9)
if sys.version_info < MINIMUM_PYTHON:
    raise SystemExit("selftest.py requires Python 3.9 or newer")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _work_dir(base: Path) -> Path:
    work = base / "work"
    work.mkdir(parents=True)
    # deslop_qc reads this requirement file; style cards are out of scope here.
    (work / "deslop_qc_requirements.json").write_text(
        json.dumps({"style_card_required": False}), encoding="utf-8"
    )
    return work


def _codes(report) -> set:
    return {issue.get("code") for issue in report["errors"]}


def main() -> int:
    checks = 0
    with tempfile.TemporaryDirectory() as directory:
        base = Path(directory)

        # A 5s slot budgets ~18 chars; a ~40-char block is past budget*1.25 and
        # would be truncated then blocked at delivery — it must fail before TTS.
        over_long = "他推开门缓缓走进昏暗的房间里环视四周又低声说了一整段很长很长的独白台词。"
        require(len(over_long) > 22, "self-test fixture is not long enough to overflow")
        over = lint_narration(
            [{"start": 10.0, "end": 15.0, "narration": over_long, "overlaps_speech": False}],
            work_dir=_work_dir(base / "over"),
        )
        require(over["ok"] is False, "over-length narration was not rejected")
        require(
            "over_length_before_tts" in _codes(over),
            "over-length narration did not raise over_length_before_tts",
        )
        checks += 2

        # The same slot with a short, complete sentence fits and stays clean.
        fit = lint_narration(
            [{"start": 10.0, "end": 15.0, "narration": "他推开门。", "overlaps_speech": False}],
            work_dir=_work_dir(base / "fit"),
        )
        require(fit["ok"] is True, f"a line that fits its slot was rejected: {fit['errors']}")
        require(
            "over_length_before_tts" not in _codes(fit),
            "a line that fits its slot raised over_length_before_tts",
        )
        checks += 2

    print(f"{checks} self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
