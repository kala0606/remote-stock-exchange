// const SOCKET_SERVER = 'https://wiggly-alder-cornet.glitch.me'; // FOR GLITCH DEPLOYMENT
const SOCKET_SERVER = 'http://localhost:3000'; // FOR LOCAL TESTING
// const SOCKET_SERVER = 'ws://remote-stock-exchange-backend.glitch.me'; // Example if using glitch

// Initialize socket connection
const socket = io();

// Game Constants
const SHARE_LOTS = [500, 1000, 5000, 10000];
const MAX_SHARES_PER_COMPANY_CLIENT = 200000;

// Add COMPANIES constant for Deck Info panel and other client logic
const COMPANIES = [
  { id: 'WCK', name: 'Wockhardt Pharma', moves: [10, 5, -5, -10] },
  { id: 'HDF', name: 'HDFC Bank', moves: [15, 10, -5, -20] },
  { id: 'TIS', name: 'Tata Steel', moves: [20, 10, -10, -20] },
  { id: 'ONG', name: 'ONGC Ltd', moves: [25, 15, -10, -30] },
  { id: 'REL', name: 'Reliance Industries', moves: [30, 25, -15, -40] },
  { id: 'INF', name: 'Infosys Ltd', moves: [30, 20, -10, -40] }
];

// Track connection state
let isConnected = false;
let currentRoom = null;
// let gameState = null; // Replaced by currentGameState for clarity
let initialPrices = {};
let isAdmin = false;
let isYourTurn = false;
// window.playerHand = []; // No longer needed as global for p5.js, will be part of gameState
// window.companyNames = {}; // Will be part of gameState or passed directly
let priceLog = [];

// NEW: Company Colors
const COMPANY_COLOR_PALETTE = [
    '#FF6347', // Tomato
    '#4682B4', // SteelBlue
    '#32CD32', // LimeGreen
    '#FFD700', // Gold
    '#6A5ACD', // SlateBlue
    '#FF69B4', // HotPink
    '#00CED1', // DarkTurquoise
    '#FFA500', // Orange
    '#8A2BE2', // BlueViolet
    '#D2691E'  // Chocolate
];
let companyColors = {}; // To be populated with { companyId: color }

// Helper function to lighten a hex color
function lightenColor(hex, percent) {
    try {
        if (!hex || hex.length < 7 || hex[0] !== '#') return hex; // Basic validation
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);

        // Ensure percent is between 0 and 1
        const p = Math.max(0, Math.min(1, percent));

        r = Math.round(r + (255 - r) * p);
        g = Math.round(g + (255 - g) * p);
        b = Math.round(b + (255 - b) * p);

        const rHex = r.toString(16).padStart(2, '0');
        const gHex = g.toString(16).padStart(2, '0');
        const bHex = b.toString(16).padStart(2, '0');

        return `#${rHex}${gHex}${bHex}`;
    } catch (e) {
        console.error('Error lightening color:', hex, e);
        return hex; // Return original on error
    }
}

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
// const handDiv = document.getElementById('hand'); // No longer needed for p5.js
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
const adminEndGameBtn = document.getElementById('adminEndGameBtn'); // NEW: End Game Button
const gameOverScreen = document.getElementById('game-over-screen'); // NEW: Game Over Screen
const playerWorthChartCanvas = document.getElementById('playerWorthChart'); // NEW: Chart Canvas
const winnerAnnouncementElement = document.getElementById('winner-announcement'); // NEW: Winner announcement
const wisdomQuoteElement = document.getElementById('wisdom-quote'); // NEW: Wisdom quote

// --- NEW: Wisdom Quotes ---
const wisdomQuotes = [
    "The stock market is filled with individuals who know the price of everything, but the value of nothing. - Philip Fisher",
    "An investment in knowledge pays the best interest. - Benjamin Franklin",
    "The four most dangerous words in investing are: 'This time it\'s different.' - Sir John Templeton",
    "Know what you own, and know why you own it. - Peter Lynch",
    "The best time to plant a tree was 20 years ago. The second best time is now. - Chinese Proverb",
    "Risk comes from not knowing what you\'re doing. - Warren Buffett",
    "It\'s not whether you\'re right or wrong that\'s important, but how much money you make when you\'re right and how much you lose when you\'re wrong. - George Soros",
    "The stock market is a device for transferring money from the impatient to the patient. - Warren Buffett",
    "In investing, what is comfortable is rarely profitable. - Robert Arnott",
    "Don\'t look for the needle in the haystack. Just buy the haystack! - John C. Bogle"
];
// --- END NEW: Wisdom Quotes ---

// --- NEW: Admin Decision Panel Elements (will be created if not in HTML) ---
let adminDecisionPanel = document.getElementById('admin-decision-panel');
let adminResolvePricesBtn = document.getElementById('adminResolvePricesBtn');
let adminAdvanceNewPeriodBtn = document.getElementById('adminAdvanceNewPeriodBtn');
let adminDecisionMessage = document.getElementById('adminDecisionMessage');
// --- END NEW ---

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
let activityLogEntries = []; // MODIFIED: Added to store activity log entries
let handDeltas = {}; // NEW: To store net impact of hand cards

let playerTurnOrderTableElement = null; // NEW: Renamed to reflect it IS the table element

let lastLoggedPeriodForSeparator = null;
let lastLoggedRoundForSeparator = null;
let cardBeingPlayed = null;

function getCompanyName(companyId, companiesStaticData) {
    // companiesStaticData is expected to be an array of company objects from state.state.companyList
    if (Array.isArray(companiesStaticData)) {
        const company = companiesStaticData.find(c => c.id === companyId);
        if (company) {
            return company.name || companyId;
        }
    }
    // Fallback to global currentGameState if direct pass failed or wasn't an array
    if (currentGameState && currentGameState.state && currentGameState.state.companyList) {
        const companyFromGlobal = currentGameState.state.companyList.find(c => c.id === companyId);
        if (companyFromGlobal) return companyFromGlobal.name;
    }
    return companyId; // Return ID if name not found
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
                if (lobbyScreen) lobbyScreen.style.display = 'block'; // MODIFIED FROM flex
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
        if (lobbyScreen) lobbyScreen.style.display = 'block'; // MODIFIED FROM flex
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
                    // After successful auto-join post-creation, this player is admin.
                    // The global isAdmin flag will be set by the subsequent gameState event.
                    // We can preemptively show the start button here for the creator.
                    if (startGameBtn) startGameBtn.style.display = 'block'; 
                    isAdmin = true; // Tentatively set for immediate UI, will be confirmed by gameState
                });
            } else {
                alert('Failed to create room. Please try again.');
            }
            currentRoom = roomID;
            // Do NOT show startGameBtn here for a regular joiner.
            // Visibility will be handled by updateUI based on gameState from server.
            // if (startGameBtn) startGameBtn.style.display = 'block'; 
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
            // Visibility of startGameBtn is now handled by updateUI based on isAdmin from server
            // if (startGameBtn) startGameBtn.style.display = 'block'; 
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
        const rawQuantity = quantityInput?.value || '0';
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
    if (!playerListDiv) return;

    if (!players || players.length === 0) {
        playerListDiv.innerHTML = '';
        playerListDiv.style.display = 'none';
        return;
    }

    playerListDiv.style.display = 'block'; // Or its default display if not block

    // const currentPlayer = players.find(p => p.id === socket.id);
    // isAdmin = currentPlayer?.isAdmin || false; // Previous global isAdmin update

    const currentPlayerForControls = players.find(p => p.id === socket.id); // Find the current viewing player
    const localIsAdminForControls = currentPlayerForControls ? currentPlayerForControls.isAdmin : false; // Determine if they are admin for showing controls
    
    playerListDiv.innerHTML = '<h2>Players</h2>' + 
        players.map((p, idx, arr) => {
            const isCurrent = p.id === currentTurnPlayerId;
            const currentTurnGameIndex = arr.findIndex(player => player.id === currentTurnPlayerId);
            let isNext = false;
            if (currentTurnGameIndex !== -1 && arr.length > 1) {
                const nextTurnGameIndex = (currentTurnGameIndex + 1) % arr.length;
                isNext = (idx === nextTurnGameIndex);
            }

            return `
            <div class="player-row ${isCurrent ? 'current-turn' : ''}">
                <div class="player-info">
                    <span class="turn-indicator ${isCurrent ? 'active' : ''}"></span>
                    <span>${p.name}</span>
                    ${isNext ? '<span style="font-style: italic; color: #007bff; margin-left: 5px;">(Next)</span>' : ''}
                    ${currentGameState && currentGameState.state && currentGameState.state.gameStarted ? `<span style="font-size: 0.85em; color: #555555; margin-left: 8px;">(Turns left: ${p.transactionsRemaining})</span>` : ''}
                    ${p.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
                </div>
                ${localIsAdminForControls && p.id !== socket.id ? ` 
                    <div class="admin-controls">
                        <button class="kick-btn game-button game-button-small" onclick="kickPlayer(\'${p.name}\')">Kick</button>
                        <button class="admin-btn game-button game-button-small" onclick="transferAdmin(\'${p.name}\')">Make Admin</button>
                    </div>
                ` : ''}
            </div>
        `;}).join('');
    
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
    
    console.log('Game state updated:', JSON.parse(JSON.stringify(state)));
    currentGameState = state; // Central update
    
    initialPrices = state.state?.init || {}; // Still needed for the "Initial" row and first comparison
    priceLog = state.state?.priceLog || []; // MODIFIED: Use server-provided priceLog directly

    if (state.state?.companyList) {
        currentGameState.state.companyList = state.state.companyList;
        window.companyNames = state.state.companyList.reduce((acc, company) => {
            acc[company.id] = company.name;
            return acc;
        }, {});

        // Populate companyColors if not already done or if companyList changed significantly (simple check here)
        if (Object.keys(companyColors).length === 0 || Object.keys(companyColors).length !== state.state.companyList.length) {
            companyColors = {}; // Reset if needed
            state.state.companyList.forEach((company, index) => {
                companyColors[company.id] = COMPANY_COLOR_PALETTE[index % COMPANY_COLOR_PALETTE.length];
            });
            console.log('Company colors assigned:', companyColors);
        }
    }
    
    isAdmin = state.isAdmin; 
    isYourTurn = state.isYourTurn;
    
    if (lobbyScreen && gameScreen && lobbyScreen.style.display !== 'none') {
        lobbyScreen.style.display = 'none';
        gameScreen.style.display = 'block';
    } else {
        lobbyScreen.style.display = 'block'; // MODIFIED FROM flex
        gameScreen.style.display = 'none';
    }
    
    updateUI(state);
});

