// const SOCKET_SERVER = 'https://wiggly-alder-cornet.glitch.me'; // FOR GLITCH DEPLOYMENT
const SOCKET_SERVER = 'http://localhost:3000'; // FOR LOCAL TESTING
// const SOCKET_SERVER = 'ws://remote-stock-exchange-backend.glitch.me'; // Example if using glitch

// Initialize socket connection
const socket = io();

// Game Constants
const SHARE_LOTS = [500, 1000, 5000, 10000];
const MAX_SHARES_PER_COMPANY_CLIENT = 200000; // *** ADD SHARE LIMIT CONSTANT (Client) ***

// Track connection state
let isConnected = false;
let currentRoom = null;
let gameState = null;
let initialPrices = {}; // *** STORE INITIAL PRICES ***
let isAdmin = false;
let isYourTurn = false;
// Define playerHand on the window object so it's accessible from sketch.js
window.playerHand = [];
window.companyNames = {}; // *** STORE COMPANY NAMES ***
let priceLog = []; // *** STORE PRICE LOG DATA ***

// Track modal state
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
    // Session expires after 24 hours
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('gameSession');
        return null;
    }
    return { roomID, playerName };
}

// Clear session
function clearSession() {
    localStorage.removeItem('gameSession');
}

// Make active suspensions available globally for sketch.js
// REMOVE window.activeSuspensions = {};

// DOM Elements
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
// const windfallBtn = document.getElementById('windfall'); // Removed
const passBtn = document.getElementById('pass');
const endTurnBtn = document.getElementById('endTurn');
const handDiv = document.getElementById('hand');
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
// REMOVE const suspendModal = document.getElementById('suspend-modal');
// REMOVE const suspendCompanySelect = document.getElementById('suspendCompanySelect');
// REMOVE const confirmSuspendBtn = document.getElementById('confirmSuspend');
// REMOVE const cancelSuspendBtn = document.getElementById('cancelSuspend');
const rightsIssueModal = document.getElementById('rights-issue-modal');
let rightsCompanySelect = document.getElementById('rightsCompanySelect');
const rightsCostInfoDiv = document.getElementById('rights-cost-info');
const confirmRightsIssueBtn = document.getElementById('confirmRightsIssue');
const cancelRightsIssueBtn = document.getElementById('cancelRightsIssue');
let desiredRightsSharesInput = document.getElementById('desiredRightsSharesInput');
const priceLogTable = document.getElementById('price-log-table');
const priceLogTableHeader = priceLogTable?.querySelector('thead tr');
const priceLogTableBody = priceLogTable?.querySelector('tbody');

// *** NEW DOM Elements for General Rights Offers ***
const generalRightsOffersPanel = document.getElementById('general-rights-offers-panel');
const generalRightsListDiv = document.getElementById('general-rights-list');
const generalRightsIssueModal = document.getElementById('general-rights-issue-modal');
const generalRightsCompanyNameSpan = document.getElementById('generalRightsCompanyName');
const generalRightsPricePerShareSpan = document.getElementById('generalRightsPricePerShare');
const desiredGeneralRightsSharesInput = document.getElementById('desiredGeneralRightsSharesInput');
const generalRightsCostInfoDiv = document.getElementById('general-rights-cost-info');
const confirmGeneralRightsIssueBtn = document.getElementById('confirmGeneralRightsIssue');
const cancelGeneralRightsIssueBtn = document.getElementById('cancelGeneralRightsIssue');

// *** NEW DOM Elements for Activity Log ***
const activityLogPanel = document.getElementById('activity-log-panel');
const activityLogContent = document.getElementById('activity-log-content');

// Hide modals by default
transactionModal.style.display = 'none';
// REMOVE suspendModal.style.display = 'none';
rightsIssueModal.style.display = 'none';

// Transaction state
let currentTransaction = {
    action: null,
    company: null,
    quantity: null
};

let currentAction = null;

// Add a flag to track rejoin
let isRejoining = false;

let currentPlayerName = null; // Store player name for potential display
let currentSessionToken = null; // Store the current active session token

// Variables to track the last logged period and round for visual separation
let lastLoggedPeriodForSeparator = null;
let lastLoggedRoundForSeparator = null;

// Store the card being played (needed for suspend)
let cardBeingPlayed = null;

// Helper function to get company name from ID
function getCompanyName(id) {
    return window.companyNames[id] || id; // Fallback to ID if name not found
}

// Socket connection handling
socket.on('connect', () => {
    console.log('[connect] Connected to server with socket ID:', socket.id);
    isConnected = true;
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;

    // --- NEW: Attempt Rejoin with Token from URL FIRST --- 
const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('session');
    currentSessionToken = tokenFromUrl || localStorage.getItem('zephyrSessionToken'); // Fallback to localStorage

    if (currentSessionToken) {
        console.log('[connect] Found session token, attempting to rejoin:', currentSessionToken);
        isRejoining = true;
        socket.emit('rejoinWithToken', currentSessionToken, response => {
            console.log('[rejoinWithToken callback] Response:', response);
            if (response.error) {
                alert('Failed to rejoin session: ' + response.error);
                // Clear bad token from URL and localStorage
                localStorage.removeItem('zephyrSessionToken');
                history.replaceState(null, '', window.location.pathname); // Clear query params
                currentSessionToken = null;
                isRejoining = false;
                // Potentially force a full UI reset or reload to lobby state
                lobbyScreen.style.display = 'flex'; // Or some other reset logic
                gameScreen.style.display = 'none';
                return;
            }
            currentRoom = response.roomID;
            currentPlayerName = response.playerName; // Server sends this back for confirmation
            localStorage.setItem('zephyrSessionToken', currentSessionToken); // Re-affirm in localStorage
            console.log('[rejoinWithToken callback] Rejoin successful. Room:', currentRoom, 'Player:', currentPlayerName);
            // isRejoining flag will be cleared by gameState handler
        });
    } else {
        console.log('[connect] No session token found in URL or localStorage. Fresh connection.');
        // Ensure lobby is visible if no session to rejoin
        lobbyScreen.style.display = 'flex';
        gameScreen.style.display = 'none';
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    isConnected = false;
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
});

// Event Listeners
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
            roomCodeInput.value = roomID;
            alert(`Room created! Room code: ${roomID}`);
            
            if (!playerNameInput.value) {
                playerNameInput.value = 'Player 1';
            }
            currentPlayerName = playerNameInput.value.trim(); // Store current player name
            
            // Auto-join after creating
            socket.emit('joinRoom', { roomID, name: currentPlayerName }, response => {
                console.log('Auto-join response after create:', response);
                if (response.error) {
                    alert(response.error);
                    return;
                }
                if (response.sessionToken) {
                    currentSessionToken = response.sessionToken;
                    localStorage.setItem('zephyrSessionToken', currentSessionToken);
                    // Update URL
                    const url = new URL(window.location.href);
                    url.searchParams.set('room', roomID);
                    url.searchParams.set('session', currentSessionToken);
                    history.pushState({roomID, playerName: currentPlayerName, token: currentSessionToken}, ``, url.toString());
                    console.log('[joinRoom] Updated URL with session token:', url.toString());
                }
                startGameBtn.style.display = 'block'; // Assuming first player is admin
            });
        } else {
            alert('Failed to create room. Please try again.');
        }
    });
};

