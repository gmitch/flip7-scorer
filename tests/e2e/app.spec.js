const { test, expect } = require('@playwright/test');
const { mockApi, seedApiUrl, seedSession, lobbyState, activeState, finishedState } = require('./helpers');

// ---------------------------------------------------------------------------
// Setup / configuration screen
// ---------------------------------------------------------------------------

test('shows Setup screen when no API URL is saved', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('h2', { hasText: 'Configuration' })).toBeVisible();
});

test('saving API URL advances to Entry screen', async ({ page }) => {
  await page.goto('./');
  await page.fill('#api-url', 'https://fake-apps-script.invalid/exec');
  await page.click('button[type=submit]');
  await expect(page.locator('h2', { hasText: 'Join Game' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Entry / join room
// ---------------------------------------------------------------------------

test('shows Entry screen when API URL is set', async ({ page }) => {
  await seedApiUrl(page);
  await page.goto('./');
  await expect(page.locator('h2', { hasText: 'Join Game' })).toBeVisible();
});

test('joining a room navigates to Lobby and shows player name', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, () => ({ success: true, state: lobbyState('MYROOM', ['Alice']) }));
  await page.goto('./');
  await page.fill('#room-input', 'MYROOM');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  await expect(page.locator('#view-lobby')).toBeVisible();
  await expect(page.locator('#lobby-players-list')).toContainText('Alice');
});

test('room badge appears after joining', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, () => ({ success: true, state: lobbyState('MYROOM', ['Alice']) }));
  await page.goto('./');
  await page.fill('#room-input', 'MYROOM');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  await expect(page.locator('#room-badge')).toBeVisible();
  await expect(page.locator('#current-room-id')).toContainText('MYROOM');
});

test('joining with a date-like room name works', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, () => ({ success: true, state: lobbyState('APRIL 18', ['Alice']) }));
  await page.goto('./');
  await page.fill('#room-input', 'APRIL 18');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  await expect(page.locator('#view-lobby')).toBeVisible();
  await expect(page.locator('#current-room-id')).toContainText('APRIL 18');
});

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

test('multiple players appear in lobby list', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, ({ action }) => {
    const state = lobbyState('ROOM1', ['Alice', 'Bob', 'Carol']);
    return { success: true, state };
  });
  await page.goto('./');
  await page.fill('#room-input', 'ROOM1');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  await expect(page.locator('#lobby-players-list')).toContainText('Bob');
  await expect(page.locator('#lobby-players-list')).toContainText('Carol');
});

test('Add Offline Player form adds a second player', async ({ page }) => {
  await seedApiUrl(page);
  let players = ['Alice'];
  await mockApi(page, ({ action, playerName }) => {
    if (action === 'JOIN_ROOM' && playerName && !players.includes(playerName)) {
      players.push(playerName);
    }
    return { success: true, state: lobbyState('ROOM1', players) };
  });
  await page.goto('./');
  await page.fill('#room-input', 'ROOM1');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  await page.click('#btn-toggle-add-player');
  await page.fill('#new-player-name', 'Bob');
  await page.click('#add-player-form button[type=submit]');
  await expect(page.locator('#lobby-players-list')).toContainText('Bob');
});

// ---------------------------------------------------------------------------
// Exit room
// ---------------------------------------------------------------------------

test('exit button returns to Entry screen', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, () => ({ success: true, state: lobbyState('ROOM1', ['Alice']) }));
  await page.goto('./');
  await page.fill('#room-input', 'ROOM1');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  page.once('dialog', d => d.accept());
  await page.click('#btn-exit-room');
  await expect(page.locator('h2', { hasText: 'Join Game' })).toBeVisible();
  await expect(page.locator('#room-badge')).toBeHidden();
});

test('exit clears saved room from localStorage', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, () => ({ success: true, state: lobbyState('ROOM1', ['Alice']) }));
  await page.goto('./');
  await page.fill('#room-input', 'ROOM1');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  page.once('dialog', d => d.accept());
  await page.click('#btn-exit-room');
  const room = await page.evaluate(() => localStorage.getItem('flip7_room'));
  expect(room).toBeNull();
});

// ---------------------------------------------------------------------------
// Auto-rejoin on page reload
// ---------------------------------------------------------------------------

