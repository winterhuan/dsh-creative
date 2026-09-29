#!/usr/bin/env python3
"""Compose the confirmed episode plan through the production adapter protocol."""
import contextlib
import json
import subprocess
import sys
from pathlib import Path

VIDEO = Path(__file__).resolve().parents[4] / 'video-recap/skills'
sys.path[:0] = [str(VIDEO / skill / 'scripts') for skill in ('video-assemble', 'video-voiceover')]
from lib import CONFIG
from assemble import assemble_video
from voiceover import synthesize_tts
from media_probe import validate_media


def compose(job):
    root = Path(job['project_root'])
    staging = Path(job['output_root'])
    plan = json.loads((root / job['source']).read_text(encoding='utf-8'))
    if plan.get('source_audio') not in ('retain', 'replace'):
        raise ValueError('Specify source_audio: retain or replace to prevent duplicate dialogue')
    if not plan.get('segments') or not plan.get('dialogue'):
        raise ValueError('Composition requires approved segments and timed dialogue')
    references = set(job['references'])
    normalized = []
    duration = 0.0
    for index, segment in enumerate(plan['segments']):
        if segment['path'] not in references:
            raise ValueError('Every clip must be a confirmed reference')
        start, end = float(segment['start']), float(segment['end'])
        if not 0 <= start < end:
            raise ValueError('Invalid segment trim')
        source = root / segment['path']
        probe = validate_media(source, 'video', {})
        if end > float(probe['format']['duration']) + 0.05:
            raise ValueError('Trim exceeds source duration')
        output = staging / f'clip-{index:04d}.mp4'
        cmd = ['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(source)]
        if plan['source_audio'] == 'replace' or not any(s['codec_type'] == 'audio' for s in probe['streams']):
            cmd += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0']
        else:
            cmd += ['-map', '0:v:0', '-map', '0:a:0']
        width, height = plan.get('width', 720), plan.get('height', 1280)
        if not all(isinstance(n, int) and 16 <= n <= 3840 and n % 2 == 0 for n in (width, height)):
            raise ValueError('Composition dimensions must be even integers between 16 and 3840')
        cmd += ['-t', str(end - start), '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', str(output)]
        subprocess.run(cmd, check=True, capture_output=True, timeout=300)
        normalized.append(output)
        duration += end - start
    if any(not 0 <= row['start'] < row['end'] <= duration for row in plan['dialogue']):
        raise ValueError('Dialogue lies outside the approved episode timeline')
    concat = staging / 'concat.txt'
    concat.write_text(''.join(f"file '{p.name}'\n" for p in normalized), encoding='utf-8')
    base = staging / 'sequence.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', str(concat), '-c', 'copy', str(base)], check=True, capture_output=True, timeout=300)
    music = plan.get('music')
    if music and music not in references:
        raise ValueError('Music must be a confirmed reference')
    CONFIG.update({'tts_provider': 'mimo-tts', 'narration_speed': 1.0, 'tts_dynamic_params': False, 'burn_subtitles': bool(plan.get('burn_subtitles', False)), 'bgm_path': str(root / music) if music else '', 'final_loudnorm': True})
    segments, _engine = synthesize_tts(plan['dialogue'], staging)
    mixed = staging / 'mixed.mp4'
    assemble_video(base, segments, staging, mixed)
    # Carry selectable dialogue subtitles as well as the assembly's burnt captions.
    from subtitle_core import _seconds_to_srt_time
    subtitles = staging / 'dialogue.srt'
    subtitles.write_text(''.join(f"{i + 1}\n{_seconds_to_srt_time(row['start'])} --> {_seconds_to_srt_time(row['end'])}\n{row['narration']}\n\n" for i, row in enumerate(plan['dialogue'])), encoding='utf-8')
    result = staging / 'episode.mp4'
    from subtitle_track import mux_subtitle_track
    mux_subtitle_track(mixed, subtitles, result)
    validate_media(result, 'video', {'generate_audio': True, 'duration': duration, 'width': width, 'height': height})
    if len(job['outputs']) != 1:
        raise ValueError('Composition requires exactly one output')
    return {'outputs': [{'target': job['outputs'][0], 'source': str(result)}]}


def main():
    job = json.load(sys.stdin)
    with contextlib.redirect_stdout(sys.stderr):
        result = compose(job)
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main()
