// const SOCKET_SERVER = 'https://wiggly-alder-cornet.glitch.me'; // FOR GLITCH DEPLOYMENT
const SOCKET_SERVER = 'http://localhost:3000'; // FOR LOCAL TESTING
// const SOCKET_SERVER = 'ws://remote-stock-exchange-backend.glitch.me'; // Example if using glitch

// Initialize socket connection
const socket = io();

// Game Constants
const SHARE_LOTS = [500, 1000, 5000, 10000];
const MAX_SHARES_PER_COMPANY_CLIENT = 200000;

// Track connection state
let isConnected = false;
let currentRoom = null;
// let gameState = null; // Replaced by currentGameState for clarity
let initialPrices = {};
let isAdmin = false;
let isYourTurn = false;
window.playerHand = [];
window.companyNames = {};
let priceLog = [];

// Track modal state - This seems unused, consider removing if not needed
let modalState = {
    action: null,
    selectedCompany: null,
    selectedQuantity: null
};

// Save session info to localStorage
function saveSession(roomID, playerName) {
    localStorage.setItem('gameSession', JSON.stringify({
        roomID,
        playerName,
        timestamp: Date.now()
    }));
}

// Try to restore session
function restoreSession() {
    const session = localStorage.getItem('gameSession');
    if (!session) return null;
    
    const { roomID, playerName, timestamp } = JSON.parse(session);
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) { // Session expires after 24 hours
        localStorage.removeItem('gameSession');
        return null;
    }
    return { roomID, playerName };
}

// Clear session
function clearSession() {
    localStorage.removeItem('gameSession');
}

// DOM Elements - Declared ONCE
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const startGameBtn = document.getElementById('startGame');
const roomCodeInput = document.getElementById('roomCode');
const playerNameInput = document.getElementById('playerName');
const playerListDiv = document.getElementById('playerList');
const periodSpan = document.getElementById('period');
const cashSpan = document.getElementById('cash');
const buyBtn = document.getElementById('buy');
const sellBtn = document.getElementById('sell');
const passBtn = document.getElementById('pass');
const endTurnBtn = document.getElementById('endTurn');
const handDiv = document.getElementById('hand'); // Used by p5.js sketch globally
const transactionModal = document.getElementById('transaction-modal');
const companySelect = document.getElementById('company');
const quantityInput = document.getElementById('quantityInput');
const costInfoDiv = document.getElementById('costInfo');
const confirmTransactionBtn = document.getElementById('confirm');
const cancelBtn = document.getElementById('cancel');
const leaderboardContent = document.querySelector('.leaderboard-content');
const advancePeriodBtn = document.getElementById('advancePeriod');
const handSummaryDiv = document.getElementById('hand-summary');
const handSummaryContentDiv = document.getElementById('hand-summary-content');
const rightsIssueModal = document.getElementById('rights-issue-modal');
const rightsCompanySelect = document.getElementById('rightsCompanySelect');
const rightsCostInfoDiv = document.getElementById('rights-cost-info');
const confirmRightsIssueBtn = document.getElementById('confirmRightsIssue');
const cancelRightsIssueBtn = document.getElementById('cancelRightsIssue');
const desiredRightsSharesInput = document.getElementById('desiredRightsSharesInput');
const priceLogTable = document.getElementById('price-log-table');
const priceLogTableHeader = priceLogTable?.querySelector('thead tr');
const priceLogTableBody = priceLogTable?.querySelector('tbody');
const generalRightsOffersPanel = document.getElementById('general-rights-offers-panel');
const generalRightsListDiv = document.getElementById('general-rights-list');
const generalRightsIssueModal = document.getElementById('general-rights-issue-modal');
const generalRightsCompanyNameSpan = document.getElementById('generalRightsCompanyName');
const generalRightsPricePerShareSpan = document.getElementById('generalRightsPricePerShare');
const desiredGeneralRightsSharesInput = document.getElementById('desiredGeneralRightsSharesInput');
const generalRightsCostInfoDiv = document.getElementById('general-rights-cost-info');
const confirmGeneralRightsIssueBtn = document.getElementById('confirmGeneralRightsIssue');
const cancelGeneralRightsIssueBtn = document.getElementById('cancelGeneralRightsIssue');
const activityLogPanel = document.getElementById('activity-log-panel');
const activityLogContent = document.getElementById('activity-log-content');

// Short Selling Elements (New)
const shortSellBtn = document.getElementById('shortSell');
const shortSellModal = document.getElementById('short-sell-modal');
const shortCompanySelect = document.getElementById('shortCompanySelect');
const shortQuantityInput = document.getElementById('shortQuantityInput');
const shortSellInfoDiv = document.getElementById('shortSellInfoDiv');
const shortSellTransactionsRemaining = document.getElementById('shortSellTransactionsRemaining');
const confirmShortSellBtn = document.getElementById('confirmShortSellBtn');
const cancelShortSellBtn = document.getElementById('cancelShortSellBtn');
const openShortsPanel = document.getElementById('open-shorts-panel');
const openShortsContent = document.getElementById('open-shorts-content');
const noOpenShortsMsg = document.getElementById('no-open-shorts-msg');

// Hide modals by default (Important to check if elements exist before accessing style)
if (transactionModal) transactionModal.style.display = 'none';
if (rightsIssueModal) rightsIssueModal.style.display = 'none';
if (generalRightsIssueModal) generalRightsIssueModal.style.display = 'none';
if (shortSellModal) shortSellModal.style.display = 'none';


// Transaction state
let currentTransaction = { // Used for Buy/Sell modal
    action: null,
    company: null,
    quantity: null
};

// let currentAction = null; // This seems unused

let isRejoining = false;
let currentPlayerName = null;
let currentSessionToken = null;
let currentGameState = null; // Central game state holder

let lastLoggedPeriodForSeparator = null;
let lastLoggedRoundForSeparator = null;
let cardBeingPlayed = null;

function getCompanyName(id) {
    return window.companyNames[id] || id;
}