joinRoomBtn.onclick = () => {
    if (!isConnected) {
        alert('Not connected to server. Please refresh the page.');
        return;
    }

    const roomID = roomCodeInput.value.toUpperCase();
    const name = playerNameInput.value.trim();
    
    if (!roomID || !name) {
        alert('Please enter both room code and your name.');
        return;
    }
    currentPlayerName = name; // Store current player name

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
            localStorage.setItem('zephyrSessionToken', currentSessionToken);
            // Update URL
            const url = new URL(window.location.href);
            url.searchParams.set('room', roomID);
            url.searchParams.set('session', currentSessionToken);
            history.pushState({roomID, playerName: name, token: currentSessionToken}, ``, url.toString());
            console.log('[joinRoom] Updated URL with session token:', url.toString());
        }
        currentRoom = roomID;
        startGameBtn.style.display = 'block'; // Might need adjustment based on actual admin status from server
    });
};

startGameBtn.onclick = () => {
    if (!currentRoom) {
        alert('Not in a room!');
        return;
    }
    console.log('Starting game in room:', currentRoom);
    socket.emit('startGame', { roomID: currentRoom });
};

buyBtn.addEventListener('click', () => showTransactionModal('buy'));
sellBtn.addEventListener('click', () => showTransactionModal('sell'));
passBtn.addEventListener('click', () => socket.emit('pass', { roomID: currentRoom }));
endTurnBtn.addEventListener('click', () => socket.emit('endTurn', { roomID: currentRoom }));

// Removed windfallBtn event listener
// windfallBtn.addEventListener('click', () => { ... });

function showTransactionModal(action) {
    console.log('[showTransactionModal] Opening modal for action:', action);
    
    currentTransaction = {
        action: action,
        company: null, // Explicitly null here
        quantity: null
    };
    console.log('[showTransactionModal] currentTransaction RESET. Company is:', currentTransaction.company);
    
    // Reset transaction state
    currentTransaction = {
        action: action,
        company: null,
        quantity: null
    };
    
    // --- SET MODAL TITLE ---
    const transactionTypeTitle = document.getElementById('transaction-type');
    if (transactionTypeTitle) {
        transactionTypeTitle.textContent = action === 'buy' ? 'Buy Shares' : 'Sell Shares';
    }
    
    // Reset select elements
    companySelect.innerHTML = '<option value="" disabled selected>Select a company</option>';
    quantityInput.value = '';
    
    const player = gameState.players.find(p => p.id === socket.id);
    console.log('Current player state:', {
        cash: player.cash,
        portfolio: player.portfolio
    });
    
    if (action === 'sell') {
        if (!player || !player.portfolio || Object.keys(player.portfolio).length === 0) {
            alert('You don\'t own any shares to sell');
            return;
        }
        
        // Only show companies that the player actually owns shares in
        const ownedCompanies = Object.entries(player.portfolio)
            .filter(([_, shares]) => shares > 0)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)));
            
        console.log('Owned companies for sell:', ownedCompanies);
        
        if (ownedCompanies.length === 0) {
            alert('You don\'t own any shares to sell');
            return;
        }
        
        ownedCompanies.forEach(([companyId, shares]) => {
            const price = gameState.state.prices[companyId];
            const option = document.createElement('option');
            option.value = companyId;
            option.textContent = `${getCompanyName(companyId)} (Owned: ${shares.toLocaleString()} @ ₹${price})`;
            companySelect.appendChild(option);
        });
    } else {
        // For buy, show all companies with their current prices
        Object.entries(gameState.state.prices)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)))
            .forEach(([companyId, price]) => {
                const option = document.createElement('option');
                option.value = companyId;
                option.textContent = `${getCompanyName(companyId)} (₹${price})`;
                companySelect.appendChild(option);
            });
    }
    
    transactionModal.style.display = 'flex';
    console.log('[showTransactionModal] BEFORE initial call to updateTransactionCostInfo. currentTransaction.company:', currentTransaction.company);
    updateTransactionCostInfo();
}

// Event Listeners
companySelect.addEventListener('change', (event) => {
    event.preventDefault();
    const newlySelectedCompanyId = event.target.value;
    console.log(`[CompanySelect Change] Event triggered. Listener instance: ${Math.random().toString(36).substring(7)}. newlySelectedCompanyId:`, newlySelectedCompanyId);
    
    if (!newlySelectedCompanyId) {
        console.log('[CompanySelect Change] No company ID selected, returning.');
        return;
    }
    
    currentTransaction.company = newlySelectedCompanyId;
    console.log('[CompanySelect Change] currentTransaction.company SET TO:', currentTransaction.company);
    currentTransaction.quantity = null;
    quantityInput.value = '';
    
    console.log('[CompanySelect Change] About to call updateTransactionCostInfo()');
    updateTransactionCostInfo();
});

quantityInput.addEventListener('input', (event) => {
    const quantity = parseInt(event.target.value);
    currentTransaction.quantity = isNaN(quantity) ? null : quantity; 
    console.log('Quantity input change:', { value: event.target.value, stateQty: currentTransaction.quantity });
    updateTransactionCostInfo();
});

confirmTransactionBtn.addEventListener('click', () => {
    const selectedCompany = companySelect.value;
    // Read from input field
    const rawQuantity = quantityInput.value;
    const quantity = parseInt(rawQuantity);

    console.log('Confirm button clicked. Company:', selectedCompany, 'Raw Qty:', rawQuantity);
    
    // --- CLIENT-SIDE VALIDATION --- 
    if (!selectedCompany) {
        alert('Please select a company.');
        return;
    }

    if (isNaN(quantity) || !Number.isInteger(quantity) || quantity <= 0 || quantity % 1000 !== 0) {
        alert('Please enter a quantity that is a positive multiple of 1000.');
        quantityInput.focus(); // Focus the input for correction
        return;
    }

    // Check affordability / ownership based on current game state
    const player = gameState?.players.find(p => p.id === socket.id);
    const price = gameState?.state?.prices[selectedCompany];
    if (!player || price === undefined) {
        alert('Cannot verify transaction validity. Game state missing.');
        return;
    }

    // *** CLIENT-SIDE SHARE LIMIT VALIDATION (for BUY action) ***
    if (currentTransaction.action === 'buy') {
        const currentOwnedShares = player.portfolio ? (player.portfolio[selectedCompany] || 0) : 0;
        if (currentOwnedShares + quantity > MAX_SHARES_PER_COMPANY_CLIENT) {
            const canBuy = MAX_SHARES_PER_COMPANY_CLIENT - currentOwnedShares;
            let alertMessage = `Cannot buy ${quantity.toLocaleString()} shares. This would exceed the ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()} share limit for ${getCompanyName(selectedCompany)}.`;
            if (canBuy > 0) {
                alertMessage += ` You can buy up to ${canBuy.toLocaleString()} more shares.`;
            } else {
                alertMessage += ` You already own the maximum allowed.`;
            }
            alert(alertMessage);
            quantityInput.focus();
            return;
        }
    }
    // *** END CLIENT-SIDE SHARE LIMIT VALIDATION ***

    if (currentTransaction.action === 'buy') {
        const cost = quantity * price;
        if (cost > player.cash) {
            alert(`Insufficient funds. You need ₹${cost.toLocaleString()} but only have ₹${player.cash.toLocaleString()}.`);
            quantityInput.focus();
            return;
        }
    } else if (currentTransaction.action === 'sell') {
        const ownedShares = player.portfolio ? (player.portfolio[selectedCompany] || 0) : 0;
        if (quantity > ownedShares) {
            alert(`Insufficient shares. You are trying to sell ${quantity.toLocaleString()} but only own ${ownedShares.toLocaleString()} of ${selectedCompany}.`);
            quantityInput.focus();
            return;
        }
    }
    // --- END CLIENT-SIDE VALIDATION ---
    
    const transactionData = {
        roomID: currentRoom,
        company: selectedCompany,
        quantity: quantity // Use validated quantity
    };
    
    console.log('Sending transaction:', {
        action: currentTransaction.action,
        data: transactionData
    });

    if (currentTransaction.action === 'buy') {
        socket.emit('buy', transactionData);
    } else if (currentTransaction.action === 'sell') {
        socket.emit('sell', transactionData);
    }
    
    // Reset state and close modal
    currentTransaction = { action: null, company: null, quantity: null };
    companySelect.value = '';
    quantityInput.value = ''; // Clear input
    transactionModal.style.display = 'none';
});

