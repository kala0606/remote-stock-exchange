// Dynamic socket server configuration
const SOCKET_SERVER = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000' 
    : `https://${window.location.hostname}`;

// Silence all console output
try {
    const noop = function(){};
    console.log = noop;
    console.warn = noop;
    console.info = noop;
    console.debug = noop;
    console.error = noop;
} catch (e) {}

// Initialize socket connection with proper configuration
const socket = io(SOCKET_SERVER, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    maxReconnectionAttempts: 5
});

// Connection event handlers will be defined later after DOM elements are loaded

// Keep-alive ping REMOVED to allow machine auto-stop and reduce costs
// The machine will auto-start when players visit the site
// setInterval(() => {
//     if (socket && socket.connected) {
//         socket.emit('ping');
//     }
// }, 25000);

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

// NEW: Company Gradient Color System
const COMPANY_GRADIENT_CLASSES = [
    'company-color-0', // Tomato gradient
    'company-color-1', // SteelBlue gradient
    'company-color-2', // LimeGreen gradient
    'company-color-3', // Gold gradient
    'company-color-4', // SlateBlue gradient
    'company-color-5', // HotPink gradient
    'company-color-6', // DarkTurquoise gradient
    'company-color-7', // Orange gradient
    'company-color-8', // BlueViolet gradient
    'company-color-9'  // Chocolate gradient
];

const COMPANY_BAR_CLASSES = [
    'company-bar-0', 'company-bar-1', 'company-bar-2', 'company-bar-3', 'company-bar-4',
    'company-bar-5', 'company-bar-6', 'company-bar-7', 'company-bar-8', 'company-bar-9'
];

const COMPANY_TEXT_CLASSES = [
    'company-text-0', 'company-text-1', 'company-text-2', 'company-text-3', 'company-text-4',
    'company-text-5', 'company-text-6', 'company-text-7', 'company-text-8', 'company-text-9'
];

let companyColors = {}; // To be populated with { companyId: colorIndex }
let companyGradientClasses = {}; // Maps companyId to gradient class

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

// Timer functions
function startTurnTimer() {
    if (isTimerRunning) {
        return; // Timer already running
    }
    
    turnStartTime = Date.now();
    isTimerRunning = true;
    
    // Show timer element
    const timerElement = document.getElementById('turn-timer');
    if (timerElement) {
        timerElement.style.display = 'inline';
    }
    
    // Start the timer interval
    turnTimer = setInterval(updateTimerDisplay, 1000);
    console.log('[Timer] Started turn timer');
}

function stopTurnTimer() {
    if (!isTimerRunning) {
        return; // Timer not running
    }
    
    isTimerRunning = false;
    
    // Clear the timer interval
    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }
    
    // Hide timer element
    const timerElement = document.getElementById('turn-timer');
    if (timerElement) {
        timerElement.style.display = 'none';
    }
    
    console.log('[Timer] Stopped turn timer');
}

