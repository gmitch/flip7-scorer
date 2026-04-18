const SHEET_NAME = 'Games';
const MAX_SCORE = 200;

// Converts a sheet cell value back to the original room-code string.
// Google Sheets will auto-convert strings like "APRIL 11" into Date objects if
// column A is not explicitly formatted as plain text. This helper reconstructs
// the "MONTHNAME DAY" string from such a Date so lookups still match.
const ROOM_CODE_MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                         'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
function cellToRoomCode(cellVal) {
  if (cellVal instanceof Date) {
    return ROOM_CODE_MONTHS[cellVal.getMonth()] + ' ' + cellVal.getDate();
  }
  return String(cellVal);
}

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['RoomCode', 'StateJSON', 'LastUpdated']);
    // Lock the header row
    sheet.setFrozenRows(1);
    
    // Format Column A as Plain Text to prevent dates like "APRIL 11" from converting
    sheet.getRange('A:A').setNumberFormat('@');
    
    // Also remove the default Sheet1 if it exists and is not the only sheet
    const sheet1 = ss.getSheetByName('Sheet1');
    if (sheet1 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet1);
    }
  }
}

function doPost(e) {
  // CORS Headers are automatically handled by Apps Script if returning ContentService JSON,
  // but we enforce returning the proper structure to allow fetch to process it.
  
  try {
    let payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      return createJsonResponse({ error: 'No payload provided' });
    }

    const action = payload.action;
    const roomCode = payload.roomCode ? String(payload.roomCode).toUpperCase() : null;
    
    if (!roomCode) {
      return createJsonResponse({ error: 'Room code required' });
    }

    // Only read operations
    if (action === 'GET_STATE') {
      const state = getRoomState(roomCode);
      return createJsonResponse({ success: true, state: state });
    }

    // Write operations - acquire a lock to prevent concurrent modification corruption
    const lock = LockService.getScriptLock();
    // Wait up to 5 seconds for other requests to finish writing
    if (!lock.tryLock(5000)) {
      return createJsonResponse({ error: 'Server busy, please wait and try again' });
    }

    try {
      let state = getRoomState(roomCode);

      if (action === 'JOIN_ROOM') {
        const playerName = payload.playerName;
        if (!playerName) throw new Error('Player name required');
        
        if (!state) {
          // Initialize a brand new room state
          state = {
            roomCode: roomCode,
            status: 'LOBBY',
            currentRound: 1,
            players: [],
            winner: null
          };
        }
        
        if (state.status !== 'LOBBY') {
          throw new Error('Game already started. Cannot join mid-game.');
        }

        // Check if player already exists
        const exists = state.players.find(p => p.name === playerName);
        if (!exists) {
          state.players.push({
            name: playerName,
            totalScore: 0,
            roundScores: {}
          });
        }
        
        saveRoomState(roomCode, state);
        return createJsonResponse({ success: true, state: state });

      } else if (action === 'START_GAME') {
        if (!state) throw new Error('Room not found');
        if (state.status !== 'LOBBY') throw new Error('Game already started');
        if (state.players.length === 0) throw new Error('Not enough players to start');
        
        state.status = 'ACTIVE';
        saveRoomState(roomCode, state);
        return createJsonResponse({ success: true, state: state });

      } else if (action === 'SUBMIT_SCORE') {
        if (!state) throw new Error('Room not found');
        if (state.status !== 'ACTIVE') throw new Error('Game is not active');
        
        const playerName = payload.playerName;
        const score = parseInt(payload.score, 10);
        if (isNaN(score)) throw new Error('Invalid score submitted');
        
        const player = state.players.find(p => p.name === playerName);
        if (!player) throw new Error('Player not found in this room');
        
        const roundStr = state.currentRound.toString();
        
        // Save the round score
        player.roundScores[roundStr] = score;

        // Recalculate total score for this player
        player.totalScore = Object.values(player.roundScores).reduce((a, b) => a + b, 0);

        // Check if all players have submitted for the current round
        const allSubmitted = state.players.every(p => p.roundScores[roundStr] !== undefined);
        
        if (allSubmitted) {
          // Track who went last in this round
          state.lastRoundLastPlayer = playerName;
          
          // Check for a winner (>= 200 points)
          const winners = state.players.filter(p => p.totalScore >= MAX_SCORE);
          if (winners.length > 0) {
            state.status = 'FINISHED';
            // Find highest score among winners (in case multiple pass 200 in the same round)
            const highestScore = Math.max(...winners.map(w => w.totalScore));
            const topWinners = winners.filter(w => w.totalScore === highestScore);
             // E.g. "Alice", or "Alice & Bob"
            state.winner = topWinners.map(w => w.name).join(' & ');
          } else {
            // Next round
            state.currentRound += 1;
          }
        }
        
        saveRoomState(roomCode, state);
        return createJsonResponse({ success: true, state: state });

      } else if (action === 'EDIT_PAST_SCORE') {
        if (!state) throw new Error('Room not found');
        
        const playerName = payload.playerName;
        const roundNum = String(payload.round);
        const score = parseInt(payload.score, 10);
        if (isNaN(score)) throw new Error('Invalid score submitted');
        
        const player = state.players.find(p => p.name === playerName);
        if (!player) throw new Error('Player not found in this room');
        
        if (player.roundScores[roundNum] === undefined) {
          throw new Error('Score for this round does not exist yet');
        }
        
        player.roundScores[roundNum] = score;
        player.totalScore = Object.values(player.roundScores).reduce((a, b) => a + b, 0);
        
        // Recheck win condition if game is still active, in case edit triggered a win
        if (state.status === 'ACTIVE') {
           const winners = state.players.filter(p => p.totalScore >= MAX_SCORE);
           if (winners.length > 0) {
              state.status = 'FINISHED';
              const highestScore = Math.max(...winners.map(w => w.totalScore));
              const topWinners = winners.filter(w => w.totalScore === highestScore);
              state.winner = topWinners.map(w => w.name).join(' & ');
           }
        }
        
        saveRoomState(roomCode, state);
        return createJsonResponse({ success: true, state: state });

      } else if (action === 'RESET_GAME') {
        if (!state) throw new Error('Room not found');
        
        // Reset scores and rounds, keep players and room
        state.status = 'LOBBY';
        state.currentRound = 1;
        state.winner = null;
        state.players.forEach(p => {
          p.totalScore = 0;
          p.roundScores = {};
        });
        saveRoomState(roomCode, state);
        return createJsonResponse({ success: true, state: state });
        
      } else {
        throw new Error('Unknown action specified');
      }
    } finally {
      // ALWAYS release the lock
      lock.releaseLock();
    }

  } catch (error) {
    return createJsonResponse({ error: error.message });
  }
}

