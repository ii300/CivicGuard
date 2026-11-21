"""Account lifecycle, CSRF, private ownership, migration and production guards."""

import html
import re
import tempfile
import unittest
from pathlib import Path

from database import upgrade
from flask.testing import FlaskClient
from sqlalchemy import create_engine, text
from werkzeug.security import check_password_hash

from app import create_app
from extensions import db
from models import SavedDraft, User


PASSWORD = "a long test passphrase"


class IsolatedRequestClient(FlaskClient):
    def open(self, *args, **kwargs):
        # A fresh g per request prevents caching one test client's user
        # in the outer application context used by database assertions.
        with self.application.app_context():
            return super().open(*args, **kwargs)


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app({
            "TESTING": True,
            "SECRET_KEY": "test-secret-that-is-not-used-in-production",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
            "WTF_CSRF_ENABLED": False,
            "RATELIMIT_ENABLED": False,
            "EMAIL_VERIFICATION_REQUIRED": False,
            "APP_ENV": "development",
            "SESSION_COOKIE_SECURE": False,
            "TRUSTED_HOSTS": None,
            "TRUST_PROXY": False,
        })
        self.context = self.app.app_context()
        self.context.push()
        self.addCleanup(self.context.pop)
        self.addCleanup(db.engine.dispose)
        self.addCleanup(db.session.remove)
        self.app.test_client_class = IsolatedRequestClient
        self.client = self.app.test_client()

    def register(self, client=None, email="person@example.com", **overrides):
        data = {"name": "Test Person", "email": email,
                "password": PASSWORD, "confirm_password": PASSWORD}
        data.update(overrides)
        return (client or self.client).post("/register", data=data)

    def draft(self, **overrides):
        return {
            "title": "My exercise", "messages": {"en": "Exercise only.", "es": "Simulación.", "zh": "模拟。"},
            "language": "zh", "channels": ["WEA", "SMS"], **overrides,
        }

    def token(self, path="/login", client=None):
        page = (client or self.client).get(path).get_data(as_text=True)
        return html.unescape(re.search(r'name="csrf_token" value="([^"]+)"', page)[1])

    def test_registration_hashes_password_normalizes_email_and_opens_workspace(self):
        response = self.register(email="  Person@Example.COM ")
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["Location"], "/console")
        user = db.session.scalar(db.select(User))
        self.assertEqual(user.email, "person@example.com")
        self.assertNotIn(PASSWORD, user.password_hash)
        self.assertTrue(user.password_hash.startswith("scrypt:"))
        self.assertTrue(check_password_hash(user.password_hash, PASSWORD))
        self.assertEqual(self.client.get("/console").status_code, 200)
        self.assertIn("HttpOnly", response.headers["Set-Cookie"])
        self.assertIn("SameSite=Lax", response.headers["Set-Cookie"])

    def test_invalid_registration_and_duplicate_email(self):
        for fields in ({"email": "bad"}, {"name": ""}, {"name": "a\nb"}, {"name": "x" * 81},
                       {"password": "short"}, {"password": "x" * 129}, {"confirm_password": "wrong"}):
            with self.subTest(fields=fields):
                self.assertEqual(self.register(**fields).status_code, 400)
        self.assertEqual(db.session.query(User).count(), 0)
        self.register()
        self.client.post("/logout")
        response = self.register(email="PERSON@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(db.session.query(User).count(), 1)

    def test_login_logout_wrong_credentials_and_fixed_redirect(self):
        self.register()
        self.assertEqual(self.client.get("/logout").status_code, 405)
        self.assertEqual(self.client.post("/logout").status_code, 303)
        self.assertEqual(self.client.get("/console").headers["Location"], "/login")
        for email, password in (("person@example.com", "wrong"), ("absent@example.com", PASSWORD)):
            response = self.client.post("/login", data={"email": email, "password": password})
            self.assertEqual(response.status_code, 400)
            self.assertIn("Email or password is incorrect.", response.get_data(as_text=True))
        response = self.client.post("/login?next=https://example.net", data={
            "email": "PERSON@example.com", "password": PASSWORD,
        })
        self.assertEqual(response.headers["Location"], "/console")
        self.assertEqual(self.client.get("/api/drafts").status_code, 200)
        self.client.post("/logout")
        self.assertEqual(self.client.get("/api/drafts").status_code, 401)

    def test_anonymous_api_requests_are_rejected(self):
        for method, path, data in (("get", "/api/drafts", None),
                                   ("post", "/api/drafts", self.draft()),
                                   ("put", "/api/drafts/1", self.draft()),
                                   ("delete", "/api/drafts/1", None),
                                   ("post", "/api/generate-alert", {"area": "Palisades", "severity": "high"})):
            response = getattr(self.client, method)(path, json=data)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json["error"], "authentication_required")

    def test_saved_draft_crud_survives_logout_and_preserves_all_languages(self):
        self.register()
        response = self.client.post("/api/drafts", json=self.draft())
        self.assertEqual(response.status_code, 201)
        draft_id = response.json["draft"]["id"]
        self.client.post("/logout")
        self.client.post("/login", data={"email": "person@example.com", "password": PASSWORD})
        response = self.client.get(f"/api/drafts/{draft_id}")
        self.assertEqual(response.json["draft"]["messages"], self.draft()["messages"])
        self.assertTrue(response.json["draft"]["updated_at"].endswith("+00:00"))
        response = self.client.put(f"/api/drafts/{draft_id}", json=self.draft(title="Edited exercise", channels=[], version=1))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.client.get("/api/drafts").json["drafts"]), 1)
        self.assertEqual(self.client.delete(f"/api/drafts/{draft_id}").status_code, 204)
        self.assertEqual(self.client.get("/api/drafts").json["drafts"], [])

    def test_other_accounts_cannot_read_update_delete_or_impersonate_owner(self):
        self.register()
        draft_id = self.client.post("/api/drafts", json=self.draft()).json["draft"]["id"]
        second = self.app.test_client()
        self.register(client=second, email="second@example.com")
        self.assertEqual(second.get("/api/drafts").json["drafts"], [])
        for method in ("get", "put", "delete"):
            response = getattr(second, method)(f"/api/drafts/{draft_id}", json=self.draft())
            self.assertEqual(response.status_code, 404)
        created = second.post("/api/drafts", json=self.draft(user_id=1)).json["draft"]["id"]
        self.assertNotEqual(db.session.get(SavedDraft, created).user_id, db.session.get(SavedDraft, draft_id).user_id)

    def test_draft_validation_and_oversized_requests(self):
        self.register()
        invalid = [None, [], {}, self.draft(title=" "), self.draft(title="x" * 101),
                   self.draft(messages={"en": "missing translations"}),
                   self.draft(messages={"en": "", "es": " ", "zh": ""}),
                   self.draft(messages={"en": "x" * 4001, "es": "", "zh": ""}),
                   self.draft(language=[]), self.draft(channels=[{}]),
                   self.draft(channels=["WEA", "WEA"]), self.draft(channels=["Email"])]
        for payload in invalid:
            with self.subTest(payload=payload):
                response = self.client.post("/api/drafts", json=payload) if payload is not None else self.client.post(
                    "/api/drafts", data="null", content_type="application/json")
                self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/api/drafts", data="text").status_code, 415)
        self.assertEqual(self.client.post("/api/drafts", json=self.draft(title="x" * 150000)).status_code, 413)
        self.assertEqual(db.session.query(SavedDraft).count(), 0)

    def test_csrf_required_on_register_login_logout_and_writes(self):
        self.app.config["WTF_CSRF_ENABLED"] = True
        self.assertEqual(self.register().status_code, 400)
        self.assertEqual(self.register(csrf_token="made-up").status_code, 400)
        self.assertEqual(self.register(csrf_token=self.token("/register")).status_code, 303)
        console = self.client.get("/console").get_data(as_text=True)
        csrf_token = re.search(r'name="csrf-token" content="([^"]+)"', console)[1]
        self.assertEqual(self.client.post("/api/drafts", json=self.draft()).json["error"], "csrf_failed")
        response = self.client.post("/api/drafts", json=self.draft(), headers={"X-CSRFToken": csrf_token})
        self.assertEqual(response.status_code, 201)
        draft_id = response.json["draft"]["id"]
        self.assertEqual(self.client.delete(f"/api/drafts/{draft_id}").status_code, 400)
        self.assertEqual(self.client.post("/logout").status_code, 400)
        self.assertEqual(self.client.post("/logout", data={"csrf_token": csrf_token}).status_code, 303)
        self.assertEqual(self.client.post("/login", data={"email": "person@example.com", "password": PASSWORD}).status_code, 400)
        self.assertEqual(self.client.post("/login", data={"email": "person@example.com", "password": PASSWORD,
            "csrf_token": self.token()}).status_code, 303)

    def test_pages_and_api_are_not_cached_and_user_names_are_escaped(self):
        self.register(name='<img src=x onerror="alert(1)">')
        response = self.client.get("/console")
        self.assertNotIn('<img src=x', response.get_data(as_text=True))
        self.assertIn("&lt;img", response.get_data(as_text=True))
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertIn("object-src 'none'", response.headers["Content-Security-Policy"])
        self.assertEqual(self.client.get("/api/drafts").headers["Cache-Control"], "no-store")


