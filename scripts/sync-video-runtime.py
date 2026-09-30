#!/usr/bin/env python3
"""Keep packaged media runtime and source-exchange helpers equal to their owners."""
import argparse
from pathlib import Path

PACKAGES = Path(__file__).resolve().parents[1] / 'packages/creative'
ROOT = PACKAGES / 'video-recap/knowledge/video-recap'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    stale = []

    def copy(source, target):
        if target.exists() and target.read_bytes() == source.read_bytes():
            return
        if args.check:
            stale.append(str(target.relative_to(PACKAGES)))
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())

    for source in sorted((ROOT / 'runtime').glob('*.py')):
        skills = ('video-voiceover', 'video-script', 'video-assemble', 'video-recap', 'video-understanding', 'video-cut') if source.name == 'lib.py' else ('video-script', 'video-understanding')
        for skill in skills:
            copy(source, ROOT / 'skills' / skill / 'scripts' / source.name)
    for skill in ('video-assemble', 'video-voiceover', 'video-understanding'):
        for source in sorted((ROOT / 'skills' / skill / 'scripts').glob('*.py')):
            copy(source, PACKAGES / 'short-drama/knowledge/video-recap/skills' / skill / 'scripts' / source.name)
    for name in ('export_novel_txt.py', 'record_lineage.py'):
        source = PACKAGES / 'story/knowledge/story/scripts' / name
        for domain in ('short-drama', 'video-recap'):
            copy(source, PACKAGES / domain / 'knowledge/source-tools' / name)
    if stale:
        parser.exit(1, 'Stale runtime copies: ' + ', '.join(stale) + '\n')


if __name__ == '__main__':
    main()
