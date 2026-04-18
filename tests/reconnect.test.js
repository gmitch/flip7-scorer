'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadCodeGs } = require('./harness');
const { MockSpreadsheet, MockSheet } = require('./mocks');

function makeActiveRoom() {
  const ss = new MockSpreadsheet();
  const state = {
    roomCode: 'TESTROOM',
    status: 'ACTIVE',
    currentRound: 2,
    players: [
      { name: 'Alice', totalScore: 45, roundScores: { '1': 45 } },
      { name: 'Bob',   totalScore: 30, roundScores: { '1': 30 } },
    ],
    winner: null,
  };
  const sheet = new MockSheet('Games', [
    ['RoomCode', 'StateJSON', 'LastUpdated'],
    ['TESTROOM', JSON.stringify(state), '2026-04-18T00:00:00Z'],
  ]);
  ss.sheets['Games'] = sheet;
  const { sandbox } = loadCodeGs({ spreadsheet: ss });
  return { sandbox, state };
}

function joinRoom(sandbox, roomCode, playerName) {
  const e = {
    postData: {
      contents: JSON.stringify({ action: 'JOIN_ROOM', roomCode, playerName }),
    },
  };
  const res = sandbox.doPost(e);
  return JSON.parse(res._text);
}

test('existing player can reconnect to an active game', () => {
  const { sandbox, state } = makeActiveRoom();
  const res = joinRoom(sandbox, 'TESTROOM', 'Alice');
  assert.ok(res.success, 'JOIN_ROOM should succeed for existing player mid-game');
  assert.equal(res.state.status, 'ACTIVE');
  assert.equal(res.state.currentRound, 2);
});

test('reconnected player gets current game state', () => {
  const { sandbox } = makeActiveRoom();
  const res = joinRoom(sandbox, 'TESTROOM', 'Bob');
  const bob = res.state.players.find(p => p.name === 'Bob');
  assert.ok(bob);
  assert.equal(bob.totalScore, 30);
});

test('new player cannot join an active game', () => {
  const { sandbox } = makeActiveRoom();
  const res = joinRoom(sandbox, 'TESTROOM', 'Charlie');
  assert.ok(res.error, 'JOIN_ROOM should fail for a new player mid-game');
  assert.match(res.error, /already started/i);
});

test('existing player can reconnect to a finished game', () => {
  const ss = new MockSpreadsheet();
  const state = {
    roomCode: 'DONE',
    status: 'FINISHED',
    currentRound: 3,
    players: [{ name: 'Alice', totalScore: 210, roundScores: {} }],
    winner: 'Alice',
  };
  const sheet = new MockSheet('Games', [
    ['RoomCode', 'StateJSON', 'LastUpdated'],
    ['DONE', JSON.stringify(state), '2026-04-18T00:00:00Z'],
  ]);
  ss.sheets['Games'] = sheet;
  const { sandbox } = loadCodeGs({ spreadsheet: ss });
  const res = joinRoom(sandbox, 'DONE', 'Alice');
  assert.ok(res.success);
  assert.equal(res.state.status, 'FINISHED');
  assert.equal(res.state.winner, 'Alice');
});