class ConfigurationTests(unittest.TestCase):
    def test_production_rejects_unsafe_defaults(self):
        base = {
            "APP_ENV": "production", "SECRET_KEY": "x" * 64,
            "SQLALCHEMY_DATABASE_URI": "postgresql+psycopg://example.invalid/civicguard",
            "TRUSTED_HOSTS": ["civicguard.example.com"], "SESSION_COOKIE_SECURE": True,
            "PUBLIC_BASE_URL": "https://civicguard.example.com", "MAIL_BACKEND": "smtp",
            "SMTP_HOST": "smtp.example.com", "MAIL_FROM": "hello@civicguard.example.com",
        }
        for override in ({"SECRET_KEY": "short"}, {"SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:"},
                         {"MAIL_BACKEND": "file"}, {"TRUSTED_HOSTS": None},
                         {"SESSION_COOKIE_SECURE": False}, {"RATELIMIT_ENABLED": False},
                         {"WTF_CSRF_ENABLED": False}):
            with self.subTest(override=override), self.assertRaises(RuntimeError):
                create_app({**base, **override})

    def test_login_rate_limit_returns_retry_after(self):
        app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:",
                          "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": True,
                          "APP_ENV": "development"})
        try:
            client = app.test_client()
            for _ in range(10):
                self.assertEqual(client.post("/login", data={"email": "absent@example.com", "password": "wrong"}).status_code, 400)
            response = client.post("/login", data={"email": "absent@example.com", "password": "wrong"})
            self.assertEqual(response.status_code, 429)
            self.assertIn("Retry-After", response.headers)
        finally:
            with app.app_context():
                db.session.remove()
                db.engine.dispose()

    def test_migration_works_for_empty_and_legacy_databases(self):
        for legacy in (False, True):
            with self.subTest(legacy=legacy), tempfile.TemporaryDirectory() as folder:
                uri = "sqlite:///" + str(Path(folder) / "migration.db")
                if legacy:
                    engine = create_engine(uri)
                    with engine.begin() as connection:
                        connection.execute(text("CREATE TABLE alert_record (id INTEGER PRIMARY KEY, area VARCHAR(100) NOT NULL, content TEXT NOT NULL, severity VARCHAR(20))"))
                        connection.execute(text("INSERT INTO alert_record VALUES (1, 'Legacy', 'Keep this draft', 'high')"))
                    engine.dispose()
                app = create_app({"SQLALCHEMY_DATABASE_URI": uri, "APP_ENV": "development", "RATELIMIT_ENABLED": False})
                with app.app_context():
                    try:
                        upgrade()
                        upgrade()
                        self.assertEqual(db.session.execute(text("SELECT COUNT(*) FROM users")).scalar(), 0)
                        if legacy:
                            row = db.session.execute(text("SELECT content, user_id FROM alert_record WHERE id = 1")).one()
                            self.assertEqual(row, ("Keep this draft", None))
                    finally:
                        db.session.remove()
                        db.engine.dispose()

    def test_upgrade_preserves_accounts_and_drafts_from_first_website_schema(self):
        with tempfile.TemporaryDirectory() as folder:
            uri = "sqlite:///" + str(Path(folder) / "old-website.db")
            engine = create_engine(uri)
            with engine.begin() as connection:
                connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(80), email VARCHAR(254), password_hash VARCHAR(512), created_at DATETIME)"))
                connection.execute(text("INSERT INTO users VALUES (1, 'Original', 'original@example.com', 'preserved-hash', '2026-01-01')"))
                connection.execute(text("CREATE TABLE saved_draft (id INTEGER PRIMARY KEY, user_id INTEGER, title VARCHAR(100), messages JSON, language VARCHAR(2), channels JSON, created_at DATETIME, updated_at DATETIME)"))
                connection.execute(text("INSERT INTO saved_draft VALUES (1, 1, 'Keep this draft', '{}', 'en', '[]', '2026-01-01', '2026-01-01')"))
            engine.dispose()
            app = create_app({"SQLALCHEMY_DATABASE_URI": uri, "APP_ENV": "development"})
            with app.app_context():
                try:
                    upgrade()
                    upgrade()
                    user = db.session.get(User, 1)
                    self.assertEqual(user.email, "original@example.com")
                    self.assertEqual(user.password_hash, "preserved-hash")
                    self.assertFalse(user.email_verified)
                    self.assertEqual(len(user.auth_version), 64)
                    draft = db.session.get(SavedDraft, 1)
                    self.assertEqual((draft.title, draft.user_id, draft.version), ("Keep this draft", 1, 1))
                finally:
                    db.session.remove()
                    db.engine.dispose()


if __name__ == "__main__":
    unittest.main()