function updateTimerDisplay() {
    if (!isTimerRunning || !turnStartTime) {
        return;
    }
    
    const elapsed = Date.now() - turnStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) {
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function resetTurnTimer() {
    stopTurnTimer();
    turnStartTime = null;
}

// DOM Elements - Declared ONCE
const lobbyScreen = document.getElementById('lobby');
const gameScreen = document.getElementById('game');
const createRoomBtn = document.getElementById('createRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const startGameBtn = document.getElementById('startGame');
const roomCodeInput = document.getElementById('roomCode');
const playerNameInput = document.getElementById('playerName');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// Function to update connection status indicator
function updateConnectionStatus(status, message) {
    if (statusIndicator && statusText) {
        statusIndicator.className = `status-indicator ${status}`;
        statusText.textContent = message;
    }
}

// Initialize connection status
updateConnectionStatus('connecting', 'Connecting to server...');

// Add input filtering for room code to only allow numbers
if (roomCodeInput) {
    roomCodeInput.addEventListener('input', (e) => {
        // Remove any non-numeric characters
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
        // Limit to 4 digits
        if (e.target.value.length > 4) {
            e.target.value = e.target.value.slice(0, 4);
        }
    });
}
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

// Rights Calculator elements
const rightsCalculator = document.getElementById('rights-calculator');
const rightsCardsInput = document.getElementById('rightsCardsInput');
const rightsCalculation = document.getElementById('rightsCalculation');

console.log('[Element Selection] Rights calculator elements:', {
    rightsCalculator: !!rightsCalculator,
    rightsCardsInput: !!rightsCardsInput,
    rightsCalculation: !!rightsCalculation
});
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
// Help Modal Elements
const helpButton = document.getElementById('helpButton');
const helpModal = document.getElementById('help-modal');
const closeHelpBtn = document.getElementById('closeHelpBtn');

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
if (helpModal) helpModal.style.display = 'none';


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
let lastHandSignature = ''; // Track hand changes to avoid unnecessary gradient updates
let lastGradientSentiment = 0; // For smoothing gradient changes
let activityLogEntries = []; // MODIFIED: Added to store activity log entries
let handDeltas = {}; // NEW: To store net impact of hand cards

// Timer functionality
let turnTimer = null;
let turnStartTime = null;
let isTimerRunning = false;


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

// Connection event handlers
socket.on('connect', () => {
    console.log('[connect] Socket.IO connected to:', SOCKET_SERVER, 'Socket ID:', socket.id);
    isConnected = true;
    updateConnectionStatus('connected', 'Connected to server');
    
    // Enable buttons when connected
    if (createRoomBtn) createRoomBtn.disabled = false;
    if (joinRoomBtn) joinRoomBtn.disabled = false;

    // Handle session token rejoin if available
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('session');
    currentSessionToken = tokenFromUrl || localStorage.getItem('remoteStockExchangeSessionToken');

    if (currentSessionToken) {
        console.log('[connect] Found session token, attempting to rejoin:', currentSessionToken);
        isRejoining = true;
        socket.emit('rejoinWithToken', currentSessionToken, response => {
            console.log('[rejoinWithToken callback] Response:', response);
            if (response.error) {
                alert('Failed to rejoin session: ' + response.error);
                localStorage.removeItem('remoteStockExchangeSessionToken');
                history.replaceState(null, '', window.location.pathname);
                currentSessionToken = null;
                isRejoining = false;
                if (lobbyScreen) lobbyScreen.style.display = 'block';
                if (gameScreen) gameScreen.style.display = 'none';
                return;
            }
            currentRoom = response.roomID;
            currentPlayerName = response.playerName;
            localStorage.setItem('remoteStockExchangeSessionToken', currentSessionToken);
            console.log('[rejoinWithToken callback] Rejoin successful. Room:', currentRoom, 'Player:', currentPlayerName);
        });
    } else {
        console.log('[connect] No session token found. Fresh connection.');
        if (lobbyScreen) lobbyScreen.style.display = 'block';
        if (gameScreen) gameScreen.style.display = 'none';
    }
});

socket.on('disconnect', (reason) => {
    console.log('[disconnect] Socket.IO disconnected:', reason);
    isConnected = false;
    updateConnectionStatus('disconnected', 'Disconnected from server');
    if (createRoomBtn) createRoomBtn.disabled = true;
    if (joinRoomBtn) joinRoomBtn.disabled = true;
});

socket.on('connect_error', (error) => {
    console.log('[connect_error] Socket.IO connection error:', error);
    isConnected = false;
    updateConnectionStatus('disconnected', 'Connection failed - retrying...');
    if (createRoomBtn) createRoomBtn.disabled = true;
    if (joinRoomBtn) joinRoomBtn.disabled = true;
});

// Help modal open/close
if (helpButton && helpModal) {
    helpButton.addEventListener('click', () => {
        helpModal.style.display = 'flex';
    });
}
if (closeHelpBtn && helpModal) {
    closeHelpBtn.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });
}
// Close help modal on outside click
if (helpModal) {
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.style.display = 'none';
    });
}

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
                        localStorage.setItem('remoteStockExchangeSessionToken', currentSessionToken);
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
        const roomID = roomCodeInput ? roomCodeInput.value.trim() : '';
        const name = playerNameInput ? playerNameInput.value.trim() : '';
        if (!roomID || !name) {
            alert('Please enter both room code and your name.');
            return;
        }
        if (!/^\d{4}$/.test(roomID)) {
            alert('Room code must be a 4-digit number (e.g., 1234).');
            return;
        }
        currentPlayerName = name;
        console.log('Joining room:', roomID, 'as:', name);
        joinRoomBtn.disabled = true;
        socket.emit('joinRoom', { roomID, name }, response => {
            joinRoomBtn.disabled = false;
            console.log('Join response:', response);
            if (response.error) {
                if (response.error.includes('Room not found')) {
                    alert('Room not found. This usually means:\n\n1. The server restarted and the room was lost\n2. The room code is incorrect\n3. The room expired\n\nPlease ask the admin to create a new room and share the new code.');
                } else if (response.error.includes('Room is full')) {
                    alert('Room is full! Maximum 12 players allowed.');
                } else if (response.error.includes('Name already taken')) {
                    alert('Name already taken in this room. Please choose a different name.');
                } else {
                    alert(response.error);
                }
                return;
            }
            if (response.sessionToken) {
                currentSessionToken = response.sessionToken;
                localStorage.setItem('remoteStockExchangeSessionToken', currentSessionToken);
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
if (passBtn) passBtn.addEventListener('click', () => {
    stopTurnTimer(); // Stop timer when passing turn
    socket.emit('pass', { roomID: currentRoom });
}); // Corrected event name
if (endTurnBtn) endTurnBtn.addEventListener('click', () => {
    stopTurnTimer(); // Stop timer when ending turn
    socket.emit('endTurn', { roomID: currentRoom });
}); // Corrected event name

function showTransactionModal(action) {
    console.log('[showTransactionModal] Opening modal for action:', action);
    currentTransaction = { action: action, company: null, quantity: null };
    
    const transactionTypeTitle = document.getElementById('transaction-type');
    if (transactionTypeTitle) {
        transactionTypeTitle.textContent = action === 'buy' ? 'Buy Shares' : 'Sell Shares';
    }
    
    // Show/hide rights calculator based on action
    if (rightsCalculator) {
        console.log('[showTransactionModal] Setting rights calculator display:', action === 'buy' ? 'block' : 'none');
        rightsCalculator.style.display = action === 'buy' ? 'block' : 'none';
    } else {
        console.log('[showTransactionModal] Rights calculator element not found!');
    }
    
    if (companySelect) companySelect.innerHTML = '<option value="" disabled selected>Select a company</option>';
    if (quantityInput) quantityInput.value = '';
    if (rightsCardsInput) rightsCardsInput.value = '0';
    
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
    updateRightsCalculator();
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
        updateRightsCalculator();
    });
}

if (quantityInput) {
    quantityInput.addEventListener('input', (event) => {
        const quantity = parseInt(event.target.value);
        currentTransaction.quantity = isNaN(quantity) ? null : quantity;
        updateTransactionCostInfo();
    });
}

// Rights Calculator event listeners
if (rightsCardsInput) {
    rightsCardsInput.addEventListener('input', () => {
        updateRightsCalculator();
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

    playerListDiv.style.display = 'block';

    const currentPlayerForControls = players.find(p => p.id === socket.id);
    const localIsAdminForControls = currentPlayerForControls ? currentPlayerForControls.isAdmin : false;
    
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
                    <span class="turn-indicator ${isCurrent ? 'active' : ''}">${isCurrent ? '★' : ''}</span>
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
    
    console.log('[gameState] Received state:', JSON.parse(JSON.stringify(state)));
    console.log('[gameState] Current turn player ID:', state.state?.currentTurnPlayerId);
    console.log('[gameState] Is your turn:', state.isYourTurn);
    console.log('[gameState] Current player ID:', socket.id);
    
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
            companyGradientClasses = {}; // Reset gradient classes too
            state.state.companyList.forEach((company, index) => {
                const colorIndex = index % COMPANY_GRADIENT_CLASSES.length;
                companyColors[company.id] = colorIndex;
                companyGradientClasses[company.id] = COMPANY_GRADIENT_CLASSES[colorIndex];
            });
            console.log('Company gradient classes assigned:', companyGradientClasses);
        }
    }
    
    isAdmin = state.isAdmin; 
    isYourTurn = state.isYourTurn;
    
    // Handle timer based on turn changes
    if (isYourTurn && state.state?.currentTurnPlayerId === socket.id && !state.state?.awaitingAdminDecision) {
        // It's my turn and not awaiting admin decision - start timer if not already running
        if (!isTimerRunning) {
            startTurnTimer();
        }
    } else {
        // It's not my turn OR awaiting admin decision - stop timer if running
        if (isTimerRunning) {
            stopTurnTimer();
        }
    }
    
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

// Function to calculate future market sentiment based on current cards in all players' hands
function calculateFutureMarketSentiment(allPlayersData, companiesStaticData, currentPrices) {
    if (!allPlayersData || !companiesStaticData || !currentPrices) {
        console.log('Missing data for future sentiment calculation:', { 
            allPlayersData: !!allPlayersData, 
            companiesStaticData: !!companiesStaticData,
            currentPrices: !!currentPrices
        });
        return 0;
    }
    
    let totalFutureChange = 0;
    let totalPriceCards = 0;
    
    // Aggregate all price cards from ALL players (using percentage changes)
    const futureDeltas = {};
    companiesStaticData.forEach(company => {
        futureDeltas[company.id] = 0;
    });
    
    // Add ALL players' hand cards (convert to percentage changes)
    allPlayersData.forEach(player => {
        if (player.hand && Array.isArray(player.hand)) {
            player.hand.forEach(card => {
                if (card.type === 'price' && !card.played) {
                    const currentPrice = currentPrices[card.company];
                    if (currentPrice && currentPrice > 0) {
                        // Convert absolute change to percentage change
                        const percentageChange = (card.change / currentPrice) * 100;
                        futureDeltas[card.company] += percentageChange;
                        totalPriceCards++;
                    }
                }
            });
        }
    });
    
    // No need for deck estimation since we're using all players' actual hands
    
    // Calculate sentiment based on aggregated future changes
    let companiesWithChanges = 0;
    let totalAbsoluteChange = 0;
    
    for (const companyId in futureDeltas) {
        if (futureDeltas[companyId] !== 0) {
            totalFutureChange += futureDeltas[companyId];
            totalAbsoluteChange += Math.abs(futureDeltas[companyId]);
            companiesWithChanges++;
        }
    }
    
    // If no companies have changes, try to calculate a baseline sentiment from the deck
    let futureSentiment = 0;
    if (companiesWithChanges > 0) {
        futureSentiment = totalFutureChange / companiesWithChanges;
    } else {
        // Fallback: calculate average sentiment from all possible cards in the deck (using percentages)
        let deckSentiment = 0;
        let totalDeckCards = 0;
        
        companiesStaticData.forEach(company => {
            const currentPrice = currentPrices[company.id];
            if (currentPrice && currentPrice > 0) {
                company.moves.forEach(move => {
                    const percentageChange = (move / currentPrice) * 100;
                    deckSentiment += percentageChange;
                    totalDeckCards++;
                });
            }
        });
        
        if (totalDeckCards > 0) {
            futureSentiment = deckSentiment / totalDeckCards;
        }
    }
    
    // Ensure we have a meaningful sentiment value
    if (Math.abs(futureSentiment) < 1 && totalPriceCards > 0) {
        // If sentiment is too small but we have price cards, amplify it
        futureSentiment = futureSentiment * 2;
    }
    
    console.log('Cumulative Market Sentiment Calculation (All Players):', {
        totalFutureChange: totalFutureChange.toFixed(2),
        totalAbsoluteChange: totalAbsoluteChange.toFixed(2),
        companiesWithChanges,
        futureSentiment: futureSentiment.toFixed(2),
        totalPlayers: allPlayersData.length,
        totalPriceCards,
        futureDeltas: Object.fromEntries(
            Object.entries(futureDeltas).map(([key, value]) => [key, value.toFixed(2)])
        )
    });
    
    return futureSentiment;
}

// Helper function to refresh gradient based on current game state
function refreshBackgroundGradient() {
    if (!currentGameState) return;
    
    const companiesStaticData = currentGameState.state?.companyList || [];
    const playerHandToRender = currentGameState.hand || [];
    const allPlayers = currentGameState.players || [];
    
    const currentPrices = currentGameState.state?.prices || {};
    const futureSentiment = calculateFutureMarketSentiment(allPlayers, companiesStaticData, currentPrices);
    updateBackgroundGradient(futureSentiment);
}

// Function to update background gradient based on market sentiment
function updateBackgroundGradient(sentiment) {
    // Clamp sentiment to prevent extreme values
    const clampedSentiment = Math.max(-50, Math.min(50, sentiment));
    
    console.log('Fluid Gradient Update (Future Sentiment):', {
        rawSentiment: sentiment.toFixed(2),
        clampedSentiment: clampedSentiment.toFixed(2),
        usingShader: 'WebGL Fluid Gradient'
    });
    
    // Use the fluid gradient shader instead of CSS
    if (typeof updateFluidGradient === 'function') {
        updateFluidGradient(clampedSentiment);
    } else {
        console.warn('Fluid gradient shader not available, falling back to CSS');
        // Fallback to CSS gradient if shader not available
        const baseGrey = 240;
        let finalColor;
        
        if (clampedSentiment > 0) {
            const intensity = Math.min(30, Math.abs(clampedSentiment) * 0.6);
            const greenTint = Math.floor(baseGrey - intensity);
            finalColor = `rgb(${greenTint}, ${baseGrey}, ${greenTint})`;
        } else if (clampedSentiment < 0) {
            const intensity = Math.min(30, Math.abs(clampedSentiment) * 0.6);
            const redTint = Math.floor(baseGrey - intensity);
            finalColor = `rgb(${baseGrey}, ${redTint}, ${redTint})`;
        } else {
            finalColor = `rgb(${baseGrey}, ${baseGrey}, ${baseGrey})`;
        }
        
        document.body.style.background = `linear-gradient(45deg, ${finalColor}, ${finalColor})`;
        document.body.style.backgroundSize = '200% 200%';
        document.body.style.animation = `gradientAnimation 12s ease-in-out infinite`;
    }
}

// Modify the updateUI function to include sentiment calculation and background update
function updateUI(state) {
    console.log("[updateUI] Received game state:", state);
    console.log("[updateUI] Current turn player ID:", state.state?.currentTurnPlayerId);
    console.log("[updateUI] Is your turn:", state.isYourTurn);
    console.log("[updateUI] Current player ID:", socket.id);
    console.log("[updateUI] Player transactions remaining:", state.players?.find(p => p.id === socket.id)?.transactionsRemaining);
    
    // Check if this is a new period (cards were just dealt) BEFORE updating currentGameState
    const isNewPeriod = state.state?.period && currentGameState?.state?.period && 
                        state.state.period !== currentGameState.state.period;
    
    // Also check for new round within same period (after admin resolves prices)
    const isNewRound = state.state?.roundNumberInPeriod && currentGameState?.state?.roundNumberInPeriod &&
                       state.state.roundNumberInPeriod !== currentGameState.state.roundNumberInPeriod;
    
    console.log('Period Detection:', {
        currentPeriod: state.state?.period,
        previousPeriod: currentGameState?.state?.period,
        isNewPeriod,
        currentRound: state.state?.roundNumberInPeriod,
        previousRound: currentGameState?.state?.roundNumberInPeriod,
        isNewRound,
        currentGameStateExists: !!currentGameState,
        handLength: state.hand?.length || 0,
        priceCards: state.hand?.filter(card => card.type === 'price' && !card.played).length || 0
    });
    
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

    const me = state.players.find(p => p.id === socket.id || p.name === currentPlayerName);
    const playerHandToRender = state.hand || []; 

    // Calculate future market sentiment based on current cards and update gradient
    // Only update gradient when cards actually change, not on every state update
    const currentHandSignature = JSON.stringify(playerHandToRender.map(card => ({ type: card.type, company: card.company, change: card.change })));
    
    console.log('Gradient Update Check:', {
        lastHandSignature: lastHandSignature.substring(0, 50) + '...',
        currentHandSignature: currentHandSignature.substring(0, 50) + '...',
        signaturesMatch: lastHandSignature === currentHandSignature,
        handLength: playerHandToRender.length,
        priceCards: playerHandToRender.filter(card => card.type === 'price' && !card.played).length
    });
    
    
    // Force update gradient if we have a fresh hand (new period) or if hand actually changed
    const isNewHand = playerHandToRender.length > 0 && lastHandSignature === '';
    const handChanged = lastHandSignature !== currentHandSignature;
    
    // Reset signature if new period or new round to force gradient update
    if (isNewPeriod || isNewRound) {
        console.log('New period or round detected, resetting hand signature');
        lastHandSignature = '';
    }
    
    // Also check if we have a significant number of price cards (indicating new cards were dealt)
    const hasSignificantPriceCards = playerHandToRender.filter(card => card.type === 'price' && !card.played).length >= 5;
    const shouldForceUpdate = hasSignificantPriceCards && lastHandSignature !== '';
    
    if (isNewHand || handChanged || isNewPeriod || isNewRound || shouldForceUpdate) {
        console.log('Hand changed, new hand, new period/round, or significant price cards - updating gradient...', { 
            isNewHand, 
            handChanged, 
            isNewPeriod,
            isNewRound,
            shouldForceUpdate,
            priceCards: playerHandToRender.filter(card => card.type === 'price' && !card.played).length,
            period: state.state?.period,
            previousPeriod: currentGameState?.state?.period,
            round: state.state?.roundNumberInPeriod,
            previousRound: currentGameState?.state?.roundNumberInPeriod
        });
        const futureSentiment = calculateFutureMarketSentiment(state.players, companiesStaticData, currentMarketPrices);
        
        // Reset smoothing when new cards are dealt (new period, new round, or significant price cards)
        if (isNewPeriod || isNewRound || shouldForceUpdate) {
            console.log('New period, new round, or significant price cards - resetting gradient smoothing');
            lastGradientSentiment = 0; // Reset to prevent accumulation
        }
        
        // Use less aggressive smoothing to prevent gradual darkening
        const smoothedSentiment = (lastGradientSentiment * 0.3) + (futureSentiment * 0.7);
        updateBackgroundGradient(smoothedSentiment);
        lastHandSignature = currentHandSignature;
        lastGradientSentiment = smoothedSentiment;
    } else {
        console.log('Hand unchanged, skipping gradient update');
    } 

    if (me) {
        updateGeneralRightsOffers(me); 
        updateOpenShortsPanel(me, currentMarketPrices, companiesStaticData);
        updatePortfolioPanel(me, currentMarketPrices, companiesStaticData);
    } else {
        updateGeneralRightsOffers(null);
        updateOpenShortsPanel(null, currentMarketPrices, companiesStaticData);
        updatePortfolioPanel(null, currentMarketPrices, companiesStaticData);
    }

    const currentPlayerNameForBar = state.players.find(p => p.id === state.state.currentTurnPlayerId)?.name || 'N/A';
    const yourTurnText = isYourTurn ? ' <span class="your-turn-indicator-dot">●</span>' : '';
    const highlightedPlayerName = isYourTurn ? `<span class="current-turn-player-name-highlight">${currentPlayerNameForBar}</span>` : currentPlayerNameForBar;

      if (periodSpan) {
          periodSpan.innerHTML = `P${state.state.period} | R${state.state.roundNumberInPeriod} | ${highlightedPlayerName}${yourTurnText}`;
          console.log(`[updateUI] Updated period display - Current Turn: ${currentPlayerNameForBar}, Is Your Turn: ${isYourTurn}`);
      }

    renderMarketBoard(currentMarketPrices, companiesStaticData, currentInitialPrices); 
    renderPlayerHand(playerHandToRender, companiesStaticData); 

    updatePlayerList(state.players, state.state.currentTurnPlayerId); 
    updateLeaderboard(state.players, currentMarketPrices, companiesStaticData); 
    updatePriceLogTable(); 
    renderPlayerTurnOrderTable(state.players, state.state.currentTurnPlayerId, state.state.period, state.state.gameStarted);
    
    // Background is now updated by our future sentiment calculation above
    // updateMarketSentimentBackground(state.state.marketSentiment || 'neutral');
    renderDeckInfoPanel(state.players.length);

    // Calculate hand deltas and update the summary display
    calculateHandDeltas(playerHandToRender, companiesStaticData);
    updateHandSummaryDisplay();

    if (lobbyScreen && gameScreen) {
        if (state.state && state.state.gameStarted) {
            lobbyScreen.style.display = 'none';
            gameScreen.style.display = 'block';
        } else {
            lobbyScreen.style.display = 'block';
            gameScreen.style.display = 'none';
        }
    }

    // Admin Decision Panel Logic
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

    const normalActionButtons = [buyBtn, sellBtn, shortSellBtn, endTurnBtn];
    const canPerformTransaction = isYourTurn && me && me.transactionsRemaining > 0 && !state.state.awaitingAdminDecision;
    const canPassOrEnd = isYourTurn && !state.state.awaitingAdminDecision;

    console.log(`[updateUI] Action button states - canPerformTransaction: ${canPerformTransaction}, canPassOrEnd: ${canPassOrEnd}`);
    // ADD CONSOLE LOG BEFORE ADMIN DECISION CHECK
    console.log(`[updateUI - Admin Panel Check] Period: ${state.state.period}, Round: ${state.state.roundNumberInPeriod}, awaitingAdminDecision: ${state.state.awaitingAdminDecision}, pricesResolvedThisCycle: ${state.state.pricesResolvedThisCycle}, isAdmin: ${isAdmin}`);

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
                adminAdvanceNewPeriodBtn.onclick = () => {
                    console.log('Admin clicked Advance to New Period - will force gradient update on next game state');
                    // Reset hand signature to force gradient update when new cards arrive
                    lastHandSignature = '';
                    socket.emit('adminAdvanceToNewPeriod_DealCards', { roomID: currentRoom });
                };
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
                    const colorIndex = companyColors[companyId] || 0;
                    const textClass = COMPANY_TEXT_CLASSES[colorIndex] || 'company-text-0';
                    portfolioDetails.push({
                        name: companyName,
                        shares: formatIndianNumber(shares),
                        value: formatIndianNumber(value),
                        textClass: textClass,
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
                const colorIndex = companyColors[companyId] || 0;
                const textClass = COMPANY_TEXT_CLASSES[colorIndex] || 'company-text-0';
                const unrealizedPnl = (shortPosition.priceOpened - currentPrice) * shortPosition.quantity;
                portfolioDetails.push({
                    name: companyName,
                    shares: `-${formatIndianNumber(shortPosition.quantity)}`,
                    value: formatIndianNumber(value),
                    textClass: textClass,
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
            <td>₹${formatIndianNumber(player.overallWorth)}${player.worthChangeText}</td>
            <td>₹${formatIndianNumber(player.cash)}</td>
            <td>₹${formatIndianNumber(player.portfolioValue)}</td>
        </tr>`;
        // Portfolio details as a second row
        leaderboardHTML += `<tr class="portfolio-details-row"><td colspan="4">`;
        if (player.portfolioDetails.length > 0) {
            leaderboardHTML += '<ul class="leaderboard-portfolio-details">';
            player.portfolioDetails.forEach(item => {
                if (item.type === 'long') {
                    leaderboardHTML += `<li><span class=\"${item.textClass}\">${item.name}</span>: ${item.shares} shares (Value: ₹${item.value})</li>`;
                } else {
                    const pnlClass = item.unrealizedPnl >= 0 ? 'positive-pnl' : 'negative-pnl';
                    leaderboardHTML += `<li><span class=\"${item.textClass}\">${item.name}</span>: ${item.shares} shares (Value: ₹${item.value}) <span class="${pnlClass}">P&L: ₹${formatIndianNumber(item.unrealizedPnl)}</span></li>`;
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
                <div>Overall Worth: <span class="leaderboard-overall-worth">₹${formatIndianNumber(player.overallWorth)}</span>${player.worthChangeText}</div>
                <div>Cash: ₹${formatIndianNumber(player.cash)}</div>
                <div>Portfolio Value: ₹${formatIndianNumber(player.portfolioValue)}</div>
                <div>Portfolio:`;
            if (player.portfolioDetails.length > 0) {
                mobileHTML += '<ul class="leaderboard-portfolio-details">';
                player.portfolioDetails.forEach(item => {
                    if (item.type === 'long') {
                        mobileHTML += `<li><span class=\"${item.textClass}\">${item.name}</span><br><span>${item.shares} shares (Value: ₹${item.value})</span></li>`;
                    } else {
                        const pnlClass = item.unrealizedPnl >= 0 ? 'positive-pnl' : 'negative-pnl';
                        mobileHTML += `<li><span class=\"${item.textClass}\">${item.name}</span><br><span>${item.shares} shares (Value: ₹${item.value}) <span class="${pnlClass}">P&L: ₹${formatIndianNumber(item.unrealizedPnl)}</span></span></li>`;
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
    if (!selectedCompany) {
        rightsCostInfoDiv.innerHTML = 'Please select a company.';
        return;
    }

    const player = currentGameState?.players.find(p => p.id === socket.id);
    if (!player) {
        rightsCostInfoDiv.innerHTML = 'Player data not available.';
        return;
    }

    const ownedShares = player.portfolio[selectedCompany] || 0;
    const initialPrice = initialPrices[selectedCompany];
    if (initialPrice === undefined) {
        rightsCostInfoDiv.innerHTML = 'Initial price data not available.';
        return;
    }

    const rightsPricePerShare = Math.ceil(initialPrice / 2);
    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const maxEligibleInLots = Math.floor(maxEligibleRaw / 1000) * 1000;
    const desiredSharesStr = desiredRightsSharesInput?.value || '0';
    const desiredSharesNum = parseInt(desiredSharesStr) || 0;

    let infoHtml = `Owned: ${ownedShares.toLocaleString()} shares.<br>`;
    infoHtml += `Eligible for: ${maxEligibleRaw.toLocaleString()} rights (${maxEligibleInLots.toLocaleString()} in 1000s lots).<br>`;
    infoHtml += `Rights price: ₹${rightsPricePerShare.toLocaleString()}/share.<br>`;

    // Calculate affordable quantity based on player's cash
    const maxAffordableQuantity = Math.floor(player.cash / rightsPricePerShare / 1000) * 1000;
    infoHtml += `You can afford up to ${maxAffordableQuantity.toLocaleString()} shares (₹${player.cash.toLocaleString()} cash).<br>`;

    if (desiredSharesNum > 0) {
        if (desiredSharesNum > maxEligibleRaw) {
            infoHtml += `<span style="color:red;">Warning: Requesting ${desiredSharesNum.toLocaleString()}, eligible for ${maxEligibleInLots.toLocaleString()} (effective).</span><br>`;
        }
        const actualOfferedShares = Math.floor(desiredSharesNum / 1000) * 1000;
        if (actualOfferedShares > 0) {
            // Add share limit check
            if (ownedShares + actualOfferedShares > MAX_SHARES_PER_COMPANY_CLIENT) {
                const canBuy = MAX_SHARES_PER_COMPANY_CLIENT - ownedShares;
                infoHtml += `<span style="color:red;">Warning: This would exceed the ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()} share limit. You can only exercise rights for up to ${canBuy.toLocaleString()} more shares.</span><br>`;
            }
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
            // Add share limit check
            if (ownedShares + actualOfferedShares > MAX_SHARES_PER_COMPANY_CLIENT) {
                const canBuy = MAX_SHARES_PER_COMPANY_CLIENT - ownedShares;
                infoHtml += `<span style="color:red;">Warning: This would exceed the ${MAX_SHARES_PER_COMPANY_CLIENT.toLocaleString()} share limit. You can only exercise rights for up to ${canBuy.toLocaleString()} more shares.</span><br>`;
            }
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
        const colorIndex = companyColors[company.id] || 0;
        const textClass = COMPANY_TEXT_CLASSES[colorIndex] || 'company-text-0';
        th.textContent = company.name;
        th.className = textClass;
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

// Helper function to calculate rights information for a player and company
function calculateRightsInfo(player, companyId) {
    console.log('[calculateRightsInfo] Called with:', { player: player?.name, companyId, hasGameState: !!currentGameState, hasInitialPrices: !!initialPrices });
    
    if (!player || !companyId || !currentGameState || !initialPrices) {
        console.log('[calculateRightsInfo] Missing required data, returning null');
        return null;
    }
    
    // Check if player has RIGHTS cards in hand
    const playerHand = currentGameState.players.find(p => p.id === socket.id)?.hand || [];
    const rightsCards = playerHand.filter(card => card.type === 'windfall' && card.sub === 'RIGHTS' && !card.played);
    
    console.log('[calculateRightsInfo] Player hand:', playerHand.map(c => ({ type: c.type, sub: c.sub, played: c.played })));
    console.log('[calculateRightsInfo] Rights cards found:', rightsCards.length);
    
    if (rightsCards.length === 0) {
        console.log('[calculateRightsInfo] No RIGHTS cards found, returning null');
        return null;
    }
    
    // Check if player owns shares in the selected company
    const ownedShares = player.portfolio?.[companyId] || 0;
    console.log('[calculateRightsInfo] Owned shares:', ownedShares);
    
    if (ownedShares === 0) {
        console.log('[calculateRightsInfo] No shares owned in company, returning null');
        return null;
    }
    
    // Get initial price for rights calculation
    const initialPrice = initialPrices[companyId];
    console.log('[calculateRightsInfo] Initial price:', initialPrice);
    
    if (initialPrice === undefined) {
        console.log('[calculateRightsInfo] No initial price found, returning null');
        return null;
    }
    
    // Calculate rights information
    const rightsPrice = Math.ceil(initialPrice / 2);
    const maxEligibleRaw = Math.floor(ownedShares / 2);
    const maxEligibleInLots = Math.floor(maxEligibleRaw / 1000) * 1000;
    const maxAffordableRaw = Math.floor(player.cash / rightsPrice);
    const maxAffordableInLots = Math.floor(maxAffordableRaw / 1000) * 1000;
    
    // Generate suggestion
    let suggestion = '';
    if (maxEligibleInLots > 0 && maxAffordableInLots > 0) {
        const optimalAmount = Math.min(maxEligibleInLots, maxAffordableInLots);
        suggestion = `Consider using RIGHTS for ${optimalAmount.toLocaleString()} shares at ₹${rightsPrice}/share instead of buying at market price.`;
    } else if (maxEligibleInLots > 0) {
        suggestion = `You're eligible for ${maxEligibleInLots.toLocaleString()} rights shares but need more cash.`;
    } else {
        suggestion = `You need at least 2,000 shares to be eligible for rights.`;
    }
    
    return {
        rightsCardsCount: rightsCards.length,
        rightsPrice: rightsPrice,
        maxEligible: maxEligibleInLots,
        maxAffordable: maxAffordableInLots,
        suggestion: suggestion
    };
}

// Function to update rights calculator display
function updateRightsCalculator() {
    if (!rightsCalculator || !rightsCalculation || !rightsCardsInput) {
        console.log('[updateRightsCalculator] Missing elements:', { rightsCalculator: !!rightsCalculator, rightsCalculation: !!rightsCalculation, rightsCardsInput: !!rightsCardsInput });
        return;
    }
    
    const selectedCompany = currentTransaction.company;
    const rightsCardsCount = parseInt(rightsCardsInput.value) || 0;
    
    console.log('[updateRightsCalculator] Called with:', { selectedCompany, rightsCardsCount });
    
    if (!selectedCompany) {
        rightsCalculation.innerHTML = 'Select a company to see rights strategy';
        return;
    }
    
    if (rightsCardsCount === 0) {
        rightsCalculation.innerHTML = 'Enter number of rights cards to see strategy';
        return;
    }
    
    const strategy = calculateRightsStrategy(selectedCompany, rightsCardsCount);
    if (!strategy) {
        rightsCalculation.innerHTML = 'Cannot calculate strategy - missing data';
        return;
    }
    
    let html = `<div style="margin-bottom: 8px;">
                  <strong>Prices:</strong> Market ₹${strategy.currentPrice}/share, Rights ₹${strategy.rightsPrice}/share (50% of ₹${strategy.initialPrice} initial)
                </div>
                <div style="margin-bottom: 8px; font-size: 0.9em; color: #666;">
                  <strong>Your Cash:</strong> ₹${strategy.playerCash.toLocaleString()}
                </div>`;
    
    if (strategy.strategies.length === 0) {
        html += `<div style="color: #dc3545;">Not enough cash for any rights strategy</div>`;
    } else {
        html += `<div><strong>Optimal Strategies (sorted by savings):</strong></div>`;
        strategy.strategies.forEach((s, index) => {
            const isBest = index === 0;
            const bgColor = isBest ? '#d4edda' : '#e8f4fd';
            const borderColor = isBest ? '#28a745' : '#4a90e2';
            
            html += `<div style="margin: 4px 0; padding: 8px; background-color: ${bgColor}; border-left: 3px solid ${borderColor}; border-radius: 3px;">
                      <div><strong>${isBest ? '🏆 BEST: ' : ''}Buy ${s.sharesToBuy.toLocaleString()} shares normally</strong></div>
                      <div style="font-size: 0.8em; margin: 2px 0;">→ Then exercise ${s.rightsEligible.toLocaleString()} rights at ₹${strategy.rightsPrice}/share (needs ${s.rightsCardsNeeded} rights card${s.rightsCardsNeeded > 1 ? 's' : ''})</div>
                      <div style="font-size: 0.8em; margin: 2px 0;"><strong>Result:</strong> ${s.totalSharesAfter.toLocaleString()} total shares for ₹${s.totalInvestment.toLocaleString()}</div>
                      <div style="font-size: 0.8em; margin: 2px 0;">Average cost: ₹${Math.round(s.avgCostPerShare)}/share (vs ₹${strategy.currentPrice}/share market)</div>
                      <div style="font-size: 0.8em; color: #28a745; font-weight: bold;">💰 Save ₹${Math.round(s.savings).toLocaleString()} (${s.savingsPercent}% discount)</div>
                    </div>`;
        });
        
        // Add summary
        const bestStrategy = strategy.strategies[0];
        if (bestStrategy) {
            html += `<div style="margin-top: 8px; padding: 6px; background-color: #fff3cd; border-radius: 3px; font-size: 0.85em;">
                      <strong>💡 Recommended:</strong> Buy ${bestStrategy.sharesToBuy.toLocaleString()} shares now, then use ${bestStrategy.rightsCardsNeeded} rights card${bestStrategy.rightsCardsNeeded > 1 ? 's' : ''} to get ${bestStrategy.rightsEligible.toLocaleString()} more at half price!
                    </div>`;
        }
    }
    
    rightsCalculation.innerHTML = html;
}

// Function to calculate rights strategy
function calculateRightsStrategy(companyId, rightsCardsCount) {
    if (!companyId || !initialPrices || !currentGameState) return null;
    
    const initialPrice = initialPrices[companyId];
    const currentPrice = currentGameState.state?.prices[companyId];
    const player = currentGameState.players.find(p => p.id === socket.id);
    
    if (!initialPrice || !currentPrice || !player) return null;
    
    const rightsPrice = Math.ceil(initialPrice / 2);
    const playerCash = player.cash;
    
    console.log('[calculateRightsStrategy] Input:', { companyId, rightsCardsCount, initialPrice, currentPrice, rightsPrice, playerCash });
    
    const strategies = [];
    
    // Calculate different scenarios: buy 2k, 4k, 6k, etc. shares
    const maxSharesAffordable = Math.floor(playerCash / currentPrice / 1000) * 1000;
    
    for (let sharesToBuy = 2000; sharesToBuy <= Math.min(maxSharesAffordable, 20000); sharesToBuy += 2000) {
        const sharesCost = sharesToBuy * currentPrice;
        
        // Calculate how many rights we can exercise (1 right per 2 owned shares)
        const rightsEligible = Math.floor(sharesToBuy / 2);
        const rightsCost = rightsEligible * rightsPrice;
        
        // Check if we have enough cash for both shares and rights
        if (sharesCost + rightsCost <= playerCash) {
            const totalSharesAfter = sharesToBuy + rightsEligible;
            const totalInvestment = sharesCost + rightsCost;
            const avgCostPerShare = totalInvestment / totalSharesAfter;
            
            // Calculate savings compared to buying all shares at market price
            const marketCostForTotalShares = totalSharesAfter * currentPrice;
            const savings = marketCostForTotalShares - totalInvestment;
            const savingsPercent = Math.round((savings / marketCostForTotalShares) * 100);
            
            strategies.push({
                rightsCardsNeeded: Math.ceil(rightsEligible / 1000), // Estimate how many rights cards needed
                sharesToBuy: sharesToBuy,
                rightsEligible: rightsEligible,
                sharesCost: sharesCost,
                rightsCost: rightsCost,
                totalInvestment: totalInvestment,
                totalSharesAfter: totalSharesAfter,
                avgCostPerShare: avgCostPerShare,
                savings: savings,
                savingsPercent: savingsPercent,
                marketCostForTotalShares: marketCostForTotalShares
            });
        }
    }
    
    // Filter strategies based on available rights cards
    const validStrategies = strategies.filter(s => s.rightsCardsNeeded <= rightsCardsCount);
    
    // Sort valid strategies by savings (best first)
    validStrategies.sort((a, b) => b.savings - a.savings);
    
    console.log('[calculateRightsStrategy] Valid strategies:', validStrategies);
    
    return {
        initialPrice: initialPrice,
        currentPrice: currentPrice,
        rightsPrice: rightsPrice,
        playerCash: playerCash,
        strategies: validStrategies.slice(0, 5) // Show top 5 strategies
    };
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
            
            // NEW: Add rights information for buy transactions
            console.log('[updateTransactionCostInfo] Checking for rights info for company:', selectedCompany);
            const rightsInfo = calculateRightsInfo(player, selectedCompany);
            console.log('[updateTransactionCostInfo] Rights info result:', rightsInfo);
            
            if (rightsInfo) {
                console.log('[updateTransactionCostInfo] Adding rights info to display');
                const savings = currentPrice - rightsInfo.rightsPrice;
                const savingsPercent = currentPrice > 0 ? Math.round((savings / currentPrice) * 100) : 0;
                additionalInfo += `<div style="margin-top: 10px; padding: 8px; background-color: #e8f4fd; border-left: 3px solid #4a90e2; border-radius: 3px;">
                                    <p style="margin: 0 0 5px 0; font-weight: bold; color: #4a90e2;">🎫 Rights Available</p>
                                    <p style="margin: 0; font-size: 0.9em;">You have ${rightsInfo.rightsCardsCount} RIGHTS card(s) in hand</p>
                                    <p style="margin: 0; font-size: 0.9em;"><strong>Rights Price:</strong> ₹${rightsInfo.rightsPrice}/share (vs ₹${currentPrice}/share market)</p>
                                    ${savings > 0 ? `<p style="margin: 0; font-size: 0.9em; color: #28a745;"><strong>Save:</strong> ₹${savings}/share (${savingsPercent}% discount)</p>` : ''}
                                    <p style="margin: 0; font-size: 0.9em;"><strong>Max Eligible:</strong> ${rightsInfo.maxEligible} rights shares</p>
                                    <p style="margin: 0; font-size: 0.9em;"><strong>Max Affordable:</strong> ${rightsInfo.maxAffordable} shares with current cash</p>
                                    ${rightsInfo.suggestion ? `<p style="margin: 5px 0 0 0; font-size: 0.85em; font-style: italic; color: #666;">💡 ${rightsInfo.suggestion}</p>` : ''}
                                  </div>`;
            } else {
                console.log('[updateTransactionCostInfo] No rights info to display');
                // Debug: Show why rights info is not available
                const playerHand = currentGameState.players.find(p => p.id === socket.id)?.hand || [];
                const rightsCards = playerHand.filter(card => card.type === 'windfall' && card.sub === 'RIGHTS' && !card.played);
                const ownedShares = player.portfolio?.[selectedCompany] || 0;
                
                if (rightsCards.length === 0 && ownedShares > 0) {
                    additionalInfo += `<div style="margin-top: 10px; padding: 8px; background-color: #fff3cd; border-left: 3px solid #ffc107; border-radius: 3px;">
                                        <p style="margin: 0; font-size: 0.9em; color: #856404;">💡 You own ${ownedShares.toLocaleString()} shares but have no RIGHTS cards in hand</p>
                                      </div>`;
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

    const currentPrice = currentGameState.state.prices ? currentGameState.state.prices[companySymbol] : undefined;
    const companyDetails = currentGameState.state.companyList ? currentGameState.state.companyList.find(c => c.id === companySymbol) : null;

    if (currentPrice === undefined || !companyDetails) {
        shortSellInfoDiv.textContent = 'Market data not yet available or company details missing.';
        console.warn('[updateShortSellInfoDiv] Market data missing! Price or details undefined.');
        confirmShortSellBtn.disabled = true;
        return;
    }
    
    let infoText = `Selected: ${getCompanyName(companySymbol)}. Price: ₹${currentPrice.toLocaleString()}.<br>`;
    
    // Calculate affordable quantity based on player's cash
    const maxAffordableQuantity = Math.floor(player.cash / currentPrice / 1000) * 1000;
    infoText += `You can afford up to ${maxAffordableQuantity.toLocaleString()} shares (₹${player.cash.toLocaleString()} cash).<br>`;
    
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
        reason = ""; // Removed the quantity validation message
    } else if (player.transactionsRemaining <= 0) {
        canShort = false;
        reason = "No transactions left.";
    } else if (quantity > maxAffordableQuantity) {
        canShort = false;
        reason = `Insufficient cash for collateral. Need ₹${(quantity * currentPrice).toLocaleString()}.`;
    }

    if (!canShort && reason) { // Only show message if there's a reason
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
            const colorIndex = companyColors[company.id] || 0;
            const barClass = COMPANY_BAR_CLASSES[colorIndex] || 'company-bar-0';
            
            let barGraphHTML = `<div class="price-level-bar-container">`;
            barGraphHTML += `<div class="price-level-bar ${barClass}" style="width: ${barWidth}%;"></div>`;
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
    const handContainer = document.getElementById('player-hand-container');
    if (!handContainer) return;

    // Find the hand content div (where cards should be rendered)
    let handContent = handContainer.querySelector('.hand-content');
    if (!handContent) {
        // If the collapsible structure doesn't exist yet, create it
        handContainer.innerHTML = `
            <div class="hand-header" style="cursor: pointer;" onclick="
                const handContent = this.nextElementSibling;
                const handIcon = this.querySelector('.expand-icon');
                if (handContent.style.display === 'none') {
                    handContent.style.display = 'block';
                    handIcon.textContent = '▼';
                } else {
                    handContent.style.display = 'none';
                    handIcon.textContent = '▶';
                }
            ">
                <h4>Your Hand <span class="expand-icon">▼</span></h4>
            </div>
            <div class="hand-content" style="display: block;">
                <!-- Player hand cards will be rendered here -->
            </div>
        `;
        handContent = handContainer.querySelector('.hand-content');
    }

    // Clear existing cards from the content area
    handContent.innerHTML = '';

    // Create a grid container for cards
    const cardsWrapper = document.createElement('div');
    cardsWrapper.className = 'cards-wrapper';
    
    // Set card size based on screen width
    const screenWidth = window.innerWidth;
    let cardWidth;
    if (screenWidth <= 700) { // Mobile
        cardWidth = 'calc(50% - 8px)'; // 2 cards per row on mobile, considering gap
    } else if (screenWidth <= 1024) { // iPad
        cardWidth = '110px';
    } else { // Desktop
        cardWidth = '130px';
    }
    
    cardsWrapper.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(${cardWidth}, 1fr));
        gap: 16px;
        padding: 16px;
        width: 100%;
        box-sizing: border-box;
        justify-content: center;
    `;

    // Add cards to the wrapper
    playerHandArray.forEach((card, index) => {
        const cardElement = document.createElement('div');
        cardElement.className = 'card';
        
        // Get company gradient class if it's a price card
        let cardClass = ''; // Default for windfall cards
        if (card.type === 'price') {
            const companyIndex = companiesStaticData.findIndex(c => c.id === card.company);
            if (companyIndex !== -1) {
                const colorIndex = companyIndex % COMPANY_GRADIENT_CLASSES.length;
                cardClass = COMPANY_GRADIENT_CLASSES[colorIndex];
            }
        }

        // Apply gradient class if it's a price card
        if (cardClass) {
            cardElement.classList.add(cardClass);
        }
        
        cardElement.style.cssText = `
            width: 100%; /* Fill the grid column */
            aspect-ratio: 2/3; /* Taller to allow longer, funnier copy */
            position: relative;
            border-radius: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
        `;

        if (card.played) {
            cardElement.style.opacity = '0.5';
        }

        let cardContent = '';
        if (card.type === 'price') {
            const company = companiesStaticData.find(c => c.id === card.company);
            const changeColor = card.change > 0 ? '#4CAF50' : card.change < 0 ? '#f44336' : '#ffffff';

            // Longer, funnier fallback copy for price cards
            const baseCompanyName = company ? company.name : card.company;
            let generatedMessage = '';
            if (card.change > 0) {
                generatedMessage = `${baseCompanyName} catches a tailwind — price nudges up by ₹${Math.abs(card.change)}. Bulls grin; bears check their calendars.`;
            } else if (card.change < 0) {
                generatedMessage = `${baseCompanyName} trips on the rumor mill — down ₹${Math.abs(card.change)}. Bulls hydrate; bears rehearse victory speeches.`;
            } else {
                generatedMessage = `${baseCompanyName} goes gloriously sideways — unchanged. Everyone pretends that was the plan.`;
            }
            const wittyMessage = card.message || generatedMessage;
            // Looser truncation to allow higher letter count
            const smartTruncated = wittyMessage.length > 120 ? wittyMessage.substring(0, 117) + '...' : wittyMessage;
            
            // Determine text color based on company - ONGC (yellow cards) should have black text
            const isONGC = card.company === 'ONG';
            const wittyTextColor = isONGC ? '#000000' : 'inherit';
            
            cardContent = `
                <div style="padding: 4px; text-align: center; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between; min-height: 0;">
                    <div style="font-weight: bold; font-size: 0.78em; margin-bottom: 2px;">${company ? company.name : card.company}</div>
                    <div style="font-size: 0.72em; line-height: 1.25; opacity: 0.95; padding: 2px; flex-grow: 1; display: flex; align-items: center; justify-content: center; text-align: center; word-wrap: break-word; overflow-wrap: break-word; hyphens: auto; color: ${wittyTextColor};">${smartTruncated}</div>
                </div>
                <div style="padding: 3px; text-align: center; background: ${changeColor}; border-radius: 0 0 8px 8px; flex-shrink: 0;">
                    <div style="font-size: 0.95em; font-weight: bold; color: white;">${card.change > 0 ? '+' : ''}₹${card.change}</div>
                </div>
            `;
        } else if (card.type === 'windfall') {
            // Witty message for windfall cards
            let generatedWindfall = '';
            switch (card.sub) {
                case 'RIGHTS':
                    generatedWindfall = 'Rights bonanza! For every 2 you own, snag 1 more at half price — because bargains taste better in 1000-lot bites.';
                    break;
                case 'LOAN':
                    generatedWindfall = 'Cheap credit hour: the bank slides you a loan, spreadsheets get brave, and leverage whispers sweet nothings.';
                    break;
                case 'DEBENTURE':
                    generatedWindfall = 'Steady Eddy: issue debentures and collect calm, fixed returns while the market argues about vibes.';
                    break;
                default:
                    generatedWindfall = `${card.sub} arrives with jazz hands. Side effects may include grins and strategic pivoting.`;
            }
            const wittyMessage = card.message || generatedWindfall;
            const smartTruncated = wittyMessage.length > 140 ? wittyMessage.substring(0, 137) + '...' : wittyMessage;
            
            cardContent = `
                <div style="padding: 6px; text-align: center; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
                    <div style="font-weight: bold; color: #4a90e2; font-size: 1em; margin-bottom: 4px;">${card.sub}</div>
                    <div style="font-size: 0.72em; line-height: 1.25; color: #555; font-style: italic; flex-grow: 1; display: flex; align-items: center; justify-content: center; text-align: center; word-wrap: break-word; overflow-wrap: break-word; padding: 2px;">${smartTruncated}</div>
                </div>
            `;
        }

        cardElement.innerHTML = cardContent;
        cardElement.onclick = () => handleCardClick(card, index);
        cardsWrapper.appendChild(cardElement);
    });

    // Add the wrapper to the hand content area
    handContent.appendChild(cardsWrapper);
}

// Helper function to convert hex to rgba
function hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Function to update background gradient based on market sentiment
function updateMarketSentimentBackground(sentiment) {
    const body = document.body;
    
    let gradient;
    switch (sentiment) {
        case 'bullish':
            // Strong green with grey
            gradient = 'linear-gradient(135deg, #f0f0f0 0%, #e8f5e8 20%, #d4f4d4 40%, #f5f5f5 60%, #f0f0f0 100%)';
            break;
        case 'positive':
            // Light green with grey
            gradient = 'linear-gradient(135deg, #f0f0f0 0%, #f0f8f0 30%, #f5f5f5 70%, #f0f0f0 100%)';
            break;
        case 'bearish':
            // Strong red with grey
            gradient = 'linear-gradient(135deg, #f0f0f0 0%, #fae8e8 20%, #f4d4d4 40%, #f5f5f5 60%, #f0f0f0 100%)';
            break;
        case 'negative':
            // Light red with grey
            gradient = 'linear-gradient(135deg, #f0f0f0 0%, #f8f0f0 30%, #f5f5f5 70%, #f0f0f0 100%)';
            break;
        case 'neutral':
        default:
            // Pure grey gradient
            gradient = 'linear-gradient(135deg, #f8f8f8 0%, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%, #f8f8f8 100%)';
            break;
    }
    
    body.style.background = gradient;
    body.style.backgroundAttachment = 'fixed';
    
    console.log(`[Market Sentiment Background] Applied ${sentiment} gradient`);
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
    const activityLogContent = document.querySelector('.activity-log-content');
    if (!activityLogContent) return;

    // Clear existing entries
    activityLogContent.innerHTML = '';

    // Add each log entry
    activityLogEntries.forEach(entry => {
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        // Add data-action-type for power negation logs
        if (entry.details && entry.details.includes('Chairman power negated')) {
            logEntry.setAttribute('data-action-type', 'CHAIRMAN_POWER');
        } else if (entry.details && entry.details.includes('President power negated')) {
            logEntry.setAttribute('data-action-type', 'PRESIDENT_POWER');
        }
        
        // Format the log entry text
        let logText = '';
        
        // Add period/round prefix if available
        if (entry.period && entry.round) {
            logText += `<span class="period-round-info">P${entry.period}R${entry.round}</span> `;
        }
        
        if (entry.playerName) {
            logText += `${entry.playerName}: `;
        }
        logText += entry.details;
        
        logEntry.innerHTML = logText; // Use innerHTML to render the span
        activityLogContent.appendChild(logEntry);
    });

    // Scroll to bottom
    activityLogContent.scrollTop = activityLogContent.scrollHeight;
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

// NEW: Listener for game summary and to render comprehensive analytics
socket.on('gameSummaryReceived', (summaryData) => {
    console.log('[gameSummaryReceived]', summaryData);
    
    // Hide other screens and show analytics
    if (lobbyScreen) lobbyScreen.style.display = 'none';
    if (gameOverScreen) {
        gameOverScreen.style.display = 'block'; // Changed from flex to block for full page
        gameOverScreen.scrollIntoView({ behavior: 'smooth' });
    }

    if (summaryData) {
        // Render all analytics sections
        renderGameAnalytics(summaryData);
        
        // Display Random Wisdom Quote
        if (wisdomQuoteElement && wisdomQuotes.length > 0) {
            const randomIndex = Math.floor(Math.random() * wisdomQuotes.length);
            wisdomQuoteElement.textContent = wisdomQuotes[randomIndex];
        }
    }
});

// NEW: Comprehensive analytics renderer
function renderGameAnalytics(summaryData) {
    const { historicalWorthData, players: playersInfo, priceLog, finalPrices, initialPrices, 
            chairmen, presidents, companyList, turnTimeData, totalPeriods, gameStartTime, gameEndTime } = summaryData;
    
    console.log('[renderGameAnalytics] Processing summary data:', summaryData);
    
    // 1. Determine Winner and populate winner announcement
    renderWinnerAnnouncement(historicalWorthData, playersInfo);
    
    // 2. Render summary cards
    renderSummaryCards(summaryData);
    
    // 3. Render player worth chart
    if (historicalWorthData && playersInfo) {
        renderPlayerWorthChart(historicalWorthData, playersInfo);
    }
    
    // 4. Render final standings table
    renderFinalStandings(historicalWorthData, playersInfo, turnTimeData);
    
    // 5. Render company performance analysis
    renderCompanyPerformance(companyList, initialPrices, finalPrices, priceLog);
    
    // 6. Render detailed player performance breakdown
    renderPlayerPerformanceBreakdown(summaryData);
    
    // 7. Render transaction analysis
    renderTransactionAnalysis(summaryData);
    
    // 8. Render rights & shorts analysis
    renderRightsAndShortsAnalysis(summaryData);
    
    // 9. Render leadership analysis
    renderLeadershipAnalysis(chairmen, presidents, playersInfo, companyList);
    
    // 10. Render game timeline
    renderGameTimeline(summaryData);
}

function renderWinnerAnnouncement(historicalWorthData, playersInfo) {
    if (!winnerAnnouncementElement || !historicalWorthData || historicalWorthData.length === 0) {
        if (winnerAnnouncementElement) {
            winnerAnnouncementElement.textContent = "No historical data to determine winner.";
        }
        return;
    }
    
    const maxPeriod = Math.max(...historicalWorthData.map(d => d.period));
    const finalPeriodData = historicalWorthData.filter(d => d.period === maxPeriod);
    
    if (finalPeriodData.length === 0) {
        winnerAnnouncementElement.textContent = "Could not determine final scores.";
        return;
    }
    
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
}

function renderSummaryCards(summaryData) {
    const { historicalWorthData, players: playersInfo, totalPeriods, gameStartTime, gameEndTime, turnTimeData } = summaryData;
    
    // Game Summary Card
    const gameSummaryContent = document.getElementById('game-summary-content');
    if (gameSummaryContent) {
        const gameDuration = gameEndTime && gameStartTime ? 
            Math.round((gameEndTime - gameStartTime) / 1000 / 60) : 'Unknown';
        const totalTurns = turnTimeData ? turnTimeData.length : 'Unknown';
        
        gameSummaryContent.innerHTML = `
            <div class="metric-card">
                <div class="metric-value">${totalPeriods || 'Unknown'}</div>
                <div class="metric-label">Total Periods</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${gameDuration}m</div>
                <div class="metric-label">Game Duration</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${totalTurns}</div>
                <div class="metric-label">Total Turns</div>
            </div>
        `;
    }
    
    // Top Performers Card
    const topPerformersContent = document.getElementById('top-performers-content');
    if (topPerformersContent && historicalWorthData && historicalWorthData.length > 0) {
        const maxPeriod = Math.max(...historicalWorthData.map(d => d.period));
        const finalPeriodData = historicalWorthData.filter(d => d.period === maxPeriod);
        const ranked = [...finalPeriodData].sort((a, b) => b.totalWorth - a.totalWorth);
        
        let html = '';
        ranked.slice(0, 3).forEach((player, index) => {
            const playerInfo = playersInfo.find(p => p.uuid === player.playerId);
            const medal = ['🥇', '🥈', '🥉'][index];
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding: 10px; background: #f8f9fa; border-radius: 4px;">
                    <span>${medal} ${playerInfo ? playerInfo.name : 'Unknown'}</span>
                    <span><strong>₹${formatIndianNumber(player.totalWorth)}</strong></span>
                </div>
            `;
        });
        topPerformersContent.innerHTML = html;
    }
    
    // Key Metrics Card
    const keyMetricsContent = document.getElementById('key-metrics-content');
    if (keyMetricsContent && historicalWorthData && historicalWorthData.length > 0) {
        // Calculate key metrics
        const maxPeriod = Math.max(...historicalWorthData.map(d => d.period));
        const initialData = historicalWorthData.filter(d => d.period === 0);
        const finalData = historicalWorthData.filter(d => d.period === maxPeriod);
        
        const totalInitialWealth = initialData.reduce((sum, p) => sum + p.totalWorth, 0);
        const totalFinalWealth = finalData.reduce((sum, p) => sum + p.totalWorth, 0);
        const wealthGrowth = totalFinalWealth - totalInitialWealth;
        const wealthGrowthPercent = totalInitialWealth > 0 ? 
            ((wealthGrowth / totalInitialWealth) * 100).toFixed(1) : 0;
        
        // Calculate average turn time
        const avgTurnTime = turnTimeData && turnTimeData.length > 0 ?
            Math.round(turnTimeData.reduce((sum, turn) => sum + turn.turnDuration, 0) / turnTimeData.length / 1000) : 0;
        
        keyMetricsContent.innerHTML = `
            <div class="metric-card">
                <div class="metric-value ${wealthGrowth >= 0 ? 'price-change positive' : 'price-change negative'}">
                    ${wealthGrowth >= 0 ? '+' : ''}₹${formatIndianNumber(wealthGrowth)}
                </div>
                <div class="metric-label">Total Wealth Change</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${wealthGrowthPercent}%</div>
                <div class="metric-label">Wealth Growth Rate</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${avgTurnTime}s</div>
                <div class="metric-label">Avg Turn Time</div>
            </div>
        `;
    }
}

function renderFinalStandings(historicalWorthData, playersInfo, turnTimeData) {
    const finalStandingsTable = document.getElementById('final-standings-table');
    if (!finalStandingsTable || !historicalWorthData || historicalWorthData.length === 0) return;
    
    const maxPeriod = Math.max(...historicalWorthData.map(d => d.period));
    const finalPeriodData = historicalWorthData.filter(d => d.period === maxPeriod);
    const playerMap = {};
    playersInfo.forEach(p => { playerMap[p.uuid] = p; });
    const ranked = [...finalPeriodData].sort((a, b) => b.totalWorth - a.totalWorth);
    
    // Calculate turn time stats
    const playerTurnTimes = {};
    if (turnTimeData && turnTimeData.length > 0) {
        turnTimeData.forEach(turn => {
            if (!playerTurnTimes[turn.playerName]) {
                playerTurnTimes[turn.playerName] = [];
            }
            playerTurnTimes[turn.playerName].push(turn.turnDuration);
        });
    }
    
    let html = `
        <table class="analytics-table">
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Net Worth</th>
                    <th>Cash</th>
                    <th>Portfolio Value</th>
                    <th>Avg Turn Time</th>
                    <th>Performance</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    ranked.forEach((d, i) => {
        const p = playerMap[d.playerId];
        const playerName = p ? p.name : d.playerId;
        const turnTimes = playerTurnTimes[playerName] || [];
        const avgTurnTime = turnTimes.length > 0 
            ? Math.round(turnTimes.reduce((sum, time) => sum + time, 0) / turnTimes.length / 1000) 
            : 0;
        const avgTimeDisplay = avgTurnTime > 0 ? `${avgTurnTime}s` : 'N/A';
        
        // Calculate performance relative to starting position
        const initialData = historicalWorthData.find(h => h.period === 0 && h.playerId === d.playerId);
        const performance = initialData ? 
            ((d.totalWorth - initialData.totalWorth) / initialData.totalWorth * 100).toFixed(1) : 'N/A';
        const performanceClass = performance !== 'N/A' ? 
            (parseFloat(performance) >= 0 ? 'price-change positive' : 'price-change negative') : '';
        
        html += `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${playerName}</strong></td>
                <td>₹${formatIndianNumber(d.totalWorth)}</td>
                <td>₹${p ? formatIndianNumber(p.finalCash || 0) : 'N/A'}</td>
                <td>₹${p ? formatIndianNumber(p.finalPortfolioValue || 0) : 'N/A'}</td>
                <td>${avgTimeDisplay}</td>
                <td><span class="${performanceClass}">${performance !== 'N/A' ? (performance >= 0 ? '+' : '') + performance + '%' : 'N/A'}</span></td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    finalStandingsTable.innerHTML = html;
}

function renderCompanyPerformance(companyList, initialPrices, finalPrices, priceLog) {
    const companyPerformanceContent = document.getElementById('company-performance-content');
    if (!companyPerformanceContent || !companyList) return;
    
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px;">';
    
    companyList.forEach(company => {
        const initialPrice = initialPrices ? initialPrices[company.id] : company.initial;
        const finalPrice = finalPrices ? finalPrices[company.id] : initialPrice;
        const priceChange = finalPrice - initialPrice;
        const priceChangePercent = initialPrice > 0 ? ((priceChange / initialPrice) * 100).toFixed(1) : 0;
        const priceChangeClass = priceChange > 0 ? 'positive' : priceChange < 0 ? 'negative' : 'neutral';
        
        // Calculate volatility from price log
        let volatility = 'N/A';
        if (priceLog && priceLog.length > 0) {
            const companyPrices = priceLog.map(log => log.prices[company.id]).filter(p => p !== undefined);
            if (companyPrices.length > 1) {
                const avg = companyPrices.reduce((sum, p) => sum + p, 0) / companyPrices.length;
                const variance = companyPrices.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / companyPrices.length;
                volatility = Math.sqrt(variance).toFixed(0);
            }
        }
        
        html += `
            <div class="company-card">
                <h4>${company.name} (${company.id})</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                    <div>Initial: ₹${formatIndianNumber(initialPrice)}</div>
                    <div>Final: ₹${formatIndianNumber(finalPrice)}</div>
                    <div>Change: <span class="price-change ${priceChangeClass}">
                        ${priceChange >= 0 ? '+' : ''}₹${formatIndianNumber(priceChange)}
                    </span></div>
                    <div>Change%: <span class="price-change ${priceChangeClass}">
                        ${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent}%
                    </span></div>
                    <div>Volatility: ₹${volatility}</div>
                    <div>Sector: ${company.sector || 'General'}</div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    companyPerformanceContent.innerHTML = html;
}

function renderPlayerPerformanceBreakdown(summaryData) {
    const playerPerformanceBreakdown = document.getElementById('player-performance-breakdown');
    if (!playerPerformanceBreakdown) return;
    
    const { players: playersInfo, historicalWorthData, turnTimeData } = summaryData;
    
    let html = '';
    
    playersInfo.forEach(player => {
        const playerHistory = historicalWorthData.filter(h => h.playerId === player.uuid).sort((a, b) => a.period - b.period);
        const playerTurnTimes = turnTimeData ? turnTimeData.filter(t => t.playerName === player.name) : [];
        
        // Calculate player-specific metrics
        const initialWorth = playerHistory.length > 0 ? playerHistory[0].totalWorth : 0;
        const finalWorth = playerHistory.length > 0 ? playerHistory[playerHistory.length - 1].totalWorth : 0;
        const totalGain = finalWorth - initialWorth;
        const totalGainPercent = initialWorth > 0 ? ((totalGain / initialWorth) * 100).toFixed(1) : 0;
        
        // Best and worst periods
        let bestPeriodGain = { period: 'N/A', gain: -Infinity };
        let worstPeriodGain = { period: 'N/A', gain: Infinity };
        
        for (let i = 1; i < playerHistory.length; i++) {
            const gain = playerHistory[i].totalWorth - playerHistory[i - 1].totalWorth;
            if (gain > bestPeriodGain.gain) {
                bestPeriodGain = { period: playerHistory[i].period, gain };
            }
            if (gain < worstPeriodGain.gain) {
                worstPeriodGain = { period: playerHistory[i].period, gain };
            }
        }
        
        // Turn time stats
        const avgTurnTime = playerTurnTimes.length > 0 ? 
            Math.round(playerTurnTimes.reduce((sum, t) => sum + t.turnDuration, 0) / playerTurnTimes.length / 1000) : 0;
        const maxTurnTime = playerTurnTimes.length > 0 ? 
            Math.round(Math.max(...playerTurnTimes.map(t => t.turnDuration)) / 1000) : 0;
        
        // Portfolio composition
        let portfolioHtml = '';
        if (player.finalPortfolio && Object.keys(player.finalPortfolio).length > 0) {
            portfolioHtml = Object.entries(player.finalPortfolio)
                .filter(([, shares]) => shares > 0)
                .map(([companyId, shares]) => `${companyId}: ${formatIndianNumber(shares)}`)
                .join(', ');
        }
        
        html += `
            <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin: 15px 0; background: #f8f9fa;">
                <h4 style="margin: 0 0 15px 0; color: #2c3e50;">${player.name}</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div>
                        <strong>Financial Performance</strong><br>
                        Total Gain: <span class="price-change ${totalGain >= 0 ? 'positive' : 'negative'}">
                            ${totalGain >= 0 ? '+' : ''}₹${formatIndianNumber(totalGain)} (${totalGainPercent}%)
                        </span><br>
                        Final Cash: ₹${formatIndianNumber(player.finalCash || 0)}<br>
                        Portfolio Value: ₹${formatIndianNumber(player.finalPortfolioValue || 0)}
                    </div>
                    <div>
                        <strong>Period Performance</strong><br>
                        Best Period: P${bestPeriodGain.period} 
                        <span class="price-change positive">+₹${formatIndianNumber(bestPeriodGain.gain)}</span><br>
                        Worst Period: P${worstPeriodGain.period} 
                        <span class="price-change negative">₹${formatIndianNumber(worstPeriodGain.gain)}</span>
                    </div>
                    <div>
                        <strong>Turn Time Stats</strong><br>
                        Average: ${avgTurnTime}s<br>
                        Longest: ${maxTurnTime}s<br>
                        Total Turns: ${playerTurnTimes.length}
                    </div>
                </div>
                ${portfolioHtml ? `<div style="margin-top: 15px;"><strong>Final Portfolio:</strong><br>${portfolioHtml}</div>` : ''}
            </div>
        `;
    });
    
    playerPerformanceBreakdown.innerHTML = html;
}

function renderTransactionAnalysis(summaryData) {
    const transactionAnalysisContent = document.getElementById('transaction-analysis-content');
    if (!transactionAnalysisContent) return;
    
    const { turnTimeData, totalPeriods } = summaryData;
    
    if (!turnTimeData || turnTimeData.length === 0) {
        transactionAnalysisContent.innerHTML = '<p>No transaction data available.</p>';
        return;
    }
    
    // Analyze turn patterns by period
    const periodStats = {};
    turnTimeData.forEach(turn => {
        if (!periodStats[turn.period]) {
            periodStats[turn.period] = { totalTime: 0, count: 0, players: new Set() };
        }
        periodStats[turn.period].totalTime += turn.turnDuration;
        periodStats[turn.period].count++;
        periodStats[turn.period].players.add(turn.playerName);
    });
    
    let html = `
        <table class="analytics-table">
            <thead>
                <tr>
                    <th>Period</th>
                    <th>Total Turns</th>
                    <th>Avg Turn Time</th>
                    <th>Active Players</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    Object.entries(periodStats).forEach(([period, stats]) => {
        const avgTime = Math.round(stats.totalTime / stats.count / 1000);
        html += `
            <tr>
                <td>Period ${period}</td>
                <td>${stats.count}</td>
                <td>${avgTime}s</td>
                <td>${stats.players.size}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    
    // Add activity timeline visualization
    html += '<h4 style="margin-top: 30px;">Activity Timeline</h4>';
    html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 15px;">';
    html += '<p>Game activity distributed across periods with varying turn times and player engagement.</p>';
    html += '</div>';
    
    transactionAnalysisContent.innerHTML = html;
}

function renderRightsAndShortsAnalysis(summaryData) {
    const rightsAndShortsAnalysis = document.getElementById('rights-shorts-analysis');
    if (!rightsAndShortsAnalysis) return;
    
    const { players: playersInfo } = summaryData;
    
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">';
    
    // Rights Analysis
    html += '<div><h4>Rights Offerings Analysis</h4>';
    html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">';
    html += '<p>Rights offerings data would be displayed here based on game activity logs.</p>';
    html += '<p>This would include rights issued, subscribed, and their impact on player positions.</p>';
    html += '</div></div>';
    
    // Shorts Analysis
    html += '<div><h4>Short Positions Analysis</h4>';
    let hasShorts = false;
    let shortsHtml = '';
    
    playersInfo.forEach(player => {
        if (player.finalShortPositions && Object.keys(player.finalShortPositions).length > 0) {
            hasShorts = true;
            const shortsList = Object.entries(player.finalShortPositions)
                .map(([company, shares]) => `${company}: ${formatIndianNumber(shares)}`)
                .join(', ');
            shortsHtml += `<p><strong>${player.name}:</strong> ${shortsList}</p>`;
        }
    });
    
    if (hasShorts) {
        html += `<div style="background: #f8f9fa; padding: 15px; border-radius: 6px;">${shortsHtml}</div>`;
    } else {
        html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 6px;"><p>No short positions held at game end.</p></div>';
    }
    
    html += '</div></div>';
    
    rightsAndShortsAnalysis.innerHTML = html;
}

function renderLeadershipAnalysis(chairmen, presidents, playersInfo, companyList) {
    const leadershipAnalysis = document.getElementById('leadership-analysis');
    if (!leadershipAnalysis) return;
    
    let html = '';
    
    if (companyList && companyList.length > 0) {
        html += `
            <table class="analytics-table">
                <thead>
                    <tr>
                        <th>Company</th>
                        <th>Chairmen</th>
                        <th>Presidents</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        companyList.forEach(company => {
            const companyChairmen = chairmen && chairmen[company.id] ? 
                chairmen[company.id].map(playerId => {
                    const player = playersInfo.find(p => p.id === playerId);
                    return player ? player.name : 'Unknown';
                }).join(', ') : 'None';
            
            const companyPresidents = presidents && presidents[company.id] ? 
                presidents[company.id].map(playerId => {
                    const player = playersInfo.find(p => p.id === playerId);
                    return player ? player.name : 'Unknown';
                }).join(', ') : 'None';
            
            html += `
                <tr>
                    <td><strong>${company.name}</strong></td>
                    <td>${companyChairmen}</td>
                    <td>${companyPresidents}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
    } else {
        html = '<p>No leadership data available.</p>';
    }
    
    leadershipAnalysis.innerHTML = html;
}

function renderGameTimeline(summaryData) {
    const gameTimelineContent = document.getElementById('game-timeline-content');
    if (!gameTimelineContent) return;
    
    const { totalPeriods, gameStartTime, gameEndTime, turnTimeData } = summaryData;
    
    let html = '<div class="timeline-container">';
    
    // Game duration info
    if (gameStartTime && gameEndTime) {
        const duration = Math.round((gameEndTime - gameStartTime) / 1000 / 60);
        const startTime = new Date(gameStartTime).toLocaleTimeString();
        const endTime = new Date(gameEndTime).toLocaleTimeString();
        
        html += `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 10px 0;">Game Session</h4>
                <p><strong>Started:</strong> ${startTime} | <strong>Ended:</strong> ${endTime} | <strong>Duration:</strong> ${duration} minutes</p>
                <p><strong>Total Periods:</strong> ${totalPeriods} | <strong>Total Turns:</strong> ${turnTimeData ? turnTimeData.length : 'Unknown'}</p>
            </div>
        `;
    }
    
    // Period breakdown
    if (turnTimeData && turnTimeData.length > 0) {
        const periodData = {};
        turnTimeData.forEach(turn => {
            if (!periodData[turn.period]) {
                periodData[turn.period] = { turns: 0, totalTime: 0 };
            }
            periodData[turn.period].turns++;
            periodData[turn.period].totalTime += turn.turnDuration;
        });
        
        html += '<h4>Period Breakdown</h4>';
        html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">';
        
        Object.entries(periodData).forEach(([period, data]) => {
            const avgTime = Math.round(data.totalTime / data.turns / 1000);
            html += `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; text-align: center;">
                    <h5 style="margin: 0 0 10px 0;">Period ${period}</h5>
                    <p><strong>${data.turns}</strong> turns</p>
                    <p><strong>${avgTime}s</strong> avg time</p>
                </div>
            `;
        });
        
        html += '</div>';
    }
    
    html += '</div>';
    gameTimelineContent.innerHTML = html;
}

// Handle endturn_awaiting_admin event to stop timer immediately
socket.on('endturn_awaiting_admin', () => {
    console.log('[endturn_awaiting_admin] Received - stopping turn timer');
    stopTurnTimer();
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

        // Use gradient color system for player chart colors
        const colorIndex = index % COMPANY_GRADIENT_CLASSES.length;
        // Extract the main color from our gradient system for chart display
        const chartColors = ['#FF6347', '#4682B4', '#32CD32', '#FFD700', '#6A5ACD', '#FF69B4', '#00CED1', '#FFA500', '#8A2BE2', '#D2691E'];
        const playerColor = chartColors[colorIndex] || '#808080';

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
    tableBody.innerHTML = ''; // Clear previous rows

    // Get the period starter from the game state
    const periodStarterId = currentGameState?.state?.periodStarter;
    console.log(`[renderPlayerTurnOrderTable - Period Starter Check] Period: ${currentGameState?.state?.period}, Round: ${currentGameState?.state?.roundNumberInPeriod}, periodStarterId from state: ${periodStarterId}`); // DEBUG LOG ADDED
    const periodStartingPlayerIndex = players.findIndex(p => p.id === periodStarterId);

    players.forEach((player, idx) => {
        const tr = document.createElement('tr');
        const isCurrentTurn = player.id === currentTurnPlayerId;
        const isPeriodStarter = player.id === periodStarterId;

        if (isCurrentTurn) {
            tr.classList.add('current-turn-highlight-table');
        }

        const tdName = document.createElement('td');
        tdName.classList.add('player-name-cell');
        
        let nameHTML = '';
        if (isPeriodStarter) {
            nameHTML += '<span class="round-starter-star" style="color: #FFD700;">★</span> ';
        }
        nameHTML += player.name;
        
        tdName.innerHTML = nameHTML;
        tr.appendChild(tdName);

        // Add Turns Remaining Dots Cell
        const tdTurns = document.createElement('td');
        tdTurns.classList.add('turns-dots-cell');
        
        const totalAllowedTransactions = 3; // Assuming max 3 transactions per round for display
        const turnsRemaining = player.transactionsRemaining;
        const turnsUsed = totalAllowedTransactions - turnsRemaining;

        // Create dots for all turns (grey for used, green for remaining)
        for (let i = 0; i < totalAllowedTransactions; i++) {
            const dot = document.createElement('span');
            dot.classList.add('turn-dot-indicator');
            // If dot index is less than the number of USED turns, it's grey
            if (i < turnsUsed) {
                dot.classList.add('turn-dot-grey');
            } else {
                dot.classList.add('turn-dot-green');
            }
            tdTurns.appendChild(dot);
        }
        tr.appendChild(tdTurns);

        // Append the row to the table body
        tableBody.appendChild(tr);
    });
}

function renderDeckInfoPanel(numPlayers) {
    let panel = document.getElementById('deck-info-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'deck-info-panel';
        panel.className = 'panel deck-info-panel'; // Re-add old classes for styling
        panel.style.marginTop = '20px';

        const leaderboard = document.querySelector('.leaderboard');
        if (leaderboard) {
            leaderboard.insertAdjacentElement('afterend', panel);
        } else {
            const gameRight = document.querySelector('.game-right');
            gameRight?.appendChild(panel);
        }
    }

    const playerCount = typeof numPlayers === 'number' ? numPlayers : 0;

    let N = 0; // Number of deck units
    if (playerCount > 0 && playerCount <= 3) {
        N = 2;
    } else if (playerCount <= 6) {
        N = 3;
    } else if (playerCount <= 9) {
        N = 5;
    } else if (playerCount >= 10) {
        N = 6;
    }

    const totalCards = N * 27;

    let content = `
        <div class="deck-info-header" style="cursor: pointer;" onclick="
            const content = this.nextElementSibling;
            const icon = this.querySelector('.expand-icon');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.textContent = '▼';
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
            }
        ">
            <h4>Deck Info (${playerCount} Players) <span class="expand-icon">▶</span></h4>
        </div>
        <div class="deck-info-content" style="display: none;">
            <div class="deck-info-summary">
                <p><strong>Total Cards:</strong> ${totalCards} (from <strong>${N}</strong> deck units)</p>
                <p>Each unique card below has <strong>${N}</strong> copies in the deck.</p>
            </div>
            <div class="deck-info-details">
                <h5>Price Cards</h5>
                <table class="deck-info-table" style="margin-bottom: 16px; width: 100%; border-collapse: collapse;">
                    <thead><tr><th style='text-align:left;'>Company</th><th style='text-align:left;'>Moves</th><th style='text-align:right;'>Copies</th></tr></thead>
                    <tbody>
    `;

    COMPANIES.forEach(company => {
        content += `<tr><td><strong>${company.name} (${company.id})</strong></td><td>${company.moves.map(move => `${move > 0 ? '+' : ''}${move}`).join(', ')}</td><td style='text-align:right;'>${N}</td></tr>`;
    });

    content += `</tbody></table>`;
    content += `
                <h5>Windfall Cards</h5>
                <table class="deck-info-table" style="width: 100%; border-collapse: collapse;">
                    <thead><tr><th style='text-align:left;'>Type</th><th style='text-align:right;'>Copies</th></tr></thead>
                    <tbody>
                        <tr><td>LOAN</td><td style='text-align:right;'>${N}</td></tr>
                        <tr><td>DEBENTURE</td><td style='text-align:right;'>${N}</td></tr>
                        <tr><td>RIGHTS</td><td style='text-align:right;'>${N}</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    panel.innerHTML = content;
}

// Function to handle quantity button clicks
function handleQuantityButtonClick(input, increment) {
    const currentValue = parseInt(input.value) || 0;
    const step = parseInt(input.step) || 1000;
    const min = parseInt(input.min) || 0;
    const newValue = increment ? currentValue + step : Math.max(min, currentValue - step);
    input.value = newValue;
    input.dispatchEvent(new Event('input')); // Trigger input event to update any dependent displays
}

// Add event listeners for quantity buttons
document.addEventListener('DOMContentLoaded', () => {
    // Initialize fluid gradient shader
    if (typeof initFluidGradient === 'function') {
        console.log('[DOMContentLoaded] Initializing fluid gradient shader...');
        initFluidGradient();
    } else {
        console.warn('[DOMContentLoaded] Fluid gradient shader not available');
    }
    
    // Initial background will be set when game starts
    // updateMarketSentimentBackground('neutral');
    
    // Find all quantity input containers
    const quantityContainers = document.querySelectorAll('.quantity-input-container');
    
    quantityContainers.forEach(container => {
        const input = container.querySelector('input[type="number"]');
        const incrementBtn = container.querySelector('.quantity-btn.increment');
        const decrementBtn = container.querySelector('.quantity-btn.decrement');
        
        if (input && incrementBtn && decrementBtn) {
            incrementBtn.addEventListener('click', () => handleQuantityButtonClick(input, true));
            decrementBtn.addEventListener('click', () => handleQuantityButtonClick(input, false));
        }
    });
});

// Function to format numbers with Indian abbreviations
function formatIndianNumber(num) {
    if (num >= 10000000) { // 1 crore = 10 million
        return (num / 10000000).toFixed(1) + 'cr';
    } else if (num >= 100000) { // 1 lakh = 100 thousand
        return (num / 100000).toFixed(1) + 'L';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(0) + 'k';
    } else {
        return num.toString();
    }
}

function updatePortfolioPanel(player, marketPrices, companiesStaticData) {
    if (!player || !marketPrices || !companiesStaticData) return;

    // Update summary section
    const portfolioCash = document.getElementById('portfolio-cash');
    const portfolioValue = document.getElementById('portfolio-value');
    const portfolioTotal = document.getElementById('portfolio-total');
    const portfolioHoldings = document.getElementById('portfolio-holdings');

    if (portfolioCash) portfolioCash.textContent = `₹${formatIndianNumber(player.cash)}`;

    let totalPortfolioValue = 0;
    let holdingsHTML = '';

    // Add long positions
    if (player.portfolio) {
        for (const companyId in player.portfolio) {
            const shares = player.portfolio[companyId];
            if (shares > 0) {
                const currentPrice = marketPrices[companyId] !== undefined ? marketPrices[companyId] : 0;
                const value = shares * currentPrice;
                totalPortfolioValue += value;
                const companyName = getCompanyName(companyId, companiesStaticData);
                const colorIndex = companyColors[companyId] || 0;
                const textClass = COMPANY_TEXT_CLASSES[colorIndex] || 'company-text-0';
                holdingsHTML += `
                    <div class="holding-item">
                        <div class="company-name ${textClass}">${companyName}</div>
                        <div class="shares">${shares.toLocaleString()} shares</div>
                    </div>
                `;
            }
        }
    }

    // Add short positions
    if (player.shortPositions) {
        for (const companyId in player.shortPositions) {
            const position = player.shortPositions[companyId];
            const currentPrice = marketPrices[companyId] !== undefined ? marketPrices[companyId] : 0;
            const value = position.quantity * currentPrice;
            totalPortfolioValue -= value; // Subtract short position value
            const companyName = getCompanyName(companyId, companiesStaticData);
            const colorIndex = companyColors[companyId] || 0;
            const textClass = COMPANY_TEXT_CLASSES[colorIndex] || 'company-text-0';
            const unrealizedPnl = (position.priceOpened - currentPrice) * position.quantity;
            const pnlClass = unrealizedPnl >= 0 ? 'positive-pnl' : 'negative-pnl';
            holdingsHTML += `
                <div class="holding-item">
                    <div class="company-name ${textClass}">${companyName} (Short)</div>
                    <div class="shares">-${position.quantity.toLocaleString()} shares <span class="${pnlClass}">P&L: ₹${formatIndianNumber(unrealizedPnl)}</span></div>
                </div>
            `;
        }
    }

    if (portfolioValue) portfolioValue.textContent = `₹${formatIndianNumber(totalPortfolioValue)}`;
    if (portfolioTotal) portfolioTotal.textContent = `₹${formatIndianNumber(player.cash + totalPortfolioValue)}`;
    if (portfolioHoldings) {
        if (holdingsHTML) {
            portfolioHoldings.innerHTML = holdingsHTML;
        } else {
            portfolioHoldings.innerHTML = '<div class="no-shares">No positions</div>';
        }
    }
}