// Function to calculate market sentiment
function calculateMarketSentiment(marketPrices, initialPrices) {
    if (!marketPrices || !initialPrices) {
        console.log('Missing market data:', { marketPrices, initialPrices });
        return 0;
    }
    
    let totalChange = 0;
    let validCompanies = 0;
    
    console.log('Calculating sentiment with prices:', {
        market: marketPrices,
        initial: initialPrices
    });
    
    for (const companyId in marketPrices) {
        const currentPrice = parseFloat(marketPrices[companyId]);
        const initialPrice = parseFloat(initialPrices[companyId]);
        
        if (!isNaN(currentPrice) && !isNaN(initialPrice) && initialPrice > 0) {
            const priceChange = ((currentPrice - initialPrice) / initialPrice) * 100;
            totalChange += priceChange;
            validCompanies++;
            console.log(`Company ${companyId}: Current=${currentPrice}, Initial=${initialPrice}, Change=${priceChange.toFixed(2)}%`);
        } else {
            console.log(`Skipping company ${companyId}: Invalid prices - Current=${currentPrice}, Initial=${initialPrice}`);
        }
    }
    
    const sentiment = validCompanies > 0 ? totalChange / validCompanies : 0;
    console.log('Final Market Sentiment:', sentiment.toFixed(2), '%');
    return sentiment;
}

// Function to update background gradient based on market sentiment
function updateBackgroundGradient(sentiment) {
    // Normalize sentiment to range between -1 and 1
    const normalizedSentiment = Math.max(-1, Math.min(1, sentiment / 100));
    
    // Calculate pastel color intensities based on sentiment
    // Using very light base colors for a more pastel effect
    const redIntensity = normalizedSentiment < 0 ? 255 : Math.floor(220 + (35 * (1 - normalizedSentiment)));
    const greenIntensity = normalizedSentiment > 0 ? 255 : Math.floor(220 + (35 * (1 + normalizedSentiment)));
    
    // Create pastel RGB colors with higher blue component for softer look
    const redColor = `rgb(${redIntensity}, 220, 220)`;
    const greenColor = `rgb(220, ${greenIntensity}, 220)`;
    
    // Calculate animation speed based on sentiment
    // More volatile market (higher absolute sentiment) = faster animation
    const baseSpeed = 15; // Base animation duration in seconds
    const speedMultiplier = 1 + Math.abs(normalizedSentiment); // 1 to 2 range
    const animationDuration = baseSpeed / speedMultiplier;
    
    console.log('Gradient Update:', {
        rawSentiment: sentiment.toFixed(2),
        normalizedSentiment: normalizedSentiment.toFixed(2),
        redIntensity,
        greenIntensity,
        redColor,
        greenColor,
        animationDuration: animationDuration.toFixed(2)
    });
    
    // Update the body background with the new gradient and animation speed
    document.body.style.background = `linear-gradient(45deg, ${redColor}, ${greenColor})`;
    document.body.style.backgroundSize = '400% 400%';
    document.body.style.animation = `gradientAnimation ${animationDuration}s ease-in-out infinite`;
}