socket.on('connect', () => {
    console.log('[connect] Connected to server with socket ID:', socket.id);
    isConnected = true;
    if (createRoomBtn) createRoomBtn.disabled = false;
    if (joinRoomBtn) joinRoomBtn.disabled = false;

    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('session');
    currentSessionToken = tokenFromUrl || localStorage.getItem('satnaSessionToken');

    if (currentSessionToken) {
        console.log('[connect] Found session token, attempting to rejoin:', currentSessionToken);
        isRejoining = true;
        socket.emit('rejoinWithToken', currentSessionToken, response => {
            console.log('[rejoinWithToken callback] Response:', response);
            if (response.error) {
                alert('Failed to rejoin session: ' + response.error);
                localStorage.removeItem('satnaSessionToken');
                history.replaceState(null, '', window.location.pathname);
                currentSessionToken = null;
                isRejoining = false;
                if (lobbyScreen) lobbyScreen.style.display = 'flex';
                if (gameScreen) gameScreen.style.display = 'none';
                return;
            }
            currentRoom = response.roomID;
            currentPlayerName = response.playerName;
            localStorage.setItem('satnaSessionToken', currentSessionToken);
            console.log('[rejoinWithToken callback] Rejoin successful. Room:', currentRoom, 'Player:', currentPlayerName);
        });
    } else {
        console.log('[connect] No session token found. Fresh connection.');
        if (lobbyScreen) lobbyScreen.style.display = 'flex';
        if (gameScreen) gameScreen.style.display = 'none';
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    isConnected = false;
    if (createRoomBtn) createRoomBtn.disabled = true;
    if (joinRoomBtn) joinRoomBtn.disabled = true;
});

if (createRoomBtn) {
    createRoomBtn.onclick = () => {
        if (!isConnected) {
            alert('Not connected to server. Please refresh the page.');
            return;
        }
        console.log('Creating room...');
        createRoomBtn.disabled = true;
        socket.emit('createRoom', (roomID) => {
            createRoomBtn.disabled = false;
            console.log('Room created:', roomID);
            if (roomID) {
                currentRoom = roomID;
                if (roomCodeInput) roomCodeInput.value = roomID;
                alert(`Room created! Room code: ${roomID}`);
                if (playerNameInput && !playerNameInput.value) {
                    playerNameInput.value = 'Player 1';
                }
                currentPlayerName = playerNameInput ? playerNameInput.value.trim() : 'Player';
                socket.emit('joinRoom', { roomID, name: currentPlayerName }, response => {
                    console.log('Auto-join response after create:', response);
                    if (response.error) {
                        alert(response.error);
                        return;
                    }
                    if (response.sessionToken) {
                        currentSessionToken = response.sessionToken;
                        localStorage.setItem('satnaSessionToken', currentSessionToken);
                        const url = new URL(window.location.href);
                        url.searchParams.set('room', roomID);
                        url.searchParams.set('session', currentSessionToken);
                        history.pushState({ roomID, playerName: currentPlayerName, token: currentSessionToken }, ``, url.toString());
                        console.log('[joinRoom] Updated URL with session token:', url.toString());
                    }
                    if (startGameBtn) startGameBtn.style.display = 'block';
                });
            } else {
                alert('Failed to create room. Please try again.');
            }
        });
    };
}

if (joinRoomBtn) {
    joinRoomBtn.onclick = () => {
        if (!isConnected) {
            alert('Not connected to server. Please refresh the page.');
            return;
        }
        const roomID = roomCodeInput ? roomCodeInput.value.toUpperCase() : '';
        const name = playerNameInput ? playerNameInput.value.trim() : '';
        if (!roomID || !name) {
            alert('Please enter both room code and your name.');
            return;
        }
        currentPlayerName = name;
        console.log('Joining room:', roomID, 'as:', name);
        joinRoomBtn.disabled = true;
        socket.emit('joinRoom', { roomID, name }, response => {
            joinRoomBtn.disabled = false;
            console.log('Join response:', response);
            if (response.error) {
                alert(response.error);
                return;
            }
            if (response.sessionToken) {
                currentSessionToken = response.sessionToken;
                localStorage.setItem('satnaSessionToken', currentSessionToken);
                const url = new URL(window.location.href);
                url.searchParams.set('room', roomID);
                url.searchParams.set('session', currentSessionToken);
                history.pushState({ roomID, playerName: name, token: currentSessionToken }, ``, url.toString());
                console.log('[joinRoom] Updated URL with session token:', url.toString());
            }
            currentRoom = roomID;
            if (startGameBtn) startGameBtn.style.display = 'block';
        });
    };
}

if (startGameBtn) {
    startGameBtn.onclick = () => {
        if (!currentRoom) {
            alert('Not in a room!');
            return;
        }
        console.log('Starting game in room:', currentRoom);
        socket.emit('startGame', { roomID: currentRoom });
    };
}

if (buyBtn) buyBtn.addEventListener('click', () => showTransactionModal('buy'));
if (sellBtn) sellBtn.addEventListener('click', () => showTransactionModal('sell'));
if (passBtn) passBtn.addEventListener('click', () => socket.emit('pass', { roomID: currentRoom })); // Corrected event name
if (endTurnBtn) endTurnBtn.addEventListener('click', () => socket.emit('endTurn', { roomID: currentRoom })); // Corrected event name

function showTransactionModal(action) {
    console.log('[showTransactionModal] Opening modal for action:', action);
    currentTransaction = { action: action, company: null, quantity: null };
    
    const transactionTypeTitle = document.getElementById('transaction-type');
    if (transactionTypeTitle) {
        transactionTypeTitle.textContent = action === 'buy' ? 'Buy Shares' : 'Sell Shares';
    }
    
    if (companySelect) companySelect.innerHTML = '<option value="" disabled selected>Select a company</option>';
    if (quantityInput) quantityInput.value = '';
    
    const player = currentGameState?.players.find(p => p.id === socket.id);
    if (!player || !currentGameState?.state?.prices) {
        alert('Game state not fully loaded. Cannot perform transaction.');
        return;
    }
    console.log('Current player state:', { cash: player.cash, portfolio: player.portfolio });

    const prices = currentGameState.state.prices;
    const companiesForSelect = action === 'sell' ? 
        Object.entries(player.portfolio || {})
            .filter(([_, shares]) => shares > 0)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)))
        : Object.entries(prices)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)));

    if (action === 'sell' && companiesForSelect.length === 0) {
        alert('You don\'t own any shares to sell.');
        return;
    }

    companiesForSelect.forEach(([companyId, data]) => {
        const option = document.createElement('option');
        option.value = companyId;
        const price = prices[companyId];
        const sharesOwned = action === 'sell' ? data : (player.portfolio?.[companyId] || 0);
        option.textContent = `${getCompanyName(companyId)} (Price: ₹${price}` +
                             (action === 'sell' ? `, Owned: ${sharesOwned.toLocaleString()})` : ')');
        if (companySelect) companySelect.appendChild(option);
    });
    
    if (transactionModal) transactionModal.style.display = 'flex';
    updateTransactionCostInfo();
}

if (companySelect) {
    companySelect.addEventListener('change', (event) => {
        event.preventDefault();
        const newlySelectedCompanyId = event.target.value;
        if (!newlySelectedCompanyId) return;
        currentTransaction.company = newlySelectedCompanyId;
        currentTransaction.quantity = null;
        if (quantityInput) quantityInput.value = '';
        updateTransactionCostInfo();
    });
}

if (quantityInput) {
    quantityInput.addEventListener('input', (event) => {
        const quantity = parseInt(event.target.value);
        currentTransaction.quantity = isNaN(quantity) ? null : quantity;
        updateTransactionCostInfo();
    });
}

if (confirmTransactionBtn) {
    confirmTransactionBtn.addEventListener('click', () => {
        const selectedCompany = companySelect?.value;
        const rawQuantity = quantityInput?.value;
        const quantity = parseInt(rawQuantity);

        if (!selectedCompany) {
            alert('Please select a company.');
            return;
        }
        if (isNaN(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity % 1000 !== 0) {
            alert('Please enter a quantity that is a positive multiple of 1000.');
            if (quantityInput) quantityInput.focus();
            return;
        }

        const player = currentGameState?.players.find(p => p.id === socket.id);
        const price = currentGameState?.state?.prices[selectedCompany];
        if (!player || price === undefined) {
            alert('Cannot verify transaction validity. Game state missing.');
            return;
        }

        if (currentTransaction.action === 'buy') {
            const currentOwnedShares = player.portfolio?.[selectedCompany] || 0;
            if (currentOwnedShares + quantity > MAX_SHARES_PER_COMPANY_CLIENT) {
                const canBuy = MAX_SHARES_PER_COMPANY_CLIENT - currentOwnedShares;
                alert(`Cannot buy ${quantity.toLocaleString()} shares. Max per company: ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()}.` +
                      (canBuy > 0 ? ` You can buy up to ${canBuy.toLocaleString()} more.` : ` You own the maximum.`));
                if (quantityInput) quantityInput.focus();
                return;
            }
            const cost = quantity * price;
            if (cost > player.cash) {
                alert(`Insufficient funds. Need ₹${cost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.`);
                if (quantityInput) quantityInput.focus();
                return;
            }
        } else if (currentTransaction.action === 'sell') {
            const ownedShares = player.portfolio?.[selectedCompany] || 0;
            if (quantity > ownedShares) {
                alert(`Insufficient shares. Trying to sell ${quantity.toLocaleString()}, own ${ownedShares.toLocaleString()}.`);
                if (quantityInput) quantityInput.focus();
                return;
            }
        }
        
        const transactionData = { roomID: currentRoom, company: selectedCompany, quantity: quantity };
        socket.emit(currentTransaction.action === 'buy' ? 'buy' : 'sell', transactionData);
        
        currentTransaction = { action: null, company: null, quantity: null };
        if (companySelect) companySelect.value = '';
        if (quantityInput) quantityInput.value = '';
        if (transactionModal) transactionModal.style.display = 'none';
    });
}

if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
        currentTransaction = { action: null, company: null, quantity: null };
        if (companySelect) companySelect.value = '';
        if (quantityInput) quantityInput.value = '';
        if (transactionModal) transactionModal.style.display = 'none';
    });
}

socket.on('error', ({ message }) => {
    alert('Error: ' + message);
});

