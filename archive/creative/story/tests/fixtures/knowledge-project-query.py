"""Read-only continuity queries use actual state across 500 chapters without loading prose."""
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# The argument is the storyctl.py path; the query modules live beside it.
sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve().parent))

import project_query
import tracking_commit

fixture = Path(__file__).with_name("continuity-state.json")


class ProjectQuery(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.project = Path(directory.name)
        (self.project / "追踪/逐章记录").mkdir(parents=True)
        self.path = self.project / "追踪/_tracking-state.json"
        self.path.write_bytes(fixture.read_bytes())
        self.tracking = tracking_commit
        self.query_module = project_query

    def query(self, **kwargs):
        return self.query_module.project_query(self.project, self.tracking, **kwargs)

    def files(self):
        return {str(p.relative_to(self.project)): p.read_bytes() for p in self.project.rglob("*") if p.is_file()}

    def test_status_and_early_foreshadow_remain_bounded_at_chapter_501(self):
        before = self.files()
        status = self.query()
        self.assertEqual(status["through_chapter"], 500)
        self.assertEqual(status["next_chapter"], 501)
        self.assertEqual(status["counts"]["due"], 2)
        hot_card = self.tracking.render_context(self.tracking.load_state(self.project))
        self.assertNotIn("F001", hot_card)
        due = self.query(kind="foreshadow", selection="due")
        self.assertEqual([row["id"] for row in due["items"]], ["F002", "F001"])
        self.assertLessEqual(len(self.query_module.encoded(due)), 16384)
        self.assertEqual(before, self.files())

    def test_paging_visits_every_matching_item_once(self):
        ids, offset = [], 0
        while True:
            page = self.query(kind="foreshadow", selection="open", offset=offset, limit=3, expected_revision=7)
            ids.extend(row["id"] for row in page["items"])
            self.assertEqual(page["omitted"], page["total"] - len(page["items"]))
            if page["next_offset"] is None:
                break
            self.assertGreater(page["next_offset"], offset)
            offset = page["next_offset"]
        self.assertEqual(len(ids), 11)
        self.assertEqual(len(set(ids)), 11)
        self.assertEqual(self.query(kind="foreshadow", offset=999)["items"], [])

    def test_distinguishes_deadlines_and_unresolved_states(self):
        for selection, expected in [("overdue", ["F002"]), ("unscheduled", ["F011"]), ("resolved", ["F012"])]:
            self.assertEqual([row["id"] for row in self.query(kind="foreshadow", selection=selection)["items"]], expected)
        self.assertEqual(self.query(kind="foreshadow", selection="due", chapter=1)["items"], [])

    def test_reader_query_does_not_return_or_search_author_secrets(self):
        reader = self.query(kind="reader-timeline")
        self.assertNotIn("objective_fact", reader["items"][0])
        self.assertEqual(self.query(kind="reader-timeline", search="SECRET")['items'], [])
        self.assertEqual(len(self.query(kind="author-timeline", search="SECRET")['items']), 1)

    def test_character_and_historical_sources(self):
        row = self.query(kind="characters", search="林舟")["items"][0]
        self.assertEqual(row["source"], "追踪/角色状态/林舟.md")
        record = self.project / "追踪/逐章记录/第001章.md"
        self.assertEqual(self.query(kind="chapter", chapter=1)["missing_sources"], ["追踪/逐章记录/第001章.md"])
        record.write_text("# 第1章\n林舟藏起铜钥匙。\n", encoding="utf-8")
        self.assertIn("铜钥匙", self.query(kind="chapter", chapter=1)["items"][0]["content"])
        with self.assertRaisesRegex(self.tracking.TrackingError, "beyond"):
            self.query(kind="chapter", chapter=501)

    def test_missing_state_and_corrupt_state_do_not_write(self):
        self.path.unlink()
        before = self.files()
        self.assertFalse(self.query()["initialized"])
        self.assertEqual(before, self.files())
        self.path.write_text("{broken", encoding="utf-8")
        before = self.files()
        with self.assertRaises(ValueError):
            self.query()
        self.assertEqual(before, self.files())

    def test_rejects_changed_revision_busy_commit_and_unsafe_path(self):
        with self.assertRaisesRegex(self.tracking.TrackingError, "revision changed"):
            self.query(expected_revision=6)
        with self.tracking.project_write_lock(self.project):
            with self.assertRaisesRegex(self.tracking.TrackingError, "in progress"):
                self.query()
        self.assertEqual(self.query()["through_chapter"], 500)
        with self.assertRaisesRegex(self.tracking.TrackingError, "leaves"):
            self.query_module.source_path(self.project, "../other-book", self.tracking)

    def test_byte_limit_returns_complete_items_and_advances(self):
        state = json.loads(self.path.read_bytes())
        snapshot = state["characters"]["林舟"]
        snapshot["knowledge"] = ["旧事" * 60 for _ in range(10)]
        state["characters"] = {f"人物{n}": snapshot for n in range(50)}
        state["context"]["active_character_names"] = []
        self.path.write_text(json.dumps(state), encoding="utf-8")
        page = self.query(kind="characters", limit=50)
        self.assertGreater(len(page["items"]), 0)
        self.assertLess(len(page["items"]), 50)
        self.assertEqual(page["next_offset"], len(page["items"]))
        self.assertEqual(page["items"][0]["knowledge"], snapshot["knowledge"])
        self.assertLessEqual(len(self.query_module.encoded(page)), 16384)

    def test_state_change_during_query_is_rejected(self):
        read = Path.read_bytes
        count = 0
        def changing(path):
            nonlocal count
            if path == self.path:
                count += 1
                if count == 2:
                    return read(path) + b" "
            return read(path)
        with patch.object(Path, "read_bytes", changing):
            with self.assertRaisesRegex(self.tracking.TrackingError, "changed during"):
                self.query()

    def test_invalid_inputs(self):
        for arguments in ({"offset": -1}, {"limit": 0}, {"limit": 51}, {"kind": "chapter"}, {"chapter": 0}, {"selection": "due"}):
            with self.subTest(arguments=arguments), self.assertRaises(self.tracking.TrackingError):
                self.query(**arguments)


unittest.main()