cancelBtn.addEventListener('click', () => {
    // Reset state and close modal
    currentTransaction = { action: null, company: null, quantity: null };
    companySelect.value = '';
    quantityInput.value = ''; // Clear input
    transactionModal.style.display = 'none';
});

// Add error handling for failed transactions
socket.on('error', ({ message }) => {
    alert(message);
});

function updatePlayerList(players, currentTurnPlayerId) {
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
    
    startGameBtn.style.display = (gameScreen.style.display === 'none' && isAdmin) ? 'block' : 'none';
}

function kickPlayer(playerName) {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to kick ${playerName}?`)) return;
    socket.emit('kickPlayer', { roomID: currentRoom, playerName });
}

function transferAdmin(playerName) {
    if (!isAdmin) return;
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
    updatePlayerList(players, null);
});

socket.on('gameState', state => {
    if (isRejoining) {
        console.log('[gameState after Rejoin] Received state:', JSON.parse(JSON.stringify(state))); // Log deep copy
        isRejoining = false; // Clear the flag after processing the first state
    } else {
        // Optional: Log non-rejoin state updates differently if needed
        // console.log('[gameState update] Received state:', state);
    }
    
    console.log('Game state updated:', state);
    const currentPlayer = state.players.find(p => p.id === socket.id);
    console.log('Current player portfolio (from currentPlayer.portfolio):', currentPlayer?.portfolio);
    gameState = state;
    initialPrices = state.state?.init || {}; // *** STORE INITIAL PRICES ***
    window.companyNames = state.state?.companyNames || {}; // *** STORE COMPANY NAMES ***
    isAdmin = state.isAdmin; 
    isYourTurn = state.isYourTurn; 
    console.log(`Is Admin: ${isAdmin}, Is Your Turn: ${isYourTurn}, Turn Index: ${state.state?.currentTurn}`);
    
    // Store active suspensions globally for sketch.js
    // REMOVE window.activeSuspensions = state.state?.activeSuspensions || {};
    // REMOVE console.log('[gameState] Updated window.activeSuspensions:', window.activeSuspensions);

    // *** LOG PRICE DATA AT START OF PERIOD ***
    const statePeriod = state.state?.period;
    const stateRound = state.state?.roundNumberInPeriod;
    const lastLogEntry = priceLog.length > 0 ? priceLog[priceLog.length - 1] : null;

    // Log if period changed OR if it's the very first state (log initial prices)
    // OR if it's the start of round 1 in any period > 1 (covers state after period resolution)
    const shouldLog = !lastLogEntry || 
                      statePeriod > lastLogEntry.period || 
                      (statePeriod === lastLogEntry.period && stateRound === 1 && lastLogEntry.round !== 1);

    if (shouldLog && state.state?.prices && statePeriod !== undefined && stateRound !== undefined) {
        console.log(`[gameState] Logging prices for Period ${statePeriod}, Round ${stateRound}`);
        priceLog.push({
            period: statePeriod,
            round: stateRound, // Log which round this state represents (usually 1)
            prices: { ...state.state.prices } // Store a copy
        });
        // Keep only the last N entries? Optional for performance later.
        // const MAX_LOG_ENTRIES = 20;
        // if (priceLog.length > MAX_LOG_ENTRIES) {
        //     priceLog = priceLog.slice(-MAX_LOG_ENTRIES);
        // }
        updatePriceLogTable(); // Update the display
    }

    // Switch screens if necessary (e.g., game start)
    if (lobbyScreen.style.display !== 'none') {
        lobbyScreen.style.display = 'none';
        gameScreen.style.display = 'block';
    }
    
    // --- Update UI --- 
    
    const currentPeriod = state.state?.period || 1; 
    const turnIndex = state.state?.currentTurn;
    const roundNumber = state.state?.roundNumberInPeriod || 1;
    const totalPlayers = state.players?.length || 0;
    
    // Find current player name for display
    let turnPlayerName = 'Waiting...';
    if (turnIndex !== undefined && turnIndex >= 0 && turnIndex < totalPlayers) {
        turnPlayerName = state.players[turnIndex]?.name || 'Unknown Player';
    }
    
    // periodSpan.textContent = `Period ${currentPeriod} | Round ${roundNumber} | Turn: ${turnPlayerName}`;
    // New Format: Period X | PlayerZ: Turn Y of 3
    if (turnPlayerName !== 'Waiting...') {
        periodSpan.textContent = `Period ${currentPeriod} | ${turnPlayerName}: Turn ${roundNumber} of 3`;
    } else {
        periodSpan.textContent = `Period ${currentPeriod} | Round ${roundNumber} | Waiting for player...`;
    }
    
    // Cash Info - Use currentPlayer.cash from the players array
    if (currentPlayer && currentPlayer.cash !== undefined && currentPlayer.cash !== null) {
        cashSpan.textContent = `Cash: ₹${currentPlayer.cash.toLocaleString()}`;
    } else {
        cashSpan.textContent = 'Cash: ₹---'; 
    }
    console.log('Player portfolio after update (from currentPlayer.portfolio):', currentPlayer?.portfolio);

    // Turn Indicator (Top Bar)
    const currentTurnPlayerIndex = state.state?.currentTurn;
    const currentTurnPlayer = (currentTurnPlayerIndex !== undefined && state.players) ? state.players[currentTurnPlayerIndex] : null;
    const infoBar = document.getElementById('info-bar');
    let turnIndicator = infoBar.querySelector('.turn-status');
    if (!turnIndicator) {
        turnIndicator = document.createElement('div');
        turnIndicator.className = 'turn-status';
        infoBar.insertBefore(turnIndicator, infoBar.firstChild);
    }
    
    if (currentTurnPlayer) {
        turnIndicator.textContent = isYourTurn ? 'Your Turn!' : `${currentTurnPlayer.name}'s Turn`;
        turnIndicator.classList.toggle('your-turn', isYourTurn);
    } else {
        turnIndicator.textContent = 'Waiting for player...';
        turnIndicator.classList.remove('your-turn');
    }

    // Action Buttons enabled/disabled based on turn
    buyBtn.disabled = !isYourTurn;
    sellBtn.disabled = !isYourTurn;
    // windfallBtn.disabled = !isYourTurn; // Removed
    passBtn.disabled = !isYourTurn;
    endTurnBtn.disabled = !isYourTurn;

    // Update Player Hand (if provided)
    if (state.hand) {
        updatePlayerHand(state.hand);
    }

    // Update Player List (Highlights current turn)
    updatePlayerList(state.players, currentTurnPlayer?.id);
    
    // Update Leaderboard
    updateLeaderboard(state.players, state.state.prices);
    
    // Update Market Board (p5 sketch)
    updateMarketBoard(state.state.prices);
    
    // Show/Hide Admin Buttons (including new Advance Period button)
    updateAdminControls();

    // *** NEW: Update General Rights Offers Display ***
    if (generalRightsOffersPanel && generalRightsListDiv) { // Ensure elements exist
        generalRightsListDiv.innerHTML = ''; // Clear previous list
        const activeOffers = gameState.state?.activeRightsOffers || {};
        const currentPlayerPortfolio = currentPlayer?.portfolio || {};
        let canShowPanel = false;

        if (isYourTurn && currentPlayer && Object.keys(activeOffers).length > 0) { // Ensure currentPlayer exists
            console.log('[gameState] Checking active rights offers for player:', currentPlayer.name, activeOffers);
            for (const companyId in activeOffers) {
                if (activeOffers.hasOwnProperty(companyId)) {
                    const offerDetails = activeOffers[companyId];
                    // Check if offer is for the current round, player owns shares, AND player did not initiate this offer
                    if (offerDetails.roundAnnounced === gameState.state.roundNumberInPeriod &&
                        (currentPlayerPortfolio[companyId] || 0) > 0 &&
                        offerDetails.initiatedByPlayerName !== currentPlayer.name) { // *** ADDED CHECK ***
                        
                        const button = document.createElement('button');
                        button.className = 'general-rights-btn button-small'; // Add a class for styling
                        button.textContent = `${getCompanyName(companyId)} (Offer @ ₹${offerDetails.rightsPricePerShare}/share)`;
                        button.dataset.companyId = companyId;
                        
                        button.addEventListener('click', () => {
                            // Pass offerDetails directly
                            showGeneralRightsIssueModal(companyId, offerDetails);
                        });
                        generalRightsListDiv.appendChild(button);
                        canShowPanel = true;
                    }
                }
            }
        }

        if (canShowPanel) {
            generalRightsOffersPanel.style.display = 'block';
        } else {
            generalRightsOffersPanel.style.display = 'none';
        }
    } else {
        console.warn('[gameState] General rights offer panel/list elements not found.');
    }
    // *** END NEW: Update General Rights Offers Display ***
});