function updatePlayerList(players, currentTurnPlayerId) {
    if (!playerListDiv || !players) return;
    const currentPlayer = players.find(p => p.id === socket.id);
    isAdmin = currentPlayer?.isAdmin || false;
    
    playerListDiv.innerHTML = '<h2>Players</h2>' + 
        players.map(p => `
            <div class="player-row ${p.id === currentTurnPlayerId ? 'current-turn' : ''}">
                <div class="player-info">
                    <span class="turn-indicator ${p.id === currentTurnPlayerId ? 'active' : ''}"></span>
                    <span>${p.name}</span>
                    ${p.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
                </div>
                ${isAdmin && p.id !== socket.id ? `
                    <div class="admin-controls">
                        <button class="kick-btn" onclick="kickPlayer('${p.name}')">Kick</button>
                        <button class="admin-btn" onclick="transferAdmin('${p.name}')">Make Admin</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    
    if (startGameBtn && gameScreen) {
        startGameBtn.style.display = (gameScreen.style.display === 'none' && isAdmin) ? 'block' : 'none';
    }
}

function kickPlayer(playerName) {
    if (!isAdmin || !currentRoom) return;
    if (!confirm(`Are you sure you want to kick ${playerName}?`)) return;
    socket.emit('kickPlayer', { roomID: currentRoom, playerName });
}

function transferAdmin(playerName) {
    if (!isAdmin || !currentRoom) return;
    if (!confirm(`Are you sure you want to make ${playerName} the admin?`)) return;
    socket.emit('transferAdmin', { roomID: currentRoom, playerName });
}

socket.on('kicked', () => {
    alert('You have been kicked from the game.');
    clearSession();
    window.location.reload();
});

socket.on('playerList', players => {
    console.log('Player list updated:', players);
    updatePlayerList(players, currentGameState?.state?.currentTurnPlayerId); // Pass current turn ID if available
});

socket.on('gameState', state => {
    if (isRejoining) {
        console.log('[gameState after Rejoin] Received state:', JSON.parse(JSON.stringify(state)));
        isRejoining = false;
    }
    
    console.log('Game state updated:', state);
    currentGameState = state; // Central update
    console.log('[gameState] state.hand BEFORE UI update:', JSON.parse(JSON.stringify(state.hand)));
    const currentPlayer = state.players.find(p => p.id === socket.id);
    
    initialPrices = state.state?.init || {};
    window.companyNames = state.state?.companyNames || {};
    // Store the full company list if available
    if (state.state?.companyList) {
        currentGameState.state.companyList = state.state.companyList; 
    }
    
    // Use the direct boolean flags from the server
    isAdmin = state.isAdmin; 
    isYourTurn = state.isYourTurn;
    
    console.log(`Is Admin: ${isAdmin}, Is Your Turn: ${isYourTurn}, Turn Player ID from state.state: ${state.state?.currentTurnPlayerId}`);

    const statePeriod = state.state?.period;
    const stateRound = state.state?.roundNumberInPeriod;
    const lastLogEntry = priceLog.length > 0 ? priceLog[priceLog.length - 1] : null;
    const shouldLog = !lastLogEntry || 
                      statePeriod > lastLogEntry.period || 
                      (statePeriod === lastLogEntry.period && stateRound === 1 && lastLogEntry.round !== 1);

    if (shouldLog && state.state?.prices && statePeriod !== undefined && stateRound !== undefined) {
        console.log(`[gameState] Logging prices for Period ${statePeriod}, Round ${stateRound}`);
        priceLog.push({
            period: statePeriod,
            round: stateRound,
            prices: { ...state.state.prices }
        });
        updatePriceLogTable();
    }

    if (lobbyScreen && gameScreen && lobbyScreen.style.display !== 'none') {
        lobbyScreen.style.display = 'none';
        gameScreen.style.display = 'block';
    }
    
    updateUI(state); // Call the main UI update function
});

function updateUI(state) { // Renamed from gameState to state for consistency with call
    if (!state || !state.players || !state.state || !state.state.prices || !window.companyNames) {
      console.error("GameState for UI update is incomplete:", state);
      return;
    }
    const currentPlayer = state.players.find(p => p.id === socket.id);
    if (!currentPlayer) {
        console.warn("Current player not in game state. Forcing lobby.");
        if (lobbyScreen) lobbyScreen.style.display = 'flex';
        if (gameScreen) gameScreen.style.display = 'none';
        return;
    }

    isYourTurn = state.state.currentTurnPlayerId === socket.id; // Re-affirm here

    // Update period and turn info
    const currentPeriod = state.state?.period || 1;
    const roundNumber = state.state?.roundNumberInPeriod || 1;
    const turnPlayer = state.players.find(p => p.id === state.state.currentTurnPlayerId);
    const turnPlayerName = turnPlayer ? turnPlayer.name : 'Waiting...';

    if (periodSpan) {
        let turnText = `${turnPlayerName}: Turn ${roundNumber} of 3`;
        if (turnPlayerName === 'Waiting...') {
            turnText = `Round ${roundNumber} | Waiting for player...`;
        }

        if (isYourTurn && turnPlayerName !== 'Waiting...') {
            // Highlight if it's your turn
            periodSpan.innerHTML = `Period ${currentPeriod} | <span class="your-turn-indicator-text">${turnPlayerName} (Your Turn)</span>: Turn ${roundNumber} of 3`;
        } else {
            periodSpan.textContent = `Period ${currentPeriod} | ${turnText}`;
        }
    }
     if (cashSpan) cashSpan.textContent = `Cash: ₹${currentPlayer.cash.toLocaleString()}`;

    // --- Debug Log for Button State ---
    console.log(`[updateUI - Button State Check] Player: ${currentPlayer.name}, isYourTurn: ${isYourTurn}, transactionsRemaining: ${currentPlayer.transactionsRemaining}`);
    // --- End Debug Log ---

    // Update action buttons
    if (buyBtn) buyBtn.disabled = !isYourTurn || currentPlayer.transactionsRemaining <= 0;
    if (sellBtn) sellBtn.disabled = !isYourTurn || currentPlayer.transactionsRemaining <= 0;
    if (shortSellBtn) shortSellBtn.disabled = !isYourTurn || currentPlayer.transactionsRemaining <= 0;
    if (passBtn) passBtn.disabled = !isYourTurn;
    if (endTurnBtn) endTurnBtn.disabled = !isYourTurn;
    
    updatePlayerHand(state.hand || []); // Use state.hand directly
    updatePlayerList(state.players, state.state.currentTurnPlayerId);
    updateLeaderboard(state.players, state.state.prices);
    // updateMarketBoard(state.state.prices); // This should be called by p5 sketch via window data
    updateAdminControls();
    updateHandSummaryDisplay(); // Update based on handDeltas
    updatePriceLogTable();
    updateGeneralRightsOffers(currentPlayer);
    updateOpenShortsPanel(currentPlayer, state.state.prices, currentGameState.state.companyList || []); // Pass companyList

    // Make data available for p5.js sketch
    if (typeof window.updateP5Data === 'function') {
        window.updateP5Data({
            marketPrices: state.state.prices,
            companyData: currentGameState.state.companyList || [], // Pass companyList to p5
            playerHand: state.hand || [], // Use state.hand directly
            playerPortfolio: currentPlayer.portfolio || {},
            activeSuspensions: state.state.activeSuspensions || {}
        });
    }
}


socket.on('dealCards', cards => { // This might be redundant if hand is in gameState
    window.playerHand = cards;
    // renderHand(); // renderHand is now empty
    updateHandSummaryDisplay(); // Recalculate deltas if hand changes standalone
    if (typeof redraw === 'function') redraw(); // Tell p5 to redraw
});

socket.on('activityLog', (logEntry) => {
    console.log('[client.js] Received activityLog event:', logEntry);
    if (!activityLogContent) return;

    if (logEntry.period !== undefined && logEntry.round !== undefined) {
        if (lastLoggedPeriodForSeparator !== null && logEntry.period !== lastLoggedPeriodForSeparator) {
            const periodSeparator = document.createElement('div');
            periodSeparator.className = 'log-separator period-separator';
            periodSeparator.textContent = `--- New Period ${logEntry.period} ---`;
            activityLogContent.insertBefore(periodSeparator, activityLogContent.firstChild);
            lastLoggedRoundForSeparator = null;
        } else if (lastLoggedRoundForSeparator !== null && logEntry.round !== lastLoggedRoundForSeparator && logEntry.period === lastLoggedPeriodForSeparator) {
            const roundSeparator = document.createElement('div');
            roundSeparator.className = 'log-separator round-separator';
            roundSeparator.textContent = `--- Round ${logEntry.round} ---`;
            activityLogContent.insertBefore(roundSeparator, activityLogContent.firstChild);
        }
        lastLoggedPeriodForSeparator = logEntry.period;
        lastLoggedRoundForSeparator = logEntry.round;
    } else if (logEntry.actionType === 'PERIOD_RESOLVED' || logEntry.actionType === 'START_GAME') {
        if (activityLogContent.firstChild) {
             const hr = document.createElement('hr');
             hr.className = 'log-separator-system';
             activityLogContent.insertBefore(hr, activityLogContent.firstChild);
        }
        lastLoggedPeriodForSeparator = null;
        lastLoggedRoundForSeparator = null;
    }

    const logElement = document.createElement('div');
    logElement.classList.add('log-entry');
    let message = ``;
    if (logEntry.period !== undefined && logEntry.round !== undefined && logEntry.actionType !== 'PERIOD_RESOLVED' && logEntry.actionType !== 'START_GAME') { // Don't prefix system messages
        message += `P${logEntry.period} R${logEntry.round} - `;
    }
    if (logEntry.playerName) {
        message += `${logEntry.playerName}: `;
    }
    message += logEntry.details || 'An action occurred.';
    logElement.textContent = message;
    activityLogContent.insertBefore(logElement, activityLogContent.firstChild);
    if (activityLogContent.children.length > 100) {
        activityLogContent.removeChild(activityLogContent.lastChild);
    }
});

function playWindfall(sub) { // This seems to be for an older modal structure. Review if still needed.
    const card = window.playerHand.find(c => c.type === 'windfall' && c.sub === sub);
    if (card && currentRoom) {
        socket.emit('windfall', { roomID: currentRoom, card });
    }
    // modal.style.display = 'none'; // 'modal' is not defined here. This needs to point to the specific windfall modal if any.
}

let handDeltas = {};
function calculateHandDeltas(hand) {
    const deltas = {};
    if (!hand || hand.length === 0) return deltas;
    hand.forEach(card => {
        if (card && card.type === 'price' && card.company && typeof card.change === 'number') {
            deltas[card.company] = (deltas[card.company] || 0) + card.change;
        }
    });
    return deltas;
}

function updateHandSummaryDisplay() {
    if (!currentGameState || !currentGameState.state || !currentGameState.state.prices) {
        if(handSummaryDiv) handSummaryDiv.style.display = 'none';
        return;
    }
    if (Object.keys(handDeltas).length === 0) {
        if(handSummaryDiv) handSummaryDiv.style.display = 'none';
        return;
    }
    let summaryHtml = '<table class="hand-impact-table"><thead><tr><th>Company</th><th>Net Impact</th></tr></thead><tbody>';
    const sortedCompanies = Object.keys(handDeltas).sort((a, b) => getCompanyName(a).localeCompare(getCompanyName(b)));
    let hasVisibleEntries = false;
    sortedCompanies.forEach(companyId => {
        const delta = handDeltas[companyId];
        if (delta === 0 && Object.keys(handDeltas).length > 1) return;
        hasVisibleEntries = true;
        const sign = delta > 0 ? '+' : '';
        const direction = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'no-change');
        const triangle = delta > 0 ? '▲' : (delta < 0 ? '▼' : '-');
        let percentageImpactText = '';
        const currentPrice = currentGameState.state.prices[companyId];
        if (currentPrice !== undefined && currentPrice > 0) {
            percentageImpactText = ` (${((delta / currentPrice) * 100).toFixed(1)}%)`;
        } else if (delta !== 0) {
            percentageImpactText = ' (N/A%)';
        }
        summaryHtml += `<tr><td>${getCompanyName(companyId)}</td><td class="summary-${direction}">${triangle} ${sign}${delta}${percentageImpactText}</td></tr>`;
    });
    summaryHtml += '</tbody></table>';

    if (hasVisibleEntries && handSummaryContentDiv && handSummaryDiv) {
        handSummaryContentDiv.innerHTML = summaryHtml;
        handSummaryDiv.style.display = 'block';
    } else if (handSummaryDiv) {
        handSummaryDiv.style.display = 'none';
    }
}