// Modify the updateUI function to include sentiment calculation and background update
function updateUI(state) {
    console.log("[updateUI] Received game state:", state);
    currentGameState = state;

    if (!state || !state.players || !state.state) {
        console.error("[updateUI] Invalid or incomplete game state received (missing players or state.state).");
        if (lobbyScreen) lobbyScreen.style.display = 'flex';
        if (gameScreen) gameScreen.style.display = 'none';
        return;
    }

    const companiesStaticData = state.state.companyList || [];
    const currentMarketPrices = state.state.prices || {};
    const currentInitialPrices = state.state.init || {};

    // Calculate and update market sentiment
    const sentiment = calculateMarketSentiment(currentMarketPrices, currentInitialPrices);
    updateBackgroundGradient(sentiment);

    const me = state.players.find(p => p.id === socket.id || p.name === currentPlayerName);
    const playerHandToRender = state.hand || []; 

    if (me) {
        if (cashSpan) cashSpan.textContent = `Your Cash: ₹${me.cash.toLocaleString()}`;
        updateGeneralRightsOffers(me); 
        updateOpenShortsPanel(me, currentMarketPrices, companiesStaticData); 
    } else {
        if (cashSpan) cashSpan.textContent = "Cash: N/A";
        updateGeneralRightsOffers(null);
        updateOpenShortsPanel(null, currentMarketPrices, companiesStaticData);
    }

    const currentPlayerNameForBar = state.players.find(p => p.id === state.state.currentTurnPlayerId)?.name || 'N/A';
    const yourTurnText = isYourTurn ? ' <span class="your-turn-indicator-text">Your Turn</span>' : '';
    const highlightedPlayerName = isYourTurn ? `<span class="current-turn-player-name-highlight">${currentPlayerNameForBar}</span>` : currentPlayerNameForBar;

    if (periodSpan) periodSpan.innerHTML = `Period ${state.state.period} | Round ${state.state.roundNumberInPeriod} | Player: ${highlightedPlayerName}${yourTurnText}`;

    renderMarketBoard(currentMarketPrices, companiesStaticData, currentInitialPrices); 
    renderPlayerHand(playerHandToRender, companiesStaticData); 

    updatePlayerList(state.players, state.state.currentTurnPlayerId); 
    updateLeaderboard(state.players, currentMarketPrices, companiesStaticData); 
    updatePriceLogTable(); 
    renderPlayerTurnOrderTable(state.players, state.state.currentTurnPlayerId, state.state.period, state.state.gameStarted); // NEW: Call to render turn order table
    renderDeckInfoPanel(); // Add this line

    // NEW: Calculate hand deltas and update the summary display
    calculateHandDeltas(playerHandToRender, companiesStaticData); // Pass companiesStaticData for getCompanyName
    updateHandSummaryDisplay(); // Call the function to update the display

    if (lobbyScreen && gameScreen) {
        if (state.state && state.state.gameStarted) {
            lobbyScreen.style.display = 'none';
            gameScreen.style.display = 'block';
        } else {
            lobbyScreen.style.display = 'block'; // MODIFIED FROM flex
            gameScreen.style.display = 'none';
        }
    }

    // --- NEW: Admin Decision Panel Logic ---
    if (!adminDecisionPanel) { 
        const gameControlsDiv = document.querySelector('.game-controls') || document.getElementById('game-screen') || document.body; 
        adminDecisionPanel = document.createElement('div');
        adminDecisionPanel.id = 'admin-decision-panel';
        adminDecisionPanel.className = 'panel admin-decision-panel';
        adminDecisionPanel.style.textAlign = 'center';

        const title = document.createElement('h4');
        title.textContent = 'Admin Action Required';
        adminDecisionPanel.appendChild(title);

        adminDecisionMessage = document.createElement('p');
        adminDecisionMessage.id = 'adminDecisionMessage';
        adminDecisionPanel.appendChild(adminDecisionMessage);

        adminResolvePricesBtn = document.createElement('button');
        adminResolvePricesBtn.id = 'adminResolvePricesBtn';
        adminResolvePricesBtn.textContent = 'End Period & Resolve Prices';
        adminResolvePricesBtn.className = 'game-button';
        adminDecisionPanel.appendChild(adminResolvePricesBtn);

        adminAdvanceNewPeriodBtn = document.createElement('button');
        adminAdvanceNewPeriodBtn.id = 'adminAdvanceNewPeriodBtn';
        adminAdvanceNewPeriodBtn.textContent = 'Advance to New Period & Deal Cards';
        adminAdvanceNewPeriodBtn.className = 'game-button';
        adminAdvanceNewPeriodBtn.style.marginLeft = '10px';
        adminDecisionPanel.appendChild(adminAdvanceNewPeriodBtn);
        
        const actionButtonsDiv = document.querySelector('.action-buttons');
        if (actionButtonsDiv) {
            actionButtonsDiv.parentNode.insertBefore(adminDecisionPanel, actionButtonsDiv);
        } else {
            gameControlsDiv.appendChild(adminDecisionPanel);
        }
    }

    const normalActionButtons = [buyBtn, sellBtn, shortSellBtn, /*passBtn,*/ endTurnBtn];
    const canPerformTransaction = isYourTurn && me && me.transactionsRemaining > 0 && !state.state.awaitingAdminDecision;
    const canPassOrEnd = isYourTurn && !state.state.awaitingAdminDecision;

    if (state.state.awaitingAdminDecision) {
        adminDecisionPanel.style.display = 'block';
        normalActionButtons.forEach(btn => { if (btn) btn.disabled = true; });
        // ADD CONSOLE LOG HERE
        console.log(`[updateUI] Admin Decision Logic: awaitingAdminDecision=${state.state.awaitingAdminDecision}, pricesResolvedThisCycle=${state.state.pricesResolvedThisCycle}, isAdmin=${isAdmin}`);

        if (isAdmin) {
            adminDecisionMessage.textContent = 'The 3-round mark has been reached. Please choose an action.';
            adminResolvePricesBtn.style.display = 'inline-block';
            adminAdvanceNewPeriodBtn.style.display = 'inline-block';

            if (state.state.pricesResolvedThisCycle === false) {
                adminResolvePricesBtn.disabled = false;
                adminAdvanceNewPeriodBtn.disabled = true;
                adminResolvePricesBtn.onclick = () => {
                    // ADD CONSOLE LOG HERE
                    console.log(`[Admin Action] Emitting 'adminResolvePeriodAndDeal' for room ${currentRoom}. Client's current pricesResolvedThisCycle: ${currentGameState?.state?.pricesResolvedThisCycle}`);
                    socket.emit('adminResolvePeriodAndDeal', { roomID: currentRoom }); 
                };
            } else {
                adminResolvePricesBtn.disabled = true;
                adminAdvanceNewPeriodBtn.disabled = false;
                adminAdvanceNewPeriodBtn.onclick = () => socket.emit('adminAdvanceToNewPeriod_DealCards', { roomID: currentRoom });
            }
        } else {
            adminDecisionMessage.textContent = 'Waiting for the admin to decide on period progression...';
            adminResolvePricesBtn.style.display = 'none';
            adminAdvanceNewPeriodBtn.style.display = 'none';
        }
        // if(advancePeriodBtn) advancePeriodBtn.style.display = 'none'; // Already handled by general hide below

    } else {
        adminDecisionPanel.style.display = 'none';
        if (buyBtn) buyBtn.disabled = !canPerformTransaction;
        if (sellBtn) sellBtn.disabled = !canPerformTransaction;
        if (shortSellBtn) shortSellBtn.disabled = !canPerformTransaction;
        if (endTurnBtn) endTurnBtn.disabled = !canPassOrEnd;
        // if(advancePeriodBtn && isAdmin) advancePeriodBtn.style.display = 'inline-block'; // Removed
    }
    
    if(advancePeriodBtn) advancePeriodBtn.style.display = 'none'; // Always hide the old button
    if(startGameBtn) startGameBtn.style.display = isAdmin && state.state && !state.state.gameStarted ? 'block' : 'none';
    if(adminEndGameBtn) adminEndGameBtn.style.display = isAdmin && state.state && state.state.gameStarted ? 'inline-block' : 'none'; // NEW: Show/hide End Game button
}

