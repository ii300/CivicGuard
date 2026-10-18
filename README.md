# CivicGuard / EmberGuard

A local wildfire alert **simulation** inspired by the January 2025 Palisades fire.
It combines a map, editable English/Spanish/Chinese drafts, and simulated channel
selection and approval. It does not send public alerts or verify current emergency
conditions. Language drafts are independent and save on this device along with
the selected language and simulated channels. Approval resets when the app reloads.

## Desktop and mobile apps

The same console now has Electron wrappers for **Windows and macOS** and Capacitor
projects for **iOS and Android**. App bundles include the UI and Leaflet; they do
not need Python, an API key, or a running web server. Online basemaps and remote
incident data still require connectivity; offline mode uses labeled examples.

```sh
npm ci
npm run desktop:dev
```

Use `npm run desktop:win -- --x64` or `npm run desktop:mac -- --arm64` on the
corresponding OS to package a desktop build. Use `npm run mobile:android` or
`npm run mobile:ios` to sync bundled assets and open the native IDE.

See [the platform build and installation guide](docs/PLATFORMS.md) for SDK setup,
downloadable CI artifacts, Intel Mac builds, and signing. Android CI outputs a
debug APK; iOS CI outputs a simulator app and an unsigned device archive. The iOS
archive needs your development team and provisioning before it can run on an iPhone.
Desktop CI packages are unsigned development builds, not notarized/store releases.

## Run locally

Use Python 3.11 or newer:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. The UI works without an API key. Flask serves only the
explicit UI assets; it does not expose `.env`, the database, or repository files.
The SQLite database is created locally on first app startup and is ignored by Git.
The development server binds to localhost with debug mode off.

## Saved drafts

Edits save automatically on this device. Reopening the same app or browser profile
restores all three language drafts, the active language, and channel choices.
The save status beneath the editor confirms successful writes or explains when
storage is unavailable. Wait for **Saved on this device** before closing or
reloading; an unfinished write may not survive an immediate close. Editing
continues if saving fails. Restored drafts always
require a fresh simulation review; approval is never stored.

**Reset drafts** asks for confirmation before clearing the saved copy and restoring
the original scenario. Canceling keeps every edit. Invalid or incompatible saved
data is reported and left untouched until you edit or confirm a reset.

Native iOS/Android apps use Capacitor Preferences; desktop/browser copies use
localStorage. Drafts are not synced between devices or app/browser installations.
Uninstalling the app or clearing its data can remove them. This is one current
draft per language, not an edit history or encrypted backup. Each language draft
is limited to 20,000 UTF-16 code units, with a 200 KiB limit on the saved record.

## Map and source behavior

- Evacuation zones are illustrative scenario geometry, never official orders.
- Fire perimeter, road closure, and mass care requests use the public ArcGIS URLs
  in `script.js`. A successful request is labeled **Remote**; its currency is
  unverified. Original perimeter geometry is retained.
- Valid empty responses stay empty. Closure and care counts include only points
  inside the configured scenario bounds. Zero records do not establish that an
  area is safe or that no real closures exist.
- Failed, timed-out, malformed, or explicitly truncated responses use labeled
  **Sample** data. Requests time out after 10 seconds. Samples are illustrations,
  not an archived or current incident feed.
- The Flask-hosted page loads Leaflet from a CDN; packaged apps include it locally.
  The Esri basemap requires internet access. A failed
  basemap is reported separately. If Leaflet cannot load, the composer still works.
- Click a zone or marker for source details. Layer checkboxes control the displayed
  data. Each draft or channel change clears the simulated approval.

## Optional AI draft API

The composer currently uses local templates; it does **not** call the AI endpoint.
To use the endpoint independently, copy `.env.example` to `.env` and configure
`ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` with a model available to your account.
No model is assumed by default. A request uses your Anthropic account and may incur
API charges. Never commit your key.

```sh
curl -X POST http://127.0.0.1:5000/api/generate-alert \
  -H 'Content-Type: application/json' \
  -d '{"area":"Palisades","severity":"high"}'
```

`area` must be a printable, single-line string of 1–100 characters after trimming.
`severity` must be `low`, `moderate`, `high`, or `extreme`. Both fields are required.
The request body is limited to 4 KiB. Successful responses contain `alert`, `id`,
and `simulation: true`; saved text has an explicit simulation label. Incomplete or
empty model output is not saved. Upstream network operations have a 20-second
timeout and no automatic retries.

Errors return JSON with `error` and `message`: `400` for invalid input, `415` for a
non-JSON request, `413` for an oversized body, `503` for missing configuration or
provider rate limiting, `504` for provider timeout, `502` for provider/output errors,
and `500` for database failures. The API has no authentication, rate limiting, or
durable approval audit trail; keep it local until those controls are implemented.

## Verify changes

With the virtual environment active, run the offline backend tests:

```sh
python -m unittest discover -s tests -p 'test_*.py' -v
```

Use Node.js 22.12 or newer for frontend tests:

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
npx playwright install webkit
npm run test:packaged
npm run test:desktop
```

Browser tests start Flask on port 5055, supply Leaflet from the pinned test
dependency, and mock external map services. Tests do not call Anthropic or send
alerts. GitHub Actions runs the backend, frontend unit, and Chromium tests.
The packaged Web tests also exercise touch navigation and safe-area spacing in
Chromium and WebKit. These are browser checks, not substitutes for testing actual
iOS and Android devices. Platform builds compile both native projects and package
the Windows/macOS applications separately.

## Next improvements

1. Add timestamped, versioned source snapshots, update metadata, and explicit retry
   controls so historical and current data can be evaluated reproducibly.
2. Add draft history and review versions, and expose a keyboard-accessible list of
   map records outside popups. Add language review and channel-specific validation.
3. Before any real deployment, define authorized roles, approval/audit requirements,
   rate limits, and a separately validated alert delivery integration.
