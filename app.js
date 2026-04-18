const state = {
    apiURL: localStorage.getItem('flip7_api_url') || '',
    roomCode: localStorage.getItem('flip7_room') || '',
    playerName: localStorage.getItem('flip7_name') || '',
    gameState: null,
    pollingInterval: null,
    isSubmitting: false,
    scoringPlayerName: null
};

const views = {
    setup: document.getElementById('view-setup'),
    entry: document.getElementById('view-entry'),
    lobby: document.getElementById('view-lobby'),
    game: document.getElementById('view-game'),
    gameOver: document.getElementById('view-game-over')
};

const ui = {
    loader: document.getElementById('global-loader'),
    roomBadge: document.getElementById('room-badge'),
    roomIdText: document.getElementById('current-room-id'),
    btnExitRoom: document.getElementById('btn-exit-room'),
    setupForm: document.getElementById('setup-form'),
    apiUrlInput: document.getElementById('api-url'),
    entryForm: document.getElementById('entry-form'),
    roomInput: document.getElementById('room-input'),
    nameInput: document.getElementById('name-input'),
    addPlayerForm: document.getElementById('add-player-form'),
    addPlayerContainer: document.getElementById('add-player-form-container'),
    newPlayerName: document.getElementById('new-player-name'),
    btnToggleAddPlayer: document.getElementById('btn-toggle-add-player'),
    btnStart: document.getElementById('btn-start-game'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    lobbyList: document.getElementById('lobby-players-list'),
    gameList: document.getElementById('game-players-list'),
    scoresList: document.getElementById('final-scores-list'),
    roundNumber: document.getElementById('current-round-number'),
    winnerName: document.getElementById('winner-name-display'),
    scoreModal: document.getElementById('score-modal-overlay'),
    scoreForm: document.getElementById('score-form'),
    scoreInput: document.getElementById('round-score'),
    btnBust: document.getElementById('btn-quick-bust'),
    btnCloseModal: document.getElementById('btn-close-modal'),
    modalPlayerName: document.getElementById('scoring-player-name'),
    modalRoundName: document.getElementById('modal-round-number')
};

function init() {
    bindEvents();
    if (!state.apiURL) {
        showView('setup');
    } else {
        if (state.roomCode && state.playerName) {
            ui.roomInput.value = state.roomCode;
            ui.nameInput.value = state.playerName;
            
            // Show loader while recovering
            ui.loader.classList.remove('hidden');
            // Attempt to automatically rejoin/recover the session
            apiCall('GET_STATE').then(res => {
                ui.loader.classList.add('hidden');
                if (res && res.state) {
                    startPolling();
                } else {
                    showView('entry');
                }
            });
        } else {
            showView('entry');
        }
    }
}

function showView(viewName) {
    Object.values(views).forEach(v => {
        v.classList.remove('active');
        v.classList.add('hidden');
    });
    views[viewName].classList.remove('hidden');
    
    // Slight delay to ensure CSS transitions trigger
    setTimeout(() => {
        views[viewName].classList.add('active');
    }, 10);
    
    if (viewName !== 'setup' && viewName !== 'entry' && state.roomCode) {
        ui.roomBadge.classList.remove('hidden');
        ui.roomIdText.textContent = state.roomCode;
    } else {
        ui.roomBadge.classList.add('hidden');
    }
}

function showError(action, msg) {
    let el = null;
    if (action === 'JOIN_ROOM') el = document.getElementById('entry-error');
    else if (action === 'START_GAME') el = document.getElementById('lobby-error');
    else if (action === 'SUBMIT_SCORE') el = document.getElementById('score-error');
    
    if (el) {
        el.textContent = msg;
        setTimeout(() => el.textContent = '', 4000);
    } else if (msg) {
        alert(msg);
    }
}

async function apiCall(action, payload = {}) {
    if (state.isSubmitting && action !== 'GET_STATE') return null;
    
    if (action !== 'GET_STATE') {
        state.isSubmitting = true;
        ui.loader.classList.remove('hidden');
    }
    
    payload.action = action;
    if (state.roomCode) payload.roomCode = state.roomCode;
    
    try {
        const response = await fetch(state.apiURL, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'text/plain' } // bypass CORS OPTIONS preflight limits
        });
        const data = await response.json();
        
        if (data.error) {
            console.error('API Error:', data.error);
            showError(action, data.error);
            return null;
        }
        
        if (data.state) {
            updateGameState(data.state);
        }
        return data;
    } catch (err) {
        console.error('Fetch error:', err);
        if (action !== 'GET_STATE') {
            showError(action, 'Network error. Check connection or Apps Script URL.');
        }
        return null;
    } finally {
        if (action !== 'GET_STATE') {
            state.isSubmitting = false;
            ui.loader.classList.add('hidden');
        }
    }
}