// NEWLY ADDED: updateLeaderboard function
function updateLeaderboard(players, marketPrices, companiesStaticData) {
    if (!leaderboardContent) return;

    const historicalWorthData = currentGameState?.state?.historicalWorthData || [];
    if (!players || players.length === 0 || !marketPrices || !companiesStaticData || companiesStaticData.length === 0) {
        leaderboardContent.innerHTML = '<p>Leaderboard data not available yet.</p>';
        return;
    }

    const rankedPlayers = players.map(player => {
        let portfolioValue = 0;
        const portfolioDetails = [];
        if (player.portfolio) {
            for (const companyId in player.portfolio) {
                const shares = player.portfolio[companyId];
                if (shares > 0) {
                    const currentPrice = marketPrices[companyId] !== undefined ? marketPrices[companyId] : 0;
                    const value = shares * currentPrice;
                    portfolioValue += value;
                    const companyName = getCompanyName(companyId, companiesStaticData);
                    const color = companyColors[companyId] || '#000000';
                    portfolioDetails.push({
                        name: companyName,
                        shares: shares.toLocaleString(),
                        value: value.toLocaleString(),
                        color: color,
                        type: 'long'
                    });
                }
            }
        }
        // Add short positions to portfolio details
        if (player.shortPositions) {
            for (const companyId in player.shortPositions) {
                const shortPosition = player.shortPositions[companyId];
                const currentPrice = marketPrices[companyId] !== undefined ? marketPrices[companyId] : 0;
                const value = shortPosition.quantity * currentPrice;
                portfolioValue -= value; // Subtract short position value from portfolio
                const companyName = getCompanyName(companyId, companiesStaticData);
                const color = companyColors[companyId] || '#000000';
                const unrealizedPnl = (shortPosition.priceOpened - currentPrice) * shortPosition.quantity;
                portfolioDetails.push({
                    name: companyName,
                    shares: `-${shortPosition.quantity.toLocaleString()}`,
                    value: value.toLocaleString(),
                    color: color,
                    type: 'short',
                    priceOpened: shortPosition.priceOpened,
                    unrealizedPnl: unrealizedPnl
                });
            }
        }
        const overallWorth = player.cash + portfolioValue;
        let worthChangeText = "";
        const playerHistory = historicalWorthData.filter(d => d.playerId === player.uuid).sort((a,b) => b.period - a.period);
        if (playerHistory.length >= 1) {
            if (playerHistory.length >= 2) {
                const currentRecordedPeriodWorth = playerHistory[0].totalWorth;
                const previousRecordedPeriodWorth = playerHistory[1].totalWorth;
                const previousRecordedPeriodNumber = playerHistory[1].period;
                if (previousRecordedPeriodWorth !== 0) {
                    const changePercent = ((currentRecordedPeriodWorth - previousRecordedPeriodWorth) / previousRecordedPeriodWorth) * 100;
                    const changeSign = changePercent >= 0 ? '+' : '';
                    const changeClass = changePercent >= 0 ? 'positive' : 'negative';
                    worthChangeText = ` <span class=\"leaderboard-worth-change ${changeClass}\">(vs P${previousRecordedPeriodNumber}: ${changeSign}${changePercent.toFixed(1)}%)</span>`;
                } else if (currentRecordedPeriodWorth > 0) {
                    worthChangeText = ` <span class=\"leaderboard-worth-change positive\">(vs P${previousRecordedPeriodNumber}: +Inf%)</span>`;
                } else {
                    worthChangeText = ` <span class=\"leaderboard-worth-change\">(vs P${previousRecordedPeriodNumber}: 0.0%)</span>`;
                }
            } else if (playerHistory[0].period === 0) {
                worthChangeText = " <span class=\"leaderboard-worth-change\">(Baseline P0)</span>";
            } else {
                worthChangeText = " <span class=\"leaderboard-worth-change\">(New History)</span>";
            }
        } else {
            worthChangeText = " <span class=\"leaderboard-worth-change\">(N/A)</span>";
        }
        return { ...player, portfolioValue, overallWorth, portfolioDetails, worthChangeText };
    }).sort((a, b) => b.overallWorth - a.overallWorth);

    // Hybrid format: table with main stats, portfolio details as a second row per player
    let leaderboardHTML = `<table class="leaderboard-table"><thead><tr>
        <th>Player</th>
        <th>Overall Worth</th>
        <th>Cash</th>
        <th>Portfolio Value</th>
    </tr></thead><tbody>`;
    rankedPlayers.forEach(player => {
        leaderboardHTML += `<tr>
            <td><strong>${player.name}</strong> ${player.isAdmin ? '(Admin)' : ''} ${player.id === socket.id ? '(You)' : ''}</td>
            <td>₹${player.overallWorth.toLocaleString()}${player.worthChangeText}</td>
            <td>₹${player.cash.toLocaleString()}</td>
            <td>₹${player.portfolioValue.toLocaleString()}</td>
        </tr>`;
        // Portfolio details as a second row
        leaderboardHTML += `<tr class="portfolio-details-row"><td colspan="4">`;
        if (player.portfolioDetails.length > 0) {
            leaderboardHTML += '<ul class="leaderboard-portfolio-details">';
            player.portfolioDetails.forEach(item => {
                if (item.type === 'long') {
                    leaderboardHTML += `<li><span style=\"color:${item.color}; font-weight:bold;\">${item.name}</span>: ${item.shares} shares (Value: ₹${item.value})</li>`;
                } else {
                    const pnlClass = item.unrealizedPnl >= 0 ? 'positive-pnl' : 'negative-pnl';
                    leaderboardHTML += `<li><span style=\"color:${item.color}; font-weight:bold;\">${item.name}</span>: ${item.shares} shares (Value: ₹${item.value}) <span class="${pnlClass}">P&L: ₹${item.unrealizedPnl.toLocaleString()}</span></li>`;
                }
            });
            leaderboardHTML += '</ul>';
        } else {
            leaderboardHTML += '<span class="no-shares">No positions</span>';
        }
        leaderboardHTML += '</td></tr>';
    });
    leaderboardHTML += '</tbody></table>';
    leaderboardContent.innerHTML = leaderboardHTML;

    // Mobile: stacked card/list format
    if (window.innerWidth <= 700) {
        let mobileHTML = '';
        rankedPlayers.forEach(player => {
            mobileHTML += `<div class="leaderboard-card">
                <div class="leaderboard-card-header"><strong>${player.name}</strong> ${player.isAdmin ? '(Admin)' : ''} ${player.id === socket.id ? '(You)' : ''}</div>
                <div>Overall Worth: <span class="leaderboard-overall-worth">₹${player.overallWorth.toLocaleString()}</span>${player.worthChangeText}</div>
                <div>Cash: ₹${player.cash.toLocaleString()}</div>
                <div>Portfolio Value: ₹${player.portfolioValue.toLocaleString()}</div>
                <div>Portfolio:`;
            if (player.portfolioDetails.length > 0) {
                mobileHTML += '<ul class="leaderboard-portfolio-details">';
                player.portfolioDetails.forEach(item => {
                    if (item.type === 'long') {
                        mobileHTML += `<li><span style=\"color:${item.color}; font-weight:bold;\">${item.name}</span><br><span>${item.shares} shares (Value: ₹${item.value})</span></li>`;
                    } else {
                        const pnlClass = item.unrealizedPnl >= 0 ? 'positive-pnl' : 'negative-pnl';
                        mobileHTML += `<li><span style=\"color:${item.color}; font-weight:bold;\">${item.name}</span><br><span>${item.shares} shares (Value: ₹${item.value}) <span class="${pnlClass}">P&L: ₹${item.unrealizedPnl.toLocaleString()}</span></span></li>`;
                    }
                });
                mobileHTML += '</ul>';
            } else {
                mobileHTML += '<span class="no-shares">No positions</span>';
            }
            mobileHTML += '</div></div>';
        });
        leaderboardContent.innerHTML = mobileHTML;
    }
}

function playWindfall(sub) {
    // This function is likely obsolete or needs review
    console.log("playWindfall function called with", sub, "- this is likely obsolete.");
}

function handleCardClick(card, index) {
    if (!currentRoom || !isYourTurn) {
        alert('Not your turn or not in a room.');
        return;
    }

    if (!card || card.played) { // MODIFIED: Check if card is undefined or already played
        console.warn('handleCardClick: Card is undefined or already played.', card);
        // Optionally provide user feedback if card is already played
        if (card && card.played) alert('This card has already been played.');
        return;
    }

    console.log('Attempting to play card:', card, 'at index:', index);
    // Store a copy of the card being processed, including its original index in the hand.
    // This is useful for modals that need to know which card initiated them.
    cardBeingPlayed = { ...card, originalIndexInHand: index }; 

    if (card.type === 'windfall') {
        if (card.sub === 'RIGHTS') {
            showRightsIssueModal(); // This modal will use cardBeingPlayed
            return; // Stop further processing for RIGHTS, modal handles emission
        } else if (card.sub === 'LOAN' || card.sub === 'DEBENTURE') {
            // For LOAN or DEBENTURE, emit directly. Server doesn't need targetCompany or desiredShares for these.
            socket.emit('windfall', { 
                roomID: currentRoom, 
                card: cardBeingPlayed // Send the card object with its originalIndexInHand
            });
            cardBeingPlayed = null; // Reset after emitting
            return;
        }
    }

    // Handle other card types if necessary (e.g., 'price' cards if they were clickable)
    // Currently, only windfall cards have direct click actions defined here.
    // Price cards are resolved at period end on the server.
    console.warn(`Card clicked: ${card.type} - ${card.sub || card.company}. This card type may not have a direct click action implemented or is handled differently.`);
    // cardBeingPlayed = null; // Reset if no further action from this click.
}

// function updateAdminControls() { // Removed
//     if (advancePeriodBtn) {
//         advancePeriodBtn.style.display = isAdmin ? 'block' : 'none';
//     }
// }

