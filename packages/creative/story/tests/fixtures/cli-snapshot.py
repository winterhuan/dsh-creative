"""Place source and tracking edits exactly inside snapshot collection."""

import json
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

sys.path.insert(0, sys.argv[1])
import cli

with tempfile.TemporaryDirectory() as temporary:
    project = Path(temporary) / "书"
    (project / "正文").mkdir(parents=True)
    (project / "大纲").mkdir()
    body = project / "正文/第001章.md"
    body.write_text("打开门。", encoding="utf-8")
    (project / "大纲/细纲_第001章.md").write_text("字数目标：500", encoding="utf-8")
    cli.tracking.initialize(project, {
        "schema_version": 1, "book_title": "书", "last_chapter": 0,
        "context": {"position": {"volume": "第一卷", "volume_start_chapter": 1, "story_time": "清晨", "scene": "门外"}},
    })
    original = cli.words.chapter_source_snapshot
    state_path = project / "追踪/_tracking-state.json"
    state_bytes = state_path.read_bytes()
    for change in ("body", "tracking"):
        calls = [0]
        def changed_source(*args):
            value = original(*args)
            calls[0] += 1
            if calls[0] == 1:
                if change == "body":
                    body.write_text("关上门。", encoding="utf-8")
                else:
                    state = json.loads(state_bytes)
                    state["state_revision"] += 1
                    state_path.write_text(json.dumps(state), encoding="utf-8")
            return value
        with patch.object(cli.words, "chapter_source_snapshot", changed_source):
            try:
                cli.snapshot(project, 1)
            except ValueError as error:
                assert "changed" in str(error), str(error)
            else:
                raise AssertionError(f"snapshot accepted a {change} edit during collection")
        body.write_text("打开门。", encoding="utf-8")
        state_path.write_bytes(state_bytes)
