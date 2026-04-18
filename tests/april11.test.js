// Regression tests for issue #5: room code "APRIL 11" (and other date-like codes)
// failed to be found because Google Sheets auto-converts such strings into Date
// objects, and the old code compared the raw Date via String() against the input.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { loadCodeGs } = require('./harness');
const { MockSpreadsheet, MockSheet } = require('./mocks');

function freshEnv() {
  const ss = new MockSpreadsheet();
  const sheet = new MockSheet('Games', [['RoomCode', 'StateJSON', 'LastUpdated']]);
  ss.sheets['Games'] = sheet;
  const { sandbox } = loadCodeGs({ spreadsheet: ss });
  return { sandbox, spreadsheet: ss, sheet };
}

// --- cellToRoomCode ---------------------------------------------------------

test('cellToRoomCode: plain string passes through unchanged', () => {
  const { sandbox } = freshEnv();
  assert.equal(sandbox.cellToRoomCode('APRIL 11'), 'APRIL 11');
  assert.equal(sandbox.cellToRoomCode('ROOM-42'), 'ROOM-42');
});

test('cellToRoomCode: Date is reconstructed to MONTHNAME DAY', () => {
  const { sandbox } = freshEnv();
  // April is month index 3
  assert.equal(sandbox.cellToRoomCode(new Date(2026, 3, 11)), 'APRIL 11');
  assert.equal(sandbox.cellToRoomCode(new Date(2026, 0, 1)), 'JANUARY 1');
  assert.equal(sandbox.cellToRoomCode(new Date(2026, 11, 31)), 'DECEMBER 31');
});

// --- getRoomState -----------------------------------------------------------

test('getRoomState finds a row when Sheets stored the room code as a Date', () => {
  // Simulate the pathological state Sheets can end up in: column A already
  // contains a Date because auto-conversion happened before the plain-text
  // format was applied. This is exactly what triggered issue #5.
  const { sandbox, sheet } = freshEnv();
  const state = { roomCode: 'APRIL 11', status: 'LOBBY', players: [] };
  sheet.appendRow([new Date(2026, 3, 11), JSON.stringify(state), '2026-04-11T00:00:00Z']);

  const result = sandbox.getRoomState('APRIL 11');
  assert.ok(result, 'getRoomState should find the row stored as a Date');
  assert.equal(result.roomCode, 'APRIL 11');
  assert.equal(result.status, 'LOBBY');
});

test('getRoomState finds a row when stored as a plain string', () => {
  const { sandbox, sheet } = freshEnv();
  const state = { roomCode: 'APRIL 11', status: 'LOBBY', players: [] };
  sheet.appendRow(['APRIL 11', JSON.stringify(state), '2026-04-11T00:00:00Z']);

  const result = sandbox.getRoomState('APRIL 11');
  assert.ok(result);
  assert.equal(result.status, 'LOBBY');
});

test('getRoomState returns null for an unknown room code', () => {
  const { sandbox } = freshEnv();
  assert.equal(sandbox.getRoomState('NOPE 99'), null);
});

test('getRoomState is case-insensitive', () => {
  const { sandbox, sheet } = freshEnv();
  sheet.appendRow(['APRIL 11', JSON.stringify({ roomCode: 'APRIL 11' }), 't']);
  assert.ok(sandbox.getRoomState('april 11'));
  assert.ok(sandbox.getRoomState('April 11'));
});

// --- saveRoomState: no apostrophe hack --------------------------------------

test('saveRoomState stores the room code as plain text (no leading apostrophe)', () => {
  const { sandbox, sheet } = freshEnv();
  const state = { roomCode: 'APRIL 11', status: 'LOBBY', players: [] };

  sandbox.saveRoomState('APRIL 11', state);

  // Exactly one data row appended (plus header row at index 0).
  assert.equal(sheet.data.length, 2);
  const storedCode = sheet.data[1][0];
  assert.equal(storedCode, 'APRIL 11',
    'stored room code must be "APRIL 11" — not "\'APRIL 11" (the old apostrophe hack)');
  assert.ok(!String(storedCode).startsWith("'"),
    'stored room code must not have a leading apostrophe');
});

test('saveRoomState sets the room-code cell to plain-text number format', () => {
  const { sandbox, sheet } = freshEnv();
  sandbox.saveRoomState('APRIL 11', { roomCode: 'APRIL 11', players: [] });
  // Row 2 (index 1), column 1 = the newly-written room code.
  assert.equal(sheet.cellFormats['2,1'], '@',
    'new room code cell must be formatted as plain text (@) to prevent Date auto-conversion');
});

// --- end-to-end round trip --------------------------------------------------

test('saveRoomState + getRoomState round-trips a date-like room code', () => {
  const { sandbox } = freshEnv();
  const state = {
    roomCode: 'APRIL 11',
    status: 'LOBBY',
    currentRound: 1,
    players: [{ name: 'Alice', totalScore: 0, roundScores: {} }],
    winner: null,
  };

  sandbox.saveRoomState('APRIL 11', state);
  const recovered = sandbox.getRoomState('APRIL 11');

  assert.deepEqual(recovered, state);
});

test('saveRoomState updates the existing row even when stored as a Date', () => {
  // The most subtle case: the legacy row was stored as a Date (before the fix).
  // A second save of the same room code must UPDATE that row, not append a new one.
  const { sandbox, sheet } = freshEnv();
  sheet.appendRow([
    new Date(2026, 3, 11),
    JSON.stringify({ roomCode: 'APRIL 11', status: 'LOBBY', players: [] }),
    '2026-04-11T00:00:00Z',
  ]);

  const newState = { roomCode: 'APRIL 11', status: 'ACTIVE', players: [{ name: 'Alice' }] };
  sandbox.saveRoomState('APRIL 11', newState);

  assert.equal(sheet.data.length, 2, 'should update the existing Date row, not append a duplicate');
  const recovered = sandbox.getRoomState('APRIL 11');
  assert.equal(recovered.status, 'ACTIVE');
  assert.equal(recovered.players[0].name, 'Alice');
});
