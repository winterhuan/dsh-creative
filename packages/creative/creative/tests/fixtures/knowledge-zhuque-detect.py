"""Offline regressions for the Zhuque chapter detector's report and failure classification."""

import importlib.util
import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch


def reject_network(event, args):
    if event in {"socket.connect", "socket.connect_ex", "socket.getaddrinfo", "http.client.connect"}:
        raise RuntimeError("Offline Zhuque test attempted network access: " + event)


sys.addaudithook(reject_network)

script = Path(sys.argv.pop(1))
spec = importlib.util.spec_from_file_location("zhuque_detect", script)
zhuque = importlib.util.module_from_spec(spec)
spec.loader.exec_module(zhuque)

PARAGRAPHS = [
    "夜色压下来的时候，她推开木门，把篮子放在桌边，" * 7,
    "灶上的水开了，壶盖一下一下地跳，她没去管，" * 8,
    "院门外有人喊她的小名，喊了两声就不喊了，" * 8,
]
CHAPTER = "# 第1章\n\n" + "\n\n".join(PARAGRAPHS) + "\n"


def segment(label, conf, text, order, position=None):
    start = CHAPTER.find(text)
    return {"text": text, "label": label, "conf": conf, "order": order,
            "position": position if position is not None else [start, len(text)]}


def success(ratio=0.7369, segments=None, labels=None):
    return {
        "status": "success",
        "softmax_confidence": 0.5552,
        "ratio_confidence": ratio,
        "labels_ratio": labels or {"0": 0.2631, "1": 0.4802, "2": 0.2567},
        "segment_labels": segments if segments is not None else [
            segment(1, 0.9997, PARAGRAPHS[0], 1),
            segment(2, 0.6081, PARAGRAPHS[1], 2),
            segment(0, 0.0112, PARAGRAPHS[2], 3),
        ],
        "usage": {"total_tokens": len(CHAPTER)},
        "msg": "",
        "makers_models_usage": {"total_tokens": 900},
    }


class FakeResponse:
    def __init__(self, payload, request_id="req_offline"):
        self.body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.headers = {"X-Makers-Models-Id": request_id}

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def http_error(code, payload):
    body = io.BytesIO(json.dumps(payload).encode("utf-8"))
    return urllib.error.HTTPError(zhuque.ENDPOINT, code, "error", {}, body)


class Stdout:
    def __init__(self):
        self.buffer = io.BytesIO()

    def text(self):
        return self.buffer.getvalue().decode("utf-8")


