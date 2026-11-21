# CivicGuard / EmberGuard

A complete Flask website for wildfire **simulation** and multilingual draft review.
Public homepage and demo, verified email accounts, password recovery, and private
workspaces that persist across devices. It does not send public emergency alerts.

中文上线步骤：[DEPLOYMENT.md](DEPLOYMENT.md)。

Publish the changed source to a GitHub branch, then create a Render Blueprint from
that branch. It creates a paid web service and PostgreSQL after you review the
estimate and enter SMTP settings. See [RELEASE_STATUS.md](RELEASE_STATUS.md) for
verified results and the remaining publishing steps. No live site has been created.

## Run locally

Python 3.11+; deployment and CI use Python 3.13. Node.js is needed only for tests.

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp -n .env.example .env
python app.py
```

Open <http://127.0.0.1:5000>. The development command applies additive database
upgrades and generates a private, persistent local signing key automatically.
Keep an existing `.env` and add missing variables without overwriting secrets.
If changing the port, also change `PUBLIC_BASE_URL` to match the address you open.

Local registration saves emails privately on this computer. On the verification
page, select **Open email preview → Open account link → Verify email**. These
previews are available only to the signed-in account from loopback in development.
Production uses TLS SMTP and disables local previews. Tests use memory/mock mail.

## Account and workspace features

- Registration, verified email, sign-in, POST-only logout, profile settings.
- Single-use verification links (24 hours) and password reset links (30 minutes).
- Password changes/reset invalidate all sessions and previously issued account links.
- Server-side session revocation, including copied cookies; 12-hour session expiry.
- Up to 100 private drafts: save, open, edit, delete, save as new, export JSON.
- Independent English, Spanish, Chinese text and simulated channel selections.
- Optimistic version checks prevent one device from overwriting another's changes.
- Download account data, and permanently delete an account and its saved records.
- Responsive pages, accessible form labels, help, privacy, useful error messages.

Save is explicit. Edits are not autosaved. The browser warns about unsaved edits.
Opening a saved draft resets simulation review. Approval is a local simulation
state, not an official authorization or delivery audit record.

Passwords use Werkzeug scrypt. Login cookies are signed, HttpOnly, SameSite=Lax,
and Secure in production. Login tokens and email links are hashed in the database.
CSRF tokens protect writes; every draft endpoint enforces ownership. Another user's
ID returns the same 404 as a missing ID. Input sizes and request rates are limited.
Atomic rate counters live in the shared database, so multiple workers share limits.

## Deployment

`render.yaml` configures PostgreSQL, Gunicorn, schema upgrades, readiness checks,
HTTPS cookies, a generated secret, trusted host names, and TLS SMTP placeholders.
The site refuses to start with unsafe/missing production settings. See the Chinese
guide for the exact fields to fill. No email or AI credentials belong in Git.

Production dependencies are in `requirements-production.txt`:

```sh
pip install -r requirements-production.txt
flask --app app db upgrade
gunicorn --config gunicorn.conf.py wsgi:app
```

`database.py` contains versioned, additive upgrades. Existing legacy `alert_record`
rows remain unowned and private. Back up before upgrades; never delete production
tables to initialize a release. The database is independent of the web filesystem.
Run `flask --app app db prune` periodically to remove expired security records.

Gunicorn access logs omit URL paths so account-link tokens are not logged there.
Configure equivalent redaction in any additional reverse proxy or monitoring tool.
Auto-deploy is off in the Blueprint; deploy tested updates explicitly.

## Pages and APIs

| Route | Behavior |
| --- | --- |
| `/`, `/demo`, `/help`, `/privacy` | Public pages |
| `/register`, `/login`, `/forgot-password` | Account forms |
| `/verify-email`, `/verify-email/<token>` | Resend/confirm email |
| `/reset-password/<token>` | Set a new password |
| `/account`, `/account/export` | Settings and private data download |
| `POST /logout` | Revoke the current session |
| `/console` | Verified account workspace |
| `GET`, `POST /api/drafts` | List/create own drafts |
| `GET`, `PUT`, `DELETE /api/drafts/<id>` | Read/update/delete own draft |
| `POST /api/generate-alert` | Optional authenticated AI API |
| `/healthz` | Database/schema readiness |

Draft writes take `title`, `messages` (exactly `en`, `es`, `zh`), `language`, and
`channels`. Updates also require the returned integer `version`; stale updates
return 409 without overwriting. Titles are 1–100 printable characters, each language
at most 4,000 characters, and at least one draft must contain text. Channels are a
subset of `WEA`, `EAS`, `SMS`, `Social`. API writes require `X-CSRFToken` from the
page's `csrf-token` meta tag and the same session cookie. Expired forms return 400,
missing login 401, unverified email 403, and exceeded quotas 429 with `Retry-After`.

## Map and AI behavior

The scenario is inspired by the January 2025 Palisades fire. Evacuation geometry is
illustrative. External ArcGIS records are marked **Remote**, with currency unverified;
failed/malformed/truncated requests use clearly labeled **Sample** data. Valid empty
results stay empty. Point counts cover the scenario area; zero is not evidence of
safety. Leaflet/Esri maps need internet. The composer works if the map library fails.

The composer uses local templates and works without AI credentials. The optional
AI API requires server-side `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`, verified login,
and CSRF. It takes `{"area":"Palisades","severity":"high"}` and returns `alert`, `id`,
`simulation: true`. Supported severity: low/moderate/high/extreme. Limits: 4 KiB body,
5 calls/minute and 30/day per account, 100/day across the site, 20-second provider
timeout without retries. Incomplete output is not stored. Provider charges may apply.

## Verification

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
npm ci
npm test
npx playwright install chromium
PYTHON="$PWD/.venv/bin/python" npm run test:browser
```

GitHub Actions installs production dependencies and runs backend tests, disposable
PostgreSQL integration tests, JavaScript unit tests, and Chromium browser tests.
Browser coverage includes registration and verification, multilingual saving, two
independent browser sessions, conflict recovery, password reset, mobile layout,
map failures, keyboard controls, and account isolation. No test sends real email,
public alerts, or live AI requests. Browser tests use their own temporary database.

PostgreSQL tests run only when `CIVICGUARD_TEST_DATABASE_URL` points to a disposable
test database; never set it to production. Local browser checks require permission
to bind port 5055 and launch Chromium. See the CI run for the actual result.