function updatePlayerHand(hand) {
    console.log('[updatePlayerHand] Received hand:', JSON.parse(JSON.stringify(hand)));
    window.playerHand = hand || [];
    handDeltas = calculateHandDeltas(window.playerHand);
    updateHandSummaryDisplay();
    if (typeof redraw === 'function') redraw(); // Tell p5 to redraw if hand changes
}

// function renderHand() { /* Intentionally empty, p5 handles rendering */ }

function updateLeaderboard(players, prices) {
    if (!leaderboardContent || !players || !prices) return;
    const playerStats = players.map(player => {
        const portfolioValue = Object.entries(player.portfolio || {}).reduce((total, [companyId, shares]) => {
            return total + (shares * (prices[companyId] || 0));
        }, 0);
        const totalValue = portfolioValue + player.cash;
        return { name: player.name, cash: player.cash, portfolio: player.portfolio || {}, totalValue, portfolioValue, id: player.id };
    }).sort((a, b) => b.totalValue - a.totalValue);

    leaderboardContent.innerHTML = playerStats.map(player => {
        const portfolioEntries = Object.entries(player.portfolio)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)))
            .map(([companyId, shares]) => {
                if (shares <= 0) return '';
                const shareValue = shares * (prices[companyId] || 0);
                return `<div class="portfolio-entry"><span class="company-name">${getCompanyName(companyId)}</span><span class="share-count">${shares.toLocaleString()} shares</span><span class="share-value">₹${shareValue.toLocaleString()}</span></div>`;
            }).join('');
        return `<div class="player-stats"><div class="player-name">${player.name}</div><div class="player-cash">Cash: ₹${player.cash.toLocaleString()}</div><div class="player-portfolio">${portfolioEntries || '<div class="no-shares">No shares owned</div>'}</div><div class="portfolio-summary"><div>Portfolio Value: ₹${player.portfolioValue.toLocaleString()}</div><div class="player-total">Total Value: ₹${player.totalValue.toLocaleString()}</div></div></div>`;
    }).join('');
}

// mousePressed is defined in sketch.js where p5 context exists

function handleCardClick(card, index) {
    if (!card || index === undefined) {
        console.error("handleCardClick: Invalid card or index.", card, index);
        return;
    }
    console.log(`[handleCardClick] Called for card type: ${card.type}, sub: ${card.sub}, index: ${index}, played: ${card.played}`);

    if ((transactionModal && transactionModal.style.display === 'flex') ||
        (rightsIssueModal && rightsIssueModal.style.display === 'flex') ||
        (generalRightsIssueModal && generalRightsIssueModal.style.display === 'flex') ||
        (shortSellModal && shortSellModal.style.display === 'block') // Check new modal too
    ) {
        console.log('Card click ignored: a modal is open.');
        return;
    }
    if (!isYourTurn) {
        console.log('Card click ignored: not your turn.');
        return;
    }
    if (card.played) {
        console.log('Card click ignored: card already played this turn.');
        return;
    }

    cardBeingPlayed = { ...card, indexInHand: index }; // Store index in hand
    if (card.type === 'windfall') {
        if (card.sub === 'RIGHTS') {
            showRightsIssueModal();
        } else {
            socket.emit('windfall', { roomID: currentRoom, card: cardBeingPlayed }); // Send card with its original index if server needs it
            // Optimistically mark played
            if (window.playerHand[index]) window.playerHand[index].played = true;
            if (typeof redraw === 'function') redraw();
        }
    } else if (card.type === 'price') {
        // For price cards, usually they are played automatically or trigger a choice.
        // For now, let's assume playing a price card means you intend to use its effect.
        // Server should handle the price change. Client just informs server.
        // If price card itself should trigger a buy/sell choice for THAT company, that's more complex.
        // Let's assume playing a price card directly applies its effect.
        console.log(`Price card (${card.company}) played. Emitting 'playPriceCard'.`);
        socket.emit('playPriceCard', { roomID: currentRoom, card: cardBeingPlayed });
        if (window.playerHand[index]) window.playerHand[index].played = true;
        if (typeof redraw === 'function') redraw();

    } else {
        console.log(`Unhandled card type (${card.type}) clicked.`);
    }
}

function updateAdminControls() {
    if (advancePeriodBtn) {
        advancePeriodBtn.style.display = isAdmin ? 'block' : 'none';
    }
}

if (advancePeriodBtn) {
    advancePeriodBtn.addEventListener('click', () => {
        if (!isAdmin || !currentRoom) return;
        if (confirm('Are you sure you want to advance to the next period?')) {
            socket.emit('advancePeriod', { roomID: currentRoom });
        }
    });
}

function handleRightsCompanyChange() {
    if (desiredRightsSharesInput) desiredRightsSharesInput.value = '';
    updateRightsIssueInfo();
}

function handleDesiredRightsInputChange() {
    updateRightsIssueInfo();
}