// Fallback for GET requests
function doGet(e) {
  return createJsonResponse({ status: 'API is alive', message: 'Use POST to interact with the Flip7 Scorer' });
}

function createJsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// Helper to get row index and parse JSON
function getRoomState(roomCode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    setup(); // create if missing
    sheet = ss.getSheetByName(SHEET_NAME);
  }
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (cellToRoomCode(data[i][0]).toUpperCase() === roomCode.toUpperCase()) {
      try {
        return JSON.parse(data[i][1]);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

// Helper to save JSON state back to sheet
function saveRoomState(roomCode, state) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet missing');
  
  const data = sheet.getDataRange().getValues();
  const timestamp = new Date().toISOString();
  const stateStr = JSON.stringify(state);
  
  for (let i = 1; i < data.length; i++) {
    if (cellToRoomCode(data[i][0]).toUpperCase() === roomCode.toUpperCase()) {
      // Row index is i + 1
      sheet.getRange(i + 1, 2).setValue(stateStr);
      sheet.getRange(i + 1, 3).setValue(timestamp);
      return;
    }
  }

  // If not found, append to bottom. Explicitly mark the room-code cell as plain
  // text so Sheets never auto-converts date-like codes (e.g. "APRIL 11") on write.
  sheet.appendRow([roomCode, stateStr, timestamp]);
  const newRow = sheet.getLastRow();
  sheet.getRange(newRow, 1).setNumberFormat('@').setValue(roomCode);
}
