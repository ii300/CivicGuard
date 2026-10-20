"""Exercise the HTTP contract without contacting Anthropic or writing a real DB."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx2
from anthropic import APIConnectionError, APITimeoutError, AuthenticationError, RateLimitError
from sqlalchemy.exc import SQLAlchemyError

from app import AlertRecord, DRAFT_LABEL, create_app, db


class AppTests(unittest.TestCase):
    def setUp(self):
        self.factory_patch = patch("app.Anthropic")
        self.factory = self.factory_patch.start()
        self.addCleanup(self.factory_patch.stop)
        self.provider = MagicMock()
        self.factory.return_value.__enter__.return_value = self.provider
        self.provider.messages.create.return_value = SimpleNamespace(
            content=[SimpleNamespace(type="text", text="Exercise draft for review.")],
            stop_reason="end_turn",
        )
        self.app = create_app({
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "ANTHROPIC_API_KEY": "test-key-not-real",
            "ANTHROPIC_MODEL": "test-model",
        })
        self.client = self.app.test_client()
        self.context = self.app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        self.addCleanup(db.engine.dispose)
        self.addCleanup(db.session.remove)

    def post(self, **changes):
        payload = {"area": "Palisades", "severity": "high"}
        payload.update(changes)
        return self.client.post("/api/generate-alert", json=payload)

    def assert_no_records(self):
        self.assertEqual(db.session.query(AlertRecord).count(), 0)

    def test_ui_starts_without_api_configuration(self):
        self.app.config.update(ANTHROPIC_API_KEY="", ANTHROPIC_MODEL="")
        for path in ("/", "/index.html", "/styles.css", "/script.js", "/console-core.js", "/draft-store.js", "/platform-storage.js", "/exercise-export.js", "/app-info.js"):
            with self.subTest(path=path), self.client.get(path) as response:
                self.assertEqual(response.status_code, 200)
        self.factory.assert_not_called()
        self.assertFalse(self.app.debug)

    def test_only_explicit_public_assets_are_served(self):
        for path in ("/.env", "/.env.example", "/alerts.db", "/app.py", "/.git/config", "/static/app.py"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_each_missing_configuration_value_returns_503(self):
        for setting in ("ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"):
            with self.subTest(setting=setting), patch.dict(self.app.config, {setting: ""}):
                response = self.post()
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json["error"], "not_configured")
        self.factory.assert_not_called()
        self.assert_no_records()

    def test_non_json_and_non_object_bodies_are_rejected(self):
        response = self.client.post("/api/generate-alert", data="area=Palisades")
        self.assertEqual(response.status_code, 415)
        for body in ("", "{broken", "null", "[]", '"Palisades"', "42"):
            with self.subTest(body=body):
                response = self.client.post(
                    "/api/generate-alert", data=body, content_type="application/json"
                )
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json["error"], "invalid_request")
        self.factory.assert_not_called()

    def test_missing_fields_never_receive_silent_defaults(self):
        for payload in ({}, {"area": "Palisades"}, {"severity": "high"}):
            with self.subTest(payload=payload):
                response = self.client.post("/api/generate-alert", json=payload)
                self.assertEqual(response.status_code, 400)
        self.factory.assert_not_called()

    def test_invalid_area_and_severity_do_not_call_provider(self):
        for area in (None, 10, [], {}, "", "  ", "x" * 101, "A\nB", "A\x00B"):
            with self.subTest(area=area):
                self.assertEqual(self.post(area=area).status_code, 400)
        for severity in (None, 1, [], {}, "", "urgent", "HIGH"):
            with self.subTest(severity=severity):
                self.assertEqual(self.post(severity=severity).status_code, 400)
        self.factory.assert_not_called()
        self.assert_no_records()

    def test_large_body_is_rejected_with_json(self):
        response = self.post(area="x" * 5000)
        self.assertEqual(response.status_code, 413)
        self.assertTrue(response.is_json)
        self.factory.assert_not_called()

    def test_api_routing_errors_are_json_and_preserve_allowed_methods(self):
        response = self.client.get("/api/generate-alert")
        self.assertEqual(response.status_code, 405)
        self.assertTrue(response.is_json)
        self.assertIn("POST", response.headers["Allow"])
        self.assertEqual(self.client.get("/api/missing").status_code, 404)
        self.assertTrue(self.client.get("/api/missing").is_json)

    def test_success_uses_selected_model_and_saves_normalized_simulation_draft(self):
        self.provider.messages.create.return_value.content = [
            SimpleNamespace(type="thinking", thinking="not public"),
            SimpleNamespace(type="text", text=" First paragraph. "),
            SimpleNamespace(type="text", text="Second paragraph."),
        ]
        response = self.post(area="  洛杉矶  ")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["simulation"])
        self.assertEqual(response.json["alert"], DRAFT_LABEL + "\n\nFirst paragraph.\n\nSecond paragraph.")
        record = db.session.get(AlertRecord, response.json["id"])
        self.assertEqual(record.area, "洛杉矶")
        self.assertEqual(record.severity, "high")
        self.assertEqual(record.content, response.json["alert"])
        self.factory.assert_called_once_with(
            api_key="test-key-not-real", timeout=20.0, max_retries=0
        )
        arguments = self.provider.messages.create.call_args.kwargs
        self.assertEqual(arguments["model"], "test-model")
        self.assertEqual(json.loads(arguments["messages"][0]["content"]), {
            "area": "洛杉矶", "severity": "high"
        })
        self.factory.return_value.__exit__.assert_called_once()

    def test_all_documented_severities_are_accepted(self):
        for severity in ("low", "moderate", "high", "extreme"):
            with self.subTest(severity=severity):
                self.assertEqual(self.post(severity=severity).status_code, 200)

    def test_upstream_errors_return_safe_json_without_saving(self):
        request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        cases = (
            (APITimeoutError(request=request), 504, "upstream_timeout"),
            (APIConnectionError(request=request), 502, "upstream_error"),
            (RateLimitError("private-provider-detail", response=httpx2.Response(429, request=request), body=None), 503, "upstream_busy"),
            (AuthenticationError("private-provider-detail", response=httpx2.Response(401, request=request), body=None), 502, "upstream_error"),
        )
        for error, status, code in cases:
            with self.subTest(error=type(error).__name__):
                self.provider.messages.create.side_effect = error
                response = self.post()
                self.assertEqual(response.status_code, status)
                self.assertEqual(response.json["error"], code)
                self.assertNotIn("private-provider-detail", response.get_data(as_text=True))
                self.assertNotIn("test-key-not-real", response.get_data(as_text=True))
                self.assert_no_records()

    def test_empty_malformed_or_incomplete_drafts_are_not_saved(self):
        cases = (
            SimpleNamespace(),
            SimpleNamespace(content=[], stop_reason="end_turn"),
            SimpleNamespace(content=None, stop_reason="end_turn"),
            SimpleNamespace(content=[SimpleNamespace(type="text", text="  ")], stop_reason="end_turn"),
            SimpleNamespace(content=[SimpleNamespace(type="text", text=42)], stop_reason="end_turn"),
            SimpleNamespace(content=[SimpleNamespace(type="text", text="Incomplete")], stop_reason="max_tokens"),
            SimpleNamespace(content=[SimpleNamespace(type="text", text="Refused")], stop_reason="refusal"),
        )
        for message in cases:
            with self.subTest(message=message):
                self.provider.messages.create.return_value = message
                response = self.post()
                self.assertEqual(response.status_code, 502)
                self.assertEqual(response.json["error"], "invalid_upstream_response")
                self.assert_no_records()

    def test_database_failure_rolls_back_and_next_request_can_succeed(self):
        with patch.object(db.session, "commit", side_effect=SQLAlchemyError("private-db-detail")):
            with patch.object(db.session, "rollback", wraps=db.session.rollback) as rollback:
                response = self.post()
                rollback.assert_called_once()
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json["error"], "storage_error")
        self.assertNotIn("private-db-detail", response.get_data(as_text=True))
        self.assert_no_records()
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(db.session.query(AlertRecord).count(), 1)


if __name__ == "__main__":
    unittest.main()