function showRightsIssueModal() {
    if (!cardBeingPlayed || cardBeingPlayed.type !== 'windfall' || cardBeingPlayed.sub !== 'RIGHTS') {
        return;
    }
    const player = currentGameState?.players.find(p => p.id === socket.id);
    if (!player || !player.portfolio || Object.keys(player.portfolio).length === 0 || Object.keys(initialPrices).length === 0) {
        alert('Cannot issue rights: missing player data, portfolio, or initial prices.');
        cardBeingPlayed = null;
        return;
    }

    if (rightsCompanySelect) {
        rightsCompanySelect.innerHTML = '<option value="" disabled selected>Select company</option>';
        const ownedCompanies = Object.entries(player.portfolio)
            .filter(([_, shares]) => shares > 0)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)));
        if (ownedCompanies.length === 0) {
            alert('You don\'t own any shares to issue rights for.');
            cardBeingPlayed = null;
            return;
        }
        ownedCompanies.forEach(([companyId]) => {
            const option = document.createElement('option');
            option.value = companyId;
            option.textContent = getCompanyName(companyId);
            rightsCompanySelect.appendChild(option);
        });
        rightsCompanySelect.removeEventListener('change', handleRightsCompanyChange);
        rightsCompanySelect.addEventListener('change', handleRightsCompanyChange);
    }
    if (desiredRightsSharesInput) {
        desiredRightsSharesInput.value = '';
        desiredRightsSharesInput.removeEventListener('input', handleDesiredRightsInputChange);
        desiredRightsSharesInput.addEventListener('input', handleDesiredRightsInputChange);
    }
    if (rightsCostInfoDiv) rightsCostInfoDiv.innerHTML = 'Please select a company and enter desired shares.';
    updateRightsIssueInfo();
    if (rightsIssueModal) rightsIssueModal.style.display = 'flex';
}

function updateRightsIssueInfo() {
    if (!rightsCompanySelect || !rightsCostInfoDiv) return;
    const selectedCompany = rightsCompanySelect.value;
    const player = currentGameState?.players.find(p => p.id === socket.id);

    if (!selectedCompany || !player || Object.keys(initialPrices).length === 0) {
        rightsCostInfoDiv.innerHTML = 'Please select a company.';
        return;
    }
    const ownedShares = player.portfolio[selectedCompany] || 0;
    const initialPrice = initialPrices[selectedCompany];
    const rightsPricePerShare = Math.ceil(initialPrice / 2);
    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const maxEligibleInLots = Math.floor(maxEligibleRaw / 1000) * 1000;
    let infoHtml = `You own ${ownedShares.toLocaleString()} of ${getCompanyName(selectedCompany)}, eligible for up to <strong>${maxEligibleInLots.toLocaleString()}</strong> rights shares (in lots of 1000).<br>`;
    const desiredSharesStr = desiredRightsSharesInput?.value || '0';
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    if (desiredSharesNum > 0) {
        if (desiredSharesNum > maxEligibleRaw) {
            infoHtml += `<span style="color:red;">Warning: Requesting ${desiredSharesNum.toLocaleString()}, eligible for ${maxEligibleInLots.toLocaleString()} (effective).</span><br>`;
        }
        const actualOfferedShares = Math.floor(desiredSharesNum / 1000) * 1000;
        if (actualOfferedShares > 0) {
            const totalCost = actualOfferedShares * rightsPricePerShare;
            infoHtml += `Requesting ${desiredSharesNum.toLocaleString()} means <strong>${actualOfferedShares.toLocaleString()}</strong> shares offered (multiples of 1000).<br>`;
            infoHtml += `Cost: ${actualOfferedShares.toLocaleString()} × ₹${rightsPricePerShare.toLocaleString()}/share = <strong>₹${totalCost.toLocaleString()}</strong>.<br>`;
            if (player.cash < totalCost) {
                infoHtml += `<span style="color:red;">Insufficient cash (₹${player.cash.toLocaleString()}).</span>`;
            }
        } else {
            infoHtml += `<span style="color:orange;">Requesting ${desiredSharesNum.toLocaleString()} shares = <strong>0</strong> actual shares (1000 multiple rule).</span>`;
        }
    } else {
        infoHtml += 'Enter desired shares (e.g., 1000, 2000).';
    }
    rightsCostInfoDiv.innerHTML = infoHtml;
}

if (confirmRightsIssueBtn) {
    confirmRightsIssueBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const selectedCompany = rightsCompanySelect?.value;
        if (!selectedCompany) {
            alert('Please select a company.');
            return;
        }
        if (!cardBeingPlayed || cardBeingPlayed.type !== 'windfall' || cardBeingPlayed.sub !== 'RIGHTS') {
            if (rightsIssueModal) rightsIssueModal.style.display = 'none';
            cardBeingPlayed = null;
            return;
        }
        const player = currentGameState?.players.find(p => p.id === socket.id);
        if (!player) {
            alert('Player data not found.');
            return;
        }
        const ownedShares = player.portfolio[selectedCompany] || 0;
        const initialPrice = initialPrices[selectedCompany];
        if (initialPrice === undefined) {
            alert('Initial price for selected company not found.');
            return;
        }
        const rightsPricePerShare = Math.ceil(initialPrice / 2);
        const maxEligibleRaw = Math.floor(ownedShares / 2);
        const desiredSharesStr = desiredRightsSharesInput?.value || '0';
        const desiredSharesNum = parseInt(desiredSharesStr) || 0;

        if (desiredSharesNum <= 0) {
            alert('Please enter a positive number of shares.');
            if (desiredRightsSharesInput) desiredRightsSharesInput.focus();
            return;
        }
        if (desiredSharesNum > maxEligibleRaw) {
            alert(`Requested ${desiredSharesNum.toLocaleString()}, eligible for max ${maxEligibleRaw.toLocaleString()}.`);
            if (desiredRightsSharesInput) desiredRightsSharesInput.focus();
            return;
        }
        const clientCalculatedSharesToGrant = Math.floor(desiredSharesNum / 1000) * 1000;
        if (clientCalculatedSharesToGrant <= 0) {
            alert(`Request of ${desiredSharesNum.toLocaleString()} results in 0 shares (1000 multiple rule).`);
            if (desiredRightsSharesInput) desiredRightsSharesInput.focus();
            return;
        }
        const clientCalculatedTotalCost = clientCalculatedSharesToGrant * rightsPricePerShare;
        if (player.cash < clientCalculatedTotalCost) {
            alert(`Insufficient cash. Need ₹${clientCalculatedTotalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.`);
            if (desiredRightsSharesInput) desiredRightsSharesInput.focus();
            return;
        }
        socket.emit('windfall', {
            roomID: currentRoom,
            card: { type: cardBeingPlayed.type, sub: cardBeingPlayed.sub, indexInHand: cardBeingPlayed.indexInHand },
            targetCompany: selectedCompany,
            desiredRightsShares: desiredSharesNum
        });
        if (typeof cardBeingPlayed.indexInHand === 'number' && window.playerHand[cardBeingPlayed.indexInHand]) {
             window.playerHand[cardBeingPlayed.indexInHand].played = true;
             if (typeof redraw === 'function') redraw();
        }
        if (rightsIssueModal) rightsIssueModal.style.display = 'none';
        if (rightsCompanySelect) rightsCompanySelect.value = '';
        if (desiredRightsSharesInput) desiredRightsSharesInput.value = '';
        if (rightsCostInfoDiv) rightsCostInfoDiv.innerHTML = '';
        cardBeingPlayed = null;
    });
}

if (cancelRightsIssueBtn) {
    cancelRightsIssueBtn.addEventListener('click', () => {
        if (rightsIssueModal) rightsIssueModal.style.display = 'none';
        if (rightsCompanySelect) rightsCompanySelect.value = '';
        if (rightsCostInfoDiv) rightsCostInfoDiv.innerHTML = '';
        cardBeingPlayed = null;
    });
}

