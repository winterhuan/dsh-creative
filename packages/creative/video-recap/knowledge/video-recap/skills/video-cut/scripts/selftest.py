#!/usr/bin/env python3
"""Offline self-test for cut-boundary sentence integrity without a transcript.

Delivery-and-compliance rule: a clip edge that lands mid-content when there is NO
ASR speech timing can no longer be verified. It must BLOCK (`cut_without_transcript`)
instead of recording a silent `unchecked`, unless the creator waives the check
explicitly (`allow_unchecked` / plan `allow_unchecked_cuts`), which downgrades it to
an explicit `unchecked` record. When speech timing IS present the existing safe /
`inside_detected_speech` decisions must be unchanged.
"""

from __future__ import annotations

import sys

from sentence_boundaries import enforce_clip_sentence_boundaries

MINIMUM_PYTHON = (3, 9)
if sys.version_info < MINIMUM_PYTHON:
    raise SystemExit("selftest.py requires Python 3.9 or newer")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def _plan():
    return {"clips": [{"clip_id": 1, "source_id": "s1", "source_start": 10.0, "source_end": 20.0}]}


def _statuses(plan):
    checks = (plan.get("qc") or {}).get("boundary_status", {}).get("sentence_checks", [])
    return {(c["edge"], c["status"], c["reason"]) for c in checks}


def _blocking_codes(plan):
    return {row.get("code") for row in (plan.get("qc") or {}).get("blocking", [])}


def main() -> int:
    checks = 0

    # No transcript, mid-content edges: blocking by default.
    blocked = enforce_clip_sentence_boundaries(_plan(), [], [], 60.0)
    require(
        "cut_without_transcript" in _blocking_codes(blocked),
        "a cut without a transcript did not block",
    )
    require(
        all(status == "blocking" for _, status, _ in _statuses(blocked)),
        "mid-content edges without a transcript were not all blocking",
    )
    checks += 2

    # Explicit creator waiver downgrades to an unchecked record, no blocker.
    waived = enforce_clip_sentence_boundaries(_plan(), [], [], 60.0, allow_unchecked=True)
    require(not _blocking_codes(waived), "an explicit waiver still produced a blocker")
    require(
        _statuses(waived) == {
            ("start", "unchecked", "speech_timing_unavailable_waived"),
            ("end", "unchecked", "speech_timing_unavailable_waived"),
        },
        "waived edges were not recorded as explicit unchecked",
    )
    checks += 2

    # With speech timing, an edge outside detected speech stays safe.
    outside = enforce_clip_sentence_boundaries(_plan(), [], [{"start": 30.0, "end": 40.0}], 60.0)
    require(not _blocking_codes(outside), "an edge outside detected speech was blocked")
    require(
        all(status == "safe" for _, status, _ in _statuses(outside)),
        "an edge outside detected speech was not marked safe",
    )
    checks += 2

    # With speech timing, an edge inside detected speech still blocks as before.
    inside = enforce_clip_sentence_boundaries(_plan(), [], [{"start": 9.0, "end": 21.0}], 60.0)
    require(
        "unsafe_clip_sentence_boundary" in _blocking_codes(inside),
        "an edge inside detected speech did not block",
    )
    checks += 1

    print(f"{checks} self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
