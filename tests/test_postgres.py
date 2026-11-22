"""Production database integration; uses only the disposable CI database."""
import os
import re
import secrets
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit

from app import create_app
from database import upgrade
from extensions import db


@unittest.skipUnless(os.getenv("CIVICGUARD_TEST_DATABASE_URL"), "Disposable PostgreSQL is provided in CI")
class PostgresTests(unittest.TestCase):
    def setUp(self):
        self.config = {"TESTING": True, "APP_ENV": "development", "SECRET_KEY": "test-only-shared-secret",
            "SQLALCHEMY_DATABASE_URI": os.environ["CIVICGUARD_TEST_DATABASE_URL"],
            "WTF_CSRF_ENABLED": False, "RATELIMIT_ENABLED": True,
            "SESSION_COOKIE_SECURE": False, "TRUSTED_HOSTS": None, "TRUST_PROXY": False,
            "PUBLIC_BASE_URL": "https://example.com"}
        self.app = create_app(self.config)
        with self.app.app_context():
            upgrade()
            upgrade()
        self.addCleanup(self.dispose, self.app)

    def dispose(self, app):
        with app.app_context():
            db.session.remove()
            db.engine.dispose()

    def test_verified_account_survives_another_worker_and_conflicting_saves(self):
        first = self.app.test_client()
        email = f"pg-{secrets.token_hex(8)}@example.com"
        password = "postgres test passphrase"
        self.assertEqual(first.post("/register", data={"name": "Planner", "email": email,
            "password": password, "confirm_password": password}).status_code, 303)
        link = urlsplit(re.search(r'https://[^\s]+', self.app.extensions["mailbox"][-1].get_content())[0]).path
        self.assertEqual(first.post(link).status_code, 303)
        self.assertEqual(first.post(link).status_code, 400)
        draft = {"title": "Across devices", "messages": {"en": "Test draft", "es": "", "zh": ""}, "language": "en", "channels": []}
        saved = first.post("/api/drafts", json=draft)
        self.assertEqual(saved.status_code, 201)
        second_app = create_app(self.config)
        self.addCleanup(self.dispose, second_app)
        second = second_app.test_client()
        self.assertEqual(second.post("/login", data={"email": email, "password": password}).status_code, 303)
        self.assertEqual(second.get("/api/drafts").json["drafts"][0]["title"], "Across devices")
        payload = {**draft, "version": saved.json["draft"]["version"]}
        url = f'/api/drafts/{saved.json["draft"]["id"]}'
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(client.put, url, json={**payload, "title": title})
                       for client, title in [(first, "Device 1"), (second, "Device 2")]]
            self.assertEqual(sorted(f.result().status_code for f in futures), [200, 409])

    def test_rate_limits_are_shared_across_workers(self):
        second_app = create_app(self.config)
        self.addCleanup(self.dispose, second_app)
        clients = [self.app.test_client(), second_app.test_client()]
        # Unique address isolates this rate-limit test from other account tests.
        address = "198.51.100.41"
        for index in range(10):
            response = clients[index % 2].post("/login", data={"email": "absent@example.com", "password": "wrong"},
                environ_overrides={"REMOTE_ADDR": address})
            self.assertEqual(response.status_code, 400)
        response = clients[0].post("/login", data={}, environ_overrides={"REMOTE_ADDR": address})
        self.assertEqual(response.status_code, 429)
        self.assertIn("Retry-After", response.headers)