// if (advancePeriodBtn) { // Event listener removed
//     advancePeriodBtn.addEventListener('click', () => {
//         if (!isAdmin || !currentRoom) return;
//         if (confirm('Are you sure you want to advance to the next period?')) {
//             socket.emit('advancePeriod', { roomID: currentRoom });
//         }
//     });
// }

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

        // Ensure all necessary data for the 'windfall' event is present
        if (!cardBeingPlayed || typeof cardBeingPlayed.originalIndexInHand !== 'number') {
            alert('Error: Card information for Rights Issue is missing. Please try playing the card again.');
            if (rightsIssueModal) rightsIssueModal.style.display = 'none';
            cardBeingPlayed = null;
            return;
        }

        socket.emit('windfall', {
            roomID: currentRoom,
            card: cardBeingPlayed, // Send the whole card object, which includes its originalIndexInHand
            targetCompany: selectedCompany,
            desiredRightsShares: desiredSharesNum // Server expects this for RIGHTS
        });

        // Server will update hand and send new game state. Client-side manipulation removed.
        // if (typeof cardBeingPlayed.originalIndexInHand === 'number' && window.playerHand[cardBeingPlayed.originalIndexInHand]) {
        //      window.playerHand[cardBeingPlayed.originalIndexInHand].played = true;
        //      if (typeof redraw === 'function') redraw();
        // }

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
    if (!priceLogTableHeader || !priceLogTableBody || 
        !currentGameState || !currentGameState.state || !currentGameState.state.companyList || currentGameState.state.companyList.length === 0) {
        if(priceLogTableHeader) while (priceLogTableHeader.children.length > 1) priceLogTableHeader.removeChild(priceLogTableHeader.lastChild);
        if(priceLogTableBody) priceLogTableBody.innerHTML = '<tr><td colspan="1">Company data not ready for price log.</td></tr>';
        return;
    }

    const companiesToDisplay = currentGameState.state.companyList;
    const clientInitialPrices = currentGameState.state.init || {}; // Use client-side initialPrices

    // Update table header (company names)
    while (priceLogTableHeader.children.length > 1) {
        priceLogTableHeader.removeChild(priceLogTableHeader.lastChild);
    }
    companiesToDisplay.forEach(company => {
        const th = document.createElement('th');
        const companyColor = companyColors[company.id] || '#000000';
        th.textContent = company.name;
        th.style.color = companyColor;
        th.style.fontWeight = 'bold';
        priceLogTableHeader.appendChild(th);
    });

    priceLogTableBody.innerHTML = ''; // Clear existing rows

    // 1. Add Initial Prices Row
    if (Object.keys(clientInitialPrices).length > 0) {
        const trInitial = document.createElement('tr');
        const tdPeriodInitial = document.createElement('td');
        tdPeriodInitial.textContent = 'Initial';
        tdPeriodInitial.style.fontWeight = 'bold';
        trInitial.appendChild(tdPeriodInitial);

        companiesToDisplay.forEach(company => {
            const companyId = company.id;
            const tdPrice = document.createElement('td');
            const initialPrice = clientInitialPrices[companyId] !== undefined ? clientInitialPrices[companyId] : '--';
            tdPrice.innerHTML = `${initialPrice === '--' ? '--' : '₹' + parseFloat(initialPrice).toFixed(2)} <span class="price-change price-no-change">(---)</span>`;
            trInitial.appendChild(tdPrice);
        });
        priceLogTableBody.appendChild(trInitial);
    }

    // 2. Add Rows from priceLog array (resolved prices)
    priceLog.forEach((logEntry, index) => {
        const currentPricesInLog = logEntry.prices;
        const tr = document.createElement('tr');
        const tdPeriod = document.createElement('td');
        // Display period and round if available, otherwise just period
        tdPeriod.textContent = `P${logEntry.period}` + (logEntry.round ? ` R${logEntry.round}` : '');
        tr.appendChild(tdPeriod);

        // Determine the set of prices to compare against
        // For the first entry in priceLog, compare against clientInitialPrices
        // For subsequent entries, compare against the previous entry in priceLog
        const comparePrices = index === 0 ? clientInitialPrices : priceLog[index - 1].prices;

        companiesToDisplay.forEach(company => {
            const companyId = company.id;
            const tdPrice = document.createElement('td');
            const currentPrice = currentPricesInLog[companyId] !== undefined ? currentPricesInLog[companyId] : '--';
            let changeText = '(0.0%)'; 
            let changeClass = 'price-no-change';
            
            const previousPrice = comparePrices[companyId];

            if (previousPrice !== undefined && currentPrice !== '--') {
                const change = currentPrice - previousPrice;
                const percentChange = (previousPrice !== 0 && !isNaN(previousPrice)) ? (change / previousPrice) * 100 : (change !== 0 ? Infinity : 0);
                changeText = `(${(change > 0 ? '+' : '')}${percentChange === Infinity ? 'New' : percentChange.toFixed(1)}%)`;
                if (Math.abs(change) > 0.001) { // Use a small tolerance for float comparison
                    changeClass = change > 0 ? 'price-up' : 'price-down';
                } else {
                    changeClass = 'price-no-change'; 
                }
            } else if (currentPrice !== '--' && previousPrice === undefined) {
                changeText = '(New)'; // Or handle as no change if initial should be the only baseline for "New"
                changeClass = 'price-no-change'; 
            }
            tdPrice.innerHTML = `${currentPrice === '--' ? '--' : '₹' + parseFloat(currentPrice).toFixed(2)} <span class="price-change ${changeClass}">${changeText}</span>`;
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
                // Check if the offer is for the current round, player owns shares, 
                // and the current player is NOT the one who initiated this specific offer.
                if (offerDetails.roundAnnounced === currentGameState.state.roundNumberInPeriod &&
                    (currentPlayerPortfolio[companyId] || 0) > 0 &&
                    offerDetails.initiatedByPlayerName !== currentPlayer.name) { // MODIFIED: Compare by name
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
    shortSellModal.style.display = 'flex'; // MODIFIED: Use flex for centering
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

// --- NEW HTML RENDERING FUNCTIONS --- 

// Function to render the market board (price table)
function renderMarketBoard(marketPrices, companiesStaticData, currentInitialPrices) {
    const marketBoardContainer = document.getElementById('market-board-container');
    if (!marketBoardContainer) return;

    let maxCurrentPrice = 100; // Default minimum for scaling to prevent division by zero or tiny bars
    if (marketPrices && Object.keys(marketPrices).length > 0) {
        const allCurrentPrices = Object.values(marketPrices).map(p => parseFloat(p)).filter(p => !isNaN(p) && p > 0);
        if (allCurrentPrices.length > 0) {
            maxCurrentPrice = Math.max(...allCurrentPrices);
        }
    }
    const maxPriceForScaling = maxCurrentPrice * 1.2; // Scale relative to current max price + 20% buffer

    let tableHTML = '<table class="market-table"><thead><tr><th>Company</th><th>Current</th><th>Price Level</th></tr></thead><tbody>';

    if (companiesStaticData && companiesStaticData.length > 0 && marketPrices && currentInitialPrices) {
        companiesStaticData.forEach(company => {
            const initialPrice = currentInitialPrices[company.id] !== undefined ? parseFloat(currentInitialPrices[company.id]) : 0;
            const currentPrice = marketPrices[company.id] !== undefined ? parseFloat(marketPrices[company.id]) : initialPrice;
            
            let priceMovementClass = 'no-change';
            if (initialPrice > 0) { 
                if (currentPrice > initialPrice) priceMovementClass = 'price-up';
                if (currentPrice < initialPrice) priceMovementClass = 'price-down';
            }

            const barWidth = Math.min((currentPrice / maxPriceForScaling) * 100, 105); 
            const companyColor = companyColors[company.id] || '#777777'; // Default to grey if color not found
            
            let barGraphHTML = `<div class="price-level-bar-container">`;
            barGraphHTML += `<div class="price-level-bar" style="width: ${barWidth}%; background-color: ${companyColor};"></div>`;
            barGraphHTML += `</div>`;

            // Optionally, color the company name text too
            // const companyNameStyle = `color: ${companyColor}; font-weight: bold;`;
            // tableHTML += `<tr>
            //     <td style="${companyNameStyle}">${company.name}</td> ...

            tableHTML += `<tr>
                <td>${company.name}</td>
                <td class="${priceMovementClass}">₹${currentPrice.toFixed(2)}</td>
                <td>${barGraphHTML}</td> 
            </tr>`;
        });
    } else {
        tableHTML += '<tr><td colspan="3">Market data not available yet.</td></tr>';
    }

    tableHTML += '</tbody></table>';
    marketBoardContainer.innerHTML = tableHTML;
}

// Function to render the player's hand (HTML cards)
function renderPlayerHand(playerHandArray, companiesStaticData) {
    const playerHandContainer = document.getElementById('player-hand-container');
    if (!playerHandContainer) {
        console.error("Player hand container not found!");
        return;
    }

    let cardsContentDiv = playerHandContainer.querySelector('#player-hand-cards-content');
    if (!cardsContentDiv) {
        const titleElement = playerHandContainer.querySelector('h4');
        playerHandContainer.innerHTML = ''; 
        if (titleElement) playerHandContainer.appendChild(titleElement); 
        cardsContentDiv = document.createElement('div');
        cardsContentDiv.id = 'player-hand-cards-content';
        cardsContentDiv.className = 'player-hand-cards-flex-container';
        playerHandContainer.appendChild(cardsContentDiv);
    } else {
        cardsContentDiv.innerHTML = ''; 
    }

    let handHTML = '';
    if (playerHandArray && playerHandArray.length > 0) {
        playerHandArray.forEach((card, index) => {
            let cardStyle = '';
            let cardClasses = 'card-html';
            if (card.played) { // NEW: Check if card is marked as played
                cardClasses += ' played-card';
            }

            if (card.type === 'price') { 
                cardClasses += ' price-card-html'; 
                const companyColor = companyColors[card.company];
                if (companyColor) {
                    const lightBackgroundColor = lightenColor(companyColor, 0.85); // 85% towards white for a very light tint
                    cardStyle = `style="background-color: ${lightBackgroundColor};"`;
                }
                const companyName = getCompanyName(card.company, companiesStaticData);
                handHTML += `<div class="${cardClasses}" data-card-index="${index}" ${cardStyle}>
                           <div class="card-title">${companyName}</div>
                           <div class="card-value ${card.change > 0 ? 'positive' : 'negative'}"> 
                             ${card.change > 0 ? '+' : ''}${card.change} 
                           </div>
                           <div class="card-subtitle">Price Change</div>`;
            } else if (card.type === 'windfall') { 
                cardClasses += ' windfall-card-html'; // This class defines black background
                handHTML += `<div class="${cardClasses}" data-card-index="${index}" ${cardStyle}>
                           <div class="card-title">Windfall</div>
                           <div class="card-value windfall-subtype">${card.sub}</div>`;
                if (card.sub === 'LOAN') { 
                    handHTML += '<div class="card-icon">⚪</div>'; 
                } else if (card.sub === 'DEBENTURE') { 
                    handHTML += '<div class="card-icon">▭▭</div>'; 
                } else if (card.sub === 'RIGHTS') { 
                    handHTML += '<div class="card-icon">△</div>'; 
                }             
            } else if (card.type === 'CURRENCY_MOVEMENT') { // This type is not in buildDeck on server
                 handHTML += `<div class="card-title">Currency</div>
                           <div class="card-value ${card.change > 0 ? 'positive' : 'negative'}">
                             ${card.change > 0 ? '+' : ''}${card.change}%
                           </div>
                           <div class="card-subtitle">Movement</div>`;
            }
            handHTML += '</div>';
        });
    } else {
        handHTML = '<p>Your hand is empty.</p>';
    }
    cardsContentDiv.innerHTML = handHTML;

    // Add event listeners to new HTML cards
    document.querySelectorAll('.card-html').forEach(cardElement => {
        cardElement.addEventListener('click', (event) => {
            const cardIndex = parseInt(event.currentTarget.dataset.cardIndex);
            // MODIFIED: Check for awaitingAdminDecision before handling click
            if (currentGameState && currentGameState.state && currentGameState.state.awaitingAdminDecision) {
                alert('Admin decision pending. Card actions are temporarily disabled.');
                return;
            }
            if (playerHandArray && playerHandArray[cardIndex]) {
                 handleCardClick(playerHandArray[cardIndex], cardIndex);
            } else {
                console.error("Could not find card data for click event"); 
            }
        });
    });
}

// --- END NEW HTML RENDERING FUNCTIONS --- 

function updateHandSummaryDisplay() {
    if (!currentGameState || !currentGameState.state || !currentGameState.state.prices || !currentGameState.state.companyList) { // Added companyList check
        if(handSummaryDiv) handSummaryDiv.style.display = 'none';
        return;
    }
    if (Object.keys(handDeltas).length === 0) {
        if(handSummaryDiv) handSummaryDiv.style.display = 'none';
        return;
    }
    let summaryHtml = '<table class="hand-impact-table"><thead><tr><th>Company</th><th>Net Impact</th></tr></thead><tbody>';
    const sortedCompanies = Object.keys(handDeltas).sort((a, b) => getCompanyName(a, currentGameState.state.companyList).localeCompare(getCompanyName(b, currentGameState.state.companyList))); // Pass companyList for sorting
    let hasVisibleEntries = false;
    sortedCompanies.forEach(companyId => {
        const delta = handDeltas[companyId];
        // if (delta === 0 && Object.keys(handDeltas).length > 1) return; // Show 0 impact if it's the only one or for consistency
        hasVisibleEntries = true;
        const sign = delta > 0 ? '+' : (delta < 0 ? '' : ''); // No sign for 0
        const direction = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'no-change');
        const triangle = delta > 0 ? '▲' : (delta < 0 ? '▼' : '-');
        let percentageImpactText = '';
        const currentPrice = currentGameState.state.prices[companyId];
        // Use currentGameState.state.companyList which is passed as companiesStaticData to getCompanyName
        const companyName = getCompanyName(companyId, currentGameState.state.companyList); 

        if (currentPrice !== undefined && currentPrice > 0 && delta !== 0) { // only show percentage if there's a non-zero delta
            percentageImpactText = ` (${((delta / currentPrice) * 100).toFixed(1)}%)`;
        } else if (delta !== 0 && (currentPrice === undefined || currentPrice === 0)) { // If price is 0 or undefined but delta exists
            percentageImpactText = ' (N/A%)';
        }
        summaryHtml += `<tr><td>${companyName}</td><td class="summary-${direction}">${triangle} ${sign}${delta}${percentageImpactText}</td></tr>`;
    });
    summaryHtml += '</tbody></table>';

    if (hasVisibleEntries && handSummaryContentDiv && handSummaryDiv) {
        handSummaryContentDiv.innerHTML = summaryHtml;
        handSummaryDiv.style.display = 'block';
    } else if (handSummaryDiv) {
        handSummaryDiv.style.display = 'none';
    }
} 

// MODIFIED: Added listener for activity logs
socket.on('activityLog', logEntry => {
    console.log('[activityLog] Received log:', logEntry);
    activityLogEntries.push(logEntry);
    // Keep the log to a reasonable size, e.g., last 50 entries
    if (activityLogEntries.length > 50) {
        activityLogEntries.shift(); 
    }
    renderActivityLog();
});

function renderActivityLog() {
    if (!activityLogContent) return;

    if (activityLogEntries.length === 0) {
        activityLogContent.innerHTML = '<p class="no-activity-msg">No activity yet.</p>';
        return;
    }

    let logHTML = '';
    // Iterate in reverse to show newest logs at the top, or normal and scroll down.
    // For now, normal order and scroll down.
    activityLogEntries.forEach(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        let prefix = `[${time}] `;
        if (entry.period !== undefined && entry.round !== undefined) {
            prefix += `P${entry.period}R${entry.round} - `;
        }
        const playerNameStr = entry.playerName ? `<strong>${entry.playerName}</strong>: ` : '';
        logHTML += `<div class="log-entry">${prefix}${playerNameStr}${entry.details}</div>`;
    });

    activityLogContent.innerHTML = logHTML;
    activityLogContent.scrollTop = activityLogContent.scrollHeight; // Scroll to the bottom
}

if (activityLogPanel) activityLogPanel.style.display = 'block'; // Make sure it's visible by default if it exists 

// NEW: Function to calculate the net impact of price cards in hand
function calculateHandDeltas(playerHandArray, companiesStaticData) {
    handDeltas = {}; // Reset before recalculating
    if (playerHandArray && playerHandArray.length > 0) {
        playerHandArray.forEach(card => {
            if (card.type === 'price' && card.company && card.change !== undefined) {
                if (!handDeltas[card.company]) {
                    handDeltas[card.company] = 0;
                }
                handDeltas[card.company] += card.change;
            }
        });
    }
    // console.log("Calculated handDeltas:", handDeltas); // For debugging
}

// NEW: Event listener for Admin End Game button
if (adminEndGameBtn) {
    adminEndGameBtn.addEventListener('click', () => {
        if (isAdmin && currentRoom) {
            if (confirm('Are you sure you want to end the game for all players? This action cannot be undone.')) {
                console.log(`[Admin Action] Emitting 'adminEndGameRequest' for room ${currentRoom}`);
                socket.emit('adminEndGameRequest', { roomID: currentRoom });
            }
        }
    });
}

// NEW: Listener for game summary and to render chart
socket.on('gameSummaryReceived', (summaryData) => {
    console.log('[gameSummaryReceived]', summaryData);
    if (lobbyScreen) lobbyScreen.style.display = 'none';
    if (gameOverScreen) {
        gameOverScreen.style.display = 'flex'; // Overlay
        gameOverScreen.scrollIntoView({ behavior: 'smooth' });
    }

    if (summaryData && summaryData.historicalWorthData && summaryData.players) {
        renderPlayerWorthChart(summaryData.historicalWorthData, summaryData.players);

        // --- NEW: Determine Winner and Display Quote ---
        const { historicalWorthData, players: playersInfo } = summaryData;

        // Determine Winner (fix: use uuid)
        if (winnerAnnouncementElement) {
            if (historicalWorthData.length > 0) {
                const maxPeriod = Math.max(...historicalWorthData.map(d => d.period));
                const finalPeriodData = historicalWorthData.filter(d => d.period === maxPeriod);
                if (finalPeriodData.length > 0) {
                    const maxWorth = Math.max(...finalPeriodData.map(d => d.totalWorth));
                    const winners = finalPeriodData.filter(d => d.totalWorth === maxWorth);
                    let winnerText = "";
                    if (winners.length === 1) {
                        const winnerInfo = playersInfo.find(p => p.uuid === winners[0].playerId);
                        winnerText = `🎉 Winner: ${winnerInfo ? winnerInfo.name : 'Unknown Player'}! 🎉`;
                    } else if (winners.length > 1) {
                        const winnerNames = winners.map(w => {
                            const playerInfo = playersInfo.find(p => p.uuid === w.playerId);
                            return playerInfo ? playerInfo.name : 'Unknown Player';
                        }).join(' and ');
                        winnerText = `🎉 It's a tie between ${winnerNames}! 🎉`;
                    } else {
                        winnerText = "Game ended, but winner could not be determined from final scores.";
                    }
                    winnerAnnouncementElement.textContent = winnerText;
                } else {
                    winnerAnnouncementElement.textContent = "Could not determine final scores.";
                }
            } else {
                winnerAnnouncementElement.textContent = "No historical data to determine winner.";
            }
        }

        // --- NEW: Add Stats Section ---
        const statsDiv = document.getElementById('game-over-stats');
        if (statsDiv) {
            // Final net worths, cash, portfolio value
            const maxPeriod = Math.max(...historicalWorthData.map(d => d.period));
            const finalPeriodData = historicalWorthData.filter(d => d.period === maxPeriod);
            // Map uuid to player info
            const playerMap = {};
            summaryData.players.forEach(p => { playerMap[p.uuid] = p; });
            // Sort by net worth descending
            const ranked = [...finalPeriodData].sort((a, b) => b.totalWorth - a.totalWorth);
            let html = '<h3>Final Standings</h3>';
            html += '<table style="margin: 0 auto; border-collapse: collapse; min-width: 320px;">';
            html += '<tr><th style="padding:4px 8px;">Rank</th><th style="padding:4px 8px;">Player</th><th style="padding:4px 8px;">Net Worth</th><th style="padding:4px 8px;">Cash</th><th style="padding:4px 8px;">Portfolio</th></tr>';
            ranked.forEach((d, i) => {
                const p = playerMap[d.playerId];
                html += `<tr><td style="padding:4px 8px;">${i+1}</td><td style="padding:4px 8px; font-weight:bold;">${p ? p.name : d.playerId}</td><td style="padding:4px 8px;">₹${d.totalWorth.toLocaleString()}</td><td style="padding:4px 8px;">₹${p ? (p.finalCash || 0).toLocaleString() : 'N/A'}</td><td style="padding:4px 8px;">₹${p ? (p.finalPortfolioValue || 0).toLocaleString() : 'N/A'}</td></tr>`;
            });
            html += '</table>';

            // Best single-period gain
            let bestGain = { player: null, value: -Infinity, period: null };
            const playerPeriods = {};
            historicalWorthData.forEach(d => {
                if (!playerPeriods[d.playerId]) playerPeriods[d.playerId] = [];
                playerPeriods[d.playerId].push(d);
            });
            Object.keys(playerPeriods).forEach(pid => {
                const arr = playerPeriods[pid].sort((a,b) => a.period - b.period);
                for (let i = 1; i < arr.length; ++i) {
                    const gain = arr[i].totalWorth - arr[i-1].totalWorth;
                    if (gain > bestGain.value) {
                        bestGain = { player: pid, value: gain, period: arr[i].period };
                    }
                }
            });
            if (bestGain.player) {
                const p = playerMap[bestGain.player];
                html += `<div style="margin-top:18px;"><b>Best Single-Period Gain:</b> ${p ? p.name : bestGain.player} (+₹${bestGain.value.toLocaleString()} in P${bestGain.period})</div>`;
            }

            // Most valuable portfolio
            let mostValuablePortfolio = { player: null, value: -Infinity };
            summaryData.players.forEach(p => {
                if ((p.finalPortfolioValue || 0) > mostValuablePortfolio.value) {
                    mostValuablePortfolio = { player: p, value: p.finalPortfolioValue };
                }
            });
            if (mostValuablePortfolio.player) {
                html += `<div style="margin-top:8px;"><b>Most Valuable Portfolio:</b> ${mostValuablePortfolio.player.name} (₹${mostValuablePortfolio.value.toLocaleString()})</div>`;
            }

            // Most profitable short (not tracked in summaryData, so show N/A)
            html += `<div style="margin-top:8px;"><b>Most Profitable Short:</b> <span style='color:#888'>N/A (not tracked)</span></div>`;

            // Number of transactions (not tracked in summaryData, so show N/A)
            html += `<div style="margin-top:8px;"><b>Number of Transactions:</b> <span style='color:#888'>N/A (not tracked)</span></div>`;

            statsDiv.innerHTML = html;
        }

        // Display Random Wisdom Quote
        if (wisdomQuoteElement && wisdomQuotes.length > 0) {
            const randomIndex = Math.floor(Math.random() * wisdomQuotes.length);
            wisdomQuoteElement.textContent = wisdomQuotes[randomIndex];
        }
    }
});

// NEW: Function to render the player worth chart
let playerWorthChartInstance = null; // To keep track of an existing chart instance

function renderPlayerWorthChart(historicalData, playersInfo) {
    console.log("[renderPlayerWorthChart] Received historicalData:", JSON.parse(JSON.stringify(historicalData))); // DEEP COPY FOR LOGGING
    console.log("[renderPlayerWorthChart] Received playersInfo:", JSON.parse(JSON.stringify(playersInfo))); // DEEP COPY FOR LOGGING

    if (!playerWorthChartCanvas) {
        console.error('Player worth chart canvas not found.');
        return;
    }

    if (playerWorthChartInstance) {
        playerWorthChartInstance.destroy(); // Destroy previous chart instance if exists
    }

    // Determine all unique periods for the x-axis labels
    const periods = [...new Set(historicalData.map(d => d.period))].sort((a, b) => a - b);
    console.log("[renderPlayerWorthChart] Calculated periods for X-axis:", periods);

    const datasets = playersInfo.map((player, index) => { // Added index here
        const playerData = periods.map(p => { 
            const record = historicalData.find(d => d.period === p && d.playerId === player.uuid);
            return record ? record.totalWorth : null; 
        });

        if (playerData.every(dp => dp === null)) {
            console.warn(`[renderPlayerWorthChart] Player ${player.name} (UUID: ${player.uuid}) has no valid data points for any period. Line will be missing. Raw playerData:`, JSON.parse(JSON.stringify(playerData)), "Historical data for player:", JSON.parse(JSON.stringify(historicalData.filter(d => d.playerId === player.uuid))));
        }

        // Corrected player color assignment to use the player's index
        const playerColor = COMPANY_COLOR_PALETTE[index % COMPANY_COLOR_PALETTE.length] || '#808080'; // Fallback to grey if palette is exhausted

        console.log(`[renderPlayerWorthChart] For player ${player.name} (UUID: ${player.uuid}): Data points:`, playerData, `Assigned Color: ${playerColor}`);

        return {
            label: player.name,
            data: playerData,
            borderColor: playerColor,
            backgroundColor: lightenColor(playerColor, 0.8), // Lighter fill for area chart, or use for line point background
            fill: false,
            tension: 0.1 // Slight curve to lines
        };
    });

    playerWorthChartInstance = new Chart(playerWorthChartCanvas, {
        type: 'line',
        data: {
            labels: periods.map(p => `P${p}`), // e.g., P0, P1, P2
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true, // Maintain aspect ratio based on canvas size
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Player Net Worth Over Game Periods'
                }
            },
            scales: {
                y: {
                    beginAtZero: false, // Start y-axis near the lowest value for better differentiation
                    title: {
                        display: true,
                        text: 'Total Worth (₹)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Game Period'
                    }
                }
            }
        }
    });
}

// NEW: Function to render Player Turn Order Table
function renderPlayerTurnOrderTable(players, currentTurnPlayerId, period, gameStarted) {
    const infoBar = document.getElementById('info-bar');
    if (!infoBar) {
        if (playerTurnOrderTableElement) {
            playerTurnOrderTableElement.style.display = 'none';
        }
        return;
    }

    if (!gameStarted || !players || players.length === 0) {
        if (playerTurnOrderTableElement) {
            playerTurnOrderTableElement.style.display = 'none';
        }
        return;
    }

    if (!playerTurnOrderTableElement) {
        playerTurnOrderTableElement = document.createElement('table');
        playerTurnOrderTableElement.className = 'player-turn-order-table';
        
        // Add table headers only once when table is created
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const thName = document.createElement('th');
        thName.textContent = 'Player';
        headerRow.appendChild(thName);
        const thTurns = document.createElement('th');
        thTurns.textContent = 'Turns';
        thTurns.style.textAlign = 'right'; // Align header text to match dots
        headerRow.appendChild(thTurns);
        thead.appendChild(headerRow);
        playerTurnOrderTableElement.appendChild(thead);

        const tbody = document.createElement('tbody');
        playerTurnOrderTableElement.appendChild(tbody);
        infoBar.parentNode.insertBefore(playerTurnOrderTableElement, infoBar.nextSibling);
    }

    playerTurnOrderTableElement.style.display = 'table';
    const tableBody = playerTurnOrderTableElement.querySelector('tbody');
    
    if (!tableBody) return; // Should not happen if table created correctly, but good guard
    tableBody.innerHTML = ''; // Ensure this is called to clear previous rows

    // Determine the starting player index for the current period
    // (period - 1) because period is 1-indexed.
    // Add players.length before modulo to ensure positive result if (period - 1) is 0
    const periodStartingPlayerIndex = ((period - 1) % players.length + players.length) % players.length;

    players.forEach((player, idx) => {
        const tr = document.createElement('tr');
        const isCurrentTurn = player.id === currentTurnPlayerId;
        const isPeriodStarter = idx === periodStartingPlayerIndex;

        // DEBUG LOG ADDED HERE
        console.log(`[renderPlayerTurnOrderTable DEBUG] Rendering dots for ${player.name}. transactionsRemaining: ${player.transactionsRemaining}, isCurrentTurn: ${isCurrentTurn}`);

        if (isCurrentTurn) {
            tr.classList.add('current-turn-highlight-table');
        }

        const tdName = document.createElement('td');
        tdName.classList.add('player-name-cell');
        
        let nameHTML = '';
        if (isPeriodStarter) {
            nameHTML += '<span class="round-starter-star">★</span> ';
        }
        nameHTML += player.name;
        // No (Next) or (Turns left) here as per simplification, player list handles those.
        
        tdName.innerHTML = nameHTML;
        tr.appendChild(tdName);

        // Add Turns Remaining Dots Cell
        const tdTurns = document.createElement('td');
        tdTurns.classList.add('turns-dots-cell');
        
        const totalAllowedTransactions = 3; // Assuming max 3 transactions per round for display
        const turnsRemaining = player.transactionsRemaining;

        for (let i = 0; i < totalAllowedTransactions; i++) {
            const dot = document.createElement('span');
            dot.classList.add('turn-dot-indicator');
            // If dot index is less than the number of REMAINING turns, it's green.
            if (i < turnsRemaining) {
                dot.classList.add('turn-dot-green');
            } else {
                dot.classList.add('turn-dot-grey');
            }
            tdTurns.appendChild(dot);
        }
        tr.appendChild(tdTurns);

        tableBody.appendChild(tr);
    });
}

function renderDeckInfoPanel() {
    const leaderboard = document.querySelector('.leaderboard');
    if (!leaderboard) return;

    let deckInfoPanel = document.getElementById('deck-info-panel');
    if (!deckInfoPanel) {
        deckInfoPanel = document.createElement('div');
        deckInfoPanel.id = 'deck-info-panel';
        deckInfoPanel.className = 'panel deck-info-panel';
        deckInfoPanel.style.marginTop = '20px';
        
        const header = document.createElement('div');
        header.className = 'deck-info-header';
        header.innerHTML = '<h4>Deck Info <span class="expand-icon">▼</span></h4>';
        header.style.cursor = 'pointer';
        header.onclick = () => {
            const content = deckInfoPanel.querySelector('.deck-info-content');
            const icon = header.querySelector('.expand-icon');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.textContent = '▼';
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
            }
        };
        
        const content = document.createElement('div');
        content.className = 'deck-info-content';
        content.style.display = 'none';
        
        deckInfoPanel.appendChild(header);
        deckInfoPanel.appendChild(content);
        leaderboard.parentNode.insertBefore(deckInfoPanel, leaderboard.nextSibling);
    }

    const content = deckInfoPanel.querySelector('.deck-info-content');
    if (!content) return;

    const numPlayers = currentGameState?.players?.length || 0;
    const cardsInOneDeckUnit = (6 * 4 * 3) + (3 * 2); // 6 companies * 4 moves * 3 copies + 3 windfalls * 2 copies
    const cardsNeededForDealingAndBuffer = (numPlayers * 10) + 50; // 10 cards per player + 50 buffer
    const N = Math.max(1, Math.ceil(cardsNeededForDealingAndBuffer / cardsInOneDeckUnit));
    const totalCards = cardsInOneDeckUnit * N;

    let html = `
        <div class="deck-info-summary">
            <p>Total Cards in Deck: ${totalCards}</p>
            <p>Cards per Player: 10</p>
            <p>Minimum Cards Remaining: 50</p>
        </div>
        <div class="deck-info-details">
            <h5>Price Cards</h5>
            <table class="deck-info-table" style="margin-bottom: 16px; width: 100%; border-collapse: collapse;">
              <thead><tr><th style='text-align:left;'>Company</th><th style='text-align:left;'>Moves</th><th style='text-align:right;'>Copies</th></tr></thead>
              <tbody>
    `;
    // Add price cards info as table rows
    COMPANIES.forEach(company => {
        html += `<tr><td><strong>${company.name} (${company.id})</strong></td><td>${company.moves.map(move => `${move > 0 ? '+' : ''}${move}`).join(', ')}</td><td style='text-align:right;'>${3 * N}</td></tr>`;
    });
    html += `</tbody></table>`;
    html += `
            <h5>Windfall Cards</h5>
            <table class="deck-info-table" style="width: 100%; border-collapse: collapse;">
              <thead><tr><th style='text-align:left;'>Type</th><th style='text-align:right;'>Copies</th></tr></thead>
              <tbody>
                <tr><td>LOAN</td><td style='text-align:right;'>${2 * N}</td></tr>
                <tr><td>DEBENTURE</td><td style='text-align:right;'>${2 * N}</td></tr>
                <tr><td>RIGHTS</td><td style='text-align:right;'>${2 * N}</td></tr>
              </tbody>
            </table>
        </div>
    `;

    content.innerHTML = html;
}