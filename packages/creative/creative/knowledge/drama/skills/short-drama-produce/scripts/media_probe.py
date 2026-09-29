"""Validate staged output streams and decode media before publication."""
import json
import math
import subprocess
from pathlib import Path


def validate_media(path: Path, modality: str, parameters: dict) -> dict:
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], check=True, capture_output=True, text=True, timeout=30)
    probe = json.loads(result.stdout)
    streams = probe.get('streams', [])
    kind = 'video' if modality in ('image', 'video') else 'audio'
    candidates = [s for s in streams if s.get('codec_type') == kind]
    if not candidates:
        raise ValueError(f'Output has no usable {kind} stream')
    stream = candidates[0]
    if kind == 'video' and (stream.get('width', 0) <= 0 or stream.get('height', 0) <= 0):
        raise ValueError('Output has invalid dimensions')
    if modality != 'image':
        duration = float(probe.get('format', {}).get('duration', 0))
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError('Output has no usable duration')
        expected = parameters.get('duration', parameters.get('duration_seconds'))
        if expected is not None and abs(duration - float(expected)) > max(0.5, float(expected) * 0.1):
            raise ValueError('Output duration differs from confirmed parameters')
    for dimension in ('width', 'height'):
        if dimension in parameters and stream.get(dimension) != parameters[dimension]:
            raise ValueError(f'Output {dimension} differs from confirmed parameters')
    resolution = str(parameters.get('resolution', '')).upper()
    expected_side = {'480P': 480, '720P': 720, '768P': 768, '1080P': 1080}.get(resolution)
    if expected_side and min(stream.get('width', 0), stream.get('height', 0)) != expected_side:
        raise ValueError('Output resolution differs from confirmed parameters')
    if parameters.get('generate_audio') is True and not any(s.get('codec_type') == 'audio' for s in streams):
        raise ValueError('Confirmed audio stream is missing')
    mappings = ['-map', '0:v:0', '-map', '0:a?'] if kind == 'video' else ['-map', '0:a:0']
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(path), *mappings, '-f', 'null', '-'], check=True, capture_output=True, timeout=120)
    return probe