function updateGameState(newState) {
    if (!newState || !state.roomCode) return;
    const oldStatus = state.gameState?.status;
    const oldRound = state.gameState?.currentRound;
    state.gameState = newState;
    
    if (newState.status === 'LOBBY') {
        if (oldStatus !== 'LOBBY' && !views.lobby.classList.contains('active')) showView('lobby');
        renderLobby();
    } else if (newState.status === 'ACTIVE') {
        if (oldStatus !== 'ACTIVE' && !views.game.classList.contains('active')) showView('game');
        
        // Re-trigger round animation if round incremented
        if (oldRound && oldRound !== newState.currentRound) {
            ui.roundNumber.classList.remove('highlight-pop');
            void ui.roundNumber.offsetWidth; // Force DOM reflow
            ui.roundNumber.classList.add('highlight-pop');
            closeScoreModal(); // Clear modal if left open during round transition
        }
        renderGame();
    } else if (newState.status === 'FINISHED') {
        if (oldStatus !== 'FINISHED' && !views.gameOver.classList.contains('active')) {
            closeScoreModal();
            showView('gameOver');
        }
        renderGameOver();
    }
}

function renderLobby() {
    if (!state.gameState || !state.gameState.players) return;
    const html = state.gameState.players.map(p => `
        <div class="player-list-item slide-down">
            <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
            <span>${p.name}</span>
        </div>
    `).join('');
    
    if (ui.lobbyList.innerHTML !== html) {
        ui.lobbyList.innerHTML = html;
    }
}

function renderGame() {
    if (!state.gameState) return;
    ui.roundNumber.textContent = state.gameState.currentRound;
    const currentRoundStr = state.gameState.currentRound.toString();
    
    // Sort players for leaderboard effect
    const sortedPlayers = [...state.gameState.players].sort((a, b) => b.totalScore - a.totalScore);
    
    let lastPlayerHtml = '';
    if (state.gameState.lastRoundLastPlayer && state.gameState.currentRound > 1) {
        lastPlayerHtml = `<div style="font-size: 0.8rem; color: #aaa; margin-bottom: 10px;">Last round's final player: <strong style="color: #fff;">${state.gameState.lastRoundLastPlayer}</strong></div>`;
    }

    const html = sortedPlayers.map((p, index) => {
        const hasScored = p.roundScores[currentRoundStr] !== undefined;
        // Escape quotes to prevent injection issues in onclick attribute
        const safeName = p.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        
        let roundHistory = [];
        for (let r = 1; r < state.gameState.currentRound; r++) {
            if (p.roundScores[r] !== undefined) {
                roundHistory.push(`R${r}: ${p.roundScores[r]}`);
            }
        }
        const historyText = roundHistory.length > 0 ? roundHistory.join(' | ') : 'No history yet';
        
        return `
        <div class="player-card" onclick="openScoreModal('${safeName}')">
            <div class="card-top">
                <span class="name"><span style="opacity: 0.5; font-size: 0.8em; margin-right: 4px;">#${index + 1}</span> ${p.name}</span> 
                <span class="badge ${hasScored ? 'done' : 'pending'}">${hasScored ? 'Scored' : 'Waiting...'}</span>
            </div>
            <div class="score-main">${p.totalScore}</div>
            <div class="score-sub" style="font-size: 0.8rem; margin-bottom: 5px;">${historyText}</div>
            <div class="score-sub">Total Points <span class="accent-text" style="float:right; font-size:1.2rem; opacity:0.5; font-weight:bold">+</span></div>
        </div>
        `;
    }).join('');
    
    const fullHtml = lastPlayerHtml + html;
    
    if (ui.gameList.innerHTML !== fullHtml) {
        ui.gameList.innerHTML = fullHtml;
    }
}

function renderGameOver() {
    if (!state.gameState) return;
    ui.winnerName.innerHTML = state.gameState.winner;
    
    const sorted = [...state.gameState.players].sort((a,b) => b.totalScore - a.totalScore);
    const html = sorted.map((p, i) => `
        <div class="final-score-row ${i === 0 ? 'is-winner' : ''}">
            <span>${i+1}. ${p.name}</span>
            <span>${p.totalScore} pts</span>
        </div>
    `).join('');
    
    if (ui.scoresList.innerHTML !== html) {
        ui.scoresList.innerHTML = html;
    }
}

