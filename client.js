// Initialize socket connection
// const socket = io();
const SOCKET_SERVER = "https://ujjwalagarwal.com";
const socket = io(SOCKET_SERVER);

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
window.activeSuspensions = {};
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
window.activeSuspensions = {};

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
const confirmBtn = document.getElementById('confirm');
const cancelBtn = document.getElementById('cancel');
const leaderboardContent = document.querySelector('.leaderboard-content');
const advancePeriodBtn = document.getElementById('advancePeriod');
const handSummaryDiv = document.getElementById('hand-summary');
const handSummaryContentDiv = document.getElementById('hand-summary-content');
const suspendModal = document.getElementById('suspend-modal');
const suspendCompanySelect = document.getElementById('suspendCompanySelect');
const confirmSuspendBtn = document.getElementById('confirmSuspend');
const cancelSuspendBtn = document.getElementById('cancelSuspend');
const rightsIssueModal = document.getElementById('rights-issue-modal');
const rightsCompanySelect = document.getElementById('rightsCompanySelect');
const rightsCostInfoDiv = document.getElementById('rights-cost-info');
const confirmRightsIssueBtn = document.getElementById('confirmRightsIssue');
const cancelRightsIssueBtn = document.getElementById('cancelRightsIssue');
const priceLogTable = document.getElementById('price-log-table');
const priceLogTableHeader = priceLogTable?.querySelector('thead tr');
const priceLogTableBody = priceLogTable?.querySelector('tbody');

// Hide modals by default
transactionModal.style.display = 'none';
suspendModal.style.display = 'none';
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
    console.log('Opening modal for action:', action);
    
    // Reset transaction state
    currentTransaction = {
        action: action,
        company: null,
        quantity: null
    };
    
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
}

// Event Listeners
companySelect.addEventListener('change', (event) => {
    event.preventDefault();
    const selectedCompany = event.target.value;
    
    console.log('Company selection change:', {
        previous: currentTransaction.company,
        new: selectedCompany,
        currentState: currentTransaction
    });
    
    if (!selectedCompany) return;
    
    currentTransaction.company = selectedCompany;
    currentTransaction.quantity = null;
    quantityInput.value = '';
    
    // REMOVE call to updateQuantityOptions();
});

quantityInput.addEventListener('input', (event) => {
    const quantity = parseInt(event.target.value);
    // Allow NaN temporarily while typing, validation happens on confirm
    currentTransaction.quantity = isNaN(quantity) ? null : quantity; 
    console.log('Quantity input change:', { value: event.target.value, stateQty: currentTransaction.quantity });
});

confirmBtn.addEventListener('click', () => {
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
    window.activeSuspensions = state.state?.activeSuspensions || {};
    console.log('[gameState] Updated window.activeSuspensions:', window.activeSuspensions);

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
    
    periodSpan.textContent = `Period ${currentPeriod} | Round ${roundNumber} | Turn: ${turnPlayerName}`;
    
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
});

socket.on('dealCards', cards => {
    window.playerHand = cards;
    renderHand();
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

    let summaryHtml = '';
    // Sort companies alphabetically for consistent display
    const sortedCompanies = Object.keys(handDeltas).sort();

    sortedCompanies.forEach(companyId => {
        const delta = handDeltas[companyId];
        if (delta === 0) return; // Optionally skip zero deltas

        const sign = delta > 0 ? '+' : '';
        const direction = delta > 0 ? 'up' : 'down';
        const triangle = delta > 0 ? '▲' : '▼';
        
        summaryHtml += `
            <div class="summary-entry summary-${direction}">
                <span class="summary-company">${getCompanyName(companyId)}</span>
                <span class="summary-delta">${sign}${delta}</span>
                <span class="summary-triangle">${triangle}</span>
            </div>
        `;
    });

    if (summaryHtml) {
        handSummaryContentDiv.innerHTML = summaryHtml;
        handSummaryDiv.style.display = 'block'; // Show the panel
    } else {
        handSummaryDiv.style.display = 'none'; // Hide if only zero deltas
    }
}

// --- Modify updatePlayerHand --- 
function updatePlayerHand(hand) {
    console.log(`[updatePlayerHand] Called. Received hand:`, hand); 
    // Ensure received hand doesn't have leftover 'played' flags from client
    window.playerHand = hand ? hand.map(card => ({ ...card, played: false })) : []; 
    console.log(`[updatePlayerHand] window.playerHand updated (and played flags reset):`, window.playerHand);

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
        || suspendModal.style.display === 'flex'
        || rightsIssueModal.style.display === 'flex' ) {
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
    } else if (card.type === 'suspend') {
        console.log(`Suspend card clicked.`);
        cardBeingPlayed = { ...card, index }; // Store the card and its original index
        showSuspendModal();
    } else {
        console.log(`Unhandled card type (${card.type}) clicked.`);
    }
}

// Function to show the Suspend Modal
function showSuspendModal() {
    const player = gameState?.players.find(p => p.id === socket.id);
    if (!player || !player.portfolio || Object.keys(player.portfolio).length === 0) {
        alert('You don\'t own any shares to suspend.');
        cardBeingPlayed = null; // Reset card being played
        return;
    }

    // Populate the dropdown ONLY with owned companies
    suspendCompanySelect.innerHTML = '<option value="" disabled selected>Select company to suspend</option>';
    const ownedCompanies = Object.entries(player.portfolio)
        .filter(([_, shares]) => shares > 0)
        .sort(([compA], [compB]) => getCompanyName(compA).localeCompare(getCompanyName(compB)));

    if (ownedCompanies.length === 0) { // Double check after filter
        alert('You don\'t own any shares to suspend.');
        cardBeingPlayed = null; // Reset card being played
        return;
    }

    ownedCompanies.forEach(([companyId]) => {
        const option = document.createElement('option');
        option.value = companyId;
        option.textContent = getCompanyName(companyId);
        suspendCompanySelect.appendChild(option);
    });

    suspendModal.style.display = 'flex';
}

