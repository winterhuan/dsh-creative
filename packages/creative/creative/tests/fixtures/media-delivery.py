"""Synthetic, keyless media regression covering draft and finished-episode delivery."""
import contextlib
import io
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

PACKAGE = Path(__file__).resolve().parents[2]
VIDEO = PACKAGE / 'knowledge/video-recap/skills'
DRAMA = PACKAGE / 'knowledge/drama/skills'
sys.path[:0] = [str(VIDEO / name / 'scripts') for name in ('video-recap', 'video-assemble', 'video-voiceover', 'video-understanding')]
sys.path[:0] = [str(DRAMA / name / 'scripts') for name in ('short-drama-produce', 'short-drama', 'short-drama-review')]
from lib import CONFIG
import voiceover
import draft
import compose_episode
import creator_markdown_check
from media_probe import validate_media
from media_review import review


def run(command):
    subprocess.run(command, check=True, capture_output=True, timeout=60)


def main():
    fixture = json.loads(Path(__file__).with_name('creator-episode.json').read_text())
    assert creator_markdown_check.validate_episode(Path('.'), documents=fixture['documents'], available_paths=set()) == []
    for case in fixture['cases']:
        documents = dict(fixture['documents'])
        documents[case['document']] = documents[case['document']].replace(case['from'], case['to'])
        errors = creator_markdown_check.validate_episode(Path('.'), documents=documents, available_paths=set())
        assert any(case['diagnostic'] in message for message in errors), (case['name'], errors)
    broken = dict(fixture['documents'])
    broken['视觉设定.md'] = broken['视觉设定.md'].replace('- ID：VISUAL-JIANGCHEN\n', '')
    assert any('VISUAL' in message for message in creator_markdown_check.validate_episode(Path('.'), documents=broken, available_paths=set()))
    binding = 'REF-ONE（顺序：1）· other.png《旁人》（用途：身份；控制：外观；不得控制：地理）'
    for name in ('分镜.md', '视频提示词.md'):
        broken[name] = fixture['documents'][name].replace('无（创作者已明确选择文生视频）', binding).replace('文生视频', '图生视频')
    errors = creator_markdown_check.validate_episode(Path('.'), documents=broken, available_paths={'other.png'})
    assert any('未声明的主体' in message for message in errors)
    assert any('缺少本镜主体' in message for message in errors)
    with tempfile.TemporaryDirectory(prefix='dsh-media-delivery-') as directory:
        root = Path(directory)
        source = root / 'source.mp4'
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:r=12', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=24000', '-t', '6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(source)])
        invalid = root / 'invalid.mp4'
        invalid.write_bytes(b'\x00\x00\x00\x18ftypisom' + b'\x00' * 24)
        try:
            validate_media(invalid, 'video', {})
            raise AssertionError('Undecodable output accepted')
        except subprocess.CalledProcessError:
            pass
        for parameters in ({'duration': 20}, {'width': 900}, {'resolution': '720P'}):
            try:
                validate_media(source, 'video', parameters)
                raise AssertionError('Incorrect declared media parameters accepted')
            except ValueError:
                pass
        work = root / 'draft'
        frames = draft.prepare(source, work, no_transcript_reason='Synthetic source has no speech')
        (work / 'agent_narration_brief.md').write_text('# Synthetic creative brief\n', encoding='utf-8')
        descriptions = root / 'descriptions.json'
        descriptions.write_text(json.dumps([{'path': frame['path'], 'description': 'Moving colored test pattern'} for frame in frames]))
        narration = root / 'narration.json'
        rows = [{'start': 0, 'end': 5, 'narration': '画面中有色彩。'}]
        narration.write_text(json.dumps(rows))
        status = draft.render(source, work, narration=narration, descriptions=descriptions, stand_in=True)
        assert status['release_ready'] is False and status['speech'] == 'timing_stand_in'
        assert validate_media(work / 'draft.mp4', 'video', {'generate_audio': True})
        import delivery_evidence
        evidence = json.loads((work / 'delivery_evidence.json').read_text())
        delivery_evidence.write_delivery_evidence(work, evidence)
        brief = (work / 'agent_narration_brief.md').read_text()
        assert brief.count('## 交付证据') == 1 and '不代表任何平台已批准' in brief
        with patch.object(voiceover, '_run_tts_engine') as paid:
            try:
                voiceover.synthesize_tts([{'start': 0, 'end': 1, 'narration': '过长文字' * 50}], root)
                raise AssertionError('Overlong narration reached synthesis')
            except ValueError:
                pass
            paid.assert_not_called()
        staging = root / 'composition'
        staging.mkdir()
        run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=24000', '-t', '6', str(root / 'music.wav')])
        (root / 'plan.json').write_text(json.dumps({'source_audio': 'replace', 'music': 'music.wav', 'width': 320, 'height': 240, 'segments': [{'path': 'source.mp4', 'start': 0, 'end': 3}, {'path': 'source.mp4', 'start': 3, 'end': 6}], 'dialogue': rows}))
        def speech(narration, work):
            audio = work / 'speech.wav'
            run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=24000', '-t', '2', str(audio)])
            return [voiceover._build_tts_segment_result(0, narration[0], narration[0]['narration'], audio, 2, 0)], 'fixture'
        with patch.object(compose_episode, 'synthesize_tts', side_effect=speech):
            output = compose_episode.compose({'project_root': str(root), 'output_root': str(staging), 'source': 'plan.json', 'references': ['source.mp4', 'music.wav'], 'outputs': ['finished.mp4']})
        path = Path(output['outputs'][0]['source'])
        probe = validate_media(path, 'video', {'generate_audio': True, 'duration': 6})
        assert {'video', 'audio', 'subtitle'} <= {stream['codec_type'] for stream in probe['streams']}
        review_result = review({'clips': [{'path': str(path), 'targetId': 'SHOT-001', 'subjects': ['test pattern'], 'location': 'test canvas'}]}, root / 'review')
        assert review_result['paid_analysis_confirmed'] is False
        assert len(review_result['observations'][0]['frames']) == 3
        assert review_result['contact_sheets']
    return 15


if __name__ == '__main__':
    with contextlib.redirect_stdout(io.StringIO()):
        count = main()
    print(f'{count} self-tests passed')