socket.on('dealCards', cards => {
    window.playerHand = cards;
    renderHand();
});

// *** NEW: Socket listener for activity log messages ***
socket.on('activityLog', (logEntry) => {
    if (!activityLogContent) return; // Guard clause

    // Check for period or round changes to insert separators
    if (logEntry.period !== undefined && logEntry.round !== undefined) {
        if (lastLoggedPeriodForSeparator !== null && logEntry.period !== lastLoggedPeriodForSeparator) {
            const periodSeparator = document.createElement('div');
            periodSeparator.className = 'log-separator period-separator';
            periodSeparator.textContent = `--- New Period ${logEntry.period} ---`;
            activityLogContent.insertBefore(periodSeparator, activityLogContent.firstChild);
            lastLoggedRoundForSeparator = null; // Reset round when period changes
        } else if (lastLoggedRoundForSeparator !== null && logEntry.round !== lastLoggedRoundForSeparator && logEntry.period === lastLoggedPeriodForSeparator) {
            const roundSeparator = document.createElement('div');
            roundSeparator.className = 'log-separator round-separator';
            roundSeparator.textContent = `--- Round ${logEntry.round} ---`;
            activityLogContent.insertBefore(roundSeparator, activityLogContent.firstChild);
        }
        lastLoggedPeriodForSeparator = logEntry.period;
        lastLoggedRoundForSeparator = logEntry.round;
    } else if (logEntry.actionType === 'PERIOD_RESOLVED' || logEntry.actionType === 'START_GAME') {
        // For specific system messages that clear old separators, ensure a line break if needed
        if (activityLogContent.firstChild) { // Add a simple thematic break if there are existing logs
             const hr = document.createElement('hr');
             hr.className = 'log-separator-system';
             activityLogContent.insertBefore(hr, activityLogContent.firstChild);
        }
        // Reset last logged period/round so the next player action correctly starts new separators
        lastLoggedPeriodForSeparator = null;
        lastLoggedRoundForSeparator = null;
    }

    const logElement = document.createElement('div');
    logElement.classList.add('log-entry'); // For potential styling

    // Construct readable log message
    let message = ``;
    // Only add Px Rx if period and round are present in the logEntry
    if (logEntry.period !== undefined && logEntry.round !== undefined) {
        message += `P${logEntry.period} R${logEntry.round} - `;
    }
    if (logEntry.playerName) {
        message += `${logEntry.playerName}: `;
    }
    message += logEntry.details || 'An action occurred.';
    
    logElement.textContent = message;

    // Add to the top of the log
    activityLogContent.insertBefore(logElement, activityLogContent.firstChild);

    // Optional: Limit the number of log entries
    const MAX_LOG_ENTRIES = 100;
    if (activityLogContent.children.length > MAX_LOG_ENTRIES) {
        activityLogContent.removeChild(activityLogContent.lastChild);
    }
});

// Helper Functions
// Removed showWindfallModal function
// function showWindfallModal(cards) { ... }

function playWindfall(sub) {
    const card = window.playerHand.find(c => c.type === 'windfall' && c.sub === sub);
    if (card) {
        socket.emit('windfall', { roomID: currentRoom, card });
    }
    modal.style.display = 'none';
}

let handDeltas = {}; // Store calculated deltas from hand

// Helper to calculate net price changes from cards in hand
function calculateHandDeltas(hand) {
    const deltas = {};
    if (!hand || hand.length === 0) {
        return deltas;
    }
    hand.forEach(card => {
        if (card && card.type === 'price' && card.company && typeof card.change === 'number') {
            deltas[card.company] = (deltas[card.company] || 0) + card.change;
        }
    });
    console.log('[calculateHandDeltas] Calculated deltas:', deltas);
    return deltas;
}

// Function to update the hand summary display
function updateHandSummaryDisplay() {
    if (Object.keys(handDeltas).length === 0) {
        handSummaryDiv.style.display = 'none'; // Hide if no deltas
        return;
    }

    // Create table structure
    let summaryHtml = '<table class="hand-impact-table">';
    summaryHtml += '<thead><tr><th>Company</th><th>Net Impact</th></tr></thead><tbody>';

    // Sort companies alphabetically for consistent display
    const sortedCompanies = Object.keys(handDeltas).sort((a, b) => {
        return (getCompanyName(a) || '').localeCompare(getCompanyName(b) || '');
    });

    let hasVisibleEntries = false;
    sortedCompanies.forEach(companyId => {
        const delta = handDeltas[companyId];
        if (delta === 0 && Object.keys(handDeltas).length > 1) return; // Skip zero deltas if there are other non-zero entries
        
        hasVisibleEntries = true; // Mark that we have at least one entry to show
        const sign = delta > 0 ? '+' : '';
        const direction = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'no-change');
        const triangle = delta > 0 ? '▲' : (delta < 0 ? '▼' : '-'); // Use '-' for no change
        
        summaryHtml += `
            <tr>
                <td>${getCompanyName(companyId)}</td>
                <td class="summary-${direction}">${triangle} ${sign}${delta}</td>
            </tr>
        `;
    });

    summaryHtml += '</tbody></table>';

    if (hasVisibleEntries) {
        handSummaryContentDiv.innerHTML = summaryHtml;
        handSummaryDiv.style.display = 'block'; // Show the panel
    } else {
        handSummaryDiv.style.display = 'none'; // Hide if only zero deltas or no deltas
    }
}

// --- Modify updatePlayerHand --- 
function updatePlayerHand(hand) {
    console.log(`[updatePlayerHand] Called. Received hand:`, hand); 
    window.playerHand = hand || []; // CORRECTED: Directly use hand from server
    console.log(`[updatePlayerHand] window.playerHand updated:`, window.playerHand);

    // Calculate and update deltas
    handDeltas = calculateHandDeltas(window.playerHand);
    updateHandSummaryDisplay(); // Update the HTML display
}