// Event Listeners for Suspend Modal
confirmSuspendBtn.addEventListener('click', () => {
    const selectedCompany = suspendCompanySelect.value;
    if (!selectedCompany) {
        alert('Please select a company to suspend.');
        return;
    }

    if (!cardBeingPlayed || cardBeingPlayed.type !== 'suspend') {
        console.error('Suspend confirm clicked, but no valid suspend card was stored.');
        suspendModal.style.display = 'none';
        cardBeingPlayed = null;
        return;
    }

    console.log(`Confirming suspend for company: ${selectedCompany} using card:`, cardBeingPlayed);
    socket.emit('playSuspendCard', {
        roomID: currentRoom,
        card: { type: cardBeingPlayed.type, sub: cardBeingPlayed.sub }, // Send clean card data
        targetCompany: selectedCompany
    });

    // Mark card as played client-side for immediate visual feedback
    if (window.playerHand[cardBeingPlayed.index]) {
         window.playerHand[cardBeingPlayed.index].played = true;
         // Trigger a redraw to show the disabled state
        if (typeof redraw === 'function') {
            redraw();
        }
    }

    suspendModal.style.display = 'none';
    suspendCompanySelect.value = '';
    cardBeingPlayed = null; // Reset card being played
});

cancelSuspendBtn.addEventListener('click', () => {
    suspendModal.style.display = 'none';
    suspendCompanySelect.value = '';
    cardBeingPlayed = null; // Reset card being played
});

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

// Function to show the Rights Issue Modal
function showRightsIssueModal() {
    console.log('[showRightsIssueModal] Function called.'); // Log function entry
    const player = gameState?.players.find(p => p.id === socket.id);
    if (!player || !player.portfolio || Object.keys(player.portfolio).length === 0) {
        alert('You don\'t own any shares to issue rights for.');
        cardBeingPlayed = null;
        return;
    }
    if (Object.keys(initialPrices).length === 0) {
         alert('Initial price data missing, cannot calculate rights cost.');
         cardBeingPlayed = null;
         return;
    }

    // Populate the dropdown ONLY with owned companies
    rightsCompanySelect.innerHTML = '<option value="" disabled selected>Select company</option>';
    rightsCostInfoDiv.innerHTML = ''; // Clear cost info
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

    // Add listener to update cost info when company changes
    rightsCompanySelect.onchange = () => {
        const selectedCompany = rightsCompanySelect.value;
        if (!selectedCompany) {
            rightsCostInfoDiv.innerHTML = '';
            return;
        }
        const ownedShares = player.portfolio[selectedCompany] || 0;
        const initialPrice = initialPrices[selectedCompany];
        const rightsShares = Math.floor(ownedShares / 2);
        const rightsPricePerShare = Math.ceil(initialPrice / 2);
        const totalCost = rightsShares * rightsPricePerShare;

        if (rightsShares > 0) {
             rightsCostInfoDiv.innerHTML = 
                `Eligible: ${rightsShares.toLocaleString()} shares for ${getCompanyName(selectedCompany)}<br>
                 Cost per share: ₹${rightsPricePerShare.toLocaleString()} (Half of initial ₹${initialPrice.toLocaleString()})<br>
                 Total Cost: ₹${totalCost.toLocaleString()}`;
        } else {
            rightsCostInfoDiv.innerHTML = `Not enough ${getCompanyName(selectedCompany)} shares owned (${ownedShares}) to issue rights.`;
        }
    };

    rightsIssueModal.style.display = 'flex';
}

// Event Listeners for Rights Issue Modal
confirmRightsIssueBtn.addEventListener('click', () => {
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

    // Client-side validation (affordability, eligibility)
    const player = gameState?.players.find(p => p.id === socket.id);
    const ownedShares = player?.portfolio[selectedCompany] || 0;
    const initialPrice = initialPrices[selectedCompany];
    const rightsShares = Math.floor(ownedShares / 2);
    const rightsPricePerShare = Math.ceil(initialPrice / 2);
    const totalCost = rightsShares * rightsPricePerShare;

    if (rightsShares <= 0) {
        alert(`Not enough shares owned in ${selectedCompany} to exercise rights.`);
        return;
    }
    if (!player || player.cash < totalCost) {
        alert(`Insufficient cash. Need ₹${totalCost.toLocaleString()}, have ₹${player?.cash.toLocaleString()}.`);
        return;
    }

    console.log(`Confirming Rights Issue for ${selectedCompany} using card:`, cardBeingPlayed);
    socket.emit('windfall', { // Emit the existing 'windfall' event
        roomID: currentRoom,
        card: { type: cardBeingPlayed.type, sub: cardBeingPlayed.sub }, // Send clean card data
        targetCompany: selectedCompany // Include the chosen company
    });

    // Mark card as played client-side
    if (window.playerHand[cardBeingPlayed.index]) {
         window.playerHand[cardBeingPlayed.index].played = true;
         if (typeof redraw === 'function') { redraw(); }
    }

    rightsIssueModal.style.display = 'none';
    rightsCompanySelect.value = '';
    rightsCostInfoDiv.innerHTML = '';
    cardBeingPlayed = null;
});

cancelRightsIssueBtn.addEventListener('click', () => {
    rightsIssueModal.style.display = 'none';
    rightsCompanySelect.value = '';
    rightsCostInfoDiv.innerHTML = '';
    cardBeingPlayed = null;
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