let currentGeneralRightsTarget = null;
function updateGeneralRightsCostInfo() {
    if (!currentGeneralRightsTarget || !currentGeneralRightsTarget.companyId || !currentGeneralRightsTarget.offerDetails || !generalRightsCostInfoDiv) return;
    const { companyId, offerDetails } = currentGeneralRightsTarget;
    const player = currentGameState?.players.find(p => p.id === socket.id);
    if (!player) {
        generalRightsCostInfoDiv.innerHTML = 'Player data missing.';
        return;
    }
    const ownedShares = player.portfolio[companyId] || 0;
    const rightsPricePerShare = offerDetails.rightsPricePerShare;
    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const maxEligibleInLots = Math.floor(maxEligibleRaw / 1000) * 1000;
    let infoHtml = `You own ${ownedShares.toLocaleString()} of ${getCompanyName(companyId)}, eligible for up to <strong>${maxEligibleInLots.toLocaleString()}</strong> rights shares (1000s lots).<br>`;
    const desiredSharesStr = desiredGeneralRightsSharesInput?.value || '0';
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    if (desiredSharesNum > 0) {
        if (desiredSharesNum > maxEligibleRaw) {
            infoHtml += `<span style="color:red;">Warning: Requesting ${desiredSharesNum.toLocaleString()}, eligible for ${maxEligibleInLots.toLocaleString()} (effective).</span><br>`;
        }
        const actualOfferedShares = Math.floor(desiredSharesNum / 1000) * 1000;
        if (actualOfferedShares > 0) {
            const totalCost = actualOfferedShares * rightsPricePerShare;
            infoHtml += `Requesting ${desiredSharesNum.toLocaleString()} = <strong>${actualOfferedShares.toLocaleString()}</strong> shares offered.<br>`;
            infoHtml += `Cost: ${actualOfferedShares.toLocaleString()} × ₹${rightsPricePerShare.toLocaleString()}/share = <strong>₹${totalCost.toLocaleString()}</strong>.<br>`;
            if (player.cash < totalCost) {
                infoHtml += `<span style="color:red;">Insufficient cash (₹${player.cash.toLocaleString()}).</span>`;
            }
        } else {
            infoHtml += `<span style="color:orange;">Request for ${desiredSharesNum.toLocaleString()} = <strong>0</strong> actual shares (1000s rule).</span>`;
        }
    } else {
        infoHtml += 'Enter desired shares (e.g., 1000, 2000).';
    }
    generalRightsCostInfoDiv.innerHTML = infoHtml;
}

function handleGeneralDesiredRightsInputChange() {
    updateGeneralRightsCostInfo();
}

function showGeneralRightsIssueModal(companyId, offerDetails) {
    currentGeneralRightsTarget = { companyId, offerDetails };
    if (generalRightsCompanyNameSpan) generalRightsCompanyNameSpan.textContent = getCompanyName(companyId);
    if (generalRightsPricePerShareSpan) generalRightsPricePerShareSpan.textContent = `₹${offerDetails.rightsPricePerShare.toLocaleString()}`;
    if (desiredGeneralRightsSharesInput) {
        desiredGeneralRightsSharesInput.value = '';
        desiredGeneralRightsSharesInput.removeEventListener('input', handleGeneralDesiredRightsInputChange);
        desiredGeneralRightsSharesInput.addEventListener('input', handleGeneralDesiredRightsInputChange);
    }
    if (generalRightsCostInfoDiv) generalRightsCostInfoDiv.innerHTML = 'Please enter desired shares.';
    updateGeneralRightsCostInfo();
    if (generalRightsIssueModal) generalRightsIssueModal.style.display = 'flex';
}

if (confirmGeneralRightsIssueBtn) {
    confirmGeneralRightsIssueBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!currentGeneralRightsTarget || !currentGeneralRightsTarget.companyId || !currentGeneralRightsTarget.offerDetails) return;
        const { companyId, offerDetails } = currentGeneralRightsTarget;
        const player = currentGameState?.players.find(p => p.id === socket.id);
        if (!player) return;
        const ownedShares = player.portfolio[companyId] || 0;
        const rightsPricePerShare = offerDetails.rightsPricePerShare;
        const maxEligibleRaw = Math.floor(ownedShares / 2);
        const desiredSharesStr = desiredGeneralRightsSharesInput?.value || '0';
        const desiredSharesNum = parseInt(desiredSharesStr) || 0;

        if (desiredSharesNum <= 0) {
            alert('Please enter a positive number of shares.');
            if (desiredGeneralRightsSharesInput) desiredGeneralRightsSharesInput.focus();
            return;
        }
        if (desiredSharesNum > maxEligibleRaw) {
            alert(`Requested ${desiredSharesNum.toLocaleString()}, eligible for max ${maxEligibleRaw.toLocaleString()}.`);
            if (desiredGeneralRightsSharesInput) desiredGeneralRightsSharesInput.focus();
            return;
        }
        const actualSharesToGrant = Math.floor(desiredSharesNum / 1000) * 1000;
        if (actualSharesToGrant <= 0) {
            alert(`Request for ${desiredSharesNum.toLocaleString()} results in 0 shares (1000s rule).`);
            if (desiredGeneralRightsSharesInput) desiredGeneralRightsSharesInput.focus();
            return;
        }
        const totalCost = actualSharesToGrant * rightsPricePerShare;
        if (player.cash < totalCost) {
            alert(`Insufficient cash. Need ₹${totalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.`);
            if (desiredGeneralRightsSharesInput) desiredGeneralRightsSharesInput.focus();
            return;
        }
        socket.emit('exerciseGeneralRights', { roomID: currentRoom, targetCompany: companyId, desiredRightsShares: desiredSharesNum });
        if (generalRightsIssueModal) generalRightsIssueModal.style.display = 'none';
        if (desiredGeneralRightsSharesInput) desiredGeneralRightsSharesInput.value = '';
        if (generalRightsCostInfoDiv) generalRightsCostInfoDiv.innerHTML = '';
        currentGeneralRightsTarget = null;
    });
}

if (cancelGeneralRightsIssueBtn) {
    cancelGeneralRightsIssueBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (generalRightsIssueModal) generalRightsIssueModal.style.display = 'none';
        if (desiredGeneralRightsSharesInput) desiredGeneralRightsSharesInput.value = '';
        if (generalRightsCostInfoDiv) generalRightsCostInfoDiv.innerHTML = '';
        currentGeneralRightsTarget = null;
    });
}

function updatePriceLogTable() {
    if (!priceLogTableHeader || !priceLogTableBody || Object.keys(window.companyNames).length === 0) return;
    while (priceLogTableHeader.children.length > 1) {
        priceLogTableHeader.removeChild(priceLogTableHeader.lastChild);
    }
    const companyIds = Object.keys(window.companyNames).sort((a,b) => getCompanyName(a).localeCompare(getCompanyName(b)));
    companyIds.forEach(id => {
        const th = document.createElement('th');
        th.textContent = getCompanyName(id);
        priceLogTableHeader.appendChild(th);
    });
    priceLogTableBody.innerHTML = '';
    priceLog.forEach((logEntry, index) => {
        const currentPrices = logEntry.prices;
        const tr = document.createElement('tr');
        const tdPeriod = document.createElement('td');
        tdPeriod.textContent = `${logEntry.period}`;
        tr.appendChild(tdPeriod);
        companyIds.forEach(id => {
            const tdPrice = document.createElement('td');
            const currentPrice = currentPrices[id] !== undefined ? currentPrices[id] : '--';
            let changeText = '';
            let changeClass = 'price-no-change';
            const comparePrices = index === 0 ? initialPrices : priceLog[index - 1].prices;
            const previousPrice = comparePrices[id];
            if (previousPrice !== undefined && currentPrice !== '--') {
                const change = currentPrice - previousPrice;
                if (Math.abs(change) > 0.01) {
                    const percentChange = previousPrice > 0 ? (change / previousPrice) * 100 : 0;
                    changeText = `(${(change > 0 ? '+' : '')}${percentChange.toFixed(1)}%)`;
                    changeClass = change > 0 ? 'price-up' : 'price-down';
                }
            }
            tdPrice.innerHTML = `₹${currentPrice} <span class="price-change ${changeClass}">${changeText}</span>`;
            tr.appendChild(tdPrice);
        });
        priceLogTableBody.appendChild(tr);
    });
}