function renderHand() {
    // This function is now empty as we're using p5.js for rendering
    console.warn('[renderHand] This function is intentionally empty. Rendering handled by sketch.js');
}

function updateLeaderboard(players, prices) {
    const playerStats = players.map(player => {
        // Calculate total portfolio value
        const portfolioValue = Object.entries(player.portfolio || {}).reduce((total, [companyId, shares]) => {
            return total + (shares * (prices[companyId] || 0));
        }, 0);
        
        const totalValue = portfolioValue + player.cash;
        
        return {
            name: player.name,
            cash: player.cash,
            portfolio: player.portfolio || {},
            totalValue,
            portfolioValue,
            id: player.id // Keep player ID if needed elsewhere
        };
    }).sort((a, b) => b.totalValue - a.totalValue);

    leaderboardContent.innerHTML = playerStats.map(player => {
        const portfolioEntries = Object.entries(player.portfolio)
            .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)))
            .map(([companyId, shares]) => {
                if (shares <= 0) return ''; // Don't show empty entries
                const shareValue = shares * (prices[companyId] || 0);
                return `
                    <div class="portfolio-entry">
                        <span class="company-name">${getCompanyName(companyId)}</span>
                        <span class="share-count">${shares.toLocaleString()} shares</span>
                        <span class="share-value">₹${shareValue.toLocaleString()}</span>
                    </div>
                `;
            }).join('');

        return `
            <div class="player-stats">
                <div class="player-name">${player.name}</div>
                <div class="player-cash">Cash: ₹${player.cash.toLocaleString()}</div>
                <div class="player-portfolio">
                    ${portfolioEntries || '<div class="no-shares">No shares owned</div>'}
                </div>
                <div class="portfolio-summary">
                    <div>Portfolio Value: ₹${player.portfolioValue.toLocaleString()}</div>
                    <div class="player-total">Total Value: ₹${player.totalValue.toLocaleString()}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Add click handling for cards
function mousePressed() {
    if (!window.playerHand || window.playerHand.length === 0) return;

    const totalWidth = window.playerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING;
    let x = (width - totalWidth) / 2;

    window.playerHand.forEach((card, index) => {
        if (mouseX >= x && mouseX <= x + CARD_WIDTH &&
            mouseY >= CARDS_Y && mouseY <= CARDS_Y + CARD_HEIGHT) {
            handleCardClick(card, index);
        }
        x += CARD_WIDTH + CARD_SPACING;
    });
}

function handleCardClick(card, index) {
    console.log(`[handleCardClick] Called for card type: ${card.type}, sub: ${card.sub}, index: ${index}, played: ${card.played}`);

    // Prevent card actions if any modal is open
    if (transactionModal.style.display === 'flex' 
        // REMOVE || suspendModal.style.display === 'flex'
        || rightsIssueModal.style.display === 'flex'
        || generalRightsIssueModal.style.display === 'flex' ) { // Also check general rights modal
        console.log('Card click ignored: a modal is open.');
        return;
    }

    // Prevent card actions if it's not the player's turn
    if (!isYourTurn) {
        console.log('Card click ignored: not your turn.');
        return;
    }

    // Prevent playing an already played card (client-side visual disabling)
    if (card.played) {
        console.log('Card click ignored: card already played this turn.');
        return;
    }

    // Add detailed logging before windfall check
    console.log(`[handleCardClick] Checking card: type='${card.type}', sub='${card.sub}'`);

    if (card.type === 'windfall') {
        // Special handling for RIGHTS
        console.log(`[handleCardClick] Is windfall. Checking if sub === 'RIGHTS'...`); // Log check
        if (card.sub === 'RIGHTS') {
            console.log(`[handleCardClick] Yes, it is RIGHTS. Calling showRightsIssueModal.`); // Log success path
            cardBeingPlayed = { ...card, index }; 
            showRightsIssueModal();
        } else {
            // Handle other windfalls directly
            console.log(`[handleCardClick] No, it is not RIGHTS (sub='${card.sub}'). Emitting directly.`); // Log else path
            socket.emit('windfall', { roomID: currentRoom, card });
            // Mark card as played client-side for immediate visual feedback
            window.playerHand[index].played = true;
            // Trigger a redraw to show the disabled state
            if (typeof redraw === 'function') {
                redraw();
            }
        }
    } else if (card.type === 'price') {
        console.log(`Price card (${card.company}) clicked. Opening transaction modal.`);
        cardBeingPlayed = card; // Store the card (might not be needed for price, but good practice)
        showTransactionModal('buy'); // Or maybe offer buy/sell choice?
    } else {
        console.log(`Unhandled card type (${card.type}) clicked.`);
    }
}

// Function to manage admin controls visibility
function updateAdminControls() {
    const advancePeriodBtn = document.getElementById('advancePeriod');
    if (advancePeriodBtn) {
        advancePeriodBtn.style.display = isAdmin ? 'block' : 'none';
        // Optional: Disable if period conditions not met (needs server signal)
        // advancePeriodBtn.disabled = !canAdvancePeriod; 
    }
    // Also update visibility of kick/make admin buttons if needed (already handled in updatePlayerList)
}

// Add event listener for the new button
advancePeriodBtn.addEventListener('click', () => {
    if (!isAdmin) {
        console.warn('Advance Period clicked by non-admin');
        return; 
    }
    if (confirm('Are you sure you want to advance to the next period? This will update prices and may deal new cards.')) {
        console.log('Admin advancing period...');
        socket.emit('advancePeriod', { roomID: currentRoom });
    }
});

// Define event handlers for Rights Issue modal inputs
function handleRightsCompanyChange() {
    desiredRightsSharesInput.value = ''; // Clear quantity when company changes
    updateRightsIssueInfo();
}

function handleDesiredRightsInputChange() {
    updateRightsIssueInfo(); // Update on quantity input
}

function showRightsIssueModal() {
    console.log('[showRightsIssueModal] Function called.');
    // cardBeingPlayed should be set by handleCardClick before this is called
    // cardBeingPlayed = window.playerHand.find(c => c.type === 'windfall' && c.sub === 'RIGHTS' && !c.played);

    if (!cardBeingPlayed || cardBeingPlayed.type !== 'windfall' || cardBeingPlayed.sub !== 'RIGHTS') {
        console.error('[showRightsIssueModal] No valid RIGHTS card was stored or passed.');
        // alert('No unplayed Rights Issue card available.');
        return;
    }
    console.log('[showRightsIssueModal] Card being processed:', cardBeingPlayed);

    const player = gameState?.players.find(p => p.id === socket.id);
    if (!player || !player.portfolio || Object.keys(player.portfolio).length === 0) {
        alert('You don\'t own any shares to issue rights for.');
        cardBeingPlayed = null; // Clear if invalid state
        return;
    }
    if (Object.keys(initialPrices).length === 0) {
        alert('Initial price data missing, cannot calculate rights cost.');
        cardBeingPlayed = null; // Clear if invalid state
        return;
    }

    // Ensure we have fresh references to DOM elements if they were somehow lost (though unlikely with const)
    // This is more of a safeguard; direct const references should be fine.
    rightsCompanySelect = document.getElementById('rightsCompanySelect'); 
    desiredRightsSharesInput = document.getElementById('desiredRightsSharesInput');

    rightsCompanySelect.innerHTML = '<option value="" disabled selected>Select company</option>';
    desiredRightsSharesInput.value = '';
    rightsCostInfoDiv.innerHTML = 'Please select a company and enter desired shares.';

    const ownedCompanies = Object.entries(player.portfolio)
        .filter(([_, shares]) => shares > 0)
        .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)));

    if (ownedCompanies.length === 0) {
        alert('You don\'t own any shares to issue rights for (after filter).');
        cardBeingPlayed = null; // Clear if invalid state
        return;
    }

    ownedCompanies.forEach(([companyId]) => {
        const option = document.createElement('option');
        option.value = companyId;
        option.textContent = getCompanyName(companyId);
        rightsCompanySelect.appendChild(option);
    });

    // Remove existing listeners before adding new ones
    rightsCompanySelect.removeEventListener('change', handleRightsCompanyChange);
    desiredRightsSharesInput.removeEventListener('input', handleDesiredRightsInputChange);

    // Add new listeners
    rightsCompanySelect.addEventListener('change', handleRightsCompanyChange);
    desiredRightsSharesInput.addEventListener('input', handleDesiredRightsInputChange);

    updateRightsIssueInfo(); // Initial call to populate info if needed
    rightsIssueModal.style.display = 'flex';
}

// *** NEW HELPER FUNCTION ***
function updateRightsIssueInfo() {
    const selectedCompany = rightsCompanySelect.value;
    const player = gameState?.players.find(p => p.id === socket.id);

    if (!selectedCompany || !player || Object.keys(initialPrices).length === 0) {
        rightsCostInfoDiv.innerHTML = 'Please select a company.';
        return;
    }

    const ownedShares = player.portfolio[selectedCompany] || 0;
    const initialPrice = initialPrices[selectedCompany];
    const rightsPricePerShare = Math.ceil(initialPrice / 2);

    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const maxEligibleInLots = Math.floor(maxEligibleRaw / 1000) * 1000; // Calculate max in 1000s

    let infoHtml = `You own ${ownedShares.toLocaleString()} of ${getCompanyName(selectedCompany)}, eligible for up to <strong>${maxEligibleInLots.toLocaleString()}</strong> rights shares (in lots of 1000).<br>`;

    const desiredSharesStr = desiredRightsSharesInput.value;
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    if (desiredSharesNum > 0) {
        if (desiredSharesNum > maxEligibleRaw) { // Still check against raw for the warning
            infoHtml += `<span style="color:red;">Warning: You are requesting ${desiredSharesNum.toLocaleString()} shares, but are only eligible for ${maxEligibleInLots.toLocaleString()} (effective).</span><br>`;
        }

        const actualOfferedShares = Math.floor(desiredSharesNum / 1000) * 1000;

        if (actualOfferedShares > 0) {
            const totalCost = actualOfferedShares * rightsPricePerShare;
            infoHtml += `Requesting ${desiredSharesNum.toLocaleString()} shares means you'll be offered <strong>${actualOfferedShares.toLocaleString()}</strong> shares (multiples of 1000).<br>`;
            infoHtml += `Cost: ${actualOfferedShares.toLocaleString()} shares × ₹${rightsPricePerShare.toLocaleString()}/share = <strong>₹${totalCost.toLocaleString()}</strong>.<br>`;
            if (player.cash < totalCost) {
                infoHtml += `<span style="color:red;">You have insufficient cash (₹${player.cash.toLocaleString()}) for this amount.</span>`;
            }
        } else {
            infoHtml += `<span style="color:orange;">Requesting ${desiredSharesNum.toLocaleString()} shares will result in <strong>0</strong> actual shares due to the 1000 multiple rule.</span>`;
        }
    } else {
        infoHtml += 'Enter the number of shares (e.g., 1000, 2000) you wish to acquire via rights.';
    }
    rightsCostInfoDiv.innerHTML = infoHtml;
}


