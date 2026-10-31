#!/usr/bin/env python3
"""Sample produced clips and optionally request explicitly confirmed picture analysis."""
import argparse
import base64
import json
import subprocess
import sys
from pathlib import Path

VIDEO = Path(__file__).resolve().parents[4] / 'video-recap/skills/video-understanding/scripts'
sys.path.insert(0, str(VIDEO))
from lib import CONFIG, file_fingerprint, get_video_duration, mimo_video_api_call
from storyboard import _render_storyboard


def review(plan, work, *, confirmed_paid_analysis=False):
    clips = plan['clips']
    if not 1 <= len(clips) <= 24:
        raise ValueError('Review batches require 1–24 clips')
    if confirmed_paid_analysis and not CONFIG.get('mimo_video_api_key'):
        raise ValueError('Configure the MiMo credential before paid analysis')
    work.mkdir(parents=True, exist_ok=True)
    observations, tiles = [], []
    for index, clip in enumerate(clips):
        source = Path(clip['path']).resolve()
        duration = get_video_duration(source)
        if duration <= 0:
            raise ValueError('Cannot sample undecodable clip')
        images = []
        for frame, fraction in enumerate((0.1, 0.5, 0.9)):
            path = work / f'clip-{index:03d}-{frame}.jpg'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(duration * fraction), '-i', str(source), '-frames:v', '1', '-vf', 'scale=480:-2', str(path)], check=True, capture_output=True, timeout=30)
            tiles.append({'frame_file': str(path), 'label': f"{clip['targetId']} {duration * fraction:.1f}s"})
            images.append(path)
        entry = {'targetId': clip['targetId'], 'source_sha256': file_fingerprint(source), 'declared_subjects': clip['subjects'], 'location': clip['location'], 'frames': [str(path) for path in images], 'status': 'sampled_only'}
        if confirmed_paid_analysis:
            references = clip.get('references', [])
            if len(references) > 3:
                raise ValueError('At most three identity/location reference pictures per clip')
            prompt = 'Review these three sampled frames against the declared subjects and optional reference pictures. Report identity drift, wardrobe, location mismatch and all visible text. Separate observation from uncertainty. This is advisory, not approval. Return JSON with identity, location, on_screen_text and limitations. Declarations: ' + json.dumps({'subjects': clip['subjects'], 'location': clip['location']}, ensure_ascii=False)
            content = [{'type': 'text', 'text': prompt}]
            for path in [*images, *map(Path, references)]:
                data = path.read_bytes()
                if len(data) > 5 * 1024 * 1024:
                    raise ValueError('Review image exceeds 5 MiB')
                mime = 'image/png' if path.suffix.lower() == '.png' else 'image/jpeg'
                content.append({'type': 'image_url', 'image_url': {'url': f'data:{mime};base64,' + base64.b64encode(data).decode()}})
            response = mimo_video_api_call({'model': CONFIG['mimo_video_model'], 'messages': [{'role': 'user', 'content': content}], 'max_tokens': 1200}, max_retries=1)
            entry.update({'status': 'analyzed', 'analysis': response['choices'][0]['message']['content']})
        observations.append(entry)
    pages, labels = _render_storyboard(work, tiles, 'episode-review')
    report = {'scope': 'media', 'advisory': True, 'paid_analysis_confirmed': confirmed_paid_analysis, 'contact_sheets': [str(path) for path in pages or []], 'labels_burned': labels, 'observations': observations, 'limitations': ['Three sampled frames per clip cannot establish complete visual continuity.']}
    (work / 'media-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', required=True, type=Path)
    parser.add_argument('--work-dir', required=True, type=Path)
    parser.add_argument('--confirmed-paid-analysis', action='store_true')
    args = parser.parse_args()
    review(json.loads(args.plan.read_text(encoding='utf-8')), args.work_dir, confirmed_paid_analysis=args.confirmed_paid_analysis)


if __name__ == '__main__':
    main()
