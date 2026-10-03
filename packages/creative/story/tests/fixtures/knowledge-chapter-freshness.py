"""Chapter checks and transactions reject files changed after inspection."""

import copy
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("storyctl", sys.argv.pop(1))
storyctl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(storyctl)


class ChapterFreshness(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.project = Path(directory.name)
        for name in ("正文", "大纲"):
            (self.project / name).mkdir()
        self.body = self.project / "正文/第1章.md"
        self.outline = self.project / "大纲/细纲_第1章.md"
        self.body.write_bytes("甲乙丙丁。\r\n".encode("utf-8"))
        self.outline.write_text("- 字数目标：5\n- 字数口径：visible_chars_v1\n", encoding="utf-8")
        self.tracking = storyctl._tracking_module()
        self.tracking.initialize(self.project, {
            "schema_version": 1, "book_title": "版本检查", "last_chapter": 0,
            "context": {"position": {"volume": "第一卷", "volume_start_chapter": 1, "story_time": "清晨", "scene": "门外"}},
        })
        self.state_path = self.project / "追踪/_tracking-state.json"
        self.transaction = {
            "schema_version": 1, "mode": "append", "chapter": 1, "chapter_title": "开门",
            "expected_state_revision": 0,
            "delta": {"result": "开门", "character_changes": [], "foreshadow_changes": [],
                      "timeline_events": [], "constraints": [], "next_chapter_commitments": [],
                      "retired_context_items": [], "retired_characters": []},
            "context": {"position": {"volume": "第一卷", "volume_start_chapter": 1, "story_time": "清晨", "scene": "门内"},
                        "long_term_constraints": [], "active_character_names": [], "continuity_risks": []},
            "character_snapshots": {},
        }
        for name, value in (("check_outline_readiness", {"status": "pass", "failures": []}),
                            ("check_blocking_quality", {"status": "pass", "blocking_findings": [], "advisories": []})):
            mocked = patch.object(storyctl, name, return_value=value)
            mocked.start()
            self.addCleanup(mocked.stop)

    def checked_transaction(self):
        check = storyctl.chapter_check(self.project, 1)
        return {**self.transaction,
                "expected_body_sha256": check["body_sha256"],
                "expected_outline_sha256": check["outline_sha256"]}

    def commit(self, document):
        path = self.project / "transaction.json"
        path.write_text(json.dumps(document), encoding="utf-8")
        return storyctl.chapter_commit(self.project, 1, path, accept_current_length=False)

    def test_check_hashes_exact_bytes(self):
        checked = storyctl.chapter_check(self.project, 1)
        for name, path in (("body", self.body), ("outline", self.outline)):
            self.assertEqual(checked[f"{name}_sha256"], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(checked["state_revision"], 0)

    def test_guarded_commit_does_not_persist_review_or_outline_hash(self):
        checked = self.commit(self.checked_transaction())
        self.assertTrue(checked["tracking_committed"])
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(state["state_revision"], 1)
        self.assertNotIn("reader_value_records", state)
        self.assertNotIn("outline_sha256", state["wordcount_records"]["1"])

    def test_stale_body_or_outline_leaves_tracking_untouched(self):
        for path in (self.body, self.outline):
            with self.subTest(path=path.name):
                document = self.checked_transaction()
                before = self.state_path.read_bytes()
                path.write_bytes(path.read_bytes() + b"\n")
                with self.assertRaisesRegex(storyctl.WordcountError, "sha256.*stale"):
                    self.commit(document)
                self.assertEqual(self.state_path.read_bytes(), before)

    def test_changed_state_requires_rebuilding_transaction(self):
        document = self.checked_transaction()
        state = json.loads(self.state_path.read_text(encoding="utf-8"))
        state["state_revision"] += 1
        self.state_path.write_text(json.dumps(state), encoding="utf-8")
        with self.assertRaisesRegex(storyctl.WordcountError, "tracking state changed"):
            self.commit(document)

    def test_edit_during_check_is_rejected(self):
        for path in (self.body, self.outline, self.state_path):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                def edit(*args):
                    if path == self.state_path:
                        state = json.loads(original)
                        state["state_revision"] += 1
                        path.write_text(json.dumps(state), encoding="utf-8")
                    else:
                        path.write_bytes(original + b"\n")
                    return {"status": "pass", "blocking_findings": [], "advisories": []}
                with patch.object(storyctl, "check_blocking_quality", side_effect=edit):
                    with self.assertRaisesRegex(storyctl.WordcountError, "changed"):
                        storyctl.chapter_check(self.project, 1)
                path.write_bytes(original)

    def test_edit_during_source_collection_is_rejected(self):
        original_read = Path.read_bytes
        def read_and_edit(path):
            data = original_read(path)
            if path == self.body.resolve():
                self.outline.write_bytes(original_read(self.outline) + b"\n")
            return data
        with patch.object(Path, "read_bytes", read_and_edit):
            with self.assertRaisesRegex(storyctl.WordcountError, "changed while reading"):
                storyctl.chapter_check(self.project, 1)

    def test_edit_during_transaction_validation_is_rejected_before_writes(self):
        document = self.checked_transaction()
        before = self.state_path.read_bytes()
        original_merge = self.tracking.merge_transaction
        def edit(state, transaction):
            self.outline.write_bytes(self.outline.read_bytes() + b"\n")
            return original_merge(state, transaction)
        with patch.object(self.tracking, "merge_transaction", side_effect=edit):
            with self.assertRaisesRegex(self.tracking.TrackingError, "changed"):
                self.tracking.apply_transaction(self.project, document)
        self.assertEqual(self.state_path.read_bytes(), before)
        self.assertEqual(list((self.project / "追踪/逐章记录").glob("*.md")), [])

    def test_invalid_hash_is_rejected(self):
        document = self.checked_transaction()
        document["expected_outline_sha256"] = ""
        with self.assertRaisesRegex(storyctl.WordcountError, "sha256 is invalid"):
            self.commit(document)

    def test_direct_transaction_without_hashes_still_works(self):
        state = self.tracking.apply_transaction(self.project, copy.deepcopy(self.transaction))
        self.assertEqual(state["last_committed_chapter"], 1)


if __name__ == "__main__":
    unittest.main()