// Event Listeners for Rights Issue Modal
confirmRightsIssueBtn.addEventListener('click', (event) => {
    event.stopPropagation(); // Stop event propagation

    const selectedCompany = rightsCompanySelect.value;
    if (!selectedCompany) {
        alert('Please select a company.');
        return;
    }

    if (!cardBeingPlayed || cardBeingPlayed.type !== 'windfall' || cardBeingPlayed.sub !== 'RIGHTS') {
        console.error('Rights Issue confirm clicked, but no valid RIGHTS card was stored.');
        rightsIssueModal.style.display = 'none';
        cardBeingPlayed = null;
        return;
    }

    const player = gameState?.players.find(p => p.id === socket.id);
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

    const desiredSharesStr = desiredRightsSharesInput.value;
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    if (desiredSharesNum <= 0) {
        alert('Please enter a positive number of shares to acquire.');
        desiredRightsSharesInput.focus();
        return;
    }

    if (desiredSharesNum > maxEligibleRaw) {
        alert(`You are requesting ${desiredSharesNum.toLocaleString()} shares, but are only eligible for a maximum of ${maxEligibleRaw.toLocaleString()} raw rights shares for ${getCompanyName(selectedCompany)}.`);
        desiredRightsSharesInput.focus();
        return;
    }

    const clientCalculatedSharesToGrant = Math.floor(desiredSharesNum / 1000) * 1000;

    if (clientCalculatedSharesToGrant <= 0) {
        alert(`Your request of ${desiredSharesNum.toLocaleString()} shares would result in 0 actual shares due to the 1000 multiple rule. Please request at least 1000 eligible shares.`);
        desiredRightsSharesInput.focus();
        return;
    }

    const clientCalculatedTotalCost = clientCalculatedSharesToGrant * rightsPricePerShare;

    // *** DETAILED LOGGING BEFORE CASH CHECK ***
    console.log('[ConfirmRightsIssue] Validation Data:', {
        selectedCompany,
        initialPrice,
        rightsPricePerShare,
        ownedShares,
        maxEligibleRaw,
        desiredSharesStr,
        desiredSharesNum,
        clientCalculatedSharesToGrant,
        clientCalculatedTotalCost,
        playerCash: player.cash
    });

    if (player.cash < clientCalculatedTotalCost) {
        alert(`Insufficient cash. To acquire ${clientCalculatedSharesToGrant.toLocaleString()} shares, you need ₹${clientCalculatedTotalCost.toLocaleString()}, but you only have ₹${player.cash.toLocaleString()}.`);
        desiredRightsSharesInput.focus();
        return;
    }

    console.log(`Confirming Rights Issue for ${selectedCompany}. Desired (raw): ${desiredSharesNum}, Card:`, cardBeingPlayed);
    socket.emit('windfall', {
        roomID: currentRoom,
        card: { type: cardBeingPlayed.type, sub: cardBeingPlayed.sub, index: cardBeingPlayed.index }, // Send clean card data + index
        targetCompany: selectedCompany,
        desiredRightsShares: desiredSharesNum // *** SEND THE RAW DESIRED AMOUNT ***
    });

    // Mark card as played client-side - Ensure cardBeingPlayed.index is correct
    if (typeof cardBeingPlayed.index === 'number' && window.playerHand[cardBeingPlayed.index]) {
         window.playerHand[cardBeingPlayed.index].played = true;
         if (typeof redraw === 'function') { redraw(); }
    } else {
        console.warn('[RightsIssueConfirm] cardBeingPlayed.index was not valid for marking card as played.');
    }

    rightsIssueModal.style.display = 'none';
    rightsCompanySelect.value = '';
    desiredRightsSharesInput.value = '';
    rightsCostInfoDiv.innerHTML = '';
    cardBeingPlayed = null;
});

cancelRightsIssueBtn.addEventListener('click', () => {
    rightsIssueModal.style.display = 'none';
    rightsCompanySelect.value = '';
    rightsCostInfoDiv.innerHTML = '';
    cardBeingPlayed = null;
});

