#!/usr/bin/env python3
"""Timeline measurements and creator-stated licensing; never platform or legal clearance."""

from __future__ import annotations

import math
import json
import re
from pathlib import Path

from typing import Any, Iterable, Mapping, Optional, Sequence

# A vertical target is portrait; the canonical short-video frame is 9:16.
_VERTICAL_ASPECT_MAX = 0.75  # width / height at or below this reads as vertical
_LICENSING_UNSTATED = "unstated"


def write_delivery_evidence(work_dir, evidence):
    """Publish measurements and refresh their section in an existing creative brief."""
    root = Path(work_dir)
    (root / 'delivery_evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    brief = root / 'agent_narration_brief.md'
    if not brief.is_file():
        return
    start, end = '<!-- delivery-evidence:start -->', '<!-- delivery-evidence:end -->'
    block = '\n'.join([
        start, '## 交付证据', '',
        f"- 实际旁白覆盖：{evidence['narration_coverage']:.1%}",
        f"- 连续原片画面最长：{evidence['longest_continuous_source_picture_seconds']} 秒",
        f"- 没有旁白覆盖的原片区间最长：{evidence['longest_unmodified_source_seconds']} 秒",
        f"- 创作者声明的授权依据：{evidence['licensing_basis']}",
        f"- 画幅与竖屏处理：{json.dumps(evidence['vertical_target'], ensure_ascii=False)}", '',
        evidence['disclaimer'], '完整测量与建议见 delivery_evidence.json。', end,
    ])
    text = brief.read_text(encoding='utf-8')
    pattern = re.escape(start) + r'[\s\S]*?' + re.escape(end)
    text = re.sub(pattern, lambda _: block, text) if start in text and end in text else text.rstrip() + '\n\n' + block + '\n'
    brief.write_text(text, encoding='utf-8')


def _f(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(result):
        return default
    return result


def _speech_spans(narration, duration):
    spans = []
    for segment in narration or []:
        start = _f(segment.get("actual_place_start") if segment.get("actual_place_start") is not None else segment.get("start"))
        end = _f(segment.get("actual_place_end") if segment.get("actual_place_end") is not None else segment.get("end"))
        start, end = max(0, start), min(duration, end)
        if end > start:
            spans.append((start, end))
    return sorted(spans)


def _longest_unmodified_run(clips, video_duration, narration):
    runs = []
    cursor = 0.0
    previous_source_end = None
    previous_source = None
    for clip in clips or []:
        start = _f(clip.get("source_start", clip.get("start")))
        end = _f(clip.get("source_end", clip.get("end")))
        duration = max(0, end - start)
        source = clip.get("source_video", "source")
        if duration:
            if runs and source == previous_source and previous_source_end == start:
                runs[-1] = (runs[-1][0], cursor + duration)
            else:
                runs.append((cursor, cursor + duration))
            cursor += duration
            previous_source, previous_source_end = source, end
    basis = "clip_plan" if runs else "full_source"
    if not runs:
        runs = [(0, video_duration)]
    picture_run = max((end - start for start, end in runs), default=0)
    for speech_start, speech_end in _speech_spans(narration, video_duration):
        remaining = []
        for start, end in runs:
            if speech_end <= start or speech_start >= end:
                remaining.append((start, end))
            else:
                if speech_start > start:
                    remaining.append((start, speech_start))
                if speech_end < end:
                    remaining.append((speech_end, end))
        runs = remaining
    return round(max((end - start for start, end in runs), default=0), 3), basis, round(picture_run, 3)


def _narration_coverage(
    narration: Optional[Iterable[Mapping[str, Any]]],
    video_duration: float,
) -> float:
    """Share of runtime covered by non-overlapping narration spans."""
    if video_duration <= 0:
        return 0.0
    spans = _speech_spans(narration, video_duration)
    if not spans:
        return 0.0
    spans.sort()
    covered = 0.0
    cur_start, cur_end = spans[0]
    for start, end in spans[1:]:
        if start <= cur_end:
            cur_end = max(cur_end, end)
        else:
            covered += cur_end - cur_start
            cur_start, cur_end = start, end
    covered += cur_end - cur_start
    return round(min(1.0, covered / video_duration), 3)


def _vertical_treatment(
    width: Any,
    height: Any,
    *,
    target_vertical: bool,
) -> dict[str, Any]:
    w = _f(width)
    h = _f(height)
    aspect = round(w / h, 4) if h > 0 else None
    is_vertical = aspect is not None and aspect <= _VERTICAL_ASPECT_MAX
    if not target_vertical:
        treatment = "no_vertical_target"
    elif is_vertical:
        treatment = "native_vertical"
    else:
        # The pipeline scales and masks but never reframes to a new aspect, so a
        # landscape master delivered against a vertical target is untreated.
        treatment = "untreated_landscape"
    return {
        "width": int(w) if w else None,
        "height": int(h) if h else None,
        "aspect_ratio": aspect,
        "is_vertical": is_vertical,
        "target_vertical": bool(target_vertical),
        "treatment": treatment,
    }


def compute_delivery_evidence(
    *,
    narration: Optional[Iterable[Mapping[str, Any]]] = None,
    clips: Optional[Sequence[Mapping[str, Any]]] = None,
    video_duration: float = 0.0,
    output_width: Any = None,
    output_height: Any = None,
    licensing_basis: Optional[str] = None,
    target_vertical: bool = False,
    long_run_advisory_seconds: float = 60.0,
    coverage_advisory_min: float = 0.5,
) -> dict[str, Any]:
    """Compute the four delivery-evidence facts plus creator-actionable advisories.

    All inputs are plain data already present in the work directory; nothing here
    reads the filesystem, calls a model, or depends on platform analytics.
    """
    duration = _f(video_duration)
    narration = list(narration or [])
    longest_run, longest_run_basis, picture_run = _longest_unmodified_run(clips, duration, narration)
    coverage = _narration_coverage(narration, duration)
    basis = (licensing_basis or "").strip() or _LICENSING_UNSTATED
    vertical = _vertical_treatment(
        output_width, output_height, target_vertical=target_vertical
    )

    advisories: list[dict[str, str]] = []
    if longest_run >= long_run_advisory_seconds:
        advisories.append(
            {
                "code": "long_unmodified_source_run",
                "message": (
                    f"最长未改动原片连续片段约 {longest_run:.0f} 秒，超过 "
                    f"{long_run_advisory_seconds:.0f} 秒。请核对该原声片段的编辑目的和授权范围。"
                ),
            }
        )
    if duration > 0 and coverage < coverage_advisory_min:
        advisories.append(
            {
                "code": "thin_narration_coverage",
                "message": (
                    f"解说覆盖约 {coverage * 100:.0f}%，低于 "
                    f"{coverage_advisory_min * 100:.0f}%。覆盖过低时成片更接近原片搬运；"
                    "确认每段长间隙都是有意保留的原声，而非缺少解说。"
                ),
            }
        )
    if basis == _LICENSING_UNSTATED:
        advisories.append(
            {
                "code": "licensing_basis_unstated",
                "message": (
                    "未记录素材复用的授权依据。这是发布前应由创作者填写的事实，"
                    "不会被自动推断，也不代表已获授权。"
                ),
            }
        )
    if vertical["treatment"] == "untreated_landscape":
        advisories.append(
            {
                "code": "vertical_target_untreated",
                "message": (
                    "目标为竖屏，但成片仍是横向画幅。本流程不自动重构画面；"
                    "如需竖屏交付，请在源头改用竖屏素材或提供裁剪/重构方案。"
                ),
            }
        )

    return {
        "longest_unmodified_source_seconds": longest_run,
        "longest_continuous_source_picture_seconds": picture_run,
        "measurement_scope": "Continuous source timeline outside measured narration; does not infer visual alteration, licensing validity or platform decisions.",
        "longest_unmodified_source_basis": longest_run_basis,
        "narration_coverage": coverage,
        "licensing_basis": basis,
        "vertical_target": vertical,
        "advisories": advisories,
        "disclaimer": (
            "交付证据是度量而非授权；它可暴露明显风险，但不代表任何平台已批准该成片。"
        ),
    }
