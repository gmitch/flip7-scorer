# Flip7 Scorer

A mobile-friendly web app for tracking scores in the card game Flip 7. Players join a shared room, scores are submitted each round, and the app tracks totals until someone hits 200 points.

**Live app:** https://gmitch.github.io/flip7-scorer/

---

## How it works

- **Frontend:** Static HTML/CSS/JS hosted on GitHub Pages
- **Backend:** Google Apps Script web app that stores game state in a Google Sheet
- The frontend talks directly to your Apps Script deployment via `fetch`; no server required

---

## Setup

### 1. Create a Google Sheet and bound Apps Script

1. Create a new Google Sheet
2. Go to **Extensions → Apps Script**
3. Note the script ID from the URL (`/d/{SCRIPT_ID}/edit`)

### 2. Deploy the backend with clasp

Install [clasp](https://github.com/google/clasp) if you haven't:
```bash
npm install -g @google/clasp
clasp login
```

Update `.clasp.json` with your script ID:
```json
{"scriptId": "YOUR_SCRIPT_ID", "rootDir": "appscript"}
```

Push and deploy:
```bash
clasp push
```

Then in the Apps Script editor, go to **Deploy → New deployment**:
- Type: **Web app**
- Execute as: **Me**
- Who has access: **Anyone**

Click **Deploy** and copy the web app URL.

### 3. Configure the app

Open the app in a browser, enter your web app URL on the Configuration screen, and save. The URL is stored in `localStorage` — you only need to do this once per device.

---

## Usage

1. **Join a room** — enter a secret room word and your name. Anyone entering the same room word joins the same game.
2. **Add offline players** — in the lobby, use **+ Add Offline Player** to add players who aren't on their own device.
3. **Start the game** — the room host clicks **Start Game** when everyone is in the lobby.
4. **Submit scores** — tap a player card to enter their score for the round. Hit **BUST** for 0 points.
5. **Edit past scores** — tap a player card and click **Edit** next to any previous round to correct a mistake.
6. **Win condition** — first player to reach 200 points wins. If multiple players cross 200 in the same round, the highest score wins.
7. **Play again** — after the game ends, **Play Again** resets scores and returns everyone to the lobby with the same players.

### Rejoining a room

- **Page refresh:** automatically rejoins your last room if localStorage still has your session.
- **After exiting:** enter the same room word and your exact player name to reconnect. During an active game, your existing player data is restored.

---

## Development

### Install dependencies
```bash
npm install
npx playwright install chromium
```

### Run tests
```bash
npm test                    # unit tests (offline)
npx playwright test         # e2e UI tests
TEST_API_URL=<url> npm run test:api   # API integration tests
```

See [TESTING.md](TESTING.md) for full details on test suites and deployment protocols.

### Deploy to production
```bash
clasp push
clasp deploy --deploymentId <id> --description "your message"
```

See [TESTING.md](TESTING.md) for deployment IDs and the full protocol.