function updateTransactionCostInfo() {
    if (!costInfoDiv || !currentGameState) { // Ensure currentGameState is available
      if (costInfoDiv) costInfoDiv.innerHTML = "Waiting for game data...";
      if (confirmTransactionBtn) confirmTransactionBtn.disabled = true;
      return;
    }
    const selectedCompany = currentTransaction.company;
    const quantityStr = quantityInput?.value || '0';
    const quantityNum = parseInt(quantityStr);
    const player = currentGameState.players.find(p => p.id === socket.id);

    if (!player) {
        costInfoDiv.innerHTML = "Waiting for player data...";
        if (confirmTransactionBtn) confirmTransactionBtn.disabled = true;
        return;
    }
    let additionalInfo = "";
    if (selectedCompany) {
        const currentPrice = currentGameState.state.prices[selectedCompany];
        const ownedShares = player.portfolio?.[selectedCompany] || 0;
        if (currentTransaction.action === 'buy') {
            additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">Own: ${ownedShares.toLocaleString()}. Max: ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()}. Cash: ₹${player.cash.toLocaleString()}</p>`;
            if (currentPrice !== undefined && currentPrice > 0) {
                const maxAffordableRaw = Math.floor(player.cash / currentPrice);
                const maxAffordableInLots = Math.floor(maxAffordableRaw / 1000) * 1000;
                const canBuyUpToLimit = MAX_SHARES_PER_COMPANY_CLIENT - ownedShares;
                const effectiveMaxBuy = Math.min(maxAffordableInLots, canBuyUpToLimit);
                if (effectiveMaxBuy > 0) {
                    additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">Affordable: <strong>${effectiveMaxBuy.toLocaleString()}</strong> shares.</p>`;
                } else if (canBuyUpToLimit <= 0) {
                    additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">Max share limit reached.</p>`;
                } else {
                    additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">Not enough cash for any lots.</p>`;
                }
            }
        } else if (currentTransaction.action === 'sell') {
            additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">Own: <strong>${ownedShares.toLocaleString()}</strong> of ${getCompanyName(selectedCompany)}.</p>`;
        }

        if (quantityNum > 0 && quantityNum % 1000 === 0 && currentPrice !== undefined) {
            const totalValue = currentPrice * quantityNum;
            let mainMessage = "";
            let canProceed = true;
            if (currentTransaction.action === 'buy') {
                mainMessage = `Cost: ₹${totalValue.toLocaleString()}`;
                if (player.cash < totalValue) { additionalInfo += `<p class="text-danger">Not enough cash.</p>`; canProceed = false; }
                if (ownedShares + quantityNum > MAX_SHARES_PER_COMPANY_CLIENT) { additionalInfo += `<p class="text-danger">Exceeds max shares.</p>`; canProceed = false; }
            } else if (currentTransaction.action === 'sell') {
                mainMessage = `Proceeds: ₹${totalValue.toLocaleString()}`;
                if (ownedShares < quantityNum) { additionalInfo += `<p class="text-danger">Not enough shares.</p>`; canProceed = false; }
            }
            costInfoDiv.innerHTML = additionalInfo + mainMessage;
            if (confirmTransactionBtn) confirmTransactionBtn.disabled = !canProceed;
        } else if (quantityNum > 0 && quantityNum % 1000 !== 0) {
            costInfoDiv.innerHTML = additionalInfo + '<p class="text-danger">Quantity must be in 1000s.</p>';
            if (confirmTransactionBtn) confirmTransactionBtn.disabled = true;
        } else {
            costInfoDiv.innerHTML = additionalInfo + 'Enter quantity (1000s).';
            if (confirmTransactionBtn) confirmTransactionBtn.disabled = true;
        }
    } else {
        if (currentTransaction.action === 'buy') {
            additionalInfo = `<p style="font-size: 0.9em; margin-bottom: 5px;">Cash: ₹${player.cash.toLocaleString()}. Purchases in 1000s.</p><p>Select company.</p>`;
        } else if (currentTransaction.action === 'sell') {
            additionalInfo = '<p style="font-size: 0.9em; margin-bottom: 5px;">Select company to sell.</p>';
        }
        costInfoDiv.innerHTML = additionalInfo;
        if (confirmTransactionBtn) confirmTransactionBtn.disabled = true;
    }
}

function updateGeneralRightsOffers(currentPlayer) {
    if (!generalRightsOffersPanel || !generalRightsListDiv || !currentGameState || !currentPlayer) return;
    generalRightsListDiv.innerHTML = '';
    const activeOffers = currentGameState.state?.activeRightsOffers || {};
    const currentPlayerPortfolio = currentPlayer.portfolio || {};
    let canShowPanel = false;

    if (isYourTurn && Object.keys(activeOffers).length > 0) {
        for (const companyId in activeOffers) {
            if (activeOffers.hasOwnProperty(companyId)) {
                const offerDetails = activeOffers[companyId];
                if (offerDetails.roundAnnounced === currentGameState.state.roundNumberInPeriod &&
                    (currentPlayerPortfolio[companyId] || 0) > 0 &&
                    offerDetails.initiatedByPlayerId !== currentPlayer.id) { // Check initiatedByPlayerId
                    const button = document.createElement('button');
                    button.className = 'general-rights-btn button-small';
                    button.textContent = `${getCompanyName(companyId)} (Offer @ ₹${offerDetails.rightsPricePerShare}/share)`;
                    button.dataset.companyId = companyId;
                    button.addEventListener('click', () => showGeneralRightsIssueModal(companyId, offerDetails));
                    generalRightsListDiv.appendChild(button);
                    canShowPanel = true;
                }
            }
        }
    }
    generalRightsOffersPanel.style.display = canShowPanel ? 'block' : 'none';
}


// --- Short Selling Functions ---
function openShortSellModal() {
    if (!currentGameState || !currentGameState.state || !currentGameState.state.prices || !currentGameState.state.companyList || !currentGameState.players) {
        alert('Game data is not yet fully loaded. Please wait a moment and try again.');
        return;
    }
    const player = currentGameState.players.find(p => p.id === socket.id);
    if (!player || !shortCompanySelect || !shortQuantityInput || !shortSellModal) { 
        console.error('[openShortSellModal] Crucial DOM element for short sell modal is missing or player data not found.');
        if (!shortSellModal) {
            alert('Error: The short sell dialog components could not be found.');
        }
        return;
    }

    shortCompanySelect.innerHTML = '<option value="" disabled selected>Select a company</option>';
    currentGameState.state.companyList.forEach(company => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = `${getCompanyName(company.id)} (${company.id})`; 
        shortCompanySelect.appendChild(option);
    });

    shortQuantityInput.value = '';
    if (shortSellTransactionsRemaining) {
        shortSellTransactionsRemaining.textContent = player.transactionsRemaining;
    }
    updateShortSellInfoDiv();
    shortSellModal.style.display = 'block'; 
}

function updateShortSellInfoDiv() {
    if (!currentGameState || !currentGameState.players || !shortCompanySelect || !shortSellInfoDiv || !confirmShortSellBtn) {
        if (shortSellInfoDiv) shortSellInfoDiv.textContent = 'Error: Core elements missing for short sell info.';
        if (confirmShortSellBtn) confirmShortSellBtn.disabled = true;
        return;
    }
    console.log('[updateShortSellInfoDiv] currentGameState:', JSON.parse(JSON.stringify(currentGameState)));

    const player = currentGameState.players.find(p => p.id === socket.id);
    const companySymbol = shortCompanySelect.value; 
    const quantity = parseInt(shortQuantityInput.value) || 0;

    if (!player) {
        shortSellInfoDiv.textContent = 'Player data not available.';
        confirmShortSellBtn.disabled = true;
        return;
    }
    if (!companySymbol) {
        shortSellInfoDiv.textContent = 'Please select a company.';
        confirmShortSellBtn.disabled = true;
        if(shortSellTransactionsRemaining) {
            shortSellTransactionsRemaining.textContent = player.transactionsRemaining;
        }
        return;
    }

    console.log(`[updateShortSellInfoDiv] Selected company ID (from select): ${companySymbol}`);
    console.log('[updateShortSellInfoDiv] currentGameState.state.prices:', JSON.parse(JSON.stringify(currentGameState.state.prices)));
    console.log('[updateShortSellInfoDiv] currentGameState.state.companyList:', JSON.parse(JSON.stringify(currentGameState.state.companyList)));

    const currentPrice = currentGameState.state.prices ? currentGameState.state.prices[companySymbol] : undefined;
    const companyDetails = currentGameState.state.companyList ? currentGameState.state.companyList.find(c => c.id === companySymbol) : null;
    
    console.log(`[updateShortSellInfoDiv] For company ID ${companySymbol} - currentPrice: ${currentPrice}, companyDetails:`, companyDetails ? JSON.parse(JSON.stringify(companyDetails)) : null);

    if (currentPrice === undefined || !companyDetails) {
        shortSellInfoDiv.textContent = 'Market data not yet available or company details missing.';
        console.warn('[updateShortSellInfoDiv] Market data missing! Price or details undefined.');
        confirmShortSellBtn.disabled = true;
        return;
    }
    
    let infoText = `Selected: ${getCompanyName(companySymbol)}. Price: ₹${currentPrice.toLocaleString()}.<br>`;
    const existingShort = player.shortPositions && player.shortPositions[companySymbol];
    if (existingShort) {
        infoText += `Currently short ${existingShort.quantity.toLocaleString()} @ avg ₹${existingShort.priceOpened.toLocaleString()}.<br>`;
        infoText += `Adding to position. Est. Proceeds for this lot: ₹${(quantity * currentPrice).toLocaleString()}.<br>`;
    } else {
        infoText += `Est. Proceeds: ₹${(quantity * currentPrice).toLocaleString()}.<br>`;
    }
    if(shortSellTransactionsRemaining) {
        shortSellTransactionsRemaining.textContent = player.transactionsRemaining;
    }


    let canShort = true;
    let reason = "";
    if (quantity <= 0 || quantity % 1000 !== 0) {
        canShort = false;
        reason = "Qty must be positive multiple of 1000.";
    } else if (player.transactionsRemaining <= 0) {
        canShort = false;
        reason = "No transactions left.";
    }

    if (!canShort) {
        infoText += `<span style="color: red;">Cannot short: ${reason}</span>`;
    }
    shortSellInfoDiv.innerHTML = infoText;
    confirmShortSellBtn.disabled = !canShort;
}

