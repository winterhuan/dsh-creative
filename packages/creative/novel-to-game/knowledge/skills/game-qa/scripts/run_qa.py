#!/usr/bin/env python3
"""Launch the shipped Chrome QA driver; Node 22+ and Chrome are required."""
import subprocess
import sys
from pathlib import Path

if __name__ == '__main__':
    raise SystemExit(subprocess.call(['node', str(Path(__file__).with_name('run-qa.mjs')), *sys.argv[1:]]))
