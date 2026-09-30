#!/usr/bin/env python3
"""Offline self-test for keyless consolidation skip.

Delivery-and-compliance rule: with no MiMo chat/VLM credential the consolidation
drivers must skip WITHOUT sending a request (returning None), instead of firing an
api_call that retries eight times before failing. With a credential present the
gate must pass through and reach api_call.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

import consolidate
from lib import CONFIG

MINIMUM_PYTHON = (3, 9)
if sys.version_info < MINIMUM_PYTHON:
    raise SystemExit("selftest.py requires Python 3.9 or newer")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


class _ReachedApiCall(RuntimeError):
    """Raised by the stub api_call to prove the credential gate let a request through."""


def main() -> int:
    checks = 0
    original_key = CONFIG.get("api_key")
    original_api_call = consolidate.api_call
    calls = []

    def _stub_api_call(*args, **kwargs):
        calls.append((args, kwargs))
        raise _ReachedApiCall("api_call was reached")

    consolidate.api_call = _stub_api_call
    try:
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / "asr_result.json").write_text(
                json.dumps({"segments": [{"start": 0.0, "end": 1.0, "text": "一句话"}]}),
                encoding="utf-8",
            )
            (work / "vlm_analysis.json").write_text(
                json.dumps({"scenes": [{"start": 0.0, "end": 1.0}]}), encoding="utf-8"
            )

            # Keyless: both drivers skip before any request.
            CONFIG["api_key"] = ""
            require(
                consolidate.consolidate_transcript(work) is None,
                "keyless consolidate_transcript did not skip",
            )
            require(
                consolidate.consolidate_index(work) is None,
                "keyless consolidate_index did not skip",
            )
            require(not calls, "keyless consolidation still attempted api_call")
            require(
                not (work / "asr_clean.json").exists(),
                "keyless consolidation wrote asr_clean.json",
            )
            checks += 4

            # With a credential the gate passes through and reaches api_call.
            CONFIG["api_key"] = "present"
            reached = False
            try:
                consolidate.consolidate_transcript(work)
            except _ReachedApiCall:
                reached = True
            require(reached, "credentialed consolidate_transcript never reached api_call")
            require(len(calls) == 1, "credentialed consolidate_transcript sent no request")
            checks += 2
    finally:
        consolidate.api_call = original_api_call
        CONFIG["api_key"] = original_key

    print(f"{checks} self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
