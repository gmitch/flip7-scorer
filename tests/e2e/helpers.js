'use strict';

const FAKE_API_URL = 'https://fake-apps-script.invalid/exec';

// Intercepts all requests to FAKE_API_URL and responds based on `action`.
// Call this at the top of each test before navigating to the app.
async function mockApi(page, handler) {
  await page.route(FAKE_API_URL, async (route) => {
    const body = route.request().postData();
    let payload = {};
    try { payload = JSON.parse(body); } catch {}
    const response = await handler(payload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...response, beVersion: 'test' }),
    });
  });
}

// Seeds localStorage so the app skips the Setup screen and goes to Entry.
async function seedApiUrl(page) {
  await page.addInitScript((url) => {
    localStorage.setItem('flip7_api_url', url);
  }, FAKE_API_URL);
}

// Seeds localStorage with both apiUrl and a saved room/player so the app
// auto-rejoins on load.
async function seedSession(page, roomCode, playerName) {
  await page.addInitScript(([url, room, name]) => {
    localStorage.setItem('flip7_api_url', url);
    localStorage.setItem('flip7_room', room);
    localStorage.setItem('flip7_name', name);
  }, [FAKE_API_URL, roomCode, playerName]);
}

function lobbyState(roomCode, players = []) {
  return {
    roomCode,
    status: 'LOBBY',
    currentRound: 1,
    players: players.map(name => ({ name, totalScore: 0, roundScores: {} })),
    winner: null,
  };
}

function activeState(roomCode, players = [], round = 1) {
  return {
    roomCode,
    status: 'ACTIVE',
    currentRound: round,
    players: players.map((name, i) => ({
      name,
      totalScore: i * 10,
      roundScores: {},
    })),
    winner: null,
    lastRoundLastPlayer: null,
  };
}

function finishedState(roomCode, winner) {
  return {
    roomCode,
    status: 'FINISHED',
    currentRound: 3,
    players: [
      { name: winner, totalScore: 210, roundScores: { '1': 100, '2': 110 } },
      { name: 'Bob',  totalScore: 80,  roundScores: { '1': 40,  '2': 40  } },
    ],
    winner,
  };
}

module.exports = { mockApi, seedApiUrl, seedSession, lobbyState, activeState, finishedState, FAKE_API_URL };
