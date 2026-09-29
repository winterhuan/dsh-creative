#!/usr/bin/env python3
"""Create a dependency-free narrative, turn-based or Canvas starter without overwriting files."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
parser.add_argument('--template', required=True, choices=['narrative', 'turn-based', 'canvas'])
args = parser.parse_args()
source = Path(__file__).parent
app = args.root / 'build/app'
app.mkdir(parents=True, exist_ok=False)
for name in ['index.html', 'rules.js', 'runtime.js', 'style.css']:
    text = (source / name).read_text(encoding='utf-8')
    (app / name).write_text(text.replace('TEMPLATE', args.template), encoding='utf-8')
qa = args.root / 'qa'
qa.mkdir(exist_ok=True)
(qa / 'plan.json').write_text(json.dumps({'seed': 1, 'minTurns': 3, 'inputs': [{'selector': '[data-action="study"]'}] * 3, 'outcomes': ['discovery', 'exhausted', 'missed'], 'restartSelector': '[data-action="restart"]'}, indent=2) + '\n')