// *** NEW: Functions for General Rights Issue Modal ***
let currentGeneralRightsTarget = null; // To store companyId and offerDetails

function updateGeneralRightsCostInfo() {
    if (!currentGeneralRightsTarget || !currentGeneralRightsTarget.companyId || !currentGeneralRightsTarget.offerDetails) {
        generalRightsCostInfoDiv.innerHTML = 'Error: Company or offer details missing.';
        return;
    }

    const { companyId, offerDetails } = currentGeneralRightsTarget;
    const player = gameState?.players.find(p => p.id === socket.id);

    if (!player || Object.keys(initialPrices).length === 0) { // initialPrices is a bit of a misnomer here, but it holds all initial prices.
        generalRightsCostInfoDiv.innerHTML = 'Player data or initial prices missing.';
        return;
    }

    const ownedShares = player.portfolio[companyId] || 0;
    const rightsPricePerShare = offerDetails.rightsPricePerShare; // Use price from the offer
    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const maxEligibleInLots = Math.floor(maxEligibleRaw / 1000) * 1000; // Calculate max in 1000s

    let infoHtml = `You own ${ownedShares.toLocaleString()} of ${getCompanyName(companyId)}, eligible for up to <strong>${maxEligibleInLots.toLocaleString()}</strong> rights shares (in lots of 1000) under this offer.<br>`;

    const desiredSharesStr = desiredGeneralRightsSharesInput.value;
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    if (desiredSharesNum > 0) {
        if (desiredSharesNum > maxEligibleRaw) { // Still check against raw for the warning
            infoHtml += `<span style="color:red;">Warning: You are requesting ${desiredSharesNum.toLocaleString()} shares, but are only eligible for ${maxEligibleInLots.toLocaleString()} (effective).</span><br>`;
        }
        const actualOfferedShares = Math.floor(desiredSharesNum / 1000) * 1000;
        if (actualOfferedShares > 0) {
            const totalCost = actualOfferedShares * rightsPricePerShare;
            infoHtml += `Requesting ${desiredSharesNum.toLocaleString()} shares means you'll be offered <strong>${actualOfferedShares.toLocaleString()}</strong> shares (multiples of 1000).<br>`;
            infoHtml += `Cost: ${actualOfferedShares.toLocaleString()} shares × ₹${rightsPricePerShare.toLocaleString()}/share = <strong>₹${totalCost.toLocaleString()}</strong>.<br>`;
            if (player.cash < totalCost) {
                infoHtml += `<span style="color:red;">You have insufficient cash (₹${player.cash.toLocaleString()}) for this amount.</span>`;
            }
        } else {
            infoHtml += `<span style="color:orange;">Requesting ${desiredSharesNum.toLocaleString()} shares results in <strong>0</strong> actual shares due to the 1000s rule.</span>`;
        }
    } else {
        infoHtml += 'Enter the number of shares (e.g., 1000, 2000) you wish to acquire.';
    }
    generalRightsCostInfoDiv.innerHTML = infoHtml;
}

function handleGeneralDesiredRightsInputChange() {
    updateGeneralRightsCostInfo();
}

function showGeneralRightsIssueModal(companyId, offerDetails) {
    console.log('[showGeneralRightsIssueModal] Called for:', companyId, offerDetails);
    currentGeneralRightsTarget = { companyId, offerDetails };

    generalRightsCompanyNameSpan.textContent = getCompanyName(companyId);
    generalRightsPricePerShareSpan.textContent = `₹${offerDetails.rightsPricePerShare.toLocaleString()}`;
    desiredGeneralRightsSharesInput.value = '';
    generalRightsCostInfoDiv.innerHTML = 'Please enter desired shares.';

    // Remove existing listener before adding new one to prevent duplicates
    desiredGeneralRightsSharesInput.removeEventListener('input', handleGeneralDesiredRightsInputChange);
    desiredGeneralRightsSharesInput.addEventListener('input', handleGeneralDesiredRightsInputChange);
    
    updateGeneralRightsCostInfo(); // Initial call to set up info based on 0 desired shares
    generalRightsIssueModal.style.display = 'flex';
}

confirmGeneralRightsIssueBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!currentGeneralRightsTarget || !currentGeneralRightsTarget.companyId || !currentGeneralRightsTarget.offerDetails) {
        alert('Error: No active general rights offer selected or details missing.');
        return;
    }

    const { companyId, offerDetails } = currentGeneralRightsTarget;
    const player = gameState?.players.find(p => p.id === socket.id);
    if (!player) {
        alert('Player data not found.');
        return;
    }

    const ownedShares = player.portfolio[companyId] || 0;
    const rightsPricePerShare = offerDetails.rightsPricePerShare;
    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const desiredSharesStr = desiredGeneralRightsSharesInput.value;
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    if (desiredSharesNum <= 0) {
        alert('Please enter a positive number of shares.');
        desiredGeneralRightsSharesInput.focus();
        return;
    }
    if (desiredSharesNum > maxEligibleRaw) {
        alert(`Requested ${desiredSharesNum.toLocaleString()}, but eligible for max ${maxEligibleRaw.toLocaleString()} for ${getCompanyName(companyId)}.`);
        desiredGeneralRightsSharesInput.focus();
        return;
    }
    const actualSharesToGrant = Math.floor(desiredSharesNum / 1000) * 1000;
    if (actualSharesToGrant <= 0) {
        alert(`Request for ${desiredSharesNum.toLocaleString()} results in 0 shares after 1000s rule.`);
        desiredGeneralRightsSharesInput.focus();
        return;
    }
    const totalCost = actualSharesToGrant * rightsPricePerShare;
    if (player.cash < totalCost) {
        alert(`Insufficient cash. Need ₹${totalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.`);
        desiredGeneralRightsSharesInput.focus();
        return;
    }

    socket.emit('exerciseGeneralRights', {
        roomID: currentRoom,
        targetCompany: companyId,
        desiredRightsShares: desiredSharesNum // Server will re-validate and re-calculate actualSharesToGrant
    });

    generalRightsIssueModal.style.display = 'none';
    desiredGeneralRightsSharesInput.value = '';
    generalRightsCostInfoDiv.innerHTML = '';
    currentGeneralRightsTarget = null;
});

cancelGeneralRightsIssueBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    generalRightsIssueModal.style.display = 'none';
    desiredGeneralRightsSharesInput.value = '';
    generalRightsCostInfoDiv.innerHTML = '';
    currentGeneralRightsTarget = null;
});

