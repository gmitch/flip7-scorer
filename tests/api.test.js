'use strict';

// Integration tests against a real Apps Script deployment.
// Set TEST_API_URL to the web app exec URL before running:
//   TEST_API_URL=https://script.google.com/macros/s/.../exec npm run test:api

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

const API_URL = process.env.TEST_API_URL;

if (!API_URL) {
  console.log('Skipping API tests: TEST_API_URL not set.');
  process.exit(0);
}

// Each test run gets a unique room code so parallel/repeated runs don't collide.
const RUN_ID = Date.now().toString(36).toUpperCase();
function roomCode(suffix) {
  return `TEST${RUN_ID}${suffix}`;
}

async function api(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...payload }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// JOIN_ROOM
// ---------------------------------------------------------------------------

describe('JOIN_ROOM', () => {
  test('creates a new room and returns LOBBY state', async () => {
    const room = roomCode('A');
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    assert.ok(res.success);
    assert.equal(res.state.status, 'LOBBY');
    assert.equal(res.state.roomCode, room);
    assert.equal(res.state.players.length, 1);
    assert.equal(res.state.players[0].name, 'Alice');
  });

  test('second player joins same room', async () => {
    const room = roomCode('B');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Bob' });
    assert.ok(res.success);
    assert.equal(res.state.players.length, 2);
    const names = res.state.players.map(p => p.name);
    assert.ok(names.includes('Alice'));
    assert.ok(names.includes('Bob'));
  });

  test('rejoining with the same name does not duplicate the player', async () => {
    const room = roomCode('C');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    assert.ok(res.success);
    assert.equal(res.state.players.length, 1);
  });

  test('date-like room code works correctly', async () => {
    // This is the core regression for issue #5 — "APRIL 18" must survive
    // the Google Sheets auto-conversion to a Date and be found on re-read.
    const room = 'APRIL 18';
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Bob' });
    assert.ok(res.success, 'second join should succeed for date-like room');
    assert.equal(res.state.players.length, 2,
      'both players should be in the room — not a fresh room with just Bob');
  });

  test('returns beVersion in every response', async () => {
    const room = roomCode('D');
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    assert.ok(res.beVersion, 'beVersion should be present');
    assert.match(res.beVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  test('rejects join without a room code', async () => {
    const res = await api('JOIN_ROOM', { playerName: 'Alice' });
    assert.ok(res.error);
  });

  test('rejects join without a player name', async () => {
    const room = roomCode('E');
    const res = await api('JOIN_ROOM', { roomCode: room });
    assert.ok(res.error);
  });
});

// ---------------------------------------------------------------------------
// GET_STATE
// ---------------------------------------------------------------------------

describe('GET_STATE', () => {
  test('returns current state for an existing room', async () => {
    const room = roomCode('F');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    const res = await api('GET_STATE', { roomCode: room });
    assert.ok(res.success);
    assert.equal(res.state.status, 'LOBBY');
  });

  test('returns null state for an unknown room', async () => {
    const res = await api('GET_STATE', { roomCode: 'NOSUCHWROOM99' });
    assert.ok(res.success);
    assert.equal(res.state, null);
  });
});

// ---------------------------------------------------------------------------
// START_GAME
// ---------------------------------------------------------------------------

describe('START_GAME', () => {
  test('transitions room from LOBBY to ACTIVE', async () => {
    const room = roomCode('G');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Bob' });
    const res = await api('START_GAME', { roomCode: room });
    assert.ok(res.success);
    assert.equal(res.state.status, 'ACTIVE');
    assert.equal(res.state.currentRound, 1);
  });

  test('new player cannot join after game starts', async () => {
    const room = roomCode('H');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('START_GAME', { roomCode: room });
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Charlie' });
    assert.ok(res.error);
    assert.match(res.error, /already started/i);
  });

  test('existing player can reconnect after game starts', async () => {
    const room = roomCode('I');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('START_GAME', { roomCode: room });
    const res = await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    assert.ok(res.success);
    assert.equal(res.state.status, 'ACTIVE');
  });
});

// ---------------------------------------------------------------------------
// SUBMIT_SCORE
// ---------------------------------------------------------------------------

describe('SUBMIT_SCORE', () => {
  test('records a score for a player', async () => {
    const room = roomCode('J');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('START_GAME', { roomCode: room });
    const res = await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Alice', score: 42 });
    assert.ok(res.success);
    const alice = res.state.players.find(p => p.name === 'Alice');
    assert.equal(alice.roundScores['1'], 42);
    assert.equal(alice.totalScore, 42);
  });

  test('all players scoring advances to next round', async () => {
    const room = roomCode('K');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Bob' });
    await api('START_GAME', { roomCode: room });
    await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Alice', score: 30 });
    const res = await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Bob', score: 20 });
    assert.ok(res.success);
    assert.equal(res.state.currentRound, 2);
  });

  test('reaching 200 points ends the game', async () => {
    const room = roomCode('L');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('START_GAME', { roomCode: room });
    const res = await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Alice', score: 200 });
    assert.ok(res.success);
    assert.equal(res.state.status, 'FINISHED');
    assert.equal(res.state.winner, 'Alice');
  });
});

// ---------------------------------------------------------------------------
// EDIT_PAST_SCORE
// ---------------------------------------------------------------------------

describe('EDIT_PAST_SCORE', () => {
  test('corrects a score in a previous round', async () => {
    const room = roomCode('M');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Bob' });
    await api('START_GAME', { roomCode: room });
    await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Alice', score: 10 });
    await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Bob', score: 20 });
    // Now in round 2 — edit Alice's round 1 score
    const res = await api('EDIT_PAST_SCORE', { roomCode: room, playerName: 'Alice', round: 1, score: 99 });
    assert.ok(res.success);
    const alice = res.state.players.find(p => p.name === 'Alice');
    assert.equal(alice.roundScores['1'], 99);
    assert.equal(alice.totalScore, 99);
  });
});

// ---------------------------------------------------------------------------
// RESET_GAME
// ---------------------------------------------------------------------------

describe('RESET_GAME', () => {
  test('resets scores and returns to LOBBY', async () => {
    const room = roomCode('N');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('START_GAME', { roomCode: room });
    await api('SUBMIT_SCORE', { roomCode: room, playerName: 'Alice', score: 50 });
    const res = await api('RESET_GAME', { roomCode: room });
    assert.ok(res.success);
    assert.equal(res.state.status, 'LOBBY');
    assert.equal(res.state.currentRound, 1);
    const alice = res.state.players.find(p => p.name === 'Alice');
    assert.equal(alice.totalScore, 0);
    assert.deepEqual(alice.roundScores, {});
  });

  test('players are preserved after reset', async () => {
    const room = roomCode('O');
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Alice' });
    await api('JOIN_ROOM', { roomCode: room, playerName: 'Bob' });
    await api('START_GAME', { roomCode: room });
    const res = await api('RESET_GAME', { roomCode: room });
    assert.equal(res.state.players.length, 2);
  });
});
