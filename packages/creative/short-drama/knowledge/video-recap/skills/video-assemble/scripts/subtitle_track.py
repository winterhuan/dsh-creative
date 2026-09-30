"""Attach selectable subtitles without requiring the optional libass renderer."""
import subprocess


def mux_subtitle_track(video, subtitles, output):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-i', str(subtitles), '-map', '0:v:0', '-map', '0:a:0', '-map', '1:0', '-c', 'copy', '-c:s', 'mov_text', str(output)], check=True, capture_output=True, timeout=300)