function handleConfirmShortSell() {
    if (!currentGameState || !currentGameState.players || !shortCompanySelect || !shortQuantityInput || !shortSellModal) {
        alert('Short sell cannot be confirmed: essential game data or UI elements are missing.');
        return;
    }
    console.log('[handleConfirmShortSell] currentGameState:', JSON.parse(JSON.stringify(currentGameState)));

    const player = currentGameState.players.find(p => p.id === socket.id);
    const companySymbol = shortCompanySelect.value; 
    const quantity = parseInt(shortQuantityInput.value);

    console.log(`[handleConfirmShortSell] Attempting short sell. Player: ${player?.name}, Company ID: ${companySymbol}, Quantity: ${quantity}`);
    console.log('[handleConfirmShortSell] currentGameState.state.prices:', JSON.parse(JSON.stringify(currentGameState.state.prices)));
    console.log('[handleConfirmShortSell] currentGameState.state.companyList:', JSON.parse(JSON.stringify(currentGameState.state.companyList)));

    const currentPriceValidation = currentGameState.state.prices ? currentGameState.state.prices[companySymbol] : undefined;
    const companyDetailsValidation = currentGameState.state.companyList ? currentGameState.state.companyList.find(c => c.id === companySymbol) : null;

    console.log(`[handleConfirmShortSell] Validation - Price: ${currentPriceValidation}, Details:`, companyDetailsValidation ? JSON.parse(JSON.stringify(companyDetailsValidation)) : null);

    // Re-validate before emitting - removed the check for existing short position
    if (player && companySymbol && quantity > 0 && quantity % 1000 === 0 &&
        player.transactionsRemaining > 0 && 
        currentPriceValidation !== undefined && companyDetailsValidation !== null) { 
        socket.emit('initiateShortSell', { roomID: currentRoom, companyId: companySymbol, quantity }); 
        shortSellModal.style.display = 'none';
    } else {
        alert('Invalid short sell attempt. Please check details.');
        console.warn('[handleConfirmShortSell] Validation failed. Details:',
            {
                playerExists: !!player,
                companySymbolValid: !!companySymbol,
                quantityValid: quantity > 0 && quantity % 1000 === 0,
                transactionsRemaining: player?.transactionsRemaining > 0,
                priceAvailable: currentPriceValidation !== undefined,
                companyDetailsAvailable: companyDetailsValidation !== null
            }
        );
        updateShortSellInfoDiv(); 
    }
}

function updateOpenShortsPanel(player, marketPrices, companiesStaticData) {
    if (!openShortsPanel || !openShortsContent || !noOpenShortsMsg || !player || !marketPrices || !companiesStaticData) {
        if(openShortsPanel) openShortsPanel.style.display = 'none';
        if(noOpenShortsMsg) noOpenShortsMsg.style.display = 'block';
        return;
    }

    if (!player.shortPositions || Object.keys(player.shortPositions).length === 0) {
        openShortsContent.innerHTML = '';
        noOpenShortsMsg.style.display = 'block';
        openShortsPanel.style.display = 'none';
        return;
    }

    openShortsPanel.style.display = 'block';
    noOpenShortsMsg.style.display = 'none';
    openShortsContent.innerHTML = '';

    for (const symbol in player.shortPositions) {
        const position = player.shortPositions[symbol];
        // Ensure companiesStaticData is an array and find is safe
        const companyDetails = Array.isArray(companiesStaticData) ? companiesStaticData.find(c => c.id === symbol) : null;
        const currentMarketPrice = marketPrices[symbol]; // Simpler access, assuming marketPrices is { SYMBOL: price }

        if (!companyDetails) {
            console.warn(`[updateOpenShortsPanel] Company details not found for symbol: ${symbol}`);
            continue;
        }

        let unrealizedPnlText = "N/A";
        if (currentMarketPrice !== undefined) { // Check if price is defined
            const unrealizedPnl = (position.priceOpened - currentMarketPrice) * position.quantity;
            const pnlClass = unrealizedPnl >= 0 ? 'positive-pnl' : 'negative-pnl';
            unrealizedPnlText = `<span class="${pnlClass}">₹${unrealizedPnl.toLocaleString()}</span>`;
        }

        const item = document.createElement('div');
        item.classList.add('short-position-item');
        item.style.padding = '5px 0';
        item.style.borderBottom = '1px solid #eee';
        item.innerHTML = `
            <strong>${getCompanyName(symbol)} (${symbol})</strong><br>
            Qty: ${position.quantity.toLocaleString()} | Opened @: ₹${position.priceOpened.toLocaleString()}<br>
            Curr. Price: ₹${currentMarketPrice !== undefined ? currentMarketPrice.toLocaleString() : 'N/A'} | P&L: ${unrealizedPnlText}<br>
            <button class="cover-short-btn game-button" data-symbol="${symbol}" style="padding: 3px 6px; font-size: 0.8em; margin-top: 3px;">Cover Short</button>
        `;
        
        const coverBtn = item.querySelector('.cover-short-btn');
        if (coverBtn) {
            coverBtn.addEventListener('click', (e) => {
                const sym = e.target.dataset.symbol;
                const priceToCoverAt = marketPrices[sym]; // Simpler access
                if (priceToCoverAt === undefined) {
                    alert(`Cannot determine current price for ${getCompanyName(sym)}.`);
                    return;
                }
                const costToCover = priceToCoverAt * position.quantity;
                if (player.cash < costToCover) {
                    alert(`Insufficient cash for ${getCompanyName(sym)}. Need ₹${costToCover.toLocaleString()}, have ₹${player.cash.toLocaleString()}.`);
                    return;
                }
                if (player.transactionsRemaining <= 0) {
                    alert('No transactions remaining to cover this short.');
                    return;
                }
                socket.emit('coverShortPosition', { roomID: currentRoom, companyId: sym });
            });
        }
        openShortsContent.appendChild(item);
    }
}

// Short Selling Event Listeners (ensure elements exist)
if (shortSellBtn) shortSellBtn.addEventListener('click', openShortSellModal);
if (confirmShortSellBtn) confirmShortSellBtn.addEventListener('click', handleConfirmShortSell);
if (cancelShortSellBtn) cancelShortSellBtn.addEventListener('click', () => { if(shortSellModal) shortSellModal.style.display = 'none'; });
if (shortCompanySelect) shortCompanySelect.addEventListener('change', updateShortSellInfoDiv);
if (shortQuantityInput) shortQuantityInput.addEventListener('input', updateShortSellInfoDiv);


// Modal closing logic
window.onclick = function(event) {
    if (transactionModal && event.target == transactionModal) {
        // Call cancelBtn's click handler to ensure state is reset
        if (cancelBtn) cancelBtn.click(); 
    }
    if (rightsIssueModal && event.target == rightsIssueModal) {
        if (cancelRightsIssueBtn) cancelRightsIssueBtn.click();
    }
    if (generalRightsIssueModal && event.target == generalRightsIssueModal) {
        if (cancelGeneralRightsIssueBtn) cancelGeneralRightsIssueBtn.click();
    }
    if (shortSellModal && event.target == shortSellModal) { // Added short sell modal
        if (cancelShortSellBtn) cancelShortSellBtn.click();
    }
}; 