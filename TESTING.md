# Testing & Deployment

## Test suites

### Unit tests — `npm test`

Backend logic only. Runs entirely in Node with a mock Google Sheets environment — no network required.

```bash
npm test
```

**Files:** `tests/april11.test.js`, `tests/reconnect.test.js`  
**Framework:** Node built-in `node:test` (zero dependencies)  
**Coverage:**
- `cellToRoomCode` — plain strings and Date-valued cells (the issue #5 regression)
- `getRoomState` / `saveRoomState` — lookup, write, and round-trip for date-like room codes
- Mid-game reconnection — existing player rejoins active/finished game; new player is rejected

---

### E2E tests — `npx playwright test`

Full UI flows in a headless Chromium browser against the live GitHub Pages frontend. The Apps Script backend is **mocked** via Playwright's route interception, so no network access to Google is needed.

```bash
npx playwright test
```

**Files:** `tests/e2e/app.spec.js`, `tests/e2e/helpers.js`  
**Config:** `playwright.config.js` (baseURL: `https://gmitch.github.io/flip7-scorer/`)  
**Coverage:**
- Setup / configuration screen
- Joining a room (including date-like room names)
- Lobby: multiple players, Add Offline Player
- Exit room (clears localStorage, returns to entry)
- Auto-rejoin on page reload
- Mid-game reconnection
- Active game: player cards, score modal, score submission, bust button
- Game over: winner display, Play Again
- Version footer

To run against a local dev server instead of GitHub Pages, change `baseURL` in `playwright.config.js`.

---

### API integration tests — `TEST_API_URL=<url> npm run test:api`

Hits a **real** Apps Script deployment end-to-end. Each run generates a unique room-code prefix so tests don't collide across runs.

```bash
TEST_API_URL=https://script.google.com/macros/s/.../exec npm run test:api

# Or using the saved dev URL:
npm run test:api:dev      # reads .env.test (gitignored)
```

**File:** `tests/api.test.js`  
**Coverage:**
- `JOIN_ROOM` — create room, add player, no-duplicate rejoin, date-like room code regression, beVersion in response, missing-field errors
- `GET_STATE` — existing room, unknown room
- `START_GAME` — LOBBY → ACTIVE, new player blocked, existing player reconnects
- `SUBMIT_SCORE` — record score, advance round, trigger FINISHED
- `EDIT_PAST_SCORE` — correct a previous round
- `RESET_GAME` — scores cleared, players preserved, back to LOBBY

**Dev URL:** stored in `.env.test` (gitignored). To update it, replace the value after deploying a new dev web app.

---

## Deployment

### Production

Production serves the live app at `https://gmitch.github.io/flip7-scorer/`.

**Frontend** (GitHub Pages — auto-deploys on push to `main`):
```bash
git push origin main
```

**Backend** (Apps Script):
```bash
clasp push                  # push code to the script
clasp deploy --deploymentId AKfycbyLh80w_WtM2ImIgVMfTBcj8XzuaVdjTWPyizrX6Ai2-KUxOqCny7Ge83yfVfzKItYzdA --description "your message"
clasp deploy --deploymentId AKfycbyHNgSKSR2qXcPJ8QEGpECP7V1bnZYK1Sno0jJCcsD2ruoCio0nUpr2FhL0b22NjPrG7w --description "your message"
```

Both deployment IDs must be updated — the app's saved API URL may point to either one.

**Version bump:** update `BE_VERSION` in `appscript/Code.gs` and `FE_VERSION` in `app.js` to confirm the right code is live. Format: `YYYY-MM-DD.N` (increment N for same-day deploys).

---

### Dev / test

A separate Apps Script bound to a scratch Google Sheet, used for API integration tests.

**Config file:** `.clasp.dev.json` (script ID: `1Nq8gujm0odfT5-VnVLap2X9gYULDw8MdDhuErl227U7l0YFK1FpkKBb4`)

`clasp` only reads `.clasp.json`, so swap files around the push:

```bash
cp .clasp.json .clasp.json.bak
cp .clasp.dev.json .clasp.json
clasp push --force
clasp deploy --deploymentId <dev-deployment-id> --description "your message"
cp .clasp.json.bak .clasp.json
```

**First-time setup for a new dev script:** `clasp deploy` alone is not enough. You must open the script in the Apps Script editor, go to **Deploy → New deployment**, set type to **Web app**, execute as **Me**, access **Anyone**, deploy, and save the resulting URL to `.env.test`.

**Dev web app URL:** `https://script.google.com/macros/s/AKfycbzbR5hF51UYXmzdN-EKxRvLQDsgwl3WGeFyMKJ_c8ZcZdkMbIvYtEzQ7kkUKPSUmvjA/exec`  
Also stored in `.env.test`:
```
TEST_API_URL=https://script.google.com/macros/s/.../exec
```

---

## Running everything

```bash
npm test                    # unit tests (fast, offline)
npx playwright test         # e2e UI tests (requires internet for GitHub Pages)
npm run test:api:dev        # API integration tests against dev deployment
```

All three suites must pass before merging to `main`.