test('page reload auto-rejoins when localStorage has session', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, () => ({ success: true, state: lobbyState('ROOM1', ['Alice']) }));
  await page.goto('./');
  await expect(page.locator('#view-lobby')).toBeVisible();
  await expect(page.locator('#current-room-id')).toContainText('ROOM1');
});

test('auto-rejoin drops to Entry when GET_STATE returns nothing', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, () => ({ success: true, state: null }));
  await page.goto('./');
  await expect(page.locator('h2', { hasText: 'Join Game' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Mid-game reconnection
// ---------------------------------------------------------------------------

test('existing player can rejoin an active game', async ({ page }) => {
  await seedApiUrl(page);
  await mockApi(page, ({ action }) => {
    if (action === 'JOIN_ROOM') return { success: true, state: activeState('ROOM1', ['Alice', 'Bob']) };
    if (action === 'GET_STATE') return { success: true, state: activeState('ROOM1', ['Alice', 'Bob']) };
    return { success: true };
  });
  await page.goto('./');
  await page.fill('#room-input', 'ROOM1');
  await page.fill('#name-input', 'Alice');
  await page.click('#btn-join');
  await expect(page.locator('#view-game')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Active game
// ---------------------------------------------------------------------------

test('game board shows player cards', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, () => ({ success: true, state: activeState('ROOM1', ['Alice', 'Bob'], 2) }));
  await page.goto('./');
  await expect(page.locator('#view-game')).toBeVisible();
  await expect(page.locator('#game-players-list')).toContainText('Alice');
  await expect(page.locator('#game-players-list')).toContainText('Bob');
});

test('tapping a player card opens score modal', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, () => ({ success: true, state: activeState('ROOM1', ['Alice', 'Bob'], 1) }));
  await page.goto('./');
  await expect(page.locator('#view-game')).toBeVisible();
  await page.locator('#game-players-list .player-card', { hasText: 'Alice' }).click();
  await expect(page.locator('#score-modal-overlay')).toBeVisible();
  await expect(page.locator('#scoring-player-name')).toContainText('Alice');
});

test('submitting a score closes the modal', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, ({ action }) => {
    if (action === 'SUBMIT_SCORE') return { success: true, state: activeState('ROOM1', ['Alice', 'Bob'], 1) };
    return { success: true, state: activeState('ROOM1', ['Alice', 'Bob'], 1) };
  });
  await page.goto('./');
  await expect(page.locator('#view-game')).toBeVisible();
  await page.locator('#game-players-list .player-card', { hasText: 'Alice' }).click();
  await page.fill('#round-score', '42');
  await page.click('#score-form button[type=submit]');
  await expect(page.locator('#score-modal-overlay')).toBeHidden();
});

test('bust button submits 0 and closes modal', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, ({ action }) => {
    if (action === 'SUBMIT_SCORE') return { success: true, state: activeState('ROOM1', ['Alice'], 1) };
    return { success: true, state: activeState('ROOM1', ['Alice'], 1) };
  });
  await page.goto('./');
  await page.locator('#game-players-list .player-card', { hasText: 'Alice' }).click();
  await page.click('#btn-quick-bust');
  await expect(page.locator('#score-modal-overlay')).toBeHidden();
});

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

test('finished game shows Game Over screen with winner', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, () => ({ success: true, state: finishedState('ROOM1', 'Alice') }));
  await page.goto('./');
  await expect(page.locator('#view-game-over')).toBeVisible();
  await expect(page.locator('#winner-name-display')).toContainText('Alice');
});

test('Play Again button returns to lobby', async ({ page }) => {
  await seedSession(page, 'ROOM1', 'Alice');
  await mockApi(page, ({ action }) => {
    if (action === 'RESET_GAME') return { success: true, state: lobbyState('ROOM1', ['Alice', 'Bob']) };
    return { success: true, state: finishedState('ROOM1', 'Alice') };
  });
  await page.goto('./');
  await expect(page.locator('#view-game-over')).toBeVisible();
  await page.click('#btn-play-again');
  await expect(page.locator('#view-lobby')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Version footer
// ---------------------------------------------------------------------------

test('version footer shows FE version', async ({ page }) => {
  await seedApiUrl(page);
  await page.goto('./');
  const feText = await page.locator('#fe-version').textContent();
  expect(feText).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
});