// *** FUNCTION TO UPDATE PRICE LOG TABLE ***
function updatePriceLogTable() {
    if (!priceLogTableHeader || !priceLogTableBody || Object.keys(window.companyNames).length === 0) {
        // Don't update if elements aren't ready or company names unknown
        return;
    }

    // --- Update Header --- 
    // Clear existing company headers (keep first 'Period' header)
    while (priceLogTableHeader.children.length > 1) {
        priceLogTableHeader.removeChild(priceLogTableHeader.lastChild);
    }
    // Add company names to header (consistent order)
    const companyIds = Object.keys(window.companyNames).sort();
    companyIds.forEach(id => {
        const th = document.createElement('th');
        th.textContent = getCompanyName(id); 
        priceLogTableHeader.appendChild(th);
    });

    // --- Update Body --- 
    priceLogTableBody.innerHTML = ''; // Clear existing rows

    // Use initial prices for the first comparison
    let previousPrices = initialPrices || {}; 

    // Iterate through log entries (newest first is often better, but chronological makes sense here)
    priceLog.forEach((logEntry, index) => {
        const currentPrices = logEntry.prices;
        const tr = document.createElement('tr');

        // Period/Round cell
        const tdPeriod = document.createElement('td');
        // Show only period number for simplicity now
        tdPeriod.textContent = `${logEntry.period}`; 
        // tdPeriod.textContent = `${logEntry.period} | ${logEntry.round}`; 
        tr.appendChild(tdPeriod);

        // Company price cells
        companyIds.forEach(id => {
            const tdPrice = document.createElement('td');
            const currentPrice = currentPrices[id] !== undefined ? currentPrices[id] : '--';
            
            let changeText = '';
            let changeClass = 'price-no-change';

            // Calculate change from the *actual* previous log entry's prices
            // Except for the very first log entry, compare it to initialPrices
            const comparePrices = index === 0 ? initialPrices : priceLog[index - 1].prices;
            const previousPrice = comparePrices[id];

            if (previousPrice !== undefined && currentPrice !== '--') {
                const change = currentPrice - previousPrice;
                const percentChange = previousPrice > 0 ? (change / previousPrice) * 100 : 0;

                if (Math.abs(change) > 0.01) { // Avoid showing 0.0% for tiny float differences
                    changeText = `(${percentChange.toFixed(1)}%)`;
                    changeClass = change > 0 ? 'price-up' : 'price-down';
                }
            }
            
            tdPrice.innerHTML = `₹${currentPrice} <span class="price-change ${changeClass}">${changeText}</span>`;
            tr.appendChild(tdPrice);
        });

        priceLogTableBody.appendChild(tr); // Add row to table
    });
}

// Initial population attempt in case gameState arrives before names?
// Or rely on first update in gameState handler.
// updatePriceLogTable(); 

function updateTransactionCostInfo() {
    const selectedCompany = currentTransaction.company;
    console.log('[updateTransactionCostInfo] CALLED. currentTransaction.company (selectedCompany):', selectedCompany, '| IsTruthy:', Boolean(selectedCompany));

    const quantityStr = quantityInput.value;
    const quantityNum = parseInt(quantityStr);

    const player = gameState?.players.find(p => p.id === socket.id);

    if (!player) {
        costInfoDiv.innerHTML = "Waiting for player data...";
        return;
    }

    let additionalInfo = "";

    if (selectedCompany) {
        console.log('[updateTransactionCostInfo] selectedCompany IS TRUTHY. Proceeding with detailed info.');
        const currentPrice = gameState?.state?.prices[selectedCompany];
        const ownedShares = player?.portfolio[selectedCompany] || 0;
        console.log('[updateTransactionCostInfo] Inside if(selectedCompany): player:', player, 'currentPrice:', currentPrice, 'ownedShares:', ownedShares);

        if (currentTransaction.action === 'buy') {
            additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">You own: ${ownedShares.toLocaleString()} shares. Max per company: ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()}.</p>`;
            if (currentPrice !== undefined && currentPrice > 0) {
                const maxAffordableRaw = Math.floor(player.cash / currentPrice);
                const maxAffordableInLots = Math.floor(maxAffordableRaw / 1000) * 1000;
                const canBuyUpToLimit = MAX_SHARES_PER_COMPANY_CLIENT - ownedShares;
                const effectiveMaxBuy = Math.min(maxAffordableInLots, canBuyUpToLimit);
                console.log('[updateTransactionCostInfo] Buy details: maxAffordableInLots:', maxAffordableInLots, 'canBuyUpToLimit:', canBuyUpToLimit, 'effectiveMaxBuy:', effectiveMaxBuy);
                
                if (effectiveMaxBuy > 0) {
                    const costForEffectiveMax = effectiveMaxBuy * currentPrice;
                    additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">With ₹${player.cash.toLocaleString()}, you could afford up to <strong>${effectiveMaxBuy.toLocaleString()}</strong> shares (cost: ₹${costForEffectiveMax.toLocaleString()}).</p>`;
                } else if (canBuyUpToLimit <=0) {
                     additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">You have reached the maximum share limit for this company.</p>`;
                } else {
                    additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">You do not have enough cash to buy any lots of this share at ₹${currentPrice.toLocaleString()}.</p>`;
                }
            }
        } else if (currentTransaction.action === 'sell') {
            additionalInfo += `<p style="font-size: 0.85em; margin-bottom: 5px;">You own: <strong>${ownedShares.toLocaleString()}</strong> shares of ${getCompanyName(selectedCompany)}.</p>`;
        }


        if (quantityNum > 0 && quantityNum % 1000 === 0 && currentPrice !== undefined) {
            const totalValue = currentPrice * quantityNum;
            let mainMessage = "";
            let canProceed = true;

            if (currentTransaction.action === 'buy') {
                mainMessage = `Total Cost: ₹${totalValue.toLocaleString()}`;
                if (player.cash < totalValue) {
                    additionalInfo += `<p class="text-danger">Not enough cash. Need ₹${totalValue.toLocaleString()}</p>`;
                    canProceed = false;
                }
                if (ownedShares + quantityNum > MAX_SHARES_PER_COMPANY_CLIENT) {
                    additionalInfo += `<p class="text-danger">This purchase would exceed the ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()} share limit.</p>`;
                    canProceed = false;
                }
            } else if (currentTransaction.action === 'sell') {
                mainMessage = `Total Proceeds: ₹${totalValue.toLocaleString()}`;
                if (ownedShares < quantityNum) {
                    additionalInfo += `<p class="text-danger">Not enough shares. You only have ${ownedShares.toLocaleString()}</p>`;
                    canProceed = false;
                }
            }
            console.log('[DEBUG] Setting innerHTML with detailed info + mainMessage (BLOCK 1A)');
            costInfoDiv.innerHTML = additionalInfo + mainMessage;
            confirmTransactionBtn.disabled = !canProceed;
        } else if (quantityNum > 0 && quantityNum % 1000 !== 0) {
            console.log('[DEBUG] Setting innerHTML with detailed info + quantity must be 1000s error (BLOCK 1B)');
            costInfoDiv.innerHTML = additionalInfo + '<p class="text-danger">Quantity must be in multiples of 1,000.</p>';
            confirmTransactionBtn.disabled = true;
        } else {
            console.log('[DEBUG] Setting innerHTML with detailed info + quantity prompt (BLOCK 1C)');
            costInfoDiv.innerHTML = additionalInfo + 'Enter quantity (multiples of 1000).';
            confirmTransactionBtn.disabled = true;
        }
    } else { 
        console.log('[updateTransactionCostInfo] selectedCompany IS FALSY. Setting initial prompt text.');
        if (currentTransaction.action === 'buy') {
            if (player) { // Ensure player data is available
                additionalInfo = `<p style="font-size: 0.9em; margin-bottom: 5px;">Your cash: ₹${player.cash.toLocaleString()}. Purchases in multiples of 1,000.</p>`;
                additionalInfo += '<p style="font-size: 0.9em; margin-bottom: 5px;">Select a company to see specific purchasing options.</p>';
            } else {
                additionalInfo = '<p>Loading player data... Select a company to see purchasing options.</p>';
            }
        } else if (currentTransaction.action === 'sell') {
            additionalInfo = '<p style="font-size: 0.9em; margin-bottom: 5px;">Select a company you own shares in to sell.</p>';
        }
        console.log('[updateTransactionCostInfo] FINAL additionalInfo before setting innerHTML (no company selected branch):', additionalInfo);
        console.log('[DEBUG] Setting innerHTML with initial prompt (BLOCK 2, no company)');
        costInfoDiv.innerHTML = additionalInfo;
        confirmTransactionBtn.disabled = true;
    }
} 