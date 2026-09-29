#!/usr/bin/env python3
"""Copy the owned Python runtime into independently distributable Skill trees."""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'packages/creative/creative/knowledge/video-recap'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    stale = []
    for source in sorted((ROOT / 'runtime').glob('*.py')):
        skills = ('video-voiceover', 'video-script', 'video-assemble', 'video-recap', 'video-understanding', 'video-cut') if source.name == 'lib.py' else ('video-script', 'video-understanding')
        for skill in skills:
            target = ROOT / 'skills' / skill / 'scripts' / source.name
            if target.exists() and target.read_bytes() == source.read_bytes():
                continue
            if args.check:
                stale.append(str(target.relative_to(ROOT)))
            else:
                target.write_bytes(source.read_bytes())
    if stale:
        parser.exit(1, 'Stale runtime copies: ' + ', '.join(stale) + '\n')


if __name__ == '__main__':
    main()
