"""End-to-end HTTP lifecycle without live SMTP or AI calls."""

import html
import re
import unittest
from datetime import timedelta
from urllib.parse import urlsplit
from unittest.mock import patch

from app import create_app
from extensions import db
from models import AccountToken, LoginSession, User, utcnow

PASSWORD = "private test passphrase"
NEW_PASSWORD = "a completely new passphrase"


class SecurityFlows(unittest.TestCase):
    def setUp(self):
        self.app = create_app({"TESTING": True, "APP_ENV": "development", "SECRET_KEY": "test-secret-only-64-character-key",
            "SQLALCHEMY_DATABASE_URI": "sqlite:///:memory:", "TRUSTED_HOSTS": None,
            "SESSION_COOKIE_SECURE": False, "TRUST_PROXY": False, "RATELIMIT_ENABLED": False,
            "EMAIL_VERIFICATION_REQUIRED": True, "WTF_CSRF_ENABLED": True,
            "PUBLIC_BASE_URL": "https://civicguard.example.com"})
        self.client = self.app.test_client()
        self.addCleanup(self.cleanup)

    def cleanup(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()

    def csrf(self, path="/login", client=None):
        page = (client or self.client).get(path).get_data(as_text=True)
        match = re.search(r'name="csrf_token" value="([^"]+)"', page)
        self.assertIsNotNone(match)
        return html.unescape(match[1])

    def register(self):
        token = self.csrf("/register")
        return self.client.post("/register", data={"csrf_token": token, "name": "Planner", "email": "planner@example.com",
            "password": PASSWORD, "confirm_password": PASSWORD})

    def email_link(self):
        message = self.app.extensions["mailbox"][-1]
        return urlsplit(re.search(r'https://[^\s]+', message.get_content())[0]).path

    def verify(self):
        path = self.email_link()
        return self.client.post(path, data={"csrf_token": self.csrf(path)})

    def login(self, client=None, password=PASSWORD):
        client = client or self.client
        return client.post("/login", data={"csrf_token": self.csrf(client=client), "email": "planner@example.com", "password": password})

    def logout(self, client=None):
        client = client or self.client
        return client.post("/logout", data={"csrf_token": self.csrf("/account", client)})

    def test_verification_is_required_and_link_is_single_use(self):
        self.assertEqual(self.register().headers["Location"], "/verify-email")
        self.assertEqual(self.client.get("/console").headers["Location"], "/verify-email")
        self.assertEqual(self.client.get("/api/drafts").status_code, 403)
        path = self.email_link()
        self.client.get(path)
        with self.app.app_context():
            self.assertFalse(db.session.scalar(db.select(User)).email_verified)
        self.assertEqual(self.verify().status_code, 303)
        self.assertEqual(self.client.get("/console").status_code, 200)
        self.assertEqual(self.client.get(path).status_code, 400)

    def test_reset_changes_password_and_revokes_other_sessions_and_old_tokens(self):
        self.register()
        self.verify()
        other = self.app.test_client()
        self.login(other)
        for _ in range(2):
            self.client.post("/forgot-password", data={"csrf_token": self.csrf("/forgot-password"), "email": "planner@example.com"})
        first = urlsplit(re.search(r'https://[^\s]+', self.app.extensions["mailbox"][-2].get_content())[0]).path
        path = self.email_link()
        self.client.get(path)
        self.assertEqual(other.get("/api/drafts").status_code, 200)
        response = self.client.post(path, data={"csrf_token": self.csrf(path), "password": NEW_PASSWORD, "confirm_password": NEW_PASSWORD})
        self.assertEqual(response.status_code, 303)
        self.assertEqual(other.get("/api/drafts").status_code, 401)
        self.assertEqual(self.client.get(path).status_code, 400)
        self.assertEqual(self.client.get(first).status_code, 400)
        self.assertEqual(self.login(password=PASSWORD).status_code, 400)
        self.assertEqual(self.login(password=NEW_PASSWORD).status_code, 303)

    def test_logout_revokes_replayed_cookie(self):
        self.register()
        self.verify()
        copied_cookie = self.client.get_cookie("civicguard_session").value
        self.logout()
        attacker = self.app.test_client()
        attacker.set_cookie("civicguard_session", copied_cookie)
        self.assertEqual(attacker.get("/api/drafts").status_code, 401)

    def test_expired_or_wrong_purpose_tokens_cannot_reset_password(self):
        self.register()
        verify_path = self.email_link()
        self.assertEqual(self.client.get(verify_path.replace("verify-email", "reset-password")).status_code, 400)
        with self.app.app_context():
            db.session.execute(db.update(AccountToken).values(expires_at=utcnow() - timedelta(seconds=1)))
            db.session.commit()
        self.assertEqual(self.client.get(verify_path).status_code, 400)

    def test_recovery_response_does_not_disclose_account_presence(self):
        self.register()
        responses = []
        for email in ("planner@example.com", "not-registered@example.com"):
            response = self.client.post("/forgot-password", data={"csrf_token": self.csrf("/forgot-password"), "email": email})
            self.assertEqual(response.status_code, 200)
            responses.append(re.sub(r'value="[^"]+"', 'value="token"', response.get_data(as_text=True)))
        self.assertEqual(responses[0], responses[1])

    def test_change_password_export_and_delete_account(self):
        self.register()
        self.verify()
        token = self.csrf("/account")
        created = self.client.post("/api/drafts", headers={"X-CSRFToken": token}, json={"title": "Exercise",
            "messages": {"en": "exercise only", "es": "", "zh": ""}, "language": "en", "channels": []})
        self.assertEqual(created.status_code, 201)
        exported = self.client.get("/account/export")
        self.assertEqual(len(exported.json["drafts"]), 1)
        self.assertNotIn("password", exported.get_data(as_text=True))
        response = self.client.post("/account", data={"csrf_token": token, "action": "password", "current_password": PASSWORD,
            "password": NEW_PASSWORD, "confirm_password": NEW_PASSWORD})
        self.assertEqual(response.status_code, 303)
        self.assertEqual(self.client.get("/api/drafts").status_code, 401)
        self.login(password=NEW_PASSWORD)
        token = self.csrf("/account")
        bad = self.client.post("/account", data={"csrf_token": token, "action": "delete", "current_password": NEW_PASSWORD, "confirmation": "wrong"})
        self.assertEqual(bad.status_code, 400)
        response = self.client.post("/account", data={"csrf_token": token, "action": "delete", "current_password": NEW_PASSWORD, "confirmation": "DELETE"})
        self.assertEqual(response.status_code, 303)
        self.assertEqual(self.client.get("/api/drafts").status_code, 401)
        with self.app.app_context():
            self.assertEqual(db.session.query(User).count(), 0)
            self.assertEqual(db.session.query(LoginSession).count(), 0)

    def test_cross_origin_posts_are_rejected_even_with_token(self):
        token = self.csrf("/register")
        response = self.client.post("/register", data={"csrf_token": token}, headers={"Origin": "https://attacker.example"})
        self.assertEqual(response.status_code, 400)

    def test_email_link_uses_configured_origin_not_request_host(self):
        self.client.get("/register", headers={"Host": "attacker.example"})
        self.register()
        body = self.app.extensions["mailbox"][-1].get_content()
        self.assertIn("https://civicguard.example.com/verify-email/", body)
        self.assertNotIn("attacker.example", body)

    def test_failed_verification_email_preserves_account_and_allows_retry(self):
        from mailer import MailDeliveryError
        with patch("account_tokens.send_account_email", side_effect=MailDeliveryError("not sent")):
            self.assertEqual(self.register().status_code, 303)
        response = self.client.post("/verify-email/resend", data={"csrf_token": self.csrf("/verify-email")})
        self.assertEqual(response.status_code, 303)
        self.assertEqual(self.verify().status_code, 303)

    def test_stale_draft_updates_are_rejected_without_losing_saved_content(self):
        self.register()
        self.verify()
        token = self.csrf("/account")
        headers = {"X-CSRFToken": token}
        body = {"title": "Original", "messages": {"en": "test", "es": "", "zh": ""}, "language": "en", "channels": []}
        draft = self.client.post("/api/drafts", headers=headers, json=body).json["draft"]
        url = f"/api/drafts/{draft['id']}"
        body.update(version=draft["version"], title="New version")
        self.assertEqual(self.client.put(url, headers=headers, json=body).status_code, 200)
        body["title"] = "Stale tab"
        self.assertEqual(self.client.put(url, headers=headers, json=body).status_code, 409)
        self.assertEqual(self.client.get(url).json["draft"]["title"], "New version")


if __name__ == "__main__":
    unittest.main()