class Detector(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name)
        self.chapter = self.root / "第1章.md"
        self.chapter.write_text(CHAPTER, encoding="utf-8")
        self.requests = []

    def tearDown(self):
        self.directory.cleanup()

    def invoke(self, args, response=None, key="dummy-makers-key"):
        def urlopen(request, timeout):
            self.requests.append(request)
            if isinstance(response, BaseException):
                raise response
            return FakeResponse(response if response is not None else success())

        stdout = Stdout()
        environ = {name: value for name, value in os.environ.items() if name != zhuque.KEY_ENV}
        if key is not None:
            environ[zhuque.KEY_ENV] = key
        with patch.object(zhuque.urllib.request, "urlopen", urlopen), patch.object(sys, "stdout", stdout), \
                patch.dict(os.environ, environ, clear=True):
            status = zhuque.main(args)
        return status, stdout.text()

    def report(self, args, response=None, key="dummy-makers-key"):
        status, output = self.invoke(["--json", *args], response, key)
        return status, json.loads(output)

    def test_maps_segments_to_lines_and_mirrors_the_web_verdict(self):
        status, report = self.report([str(self.chapter)])
        self.assertEqual(status, zhuque.EXIT_BELOW_TARGET)
        self.assertEqual(report["schema"], "story-zhuque-detect/v1")
        self.assertEqual((report["verdict"], report["verdict_text"], report["pass"]), ("yellow", "人工创作特征较弱", False))
        self.assertEqual(report["ai_percent"], 73.69)
        self.assertEqual(report["labels_ratio"], {"human": 0.2631, "ai": 0.4802, "suspected": 0.2567})
        self.assertEqual([item["label"] for item in report["segments"]], ["ai", "suspected", "human"])
        self.assertEqual([item["lines"] for item in report["segments"]], [[3, 3], [5, 5], [7, 7]])
        self.assertEqual(report["usage"], {"model_tokens": len(CHAPTER), "billed_tokens": 900})
        self.assertEqual(report["request_id"], "req_offline")
        self.assertTrue(report["segments"][0]["excerpt"].startswith("夜色压下来的时候"))

    def test_sends_the_whole_chapter_unmerged_with_a_bearer_key(self):
        status, output = self.invoke([str(self.chapter)])
        self.assertEqual(status, zhuque.EXIT_BELOW_TARGET)
        request = self.requests[0]
        self.assertEqual(request.full_url, zhuque.ENDPOINT)
        self.assertEqual(request.get_header("Authorization"), "Bearer dummy-makers-key")
        self.assertEqual(json.loads(request.data.decode("utf-8")), {"text": CHAPTER, "is_merge": False})
        self.assertNotIn("dummy-makers-key", output)
        self.assertIn("AI 浓度 73.69%（黄：人工创作特征较弱）", output)
        self.assertIn("#1 AI 0.9997 第3-3行", output)

    def test_target_and_color_boundaries(self):
        cases = [(0.4999, "green", 0.5, True), (0.5, "yellow", 0.5, False), (1, "red", 0.5, False), (0.3, "green", 0.3, False)]
        for ratio, verdict, target, passed in cases:
            with self.subTest(ratio=ratio, target=target):
                status, report = self.report(["--target", str(target), str(self.chapter)], success(ratio=ratio))
                self.assertEqual((report["verdict"], report["pass"]), (verdict, passed))
                self.assertEqual(status, zhuque.EXIT_PASS if passed else zhuque.EXIT_BELOW_TARGET)

    def test_recovers_or_reports_segments_whose_positions_do_not_match(self):
        shifted = segment(1, 0.99, PARAGRAPHS[1], 1, position=[0, len(PARAGRAPHS[1])])
        missing = {"text": "原文里没有这句话。", "label": 2, "conf": 0.6, "order": 2, "position": [5, 9]}
        status, report = self.report([str(self.chapter)], success(segments=[shifted, missing]))
        self.assertEqual(status, zhuque.EXIT_BELOW_TARGET)
        self.assertEqual(report["segments"][0]["lines"], [5, 5])
        self.assertEqual(report["segments"][0]["start"], CHAPTER.find(PARAGRAPHS[1]))
        self.assertEqual({key: report["segments"][1][key] for key in ("start", "length", "lines")},
                         {"start": None, "length": None, "lines": None})

    def test_classifies_http_and_network_failures(self):
        cases = [
            (lambda: http_error(401, {"error": {"message": "API key not found.", "code": "auth_failed"}}), "auth_failed", zhuque.EXIT_CREDENTIAL),
            (lambda: http_error(403, {"error": {"message": "forbidden"}}), "auth_failed", zhuque.EXIT_CREDENTIAL),
            (lambda: http_error(429, {"error": {"message": "slow down"}}), "rate_limited", zhuque.EXIT_SERVICE),
            (lambda: http_error(400, {"error": {"message": "text must be a non-empty string"}}), "invalid_request", zhuque.EXIT_INPUT),
            (lambda: http_error(502, {}), "service_error", zhuque.EXIT_SERVICE),
            (lambda: urllib.error.URLError("offline"), "network_error", zhuque.EXIT_SERVICE),
            (lambda: TimeoutError("timed out"), "network_error", zhuque.EXIT_SERVICE),
        ]
        for response, code, exit_code in cases:
            with self.subTest(code=code):
                status, report = self.report([str(self.chapter)], response())
                self.assertEqual((status, report["ok"], report["error"]["code"]), (exit_code, False, code))
        _, report = self.report([str(self.chapter)], cases[0][0]())
        self.assertEqual(report["error"]["message"], "HTTP 401: API key not found.")

    def test_rejects_malformed_or_unsuccessful_responses(self):
        cases = [
            (b"<html>gateway</html>", "invalid_response"),
            ([1, 2], "invalid_response"),
            ({"status": "failed", "msg": "busy"}, "service_error"),
            ({**success(), "ratio_confidence": "high"}, "invalid_response"),
            ({**success(), "segment_labels": None}, "invalid_response"),
        ]
        for response, code in cases:
            with self.subTest(code=code):
                status, report = self.report([str(self.chapter)], response)
                self.assertEqual((status, report["error"]["code"]), (zhuque.EXIT_SERVICE, code))

    def test_refuses_before_any_request_without_a_key_or_with_unusable_input(self):
        short = self.root / "short.md"
        short.write_text("她推开木门。\n" * 20, encoding="utf-8")
        cases = [
            ([str(self.chapter)], None, "missing_credential", zhuque.EXIT_CREDENTIAL),
            ([str(self.chapter)], "   ", "missing_credential", zhuque.EXIT_CREDENTIAL),
            ([str(short)], "dummy", "text_too_short", zhuque.EXIT_INPUT),
            (["--max-chars", "400", str(self.chapter)], "dummy", "text_too_long", zhuque.EXIT_INPUT),
            ([str(self.root / "missing.md")], "dummy", "file_not_found", zhuque.EXIT_INPUT),
            (["--target", "0", str(self.chapter)], "dummy", "invalid_arguments", zhuque.EXIT_INPUT),
            (["--target", "1.5", str(self.chapter)], "dummy", "invalid_arguments", zhuque.EXIT_INPUT),
            (["--max-chars", "100", str(self.chapter)], "dummy", "invalid_arguments", zhuque.EXIT_INPUT),
            (["--unknown", str(self.chapter)], "dummy", "invalid_arguments", zhuque.EXIT_INPUT),
        ]
        for args, key, code, exit_code in cases:
            with self.subTest(code=code, args=args):
                status, report = self.report(args, key=key)
                self.assertEqual((status, report["error"]["code"]), (exit_code, code))
        self.assertEqual(self.requests, [])

    def test_counts_characters_like_the_web_page(self):
        self.assertEqual(zhuque.counted_chars("hello world 你好，世界"), 2 + 5)
        self.assertEqual(zhuque.counted_chars("  第1章\n\n她笑了。 OK "), 3 + 4 + 1)

    def test_normalizes_bom_and_line_endings_before_detection(self):
        self.chapter.write_bytes(("﻿" + CHAPTER.replace("\n", "\r\n")).encode("utf-8"))
        status, report = self.report([str(self.chapter)])
        self.assertEqual(status, zhuque.EXIT_BELOW_TARGET)
        self.assertEqual(json.loads(self.requests[0].data.decode("utf-8"))["text"], CHAPTER)
        self.assertEqual(report["segments"][0]["lines"], [3, 3])

    def test_writes_the_report_file_and_leaves_the_chapter_untouched(self):
        out = self.root / ".story-polish" / "第1章" / "R0.json"
        status, output = self.invoke(["--out", str(out), str(self.chapter)])
        self.assertEqual(status, zhuque.EXIT_BELOW_TARGET)
        self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["ai_percent"], 73.69)
        self.assertEqual(self.chapter.read_text(encoding="utf-8"), CHAPTER)
        self.assertIn("消耗 900 token（请求 req_offline）", output)

    def test_reports_an_unwritable_report_path_as_an_input_error(self):
        blocker = self.root / "blocker"
        blocker.write_text("", encoding="utf-8")
        status, report = self.report(["--out", str(blocker / "R0.json"), str(self.chapter)])
        self.assertEqual((status, report["error"]["code"]), (zhuque.EXIT_INPUT, "report_unwritable"))

    def test_prints_failures_readably_without_json(self):
        status, output = self.invoke([str(self.chapter)], key=None)
        self.assertEqual(status, zhuque.EXIT_CREDENTIAL)
        self.assertTrue(output.startswith("朱雀检测失败（missing_credential）"))


if __name__ == "__main__":
    unittest.main()