// Global modal open/close functions for DOM events
window.openScoreModal = function(playerName) {
    if (state.gameState?.status !== 'ACTIVE') return;
    
    const player = state.gameState.players.find(p => p.name === playerName);
    
    state.scoringPlayerName = playerName;
    ui.modalPlayerName.textContent = playerName;
    ui.modalRoundName.textContent = state.gameState.currentRound;
    ui.scoreInput.value = '';
    
    // Show past scores
    const pastScores = document.getElementById('past-scores-list');
    if (pastScores && player) {
        let html = '';
        for (let r = 1; r <= state.gameState.currentRound; r++) {
            if (player.roundScores[r] !== undefined) {
                html += `<div class="past-score-item">R${r}: <strong>${player.roundScores[r]}</strong> <button type="button" onclick="editPastScore('${playerName}', ${r})" class="btn-small">Edit</button></div>`;
            }
        }
        pastScores.innerHTML = html;
    }
    
    ui.scoreModal.classList.remove('hidden');
    // Focus after popup animation
    setTimeout(() => ui.scoreInput.focus(), 50);
};

window.editPastScore = async function(playerName, roundNum) {
    const newScoreStr = prompt(`Enter new score for ${playerName} in Round ${roundNum}:`);
    if (newScoreStr === null || newScoreStr.trim() === '') return;
    const newScore = parseInt(newScoreStr, 10);
    if (isNaN(newScore)) {
        alert("Invalid score");
        return;
    }
    const res = await apiCall('EDIT_PAST_SCORE', { playerName: playerName, round: roundNum, score: newScore });
    if (res && res.success) {
        closeScoreModal();
    }
};

function closeScoreModal() {
    ui.scoreModal.classList.add('hidden');
    state.scoringPlayerName = null;
    ui.scoreInput.blur();
}

function exitRoom() {
    if (!state.roomCode) return;
    if (!confirm('Exit this room and return to the start? Your local session will be cleared.')) return;

    if (state.pollingInterval) {
        clearInterval(state.pollingInterval);
        state.pollingInterval = null;
    }

    state.roomCode = '';
    state.playerName = '';
    state.gameState = null;
    state.scoringPlayerName = null;
    localStorage.removeItem('flip7_room');
    localStorage.removeItem('flip7_name');

    closeScoreModal();
    ui.roomInput.value = '';
    ui.nameInput.value = '';
    ui.roomBadge.classList.add('hidden');

    showView(state.apiURL ? 'entry' : 'setup');
}

function startPolling() {
    if (state.pollingInterval) clearInterval(state.pollingInterval);
    apiCall('GET_STATE'); // Initial fetch
    state.pollingInterval = setInterval(() => {
        // Only poll if tab is active to save resources & Apps Script quota
        if (!document.hidden && !state.isSubmitting) {
            apiCall('GET_STATE');
        }
    }, 3000); // 3 seconds polling
}

function bindEvents() {
    ui.setupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        state.apiURL = ui.apiUrlInput.value.trim();
        localStorage.setItem('flip7_api_url', state.apiURL);
        showView('entry');
    });

    ui.entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const room = ui.roomInput.value.trim().toUpperCase();
        const name = ui.nameInput.value.trim();
        
        state.roomCode = room;
        localStorage.setItem('flip7_room', room);
        state.playerName = name;
        localStorage.setItem('flip7_name', name);
        
        const res = await apiCall('JOIN_ROOM', { playerName: name });
        if (res && res.success) {
            startPolling();
        }
    });

    ui.btnStart.addEventListener('click', () => {
        apiCall('START_GAME');
    });

    ui.btnToggleAddPlayer.addEventListener('click', () => {
        ui.addPlayerContainer.classList.toggle('hidden');
        if (!ui.addPlayerContainer.classList.contains('hidden')) {
            ui.newPlayerName.focus();
        }
    });

    ui.addPlayerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = ui.newPlayerName.value.trim();
        if (!name) return;
        const res = await apiCall('JOIN_ROOM', { playerName: name });
        if (res && res.success) {
            ui.newPlayerName.value = '';
            ui.addPlayerContainer.classList.add('hidden');
        }
    });

    ui.btnCloseModal.addEventListener('click', closeScoreModal);
    
    ui.btnBust.addEventListener('click', async () => {
        if (!state.scoringPlayerName) return;
        const res = await apiCall('SUBMIT_SCORE', { playerName: state.scoringPlayerName, score: 0 });
        if (res && res.success) closeScoreModal();
    });

    ui.scoreForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const score = ui.scoreInput.value;
        if (!state.scoringPlayerName || score === '') return;
        const res = await apiCall('SUBMIT_SCORE', { playerName: state.scoringPlayerName, score: score });
        if (res && res.success) closeScoreModal();
    });

    ui.btnPlayAgain.addEventListener('click', async () => {
        await apiCall('RESET_GAME');
    });

    ui.btnExitRoom.addEventListener('click', exitRoom);
}

document.addEventListener('DOMContentLoaded', init);
