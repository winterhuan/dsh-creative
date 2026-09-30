#!/usr/bin/env python3
"""Keyless draft preparation and rendering; never a release approval."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

SIBLINGS = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(SIBLINGS / skill / 'scripts') for skill in ('video-assemble', 'video-voiceover', 'video-understanding')]
from lib import CONFIG, get_video_duration
from voiceover import _build_tts_segment_result
from assemble import assemble_video


def run(command):
    subprocess.run(command, check=True, capture_output=True, timeout=300)


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def prepare(video, work, *, transcript=None, asr_model=None, no_transcript_reason=None):
    duration = get_video_duration(video)
    if duration <= 0:
        raise ValueError('Source has no decodable duration')
    work.mkdir(parents=True, exist_ok=True)
    if transcript:
        rows = json.loads(Path(transcript).read_text(encoding='utf-8'))
        asr = 'creator_transcript'
    elif asr_model:
        executable = shutil.which('whisper-cli')
        if not executable or not Path(asr_model).is_file():
            raise ValueError('Local ASR requires whisper-cli and an installed model file')
        wav = work / 'source.wav'
        run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vn', '-ar', '16000', '-ac', '1', str(wav)])
        run([executable, '-m', str(asr_model), '-f', str(wav), '-oj', '-of', str(work / 'local-asr')])
        raw = json.loads((work / 'local-asr.json').read_text())
        rows = [{'start': row['offsets']['from'] / 1000, 'end': row['offsets']['to'] / 1000, 'text': row['text']} for row in raw['transcription']]
        asr = 'local_whisper'
    elif no_transcript_reason and no_transcript_reason.strip():
        rows, asr = [], 'creator_waiver'
    else:
        raise ValueError('Provide --asr-model, --transcript, or an explicit --no-transcript-reason')
    write(work / 'asr_result.json', rows)
    frames = []
    for index in range(min(12, max(1, int(duration / 5)))):
        at = duration * (index + 0.5) / min(12, max(1, int(duration / 5)))
        path = work / f'frame-{index:02d}.jpg'
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(at), '-i', str(video), '-frames:v', '1', '-vf', 'scale=480:-2', str(path)])
        frames.append({'path': path.name, 'time': round(at, 3)})
    write(work / 'storyboard.json', frames)
    write(work / 'draft_status.json', {'status': 'draft', 'asr': asr, 'waiver': no_transcript_reason, 'vision': 'awaiting_storyboard_descriptions', 'speech': 'not_rendered', 'source': str(Path(video).resolve())})
    return frames


def render(video, work, *, narration, descriptions, stand_in=False):
    status = json.loads((work / 'draft_status.json').read_text())
    if status['source'] != str(Path(video).resolve()):
        raise ValueError('Draft source changed; prepare again')
    frames = json.loads((work / 'storyboard.json').read_text())
    observations = json.loads(Path(descriptions).read_text(encoding='utf-8'))
    if not isinstance(observations, list) or {row.get('path') for row in observations} != {row['path'] for row in frames} or any(not row.get('description', '').strip() for row in observations):
        raise ValueError('Describe every storyboard frame before drafting narration')
    write(work / 'frame_descriptions.json', observations)
    rows = json.loads(Path(narration).read_text(encoding='utf-8'))
    duration = get_video_duration(video)
    segments = []
    for index, row in enumerate(rows):
        if not 0 <= row['start'] < row['end'] <= duration or not row['narration'].strip():
            raise ValueError('Narration requires text and valid source-time bounds')
        wav = work / f'local-{index:03d}.wav'
        if stand_in:
            run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000', '-t', str(min(1, (row['end'] - row['start']) / 2)), str(wav)])
        elif shutil.which('say'):
            text = work / f'line-{index:03d}.txt'
            text.write_text(row['narration'], encoding='utf-8')
            run(['say', '-f', str(text), '-o', str(wav), '--data-format=LEI16@24000'])
        elif shutil.which('espeak-ng'):
            run(['espeak-ng', '-w', str(wav), '--', row['narration']])
        else:
            raise ValueError('Install say/espeak-ng or explicitly choose --stand-in for timing-only audio')
        segments.append(_build_tts_segment_result(index, row, row['narration'], wav, get_video_duration(wav), 0))
    CONFIG.update({'narration_speed': 1.0, 'tts_dynamic_params': False, 'burn_subtitles': False})
    assemble_video(video, segments, work, work / 'draft-master.mp4')
    from subtitle_track import mux_subtitle_track
    mux_subtitle_track(work / 'draft-master.mp4', work / 'subtitles.srt', work / 'draft.mp4')
    status.update({'vision': 'storyboard_descriptions', 'speech': 'timing_stand_in' if stand_in else 'local_speech', 'release_ready': False, 'degraded_stages': ['local_speech', 'storyboard_only_vision', 'no_paid_review']})
    write(work / 'draft_status.json', status)
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    parser.add_argument('--work-dir', required=True, type=Path)
    parser.add_argument('--stage', choices=['prepare', 'render'], required=True)
    parser.add_argument('--transcript', type=Path)
    parser.add_argument('--asr-model', type=Path)
    parser.add_argument('--no-transcript-reason')
    parser.add_argument('--narration', type=Path)
    parser.add_argument('--descriptions', type=Path)
    parser.add_argument('--stand-in', action='store_true')
    args = parser.parse_args()
    if args.stage == 'prepare':
        result = prepare(args.video, args.work_dir, transcript=args.transcript, asr_model=args.asr_model, no_transcript_reason=args.no_transcript_reason)
    else:
        if not args.narration or not args.descriptions:
            parser.error('render requires --narration and --descriptions')
        result = render(args.video, args.work_dir, narration=args.narration, descriptions=args.descriptions, stand_in=args.stand_in)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
