#!/usr/bin/env python3
"""Offline self-test for delivery evidence.

Focuses on the delivery-and-compliance rule: a finished recap must report the
longest unmodified source run, narration coverage, the stated licensing basis
and the vertical-target treatment, with creator-actionable advisories — and it
must never invent a licensing basis or claim approval.
"""

from __future__ import annotations

import sys

from delivery_evidence import compute_delivery_evidence

MINIMUM_PYTHON = (3, 9)
if sys.version_info < MINIMUM_PYTHON:
    raise SystemExit("selftest.py requires Python 3.9 or newer")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _codes(evidence) -> set:
    return {item["code"] for item in evidence["advisories"]}


def main() -> int:
    checks = 0

    # A cut plan with a 90s verbatim lift, thin narration, no licensing basis and
    # a landscape master delivered against a vertical target — every advisory fires.
    exposed = compute_delivery_evidence(
        narration=[{"start": 0.0, "end": 10.0, "narration": "一段解说。"}],
        clips=[
            {"source_start": 0.0, "source_end": 90.0},
            {"source_start": 100.0, "source_end": 120.0},
        ],
        video_duration=120.0,
        output_width=1920,
        output_height=1080,
        licensing_basis=None,
        target_vertical=True,
    )
    require(
        exposed["longest_unmodified_source_seconds"] == 80.0,
        f"longest run wrong: {exposed['longest_unmodified_source_seconds']}",
    )
    require(
        exposed["longest_unmodified_source_basis"] == "clip_plan",
        "longest-run basis should credit the clip plan",
    )
    require(
        abs(exposed["narration_coverage"] - round(10.0 / 120.0, 3)) < 1e-9,
        f"coverage wrong: {exposed['narration_coverage']}",
    )
    require(exposed["licensing_basis"] == "unstated", "absent basis must read as unstated")
    require(
        exposed["vertical_target"]["treatment"] == "untreated_landscape",
        "landscape master against a vertical target must read as untreated",
    )
    require(
        _codes(exposed)
        == {
            "long_unmodified_source_run",
            "thin_narration_coverage",
            "licensing_basis_unstated",
            "vertical_target_untreated",
        },
        f"expected all four advisories, got {_codes(exposed)}",
    )
    require("授权" not in exposed["disclaimer"] or "不代表" in exposed["disclaimer"],
            "disclaimer must not read as approval")
    checks += 6

    # A well-behaved full-mode recap: dense narration, stated basis, no vertical
    # target, no clip plan (whole source plays) — no advisory fires.
    clean = compute_delivery_evidence(
        narration=[
            {"start": 0.0, "end": 40.0, "narration": "解说一。"},
            {"start": 45.0, "end": 100.0, "narration": "解说二。"},
        ],
        clips=None,
        video_duration=100.0,
        output_width=1080,
        output_height=1920,
        licensing_basis="已获版权方书面授权",
        target_vertical=True,
        long_run_advisory_seconds=200.0,
    )
    require(
        clean["longest_unmodified_source_basis"] == "full_source",
        "no clip plan should fall back to full-source run",
    )
    require(clean["longest_unmodified_source_seconds"] == 5.0, "full-source run wrong")
    require(clean["narration_coverage"] == round(95.0 / 100.0, 3), "clean coverage wrong")
    require(clean["licensing_basis"] == "已获版权方书面授权", "stated basis must pass through")
    require(
        clean["vertical_target"]["treatment"] == "native_vertical",
        "portrait master against a vertical target is native vertical",
    )
    require(clean["advisories"] == [], f"clean recap raised advisories: {clean['advisories']}")
    checks += 6

    # Overlapping narration spans must not double-count past 100% coverage.
    overlap = compute_delivery_evidence(
        narration=[
            {"start": 0.0, "end": 60.0, "narration": "a"},
            {"start": 30.0, "end": 90.0, "narration": "b"},
        ],
        clips=None,
        video_duration=100.0,
    )
    require(
        overlap["narration_coverage"] == round(90.0 / 100.0, 3),
        f"overlap coverage should merge: {overlap['narration_coverage']}",
    )
    checks += 1

    print(f"{checks} self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
