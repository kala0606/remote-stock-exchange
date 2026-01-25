// Console output enabled for debugging and monitoring

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

// Firebase Admin SDK - Initialize safely without blocking server startup
let admin = null;
let db = null;
try {
  admin = require('firebase-admin');
  // Initialize Firebase Admin (use environment variable for service account or default credentials)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      if (admin.apps.length > 0) {
        db = admin.firestore();
        console.log('[Firebase] Firebase Admin initialized successfully from FIREBASE_SERVICE_ACCOUNT.');
      }
    } catch (parseError) {
      console.warn('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', parseError.message);
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      if (admin.apps.length > 0) {
        db = admin.firestore();
        console.log('[Firebase] Firebase Admin initialized successfully from GOOGLE_APPLICATION_CREDENTIALS.');
      }
    } catch (credError) {
      console.warn('[Firebase] Failed to initialize with GOOGLE_APPLICATION_CREDENTIALS:', credError.message);
    }
  } else {
    // Try to initialize with default credentials (for local development)
    try {
      admin.initializeApp();
      if (admin.apps.length > 0) {
        db = admin.firestore();
        console.log('[Firebase] Firebase Admin initialized successfully with default credentials.');
      }
    } catch (e) {
      console.warn('[Firebase] Could not initialize Firebase Admin. Game data will not be saved. Set FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS environment variable.');
    }
  }
} catch (error) {
  console.warn('[Firebase] Firebase Admin SDK not available. Game data will not be saved. Error:', error.message);
  // Continue without Firebase - server should still start
}

// Game Constants
const MAX_PLAYERS = 12;
const START_CASH = 600000;
const SHARE_LOTS = [500, 1000, 5000, 10000];
const MAX_SHARES_PER_COMPANY = 200000;
const COMPANIES = [
  { id:'WCK', name: 'Wockhardt Pharma', initial:20, moves:[10,5,-5,-10] },
  { id:'HDF', name: 'HDFC Bank', initial:25, moves:[15,10,-5,-20] }, // Sum: 0
  { id:'TIS', name: 'Tata Steel', initial:40, moves:[20,10,-10,-20] },
  { id:'ONG', name: 'ONGC Ltd', initial:55, moves:[25,15,-10,-30] }, // Sum: 0
  { id:'REL', name: 'Reliance Industries', initial:75, moves:[30,25,-15,-40] }, // Sum: 0
  { id:'INF', name: 'Infosys Ltd', initial:80, moves:[30,20,-10,-40] } // Sum: 0
];

// Witty and brutal Indian context messages for price changes
const CARD_MESSAGES = {
  'WCK': {
    10: [
      "CEO does yoga with Baba Ramdev! 🧘‍♂️",
      "Discovers cure for Monday blues!",
      "Blessed medicines by local pandit!",
      "Akshay Kumar endorses = instant success!"
    ],
    5: [
      "Launches 'Gau Mutra Plus' edition!",
      "Free homeopathy with every pill!",
      "CEO distributes free meds at station!",
      "Now available at every pan shop!"
    ],
    '-5': [
      "Expired meds labeled 'vintage collection'!",
      "CEO caught using competitor's syrup! 😬",
      "Quality team busy watching IPL!",
      "Medicine bottles used for pickles!"
    ],
    '-10': [
      "'Instant cure' takes 6 months!",
      "Customers feeling TOO healthy!",
      "CEO googles symptoms before prescribing!",
      "Factory makes energy drinks by mistake!"
    ]
  },
  'HDF': {
    15: [
      "0% loans for Ambani/Adani only!",
      "Aadhaar data prints money now!",
      "AI approves loans in nanoseconds!",
      "Bank branch in every mall!"
    ],
    10: [
      "Emoji banking: React 💰 for loans!",
      "Free relationship counseling included!",
      "ATMs dispense motivational quotes!",
      "Loan approval by Instagram followers!"
    ],
    '-5': [
      "₹50 to check your own balance!",
      "Quick loan slower than monsoon!",
      "Hold time longer than Bollywood movie!",
      "Festival surge pricing introduced!"
    ],
    '-20': [
      "Server crashes during IPL final! 💸",
      "Salary sent to everyone's ex!",
      "Security answer: 'None of your business!'",
      "Manager uses calculator for 2+2!"
    ]
  },
  'TIS': {
    20: [
      "Now making vibranium for Marvel!",
      "Ratan Tata delivers steel on bicycle!",
      "Steel used for unbreakable political promises!",
      "Withstands earthquakes AND mother-in-law!"
    ],
    10: [
      "Premium 'artisanal hand-forged' steel!",
      "Broken dreams → strong beams program!",
      "Workers get free gym membership!",
      "Unbreakable cricket bats - Dhoni approved!"
    ],
    '-10': [
      "Workers demand steel-free workplace!",
      "Rust-proof steel rusts during elections!",
      "Steel used for employee BBQ parties!",
      "Bend like Beckham, break like our steel!"
    ],
    '-20': [
      "Elon tweets 'Iron Man overrated'! 🤦‍♂️",
      "Bridge collapses during inauguration!",
      "Factory makes chocolate by mistake!",
      "Quality control by coin-flipping monkeys!"
    ]
  },
  'ONG': {
    25: [
      "Oil struck in Sharma ji's backyard!",
      "Partnership with NASA for Mars drilling! 🚀",
      "Jasmine-scented premium fuel discovered!",
      "Oil found under every cricket stadium!"
    ],
    15: [
      "Drilling guided by local aunties!",
      "Oil comes with free cooking tips!",
      "Workers strike gold instead of oil!",
      "Organic oil label = instant success!"
    ],
    '-10': [
      "Mistakes sewage pipe for oil pipeline!",
      "Exploration guided by astrology!",
      "Smart AI keeps hitting water!",
      "Oil reserves are just coconut oil!"
    ],
    '-30': [
      "Hits water pipe, solves Delhi crisis!",
      "CEO admits selling cooking oil as crude!",
      "Exploration budget spent on team building!",
      "Oil only works on Tuesdays!"
    ]
  },
  'REL': {
    30: [
      "Ambani buys floor for pet goldfish!",
      "Free internet for life (24 hours)!",
      "Jio Satellite promises 5G on Moon! 🚀",
      "Morning jog powers entire Mumbai!"
    ],
    25: [
      "Selling bottled air to premium customers!",
      "Jio Brain thinks faster than counting money!",
      "Buying the alphabet - vowels cost extra!",
      "Grocery delivery by helicopter!"
    ],
    '-15': [
      "Network down during Bigg Boss finale!",
      "Selling 'organic' plastic bags!",
      "WiFi password leaked: 'Jio123'!",
      "AI gives life advice instead of support!"
    ],
    '-40': [
      "WiFi password was 'password123'!",
      "Vegetables at ₹1000/kg - too much!",
      "Network replaced with carrier pigeons!",
      "Quarterly report in Comic Sans font!"
    ]
  },
  'INF': {
    30: [
      "AI attends boring meetings for you!",
      "Narayana Murthy coding at 3 AM!",
      "Software debugs itself - becomes sentient!",
      "AI complains about work-life balance!"
    ],
    20: [
      "Code Yoga: Meditation while programming!",
      "AI writes code faster than coffee breaks!",
      "Free therapy for coding trauma!",
      "Must code in 5 languages + make chai!"
    ],
    '-10': [
      "Code review longer than development!",
      "Agile slower than government bureaucracy!",
      "AI demands work-from-home policy!",
      "Meetings about meetings > actual coding!"
    ],
    '-40': [
      "Code accidentally sent to competitor!",
      "Work from Home = Work from Himalayas!",
      "Software update deletes itself!",
      "AI charges for emotional labor!"
    ]
  }
};
const WINDFALLS = ['LOAN','DEBENTURE','RIGHTS'];

// Witty messages for windfall cards (shorter for card display)
const WINDFALL_MESSAGES = {
  'LOAN': [
    "Rich uncle finally delivers! 💰",
    "Found money in old jeans!",
    "Crypto mining pays off!",
    "Bank gives 0% loan (soul required)",
    "Won Bollywood birthday lottery!",
    "Government free money scheme!"
  ],
  'DEBENTURE': [
    "Junk stocks → actual money!",
    "Insurance claim approved!",
    "Tax refund after 5 years!",
    "Bankruptcy = opportunity!",
    "Government buyback program!",
    "Stock market therapy fund!"
  ],
  'RIGHTS': [
    "Buy more pain at discount!",
    "CEO's guilt = cheap shares!",
    "Double shares, double stress!",
    "Loyalty rewards: more losses!",
    "Company apology shares!",
    "Half price, full regret!"
  ]
};

const TRANSACTIONS_PER_PERIOD = 3;
const MAX_ROUNDS_PER_PERIOD = 3; // Define max rounds
const CHAIRMAN_SHARE_THRESHOLD = 100000; // Threshold for chairman
const PRESIDENT_SHARE_THRESHOLD = 50000; // Threshold for president

// Setup Express and Socket.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "https://remote-stock-exchange.fly.dev"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  pingTimeout: 60000, // 60 seconds - increased from default 20s
  pingInterval: 25000, // 25 seconds - keep default
  connectTimeout: 45000 // 45 seconds connection timeout
});
// Root route to serve the main page and update activity
app.get('/', (req, res) => {
  updateGlobalActivity();
  res.sendFile(__dirname + '/public/index.html');
});

// Dashboard route
app.get('/dashboard.html', (req, res) => {
  res.sendFile(__dirname + '/public/dashboard.html');
});

app.use(express.static('public'));

// Game state storage
const games = {};

// --- NEW Session Token Storage ---
// Store: token -> { roomID, playerName, socketId, isAdminInitial, lastActive }
const tokenStore = {};

// --- Room Cleanup Configuration ---
const ROOM_EXPIRY_TIME = 2 * 60 * 60 * 1000; // 2 hours (increased from 30 minutes)
const CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes (increased from 5 minutes)

// --- Idle Detection Configuration ---
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes of no activity before considering shutdown
const IDLE_CHECK_INTERVAL = 2 * 60 * 1000; // Check every 2 minutes
let lastActivityTime = Date.now();

// Helper function to update game activity timestamp
function updateGameActivity(game) {
  if (game) {
    game.lastActivity = Date.now();
    lastActivityTime = Date.now(); // Update global activity timestamp
  }
}

// Helper function to update global activity timestamp
function updateGlobalActivity() {
  lastActivityTime = Date.now();
}

// --- NEW: Function to save game data to Firestore ---
async function saveGameDataToFirestore(game, summaryData) {
  if (!db || !admin) {
    console.log('[saveGameDataToFirestore] Firestore not initialized. Skipping data save.');
    return;
  }

  try {
    const FieldValue = admin.firestore.FieldValue;
    const gameData = {
      roomID: Object.keys(games).find(key => games[key] === game),
      gameStartTime: game.gameStartTime || null,
      gameEndTime: Date.now(),
      totalPeriods: game.period,
      players: game.players.map(p => ({
        uuid: p.uuid,
        name: p.name,
        finalCash: p.cash,
        finalPortfolioValue: calculatePlayerTotalWorth(p, game.state.prices) - p.cash,
        finalTotalWorth: calculatePlayerTotalWorth(p, game.state.prices),
        finalPortfolio: p.portfolio || {},
        finalShortPositions: p.shortPositions || {}
      })),
      historicalWorthData: game.state.historicalWorthData || [],
      turnTimeData: game.state.turnTimeData || [],
      priceLog: game.state.priceLog || [],
      finalPrices: game.state.prices,
      initialPrices: game.state.init || {},
      chairmen: game.state.chairmen || {},
      presidents: game.state.presidents || {},
      companyList: COMPANIES,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    // Save game document
    const gameRef = await db.collection('games').add(gameData);
    console.log(`[saveGameDataToFirestore] Game data saved with ID: ${gameRef.id}`);

    // Save individual player stats
    const playerStatsPromises = game.players.map(async (player) => {
      const playerStats = {
        gameId: gameRef.id,
        playerUuid: player.uuid,
        firebaseUid: player.firebaseUid || null, // Include Firebase UID in stats
        playerName: player.name,
        finalCash: player.cash,
        finalPortfolioValue: calculatePlayerTotalWorth(player, game.state.prices) - player.cash,
        finalTotalWorth: calculatePlayerTotalWorth(player, game.state.prices),
        finalPortfolio: player.portfolio || {},
        finalShortPositions: player.shortPositions || {},
        totalPeriods: game.period,
        gameStartTime: game.gameStartTime || null,
        gameEndTime: Date.now(),
        createdAt: FieldValue.serverTimestamp()
      };

      // Save to player_stats collection
      await db.collection('player_stats').add(playerStats);
      
      // Also update/aggregate player summary stats
      // Use Firebase UID if available, otherwise use player UUID
      const statsDocId = player.firebaseUid || player.uuid;
      console.log(`[saveGameDataToFirestore] Saving stats for player ${player.name}: UUID=${player.uuid}, FirebaseUID=${player.firebaseUid || 'none'}, DocID=${statsDocId}`);
      const playerSummaryRef = db.collection('player_summaries').doc(statsDocId);
      const playerSummaryDoc = await playerSummaryRef.get();
      
      if (playerSummaryDoc.exists) {
        const existing = playerSummaryDoc.data();
        const newTotalGames = (existing.totalGames || 0) + 1;
        const newTotalWorth = (existing.totalFinalWorth || 0) + playerStats.finalTotalWorth;
        await playerSummaryRef.update({
          totalGames: newTotalGames,
          totalWins: existing.totalWins || 0, // Will be updated if this player won
          bestFinalWorth: Math.max(existing.bestFinalWorth || 0, playerStats.finalTotalWorth),
          totalFinalWorth: newTotalWorth,
          averageFinalWorth: newTotalWorth / newTotalGames,
          lastPlayedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`[saveGameDataToFirestore] ✅ Updated existing stats for ${player.name} (DocID: ${statsDocId}): Games=${newTotalGames}, TotalWorth=${newTotalWorth}`);
      } else {
        await playerSummaryRef.set({
          playerUuid: player.uuid,
          firebaseUid: player.firebaseUid || null, // Store Firebase UID for linking
          playerName: player.name,
          totalGames: 1,
          totalWins: 0,
          bestFinalWorth: playerStats.finalTotalWorth,
          totalFinalWorth: playerStats.finalTotalWorth,
          averageFinalWorth: playerStats.finalTotalWorth,
          lastPlayedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`[saveGameDataToFirestore] ✅ Created new stats document for ${player.name} (DocID: ${statsDocId}): Games=1, TotalWorth=${playerStats.finalTotalWorth}`);
      }
    });

    await Promise.all(playerStatsPromises);
    
    // Determine winner and update their win count
    const winner = game.players.reduce((prev, current) => {
      const prevWorth = calculatePlayerTotalWorth(prev, game.state.prices);
      const currentWorth = calculatePlayerTotalWorth(current, game.state.prices);
      return currentWorth > prevWorth ? current : prev;
    });
    
    if (winner) {
        // Use Firebase UID if available, otherwise use player UUID
        const winnerStatsDocId = winner.firebaseUid || winner.uuid;
        const winnerSummaryRef = db.collection('player_summaries').doc(winnerStatsDocId);
        const winnerSummaryDoc = await winnerSummaryRef.get();
        if (winnerSummaryDoc.exists) {
          await winnerSummaryRef.update({
            totalWins: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp()
          });
        }
    }

    console.log(`[saveGameDataToFirestore] Successfully saved game data and player stats.`);
  } catch (error) {
    console.error('[saveGameDataToFirestore] Error saving game data:', error);
  }
}

// Idle detection function
function checkIdleAndShutdown() {
  const now = Date.now();
  const timeSinceLastActivity = now - lastActivityTime;
  const activeRooms = Object.keys(games).length;
  
  console.log(`[Idle Check] Time since last activity: ${Math.round(timeSinceLastActivity / 1000 / 60)} minutes, Active rooms: ${activeRooms}`);
  
  // Check if any active rooms have been idle for too long
  let allRoomsIdle = true;
  if (activeRooms > 0) {
    for (const [roomID, game] of Object.entries(games)) {
      const roomIdleTime = now - (game.lastActivity || game.createdAt || now);
      if (roomIdleTime < IDLE_TIMEOUT) {
        allRoomsIdle = false;
        break;
      }
    }
  }
  
  // Shutdown if no activity for IDLE_TIMEOUT and (no active games OR all rooms are idle)
  if (timeSinceLastActivity > IDLE_TIMEOUT && (activeRooms === 0 || allRoomsIdle)) {
    console.log(`[Idle Shutdown] No activity for ${Math.round(timeSinceLastActivity / 1000 / 60)} minutes. Active rooms: ${activeRooms}, All idle: ${allRoomsIdle}. Initiating graceful shutdown...`);
    // Give a brief moment for any pending requests to complete
    setTimeout(() => {
      console.log('[Idle Shutdown] Graceful shutdown initiated due to inactivity');
      process.exit(0);
    }, 5000);
  }
}

// Cleanup function to remove stale rooms
function cleanupStaleRooms() {
  const now = Date.now();
  const roomsToDelete = [];
  
  for (const [roomID, game] of Object.entries(games)) {
    const timeSinceCreation = now - (game.createdAt || now);
    const timeSinceActivity = now - (game.lastActivity || now);
    
    // Delete room if it's been inactive for too long or is very old
    if (timeSinceActivity > ROOM_EXPIRY_TIME || timeSinceCreation > ROOM_EXPIRY_TIME * 2) {
      roomsToDelete.push(roomID);
    }
  }
  
  if (roomsToDelete.length > 0) {
    console.log(`[cleanupStaleRooms] Removing ${roomsToDelete.length} stale rooms:`, roomsToDelete);
    roomsToDelete.forEach(roomID => {
      delete games[roomID];
      // Also clean up related tokens
      Object.keys(tokenStore).forEach(token => {
        if (tokenStore[token].roomID === roomID) {
          delete tokenStore[token];
        }
      });
    });
  }
}

// Start cleanup interval
setInterval(cleanupStaleRooms, CLEANUP_INTERVAL);

// Start idle detection interval
setInterval(checkIdleAndShutdown, IDLE_CHECK_INTERVAL);

// Health check endpoint for fly.dev
app.get('/api/status', (req, res) => {
  const activeRooms = Object.keys(games).map(roomID => {
    const game = games[roomID];
    return {
      roomID,
      playerCount: game.players.length,
      createdAt: new Date(game.createdAt || 0).toISOString(),
      lastActivity: new Date(game.lastActivity || 0).toISOString(),
      gameStarted: game.gameStarted || false,
      admin: game.admin
    };
  });
  
  res.status(200).json({
    status: 'running',
    timestamp: new Date().toISOString(),
    activeRooms: activeRooms.length,
    rooms: activeRooms,
    totalTokens: Object.keys(tokenStore).length,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Simple health check endpoint for load balancer
app.get('/health', (req, res) => {
  updateGlobalActivity(); // Update activity on health checks
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
}); 

// --- NEW: Helper function to calculate player's total worth ---
function calculatePlayerTotalWorth(player, marketPrices) {
    let portfolioValue = 0;
    if (player.portfolio) {
        for (const companyId in player.portfolio) {
            const shares = player.portfolio[companyId];
            if (shares > 0 && marketPrices[companyId] !== undefined) {
                portfolioValue += shares * marketPrices[companyId];
            }
        }
    }
    // Also account for short positions - they don't directly contribute to "worth" in a positive way for this graph,
    // but the cash held as collateral IS part of their assets.
    // For simplicity in this graph, we'll consider current cash + current portfolio value.
    // A more complex "net worth" might subtract potential cost to cover shorts, but that makes the historical graph tricky.
    return player.cash + portfolioValue;
}

// --- NEW: Function to calculate dynamic loan amount based on game state ---
function calculateDynamicLoanAmount(game) {
    // Base loan amount (1 lakh)
    const BASE_LOAN = 100000;
    
    // Get current round information
    const currentPeriod = game.period || 1;
    const currentRound = game.state.roundNumberInPeriod || 1;
    // Calculate total round number across all periods (assuming 3 rounds per period)
    const totalRound = (currentPeriod - 1) * MAX_ROUNDS_PER_PERIOD + currentRound;
    
    // Calculate average player wealth
    let totalWealth = 0;
    let playerCount = game.players.length;
    
    if (playerCount > 0) {
        game.players.forEach(player => {
            totalWealth += calculatePlayerTotalWorth(player, game.state.prices);
        });
    }
    const averageWealth = playerCount > 0 ? totalWealth / playerCount : 0;
    
    // Dynamic loan calculation with two approaches:
    // 1. Round-based exponential growth: grows by 50% per round
    const roundBasedLoan = BASE_LOAN * Math.pow(1.5, totalRound - 1);
    
    // 2. Wealth-based loan: 15% of average player wealth (minimum base loan)
    const wealthBasedLoan = Math.max(BASE_LOAN, averageWealth * 0.15);
    
    // Use the higher of the two approaches, but cap at 50L (5 million) to prevent abuse
    const dynamicLoan = Math.min(Math.max(roundBasedLoan, wealthBasedLoan), 5000000);
    
    // Round to nearest 10,000 for cleaner numbers
    return Math.round(dynamicLoan / 10000) * 10000;
}

// --- NEW: Function to record historical worth data ---
function recordHistoricalWorth(game, periodMarker) {
    if (!game || !game.players || !game.state || !game.state.prices) {
        console.error('[recordHistoricalWorth] Missing data to record worth.');
        return;
    }
    if (!game.state.historicalWorthData) {
        game.state.historicalWorthData = []; // Initialize if it somehow wasn't
    }

    game.players.forEach(player => {
        const totalWorth = calculatePlayerTotalWorth(player, game.state.prices);
        game.state.historicalWorthData.push({
            period: periodMarker, // Use the passed marker (e.g., 0 for initial, game.period for resolved)
            playerId: player.uuid, // CHANGED: Use persistent UUID
            playerName: player.name, // Store name for easier chart labeling later
            totalWorth: totalWorth
        });
        console.log(`[recordHistoricalWorth] Period ${periodMarker}: Player ${player.name} (UUID: ${player.uuid}), Worth: ${totalWorth}`);
    });
}

function buildDeck(game) { // Added game parameter
  let deck = [];

  const numPlayers = game && game.players && game.players.length > 0 ? game.players.length : 1;
  
  let N = 0; // Number of deck units
  if (numPlayers <= 3) {
      N = 2; // 54 cards
  } else if (numPlayers <= 6) {
      N = 3; // 81 cards
  } else if (numPlayers <= 9) {
      N = 5; // 135 cards
  } else { // 10-12 players
      N = 6; // 162 cards
  }

  console.log(`[buildDeck] Building deck for ${numPlayers} players. Using N=${N} deck units.`);

  // A base deck unit has 1 copy of each unique card.
  // We will loop N times to add N units to the deck.
  for (let i = 0; i < N; i++) {
    // Add price movement cards
    COMPANIES.forEach(company => {
      company.moves.forEach(change => {
        // Get random witty message for this company and price change
        const messages = CARD_MESSAGES[company.id] && CARD_MESSAGES[company.id][change.toString()];
        const randomMessage = messages && messages.length > 0 
          ? messages[Math.floor(Math.random() * messages.length)]
          : `${company.name} stock ${change > 0 ? 'rises' : 'falls'} by ₹${Math.abs(change)}`;
        
        deck.push({ 
          type: 'price', 
          company: company.id, 
          change,
          message: randomMessage
        });
      });
    });

    // Add windfall cards
    WINDFALLS.forEach(windfall => {
      // Get random witty message for this windfall card
      const messages = WINDFALL_MESSAGES[windfall];
      const randomMessage = messages && messages.length > 0 
        ? messages[Math.floor(Math.random() * messages.length)]
        : `${windfall} card activated`;
      
      deck.push({ 
        type: 'windfall', 
        sub: windfall,
        message: randomMessage
      });
    });
  }

  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  console.log(`[buildDeck] Deck built with ${deck.length} cards.`);
  return deck;
}

function initGame(game, initialAdminPlayerId) {
  const initialPrices = {};
  COMPANIES.forEach(company => {
    initialPrices[company.id] = company.initial;
  });

  // Randomly select first player BEFORE setting up game state
  const randomFirstPlayerIndex = Math.floor(Math.random() * game.players.length);
  console.log(`[initGame] Randomly selected first player index: ${randomFirstPlayerIndex}`);

  game.state = {
    prices: {...initialPrices},
    init: {...initialPrices},
    historicalWorthData: [], // NEW: Initialize historical worth data array
    priceLog: [], // NEW: Initialize server-side price log
    trans: 0,
    played: [],
    currentTurn: randomFirstPlayerIndex, // Use the pre-calculated random index
    roundNumberInPeriod: 1, 
    activeRightsOffers: {},
    chairmen: {}, // { companyId: [playerId1, playerId2, ...] }
    presidents: {}, // { companyId: [playerId1, playerId2, ...] }
    awaitingAdminDecision: false, // ADDED: Flag for admin choice
    pricesResolvedThisCycle: false, // ADDED: Flag to track if prices have been resolved in the current admin decision cycle
    periodStarter: game.players[randomFirstPlayerIndex].id, // NEW: Store the period starter's ID
    turnTimeData: [], // NEW: Initialize turn time tracking array
    currentTurnStartTime: null // NEW: Track when current turn started
  };
  game.period = 1;
  game.deck = buildDeck(game); // Pass game object
  game.discard = [];
  
  // Admin is now determined *before* initGame based on first join
  // We just confirm it matches the expected initial admin
  if (initialAdminPlayerId && game.players.some(p => p.id === initialAdminPlayerId)) {
      game.admin = initialAdminPlayerId;
      console.log(`[initGame] Confirmed Admin ID: ${game.admin}`);
  } else if (game.players.length > 0) {
      // Fallback if initialAdminPlayerId wasn't passed or found (shouldn't happen)
      game.admin = game.players[0].id;
      console.warn(`[initGame] Fallback: Setting admin to first player: ${game.admin}`);
  } else {
      game.admin = null;
      console.error(`[initGame] Error: No players found when initializing game.`);
  }

  console.log(`[initGame] Initial currentTurn set to index: ${game.state.currentTurn} for Period ${game.period}`);
  console.log(`[initGame] First player will be: ${(game.players[game.state.currentTurn] && game.players[game.state.currentTurn].name) ? game.players[game.state.currentTurn].name : 'N/A'}`);

  // Deal 10 cards to each player and set initial transactions
  game.players.forEach((player, index) => {
    player.hand = game.deck.splice(0, 10);
    player.transactionsRemaining = TRANSACTIONS_PER_PERIOD; // Initialize transactions
  });

  game.gameStarted = true;
  game.gameStartTime = Date.now(); // NEW: Track game start time for analytics
  console.log(`[initGame] Game started flag set to true. Emitting initial game state...`);
  recordHistoricalWorth(game, 0); // NEW: Record initial worth for all players at period 0
  logActivity(game, null, 'GAME_STARTED', `Game started. Period ${game.period}, Round ${game.state.roundNumberInPeriod}.`);
  emitGameState(game);
}

function emitGameState(game, context = 'normal') {
  if (!game || !game.players) {
      console.error('[emitGameState] Error: Invalid game object.');
      return;
  }
  
  // Check if game has started (game.state exists)
  const gameStarted = game.state !== null && game.gameStarted === true;
  
  console.log(`[emitGameState] Emitting game state. Context: ${context}, Game started: ${gameStarted}`);
  
  if (gameStarted) {
    console.log(`[emitGameState] Current turn index: ${game.state.currentTurn}, Current turn player ID: ${game.state.currentTurnPlayerId}`);
    
    // Track turn time - record when turn changes
    const currentTurnPlayer = game.players[game.state.currentTurn];
    if (currentTurnPlayer && game.state.currentTurnStartTime === null) {
      // New turn starting - record start time
      game.state.currentTurnStartTime = Date.now();
      console.log(`[emitGameState] Turn started for ${currentTurnPlayer.name} at ${new Date().toISOString()}`);
    }
  }
  
  game.players.forEach(player => {
    const currentAdminId = game.admin;
    const currentPlayerId = player.id;
    const isAdmin = currentPlayerId === currentAdminId;
    
    let currentTurnPlayerId = null;
    let isYourTurn = false;
    
    if (gameStarted) {
      const currentTurnPlayer = game.players[game.state.currentTurn];
      currentTurnPlayerId = currentTurnPlayer ? currentTurnPlayer.id : null;
      isYourTurn = currentTurnPlayerId ? currentPlayerId === currentTurnPlayerId : false;
      console.log(`[emitGameState] Player ${player.name} (${player.id}): isAdmin=${isAdmin}, isYourTurn=${isYourTurn}, currentTurnPlayerId=${currentTurnPlayerId}`);
    } else {
      console.log(`[emitGameState] Player ${player.name} (${player.id}): isAdmin=${isAdmin}, Game not started yet`);
    }
    
    // Create company name mapping
    const companyNameMapping = COMPANIES.reduce((acc, company) => {
        acc[company.id] = company.name;
        return acc;
    }, {});

    const stateToSend = {
      players: game.players.map(p => ({ 
        id: p.id,
        uuid: p.uuid,
        name: p.name,
        portfolio: p.portfolio || {}, 
        cash: p.cash,
        shortPositions: p.shortPositions || {},
        transactionsRemaining: p.transactionsRemaining,
        hand: p.hand || [], // Include hand data for all players
        isAdmin: p.id === game.admin 
      })),
      state: gameStarted ? { 
        prices: game.state.prices,
        init: game.state.init || {},
        historicalWorthData: game.state.historicalWorthData || [],
        priceLog: game.state.priceLog || [],
        companyNames: companyNameMapping,
        companyList: COMPANIES,
        period: game.period,
        currentTurn: game.state.currentTurn,
        currentTurnPlayerId: currentTurnPlayerId,
        roundNumberInPeriod: game.state.roundNumberInPeriod,
        activeRightsOffers: game.state.activeRightsOffers || {},
        chairmen: game.state.chairmen || {},
        presidents: game.state.presidents || {},
        gameStarted: game.gameStarted,
        awaitingAdminDecision: game.state.awaitingAdminDecision,
        pricesResolvedThisCycle: game.state.pricesResolvedThisCycle,
        periodStarter: game.state.periodStarter,
        marketSentiment: game.state.marketSentiment || 'neutral'
      } : {
        // Minimal state for pre-game lobby
        companyNames: companyNameMapping,
        companyList: COMPANIES,
        gameStarted: false
      },
      hand: player.hand, 
      isAdmin: isAdmin, 
      isYourTurn: isYourTurn 
    };

    io.to(player.id).emit('gameState', stateToSend);
  });
}

// --- REFACTORED PERIOD RESOLUTION LOGIC ---

function calculateAndApplyPriceChanges(game) {
  if (!game || !game.state || !game.players) return;
  console.log('\n=== CALCULATING PRICE CHANGES ===');

  let deltas = {};
  let priceChangeMessages = {}; // Store witty messages for each company
  COMPANIES.forEach(company => { 
    deltas[company.id] = 0; 
    priceChangeMessages[company.id] = [];
  });

  game.players.forEach(player => {
    (player.hand || []).forEach(card => {
      if (card.type === 'price' && !card.played) {
        deltas[card.company] += card.change;
        // Collect witty messages for price changes
        if (card.message) {
          priceChangeMessages[card.company].push(card.message);
        }
      }
    });
  });

  // Log final price changes with witty messages
  console.log('\nFINAL PRICE CHANGES:');
  Object.keys(deltas).forEach(company => {
    if (deltas[company] !== 0) {
      console.log(`  - ${getCompanyName(company, game)}: ${deltas[company]}`);
      // Log witty messages for this company
      if (priceChangeMessages[company].length > 0) {
        console.log(`    Messages: ${priceChangeMessages[company].join(' | ')}`);
      }
    }
  });

  Object.keys(game.state.prices).forEach(company => {
    game.state.prices[company] = Math.max(0, game.state.prices[company] + deltas[company]);
  });

  // Calculate market sentiment based on price changes
  let totalPriceChange = 0;
  let companiesAffected = 0;
  Object.keys(deltas).forEach(company => {
    if (deltas[company] !== 0) {
      totalPriceChange += deltas[company];
      companiesAffected++;
    }
  });
  
  // Determine market sentiment: positive, negative, or neutral
  let marketSentiment = 'neutral';
  if (companiesAffected > 0) {
    const averageChange = totalPriceChange / companiesAffected;
    if (averageChange > 5) {
      marketSentiment = 'bullish';
    } else if (averageChange < -5) {
      marketSentiment = 'bearish';
    } else if (averageChange > 0) {
      marketSentiment = 'positive';
    } else if (averageChange < 0) {
      marketSentiment = 'negative';
    }
  }
  
  // Store market sentiment in game state
  game.state.marketSentiment = marketSentiment;
  console.log(`[Market Sentiment] ${marketSentiment.toUpperCase()} - Total change: ${totalPriceChange}, Companies affected: ${companiesAffected}`);

  // Simple price update message without witty messages
  logActivity(game, null, 'PRICES_RESOLVED', `Market prices updated based on card effects for Period ${game.period}.`);
  
  // --- NEW: Automatic Short Position Covering at End of Period ---
  console.log(`[calculateAndApplyPriceChanges] Period ${game.period}: Starting automatic cover of short positions.`);
  game.players.forEach(player => {
    if (player.shortPositions && Object.keys(player.shortPositions).length > 0) {
      console.log(`[calculateAndApplyPriceChanges] Checking player ${player.name} (UUID: ${player.uuid}) for shorts.`);
      for (const companyId in player.shortPositions) {
        if (player.shortPositions.hasOwnProperty(companyId)) {
          const shortPosition = player.shortPositions[companyId];
          const quantityCovered = shortPosition.quantity;
          const averagePriceOpenedCollateral = shortPosition.priceOpened;
          const currentMarketPrice = game.state.prices[companyId]; // Use the just-resolved market price

          if (currentMarketPrice === undefined || currentMarketPrice === null) {
            console.warn(`[Auto Short Cover] Market price for ${companyId} is undefined for player ${player.name}. Skipping auto-cover for this short.`);
            logActivity(game, player.name, 'AUTO_SHORT_COVER_FAIL', `Could not auto-cover ${quantityCovered} of ${getCompanyName(companyId, game)} due to missing market price.`);
            continue; // Skip to next short position
          }

          const totalCollateralHeld = averagePriceOpenedCollateral * quantityCovered;
          const costToBuyBackAtMarket = currentMarketPrice * quantityCovered;
          const amountToReturnToPlayer = (2 * totalCollateralHeld) - costToBuyBackAtMarket;
          
          player.cash += amountToReturnToPlayer;
          const profitOrLoss = totalCollateralHeld - costToBuyBackAtMarket;
          delete player.shortPositions[companyId];

          let PnLMessage = `Profit: ₹${profitOrLoss.toLocaleString()}`;
          if (profitOrLoss < 0) PnLMessage = `Loss: ₹${Math.abs(profitOrLoss).toLocaleString()}`;
          else if (profitOrLoss === 0) PnLMessage = `No profit or loss.`;

          console.log(`[Auto Short Cover] Player ${player.name} auto-covered ${quantityCovered} of ${getCompanyName(companyId, game)}. ${PnLMessage}. New cash: ${player.cash}`);
          logActivity(game, player.name, 'AUTO_SHORT_COVER', 
            `Automatically covered short on ${quantityCovered.toLocaleString()} shares of ${getCompanyName(companyId, game)} at period end. ${PnLMessage}`
          );
        }
      }
    }
  });
  console.log(`[calculateAndApplyPriceChanges] Period ${game.period}: Finished automatic cover of short positions.`);
  // --- END NEW: Automatic Short Position Covering ---

  // NEW: Add to server-side priceLog
  const lastLogEntry = game.state.priceLog.length > 0 ? game.state.priceLog[game.state.priceLog.length - 1] : null;
  if (!(lastLogEntry && lastLogEntry.period === game.period && lastLogEntry.round === game.state.roundNumberInPeriod)) {
    game.state.priceLog.push({
        period: game.period,
        round: game.state.roundNumberInPeriod, // Log the round at the time of resolution
        prices: { ...game.state.prices }
    });
    console.log(`[calculateAndApplyPriceChanges] Added to server priceLog for P${game.period}R${game.state.roundNumberInPeriod}`);
  } else {
    console.warn(`[calculateAndApplyPriceChanges] Price log entry for P${game.period}R${game.state.roundNumberInPeriod} already exists. Not adding duplicate.`);
  }

  game.state.pricesResolvedThisCycle = true; // Mark that prices have been resolved for this decision cycle
  recordHistoricalWorth(game, game.period); // NEW: Record worth after price changes
  // Mark all 'price' cards in hands as played for this cycle if they were considered
  // This assumes all price cards contribute and are then "spent" for the period's resolution.
  // If only some cards are played, this logic would need to be tied to actual card play.
  // For now, if they contribute to deltas, let's mark them.
  game.players.forEach(player => {
      if (player.hand) {
          player.hand.forEach(card => {
              if (card.type === 'price') {
                  card.played = true; // Or some other flag to indicate it was used in resolution
              }
          });
      }
  });
}

function dealNewCardsAndStartNewPeriod(game) {
  if (!game || !game.players) return;
  const roomID = Object.keys(games).find(key => games[key] === game);
  console.log(`[dealNewCardsAndStartNewPeriod] Advancing to new period for Room ${roomID}`);

  game.period++;
  game.state.roundNumberInPeriod = 1;

  console.log(`[dealNewCardsAndStartNewPeriod] Period ${game.period}: Building fresh deck and dealing new cards.`);
  game.deck = buildDeck(game); 
  game.discard = [];
  game.players.forEach(player => {
    player.hand = game.deck.splice(0, 10);
    player.transactionsRemaining = TRANSACTIONS_PER_PERIOD; // Reset for ALL players at start of new period
  });
  console.log(`[dealNewCardsAndStartNewPeriod] Reset transactions for ALL players to ${TRANSACTIONS_PER_PERIOD} for start of Period ${game.period}`);

  if (game.players.length > 0) {
    // Find the current period starter's index
    const currentPeriodStarterIndex = game.players.findIndex(p => p.id === game.state.periodStarter);
    // Set the next period starter to be the next player in sequence
    const nextPeriodStarterIndex = (currentPeriodStarterIndex + 1) % game.players.length;
    
    // Update both turn indicators together
    game.state.currentTurn = nextPeriodStarterIndex;
    game.state.currentTurnPlayerId = game.players[nextPeriodStarterIndex].id;
    game.state.periodStarter = game.players[nextPeriodStarterIndex].id;
    
    console.log(`[dealNewCardsAndStartNewPeriod] New period starter: ${game.players[nextPeriodStarterIndex].name} (index: ${nextPeriodStarterIndex}, id: ${game.state.currentTurnPlayerId})`);
  } else {
    game.state.currentTurn = 0;
    game.state.currentTurnPlayerId = null;
    game.state.periodStarter = null;
  }
  
  // Reset admin decision flags for the new period cycle
  game.state.awaitingAdminDecision = false;
  game.state.pricesResolvedThisCycle = false;
  
  console.log(`[dealNewCardsAndStartNewPeriod] Advanced to Period ${game.period}, Round ${game.state.roundNumberInPeriod}, Turn Index: ${game.state.currentTurn}`);
  logActivity(game, null, 'NEW_PERIOD_STARTED', `New cards dealt. Starting Period ${game.period}, Round ${game.state.roundNumberInPeriod}. Player ${game.players[game.state.currentTurn]?.name} starts.`);
}

// Original resolvePeriod can be kept for now, or modified if needed for other flows, or deprecated.
// For the new admin flow, we'll use the granular functions directly.
function resolvePeriod(roomID) {
  const game = games[roomID];
  if (!game) return;
  console.warn('[resolvePeriod] SERVER TRACER: The generic resolvePeriod() function was called. Ensure this is intended. Details: Period ${game.period}, Round ${game.state.roundNumberInPeriod}, AwaitingAdminDecision: ${game.state.awaitingAdminDecision}, PricesResolved: ${game.state.pricesResolvedThisCycle}');
  
  // For compatibility or if called directly, it performs both steps.
  calculateAndApplyPriceChanges(game);
  dealNewCardsAndStartNewPeriod(game);
  // Emit game state after both actions
  emitGameState(game);
}

// Helper function to get company name (already on client, adding to server for error messages)
function getCompanyName(companyId, game) {
    if (game && game.state && game.state.companyNames) {
        return game.state.companyNames[companyId] || companyId;
    }
    // Fallback for older game states or if mapping isn't available yet
    const companyData = COMPANIES.find(c => c.id === companyId);
    return companyData ? companyData.name : companyId;
}

// *** NEW: Helper function for logging activity ***
function logActivity(game, playerName, actionType, detailsOverride = null, roundOverride = null) {
    if (!game || !game.state) {
        // If game or game.state is not ready (e.g. player joining before game start), log without period/round
        const simpleLogEntry = {
            playerName: playerName, // Can be null
            actionType: actionType,
            details: detailsOverride || `${actionType} action by ${playerName}.`,
            timestamp: Date.now()
        };
        // Attempt to find roomID even without full game state for early logs like 'JOIN'
        let roomID = null;
        for (const id in games) {
            if (games[id] === game) {
                roomID = id;
                break;
            }
             // Special case for join, game might not have players yet, but game object exists
            if (actionType === 'JOIN' && games[id] && games[id].players && games[id].players.some(p => p.name === playerName)) {
                roomID = id;
                break;
            }
        }
        if (roomID) {
            io.to(roomID).emit('activityLog', simpleLogEntry);
            console.log(`[Activity Log - PreGame] ${playerName ? playerName + ': ' : ''}${simpleLogEntry.details}`);
        } else {
             console.warn(`[logActivity PreGame] Could not find roomID for player ${playerName}, action ${actionType}. Log not sent to client.`);
        }
        return;
    }

    // Default details based on actionType, can be overridden
    let details = detailsOverride;
    if (!details) {
        // Basic default, specific actions should provide better detailsOverride
        details = `${actionType} performed by ${playerName || 'system'}.`; 
    }

    const logEntry = {
        playerName: playerName, // Can be null for system messages like "Period Resolved"
        actionType: actionType, // e.g., "BUY", "SELL", "PLAY_CARD"
        details: details,       // e.g., "Bought 1000 HDF", "Played LOAN card"
        timestamp: Date.now()
    };

    // Conditionally add period and round for client, unless it's a system message type that shouldn't have it
    if (actionType !== 'START_GAME' && actionType !== 'PERIOD_RESOLVED') {
        logEntry.period = game.period;
        logEntry.round = roundOverride !== null ? roundOverride : game.state.roundNumberInPeriod;
    }

    const roomID = Object.keys(games).find(key => games[key] === game);
    if (roomID) {
        io.to(roomID).emit('activityLog', logEntry);
        // Server console log still includes period/round for all relevant game-specific logs for debugging
        if (game.period && game.state.roundNumberInPeriod) { // Check if game context exists for P/R logging
            console.log(`[Activity Log - P${game.period}R${roundOverride !== null ? roundOverride : game.state.roundNumberInPeriod}] ${playerName ? playerName + ': ' : ''}${details}`);
        } else {
            console.log(`[Activity Log - System] ${playerName ? playerName + ': ' : ''}${details}`);
        }
    } else {
        console.warn('[logActivity] Could not find roomID to emit log entry (this should not happen if game object is valid).');
    }
}

io.on('connection', socket => {
  console.log('Client connected:', socket.id, 'from:', socket.handshake.address);
  updateGlobalActivity(); // Update activity on new connections

  // Ping handler removed - using auto_stop_machines for cost optimization
  // Machine will auto-start when players connect

  // --- NEW REJOIN WITH TOKEN HANDLER ---
  socket.on('rejoinWithToken', (token, callback) => {
      console.log(`[rejoinWithToken] Attempting rejoin with token: ${token}`);
      const sessionData = tokenStore[token];

      if (!sessionData) {
          console.log(`[rejoinWithToken] Token not found in tokenStore. Current tokenStore size: ${Object.keys(tokenStore).length}. Token: ${token}`);
          // Log a few existing tokens if store is small, for debugging
          // if (Object.keys(tokenStore).length < 10) { // Removed debug log
          //   console.log('[rejoinWithToken] Existing tokens:', Object.keys(tokenStore));
          // }
          return callback({ error: 'Invalid or expired session token.' });
      }

      const { roomID, playerName, isAdminInitial } = sessionData;
      const game = games[roomID];

      if (!game) {
          console.log(`[rejoinWithToken] Game room ${roomID} not found for token ${token}.`);
          // Maybe clean up tokenStore entry?
          delete tokenStore[token];
          return callback({ error: 'Game room no longer exists.' });
      }

      const player = game.players.find(p => p.name === playerName);
      if (!player) {
          console.log(`[rejoinWithToken] Player ${playerName} not found in game room ${roomID}.`);
          // Maybe clean up tokenStore entry?
          delete tokenStore[token];
          return callback({ error: 'Player not found in this game.' });
      }

      const oldSocketId = player.id;
      console.log(`[rejoinWithToken] Player ${playerName} rejoining room ${roomID}. Old socket: ${oldSocketId}, New socket: ${socket.id}`);

      updateGameActivity(game); // Update activity timestamp on rejoin
      
      // Update player's socket ID in the game state
      player.id = socket.id;

      // === ADDED LOGIC to update periodStarter and currentTurnPlayerId ===
      if (game.state) { // Ensure game.state exists
        if (game.state.periodStarter === oldSocketId) {
          game.state.periodStarter = socket.id; // New socket ID
          console.log(`[rejoinWithToken] Updated game.state.periodStarter from ${oldSocketId} to ${socket.id}`);
        }
        if (game.state.currentTurnPlayerId === oldSocketId) {
          game.state.currentTurnPlayerId = socket.id; // New socket ID
          console.log(`[rejoinWithToken] Updated game.state.currentTurnPlayerId from ${oldSocketId} to ${socket.id}`);
        }
      }
      // === END ADDED LOGIC ===

      // Update game.admin if the rejoining player was the current admin
      if (game.admin === oldSocketId) {
          console.log(`[rejoinWithToken] Updating game.admin from ${oldSocketId} to ${socket.id} as rejoining player was current admin.`);
          game.admin = socket.id;
      }
      // The isAdminInitial flag on the token is more for tracking who *started* as admin,
      // but the live game.admin is the source of truth for current admin status.

      // Update token store with new socket ID and timestamp
      sessionData.socketId = socket.id;
      sessionData.lastActive = Date.now();
      tokenStore[token] = sessionData; // Re-save (might not be strictly necessary if object reference is kept)

      socket.join(roomID);
      callback({ success: true, roomID, playerName }); // Send back info for client confirmation
      
      console.log(`[rejoinWithToken] Rejoin successful for ${playerName}. Emitting game state.`);
      emitGameState(game, 'rejoin');
  });

  socket.on('createRoom', (callback) => {
    try {
      const roomID = Math.floor(1000 + Math.random() * 9000).toString(); // Generate 4-digit number (1000-9999)
      console.log(`[CREATE_ROOM] Socket ${socket.id} creating room: ${roomID}`);
      
      // Check if room already exists (very unlikely but good practice)
      if (games[roomID]) {
        console.warn(`[CREATE_ROOM] Room ID collision detected: ${roomID}`);
        return callback(null);
      }
      
      games[roomID] = {
        players: [],
        deck: [],
        discard: [],
        period: 0,
        state: null,
        admin: null, // Admin ID will be set on first join
        createdAt: Date.now(), // Track when room was created
        lastActivity: Date.now() // Track last activity for cleanup
      };
      
      socket.join(roomID);
      console.log(`[CREATE_ROOM] Room ${roomID} created successfully by socket ${socket.id}`);
      console.log(`[CREATE_ROOM] Total active rooms: ${Object.keys(games).length}, Rooms: [${Object.keys(games).join(', ')}]`);
      
      if (typeof callback === 'function') {
        callback(roomID);
      }
    } catch (error) {
      console.error('[CREATE_ROOM] Error creating room:', error);
      if (typeof callback === 'function') {
        callback(null);
      }
    }
  });

  socket.on('joinRoom', ({ roomID, name, firebaseUid }, callback) => {
    const timestamp = new Date().toISOString();
    console.log(`[JOIN_ROOM] ${timestamp} - Socket ${socket.id} attempting to join room ${roomID} as "${name}"${firebaseUid ? ` (Firebase UID: ${firebaseUid})` : ' (Guest mode - no Firebase UID)'}`);
    const game = games[roomID];
    if (!game) {
      console.log(`[JOIN_ROOM] ERROR: Room ${roomID} NOT FOUND for player "${name}"`);
      console.log(`[JOIN_ROOM] Available rooms: [${Object.keys(games).join(', ')}] (Total: ${Object.keys(games).length})`);
      console.log(`[JOIN_ROOM] Server uptime: ${process.uptime()} seconds`);
      return callback({ error: 'Room not found. The room may have expired or the server restarted. Please ask the admin to create a new room.' });
    }
    if (game.players.length >= MAX_PLAYERS) {
      console.log('Room full:', roomID);
      return callback({ error: 'Room is full' });
    }

    if (game.players.some(p => p.name === name)) {
      return callback({ error: 'Name already taken in this room' });
    }

    const player = {
      id: socket.id,
      uuid: uuidv4(), // ADDED: Persistent unique ID for the player
      firebaseUid: firebaseUid || null, // ADDED: Firebase UID if user is logged in
      name,
      cash: START_CASH,
      portfolio: {},
      hand: [],
      shortPositions: {}
    };
    game.players.push(player);
    game.lastActivity = Date.now(); // Update room activity timestamp
    socket.join(roomID);
    
    let isFirstPlayer = false;
    // Set admin if this is the first player
    if (game.players.length === 1 && !game.admin) {
        game.admin = player.id;
        isFirstPlayer = true;
        console.log(`[joinRoom] First player ${player.name} (${player.id}) set as admin for room ${roomID}`);
    }
    
    // --- Generate and Store Session Token --- 
    const sessionToken = uuidv4();
    tokenStore[sessionToken] = {
        roomID: roomID,
        playerName: name,
        socketId: socket.id,
        isAdminInitial: isFirstPlayer, // Store if they were the *first* to join
        lastActive: Date.now()
    };
    console.log(`[joinRoom] Generated session token ${sessionToken} for ${name}`);
    // --------------------------------------
    
    console.log('Player joined:', name, 'to room:', roomID);
    io.to(roomID).emit('playerList', game.players.map(p => ({
      id: p.id,
      uuid: p.uuid, // ADDED: Send UUID to client
      name: p.name,
      isAdmin: game.admin === p.id 
    })));
    
    // Send token back to client
    callback({ success: true, sessionToken: sessionToken }); 
    logActivity(game, name, 'JOIN_ROOM', `${name} joined room ${roomID}.`);
  });

  // Add admin-only actions
  socket.on('kickPlayer', ({ roomID, playerName }) => {
    const game = games[roomID];
    if (!game || game.admin !== socket.id) return;

    const playerIndex = game.players.findIndex(p => p.name === playerName);
    if (playerIndex === -1) return;

    const player = game.players[playerIndex];
    game.players.splice(playerIndex, 1);
    io.to(player.id).emit('kicked');
    io.to(roomID).emit('playerList', game.players.map(p => ({
      id: p.id,
      uuid: p.uuid, // ADDED: Send UUID to client
      name: p.name,
      isAdmin: game.admin === p.id
    })));
  });

  socket.on('transferAdmin', ({ roomID, playerName }) => {
    const game = games[roomID];
    if (!game || game.admin !== socket.id) return;

    const newAdmin = game.players.find(p => p.name === playerName);
    if (!newAdmin) return;

    game.admin = newAdmin.id;
    io.to(roomID).emit('playerList', game.players.map(p => ({
      id: p.id,
      uuid: p.uuid, // ADDED: Send UUID to client
      name: p.name,
      isAdmin: game.admin === p.id
    })));
  });

  socket.on('startGame', ({ roomID }) => {
    const game = games[roomID];
    if (!game) {
        console.error(`[startGame] Error: Game not found for room ${roomID}`);
        return;
    }
    if (game.admin !== socket.id) {
        console.warn(`[startGame] Non-admin player ${socket.id} (expected admin: ${game.admin}) tried to start game in room ${roomID}.`);
        io.to(socket.id).emit('error', { message: 'Only the admin can start the game.' });
        return;
    }
    
    updateGameActivity(game); // Update activity timestamp
    
    console.log(`[startGame] Admin ${socket.id} starting game in room ${roomID}. Calling initGame...`);
    // Pass the confirmed admin ID to initGame
    initGame(game, game.admin); 
    logActivity(game, game.players.find(p => p.id === game.admin)?.name || 'Admin', 'START_GAME', `Game started.`);
  });

  // NEW: Admin End Game Request Handler
  socket.on('adminEndGameRequest', ({ roomID }) => {
    const game = games[roomID];
    if (!game) {
        console.error(`[adminEndGameRequest] Error: Game not found for room ${roomID}`);
        return io.to(socket.id).emit('error', { message: 'Game not found.' });
    }
    if (game.admin !== socket.id) {
        console.warn(`[adminEndGameRequest] Non-admin player ${socket.id} tried to end game in room ${roomID}.`);
        return io.to(socket.id).emit('error', { message: 'Only the admin can end the game.' });
    }
    
    updateGameActivity(game); // Update activity timestamp
    if (game.gameEnded) {
        console.warn(`[adminEndGameRequest] Game in room ${roomID} has already ended.`);
        // Optionally re-send summary if needed, or just inform admin
        return io.to(socket.id).emit('error', { message: 'Game has already ended.' }); 
    }

    console.log(`[Admin Action] Admin ${socket.id} ending game in room ${roomID}.`);
    game.gameEnded = true; // Mark game as ended

    // Final recording of worth, if any transactions could have happened since last auto-record
    // For simplicity, we assume the last record at price resolution is sufficient unless game ends abruptly.
    // If game can end mid-period, consider a final recordHistoricalWorth(game, game.period + " (Final)") here.

    const summaryData = {
        players: game.players.map(p => ({ // Send a snapshot of player details for the summary
            id: p.id,
            uuid: p.uuid, // ADDED: Send UUID to client
            name: p.name,
            // No need to send full portfolio/cash again if chart only uses historical worth
            // But can be useful for a final leaderboard display on the summary screen
            finalCash: p.cash,
            finalPortfolioValue: calculatePlayerTotalWorth(p, game.state.prices) - p.cash, // Recalculate for safety
            finalPortfolio: p.portfolio || {},
            finalShortPositions: p.shortPositions || {}
        })),
        historicalWorthData: game.state.historicalWorthData || [],
        turnTimeData: game.state.turnTimeData || [], // NEW: Include turn time data
        priceLog: game.state.priceLog || [], // Include complete price history
        finalPrices: game.state.prices,
        initialPrices: game.state.init || {},
        chairmen: game.state.chairmen || {},
        presidents: game.state.presidents || {},
        companyList: COMPANIES,
        totalPeriods: game.period,
        gameStartTime: game.gameStartTime || null,
        gameEndTime: Date.now()
    };

    io.to(roomID).emit('gameSummaryReceived', summaryData);
    logActivity(game, game.players.find(p => p.id === game.admin)?.name || 'Admin', 'GAME_ENDED', `Game has been ended by the admin.`);
    
    // Save game data to Firestore
    console.log(`[adminEndGameRequest] Attempting to save game data to Firestore for room ${roomID}`);
    saveGameDataToFirestore(game, summaryData).catch(err => {
      console.error('[adminEndGameRequest] Error saving game data:', err);
      console.error('[adminEndGameRequest] Error details:', err.message, err.stack);
    });
    
    // Optional: Clean up the game object from `games` after a delay, or implement a proper archive/delete.
    // For now, game remains in memory but marked as ended.
  });

  socket.on('buy', ({ roomID, company, quantity }) => {
    console.log('\n=== BUY TRANSACTION START ===');
    console.log('Received buy request:', { roomID, company, quantity });
    
    const game = games[roomID];
    if (!game) {
        console.log('Error: Game not found');
        return;
    }
    
    updateGameActivity(game); // Update activity timestamp
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
        console.log('Error: Player not found');
        return;
    }
    
    console.log('Current prices:', game.state.prices);
    console.log('Player before buy:', {
        name: player.name,
        cash: player.cash,
        portfolio: JSON.stringify(player.portfolio)
    });

    if (player.id !== game.players[game.state.currentTurn]?.id) {
        console.log('Error: Not player\'s turn');
        io.to(player.id).emit('error', { message: 'It\'s not your turn' });
        return;
    }

    // --- VALIDATION CHANGE --- 
    // Check if quantity is positive and a multiple of 1000
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity % 1000 !== 0) {
        console.log(`Error: Invalid quantity ${quantity}. Must be a positive multiple of 1000.`);
        io.to(player.id).emit('error', { message: 'Quantity must be a positive multiple of 1000.' });
        return;
    }

    const price = game.state.prices[company];
    console.log('Share price for', company, ':', price);
    
    if (!price) {
        console.log('Error: Invalid company or price');
        io.to(player.id).emit('error', { message: 'Invalid company' });
        return;
    }

    // *** VALIDATE SHARE LIMIT ***
    const currentOwnedShares = player.portfolio ? (player.portfolio[company] || 0) : 0;
    if (currentOwnedShares + quantity > MAX_SHARES_PER_COMPANY) {
        const canBuy = MAX_SHARES_PER_COMPANY - currentOwnedShares;
        let message = `Cannot buy ${quantity.toLocaleString()} shares. This would exceed the ${MAX_SHARES_PER_COMPANY.toLocaleString()} share limit for ${getCompanyName(company, game)}.`;
        if (canBuy > 0) {
            message += ` You can buy up to ${canBuy.toLocaleString()} more shares.`;
        } else {
            message += ` You already own the maximum allowed.`;
        }
        console.log(`Error: Share limit exceeded for ${company}. Owned: ${currentOwnedShares}, Trying to buy: ${quantity}`);
        io.to(player.id).emit('error', { message });
        return;
    }
    // *** END VALIDATE SHARE LIMIT ***

    const cost = price * quantity;
    console.log('Transaction cost:', cost);
    
    if (player.cash < cost) {
        console.log('Error: Insufficient funds');
        io.to(player.id).emit('error', { message: `Not enough cash. Need ₹${cost.toLocaleString()}` });
        return;
    }

    // Update player's cash and portfolio
    player.cash -= cost;
    if (!player.portfolio) player.portfolio = {};
    player.portfolio[company] = (player.portfolio[company] || 0) + quantity;

    // Update chairman status if threshold crossed
    if (player.portfolio[company] >= CHAIRMAN_SHARE_THRESHOLD) {
        if (!game.state.chairmen[company]) {
            game.state.chairmen[company] = [];
        }
        if (!game.state.chairmen[company].includes(player.id)) {
            game.state.chairmen[company].push(player.id);
            logActivity(game, player.name, 'BECOME_CHAIRMAN', `Became Chairman of ${getCompanyName(company, game)}.`);
        }
    } // No need to check for losing chairmanship on buy, only on sell

    // Update president status if threshold crossed
    if (player.portfolio[company] >= PRESIDENT_SHARE_THRESHOLD) {
        if (!game.state.presidents[company]) {
            game.state.presidents[company] = [];
        }
        if (!game.state.presidents[company].includes(player.id)) {
            game.state.presidents[company].push(player.id);
            logActivity(game, player.name, 'BECOME_PRESIDENT', `Became President of ${getCompanyName(company, game)}.`);
        }
    } // No need to check for losing president status on buy

    console.log('Player after buy:', {
        name: player.name,
        cash: player.cash,
        portfolio: JSON.stringify(player.portfolio)
    });

    // player.transactionsRemaining = Math.max(0, (player.transactionsRemaining || 0) - 1); // New way
    game.state.trans++; // Keep global transaction counter for other purposes if needed

    console.log(`Player ${player.name} bought. Transactions remaining: ${player.transactionsRemaining}`);
    console.log('=== BUY TRANSACTION END ===\n');
    logActivity(game, player.name, 'BUY', `Bought ${quantity.toLocaleString()} shares of ${getCompanyName(company, game)} for ₹${(price * quantity).toLocaleString()}.`);
    emitGameState(game);
  });

  socket.on('sell', ({ roomID, company, quantity }) => {
    console.log('\n=== SELL TRANSACTION START ===');
    console.log('Received sell request:', { roomID, company, quantity });
    
    const game = games[roomID];
    if (!game) {
        console.log('Error: Game not found');
        return;
    }
    
    updateGameActivity(game); // Update activity timestamp
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) {
        console.log('Error: Player not found');
        return;
    }
    
    console.log('Current prices:', game.state.prices);
    console.log('Player before sell:', {
        name: player.name,
        cash: player.cash,
        portfolio: JSON.stringify(player.portfolio)
    });

    if (player.id !== game.players[game.state.currentTurn]?.id) {
        console.log('Error: Not player\'s turn');
        io.to(player.id).emit('error', { message: 'It\'s not your turn' });
        return;
    }

    // --- VALIDATION CHANGE --- 
    // Check if quantity is positive and a multiple of 1000
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity % 1000 !== 0) {
        console.log(`Error: Invalid quantity ${quantity}. Must be a positive multiple of 1000.`);
        io.to(player.id).emit('error', { message: 'Quantity must be a positive multiple of 1000.' });
        return;
    }

    const price = game.state.prices[company];
    console.log('Share price for', company, ':', price);
    
    if (!price) {
        console.log('Error: Invalid company or price');
        io.to(player.id).emit('error', { message: 'Invalid company' });
        return;
    }

    if (!player.portfolio) player.portfolio = {};
    const ownedShares = player.portfolio[company] || 0;
    console.log('Owned shares:', ownedShares);
    
    if (ownedShares < quantity) {
        console.log('Error: Insufficient shares');
        io.to(player.id).emit('error', { message: `Not enough shares. You only have ${ownedShares.toLocaleString()}` });
        return;
    }

    // Calculate proceeds and update player's cash
    const proceeds = price * quantity;
    console.log('Transaction proceeds:', proceeds);
    
    player.cash += proceeds;
    player.portfolio[company] -= quantity;

    // Update chairman status if threshold crossed (lost chairmanship)
    if ((player.portfolio[company] || 0) < CHAIRMAN_SHARE_THRESHOLD) {
        if (game.state.chairmen[company] && game.state.chairmen[company].includes(player.id)) {
            game.state.chairmen[company] = game.state.chairmen[company].filter(id => id !== player.id);
            if (game.state.chairmen[company].length === 0) {
                delete game.state.chairmen[company]; // Clean up if no chairmen left for this company
            }
            logActivity(game, player.name, 'LOSE_CHAIRMAN', `Lost Chairmanship of ${getCompanyName(company, game)}.`);
        }
    } // No need to check for gaining chairmanship on sell

    // Update president status if threshold crossed (lost president status)
    if ((player.portfolio[company] || 0) < PRESIDENT_SHARE_THRESHOLD) {
        if (game.state.presidents[company] && game.state.presidents[company].includes(player.id)) {
            game.state.presidents[company] = game.state.presidents[company].filter(id => id !== player.id);
            if (game.state.presidents[company].length === 0) {
                delete game.state.presidents[company]; // Clean up if no presidents left
            }
            logActivity(game, player.name, 'LOSE_PRESIDENT', `Lost Presidency of ${getCompanyName(company, game)}.`);
        }
    }

    // Remove company from portfolio if no shares left
    if (player.portfolio[company] <= 0) {
        console.log('Removing company from portfolio (no shares left)');
        delete player.portfolio[company];
    }

    console.log('Player after sell:', {
        name: player.name,
        cash: player.cash,
        portfolio: JSON.stringify(player.portfolio)
    });

    // player.transactionsRemaining = Math.max(0, (player.transactionsRemaining || 0) - 1); // New way
    game.state.trans++; // Keep global transaction counter

    console.log(`Player ${player.name} sold. Transactions remaining: ${player.transactionsRemaining}`);
    console.log('=== SELL TRANSACTION END ===\n');
    logActivity(game, player.name, 'SELL', `Sold ${quantity.toLocaleString()} shares of ${getCompanyName(company, game)} for ₹${(price * quantity).toLocaleString()}.`);
    emitGameState(game);
  });

  socket.on('windfall', ({ roomID, card, targetCompany, desiredRightsShares }) => {
    const game = games[roomID];
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    
    updateGameActivity(game); // Update activity timestamp
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', { message: 'Player not found in game.' });
    if (!card || !player.hand) return socket.emit('error', { message: 'Invalid card or hand data.' });

    let cardInHandIndex = -1;
    if (typeof card.index === 'number' && card.index >=0 && card.index < player.hand.length) {
        if (player.hand[card.index].type === card.type && player.hand[card.index].sub === card.sub) {
            cardInHandIndex = card.index;
        }
    } else {
        cardInHandIndex = player.hand.findIndex(c => c.type === card.type && c.sub === card.sub && !c.played);
    }
    if (cardInHandIndex === -1) return socket.emit('error', { message: 'Card not found in your hand or already played (index match failed).' });
    const actualCardInHand = player.hand[cardInHandIndex];
    if (actualCardInHand.played) return socket.emit('error', { message: 'This card has already been played.' });

    console.log(`[Windfall] Player ${player.name} attempting to play card:`, actualCardInHand, `Target: ${targetCompany}, DesiredRights: ${desiredRightsShares}`);

    if (card.sub === 'LOAN') {
        const loanAmount = calculateDynamicLoanAmount(game);
        player.cash += loanAmount;
        actualCardInHand.played = true;
        // game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // LOAN usually doesn't count as transaction
        const wittyMessage = actualCardInHand.message || `Played LOAN card.`;
        const fullLoanMessage = `LOAN: ${wittyMessage} (Received: ₹${loanAmount.toLocaleString()})`;
        logActivity(game, player.name, 'PLAY_CARD', fullLoanMessage);
        emitGameState(game);
    } else if (card.sub === 'DEBENTURE') {
        let debentureValue = 0;
        for (const companyId in player.portfolio) {
            if (player.portfolio[companyId] > 0 && game.state.prices[companyId] === 0) {
                debentureValue += player.portfolio[companyId] * (game.state.init[companyId] || 0);
                player.portfolio[companyId] = 0;
            }
        }
        if (debentureValue > 0) player.cash += debentureValue;
        actualCardInHand.played = true;
        // game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // DEBENTURE usually doesn't count
        const baseMessage = debentureValue > 0 ? `Debenture card yielded ₹${debentureValue.toLocaleString()}` : 'Debenture card played, no eligible stocks.';
        const wittyMessage = actualCardInHand.message || baseMessage;
        const fullMessage = `DEBENTURE: ${wittyMessage} (Received: ₹${debentureValue.toLocaleString()})`;
        socket.emit('info', { message: fullMessage });
        logActivity(game, player.name, 'PLAY_CARD', fullMessage);
        emitGameState(game);
    } else if (card.sub === 'RIGHTS') {
        if (!targetCompany || !COMPANIES.find(c => c.id === targetCompany)) return socket.emit('error', { message: 'Invalid target company for Rights Issue.' });
        if (typeof desiredRightsShares !== 'number' || desiredRightsShares <= 0) return socket.emit('error', { message: 'Invalid desired shares for Rights Issue.' });

        const initialPrice = game.state.init[targetCompany];
        if (initialPrice === undefined) return socket.emit('error', { message: 'Initial price not found for target company.' });
        
        const ownedShares = player.portfolio[targetCompany] || 0;
        const maxEligibleForRights = Math.floor(ownedShares / 2);
        if (desiredRightsShares > maxEligibleForRights) return socket.emit('error', { message: `Requested ${desiredRightsShares.toLocaleString()} rights (own eligibility: ${maxEligibleForRights}) for ${getCompanyName(targetCompany, game)} - too many.` });

        const actualSharesToGrant = Math.floor(desiredRightsShares / 1000) * 1000;
        if (actualSharesToGrant <= 0) return socket.emit('error', { message: `Request for ${desiredRightsShares.toLocaleString()} rights results in 0 shares after 1000s rule.` });

        // Add share limit check
        const currentOwnedShares = player.portfolio[targetCompany] || 0;
        if (currentOwnedShares + actualSharesToGrant > MAX_SHARES_PER_COMPANY) {
            const canBuy = MAX_SHARES_PER_COMPANY - currentOwnedShares;
            let message = `Cannot exercise rights for ${actualSharesToGrant.toLocaleString()} shares. This would exceed the ${MAX_SHARES_PER_COMPANY.toLocaleString()} share limit for ${getCompanyName(targetCompany, game)}.`;
            if (canBuy > 0) {
                message += ` You can exercise rights for up to ${canBuy.toLocaleString()} more shares.`;
            } else {
                message += ` You already own the maximum allowed.`;
            }
            return socket.emit('error', { message });
        }

        const rightsPricePerShare = Math.ceil(initialPrice / 2);
        const totalCost = actualSharesToGrant * rightsPricePerShare;
        if (player.cash < totalCost) return socket.emit('error', { message: `Insufficient cash for your Rights. Need ₹${totalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.` });

        player.cash -= totalCost;
        player.portfolio[targetCompany] = (player.portfolio[targetCompany] || 0) + actualSharesToGrant;
        actualCardInHand.played = true;
        // game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // DECIDE IF PERSONAL RIGHTS ISSUE IS A TRANSACTION
        const baseRightsMessage = `Your Rights Issue: Acquired ${actualSharesToGrant.toLocaleString()} shares of ${getCompanyName(targetCompany, game)} for ₹${totalCost.toLocaleString()}.`;
        const wittyMessage = actualCardInHand.message || baseRightsMessage;
        const fullRightsMessage = `RIGHTS: ${wittyMessage} (${getCompanyName(targetCompany, game)}: ${actualSharesToGrant.toLocaleString()} shares for ₹${totalCost.toLocaleString()})`;
        console.log(`[Windfall RIGHTS Personal] Player ${player.name} got ${actualSharesToGrant} of ${targetCompany}. Cash: ${player.cash}`);
        socket.emit('info', { message: fullRightsMessage });
        logActivity(game, player.name, 'PLAY_CARD_RIGHTS', fullRightsMessage);

        // Announce general rights offer if not already active for this company in this round
        if (!game.state.activeRightsOffers[targetCompany] || game.state.activeRightsOffers[targetCompany].roundAnnounced !== game.state.roundNumberInPeriod) {
            game.state.activeRightsOffers[targetCompany] = {
                initialPrice: initialPrice,
                rightsPricePerShare: rightsPricePerShare,
                roundAnnounced: game.state.roundNumberInPeriod,
                initiatedByPlayerName: player.name 
            };
            console.log(`[Windfall RIGHTS Global] Offer for ${targetCompany} (Round ${game.state.roundNumberInPeriod}) now active.`);
            io.to(roomID).emit('info', { message: `${getCompanyName(targetCompany, game)} Rights Offer is active this round (@₹${rightsPricePerShare}/share, 1 per 2 owned, 1000s lots).` });
        }
        emitGameState(game);
    }
  });

  socket.on('pass', ({ roomID }) => {
    const game = games[roomID];
    if (!game || !game.players || game.players.length === 0) {
        console.warn(`[pass] Game or players not found for roomID: ${roomID}`);
        return socket.emit('error', { message: 'Game or players not found.' });
    }
    
    updateGameActivity(game); // Update activity timestamp

    const player = game.players.find(p => p.id === socket.id);
    if (!player || game.state.currentTurnPlayerId !== player.id) {
        console.warn(`[pass] Invalid pass attempt by player ${player?.name || socket.id}. Not their turn or player not found. Current turn: ${game.state.currentTurnPlayerId}`);
        return socket.emit('error', { message: 'It\'s not your turn.' });
    }

    const roundAtActionTime = game.state.roundNumberInPeriod;
    
    // Record turn time before passing
    if (game.state.currentTurnStartTime) {
        const turnDuration = Date.now() - game.state.currentTurnStartTime;
        const turnData = {
            playerName: player.name,
            period: game.period,
            round: roundAtActionTime,
            turnDuration: turnDuration,
            timestamp: new Date().toISOString()
        };
        game.state.turnTimeData.push(turnData);
        console.log(`[pass] Recorded turn time for ${player.name}: ${turnDuration}ms`);
    }
    
    console.log(`[pass] Player ${player.name} (Socket: ${socket.id}, Round: ${roundAtActionTime}) is passing.`);

    if (player.transactionsRemaining > 0) {
        player.transactionsRemaining--;
        console.log(`[pass] Player ${player.name} transactions_remaining decremented to: ${player.transactionsRemaining}`);
    } else {
        console.log(`[pass] Player ${player.name} passed with 0 transactions remaining.`);
    }
    
    logActivity(game, player.name, 'PASS_TURN', `Passed turn. Transactions left: ${player.transactionsRemaining}`, roundAtActionTime);

    const currentPlayerIndex = game.players.findIndex(p => p.id === game.state.currentTurnPlayerId);
    const nextTurnPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
    const periodStartingPlayerActualIndex = game.players.findIndex(p => p.id === game.state.periodStarter);

    // Check if we've completed a round (returned to period starter)
    let roundCompleted = (nextTurnPlayerIndex === periodStartingPlayerActualIndex);
    let currentRoundForCheck = game.state.roundNumberInPeriod || 1;

    // Only advance round if all players have used their turns
    const allPlayersUsedTurns = game.players.every(p => p.transactionsRemaining === 0);

    console.log(`[pass] Round completion check: roundCompleted=${roundCompleted}, allPlayersUsedTurns=${allPlayersUsedTurns}, currentRound=${currentRoundForCheck}, awaitingAdminDecision=${game.state.awaitingAdminDecision}`);
    console.log(`[pass] Player transactions state:`);
    game.players.forEach(p => {
        console.log(`  - ${p.name}: ${p.transactionsRemaining}`);
    });

    if (roundCompleted && allPlayersUsedTurns) {
        if (currentRoundForCheck % MAX_ROUNDS_PER_PERIOD === 0 && !game.state.awaitingAdminDecision) {
            console.log(`[pass] Checkpoint reached for admin decision. Round: ${currentRoundForCheck}, Period: ${game.period}. Setting awaitingAdminDecision = true.`);
            game.state.awaitingAdminDecision = true;
            emitGameState(game, 'pass_awaiting_admin');
            return;
        } else if (!game.state.awaitingAdminDecision) {
            game.state.roundNumberInPeriod++;
            console.log(`[pass] Round ${currentRoundForCheck} completed. Advancing to Round ${game.state.roundNumberInPeriod}.`);
            if (game.state.activeRightsOffers && Object.keys(game.state.activeRightsOffers).length > 0) {
                console.log(`[pass] End of round ${currentRoundForCheck}. Clearing active rights offers.`);
                game.state.activeRightsOffers = {};
            }
            // Reset transactions for ALL players at the start of a new round
            game.players.forEach(p => {
                p.transactionsRemaining = TRANSACTIONS_PER_PERIOD;
            });
            console.log(`[pass] New round started. Reset transactions for all players.`);
        }
    }
    
    if (!game.state.awaitingAdminDecision) {
        game.state.currentTurn = nextTurnPlayerIndex;
        game.state.currentTurnPlayerId = game.players[nextTurnPlayerIndex].id;
        
        // Reset turn start time for new turn
        game.state.currentTurnStartTime = null;
        
        const nextPlayer = game.players[nextTurnPlayerIndex];
        if (nextPlayer) {
            // Only reset transactions for the next player if the round did NOT advance
            if (!roundCompleted) {
                nextPlayer.transactionsRemaining = TRANSACTIONS_PER_PERIOD;
                console.log(`[pass] Still in same round. Reset transactions for next player ${nextPlayer.name} to ${TRANSACTIONS_PER_PERIOD}.`);
            } else {
                console.log(`[pass] Round advanced or admin decision. Transactions for ${nextPlayer.name} were already handled (or will be after admin).`);
            }
        }
        console.log(`[pass] Advanced turn. New Turn Player ID: ${game.state.currentTurnPlayerId}, Round: ${game.state.roundNumberInPeriod}`);
        
        // Ensure we emit the game state with the updated turn information
        emitGameState(game, 'pass_turn_advanced');
    }
  });

  socket.on('endTurn', ({ roomID }) => {
    const game = games[roomID];
    if (!game || !game.players || game.players.length === 0) {
        console.warn(`[endTurn] Game or players not found for roomID: ${roomID}`);
        return socket.emit('error', { message: 'Game or players not found.' });
    }
    
    updateGameActivity(game); // Update activity timestamp
    
    const player = game.players.find(p => p.id === socket.id); 

    if (!player || player.id !== game.players[game.state.currentTurn]?.id) { 
        console.warn(`[endTurn] Invalid endTurn attempt by socket ${socket.id}. Current turn player ID: ${game.players[game.state.currentTurn]?.id}, Player found: ${!!player}`);
        io.to(socket.id).emit('error', { message: 'It\'s not your turn or invalid state.' });
        return;
    }

    const roundAtActionTime = game.state.roundNumberInPeriod;

    // Record turn time before ending turn
    if (game.state.currentTurnStartTime) {
        const turnDuration = Date.now() - game.state.currentTurnStartTime;
        const turnData = {
            playerName: player.name,
            period: game.period,
            round: roundAtActionTime,
            turnDuration: turnDuration,
            timestamp: new Date().toISOString()
        };
        game.state.turnTimeData.push(turnData);
        console.log(`[endTurn] Recorded turn time for ${player.name}: ${turnDuration}ms`);
    }

    console.log(`[endTurn] Player ${player.name} (Current Turn Index: ${game.state.currentTurn}, Socket: ${socket.id}, Round: ${roundAtActionTime}) is ending turn.`);

    // Decrement transactions remaining for the player by 1, ensuring it doesn't go below 0.
    if (player.transactionsRemaining > 0) {
        player.transactionsRemaining--;
        console.log(`[endTurn] Player ${player.name} transactions_remaining decremented to: ${player.transactionsRemaining}`);
    } else {
        console.log(`[endTurn] Player ${player.name} ended turn with 0 transactions remaining. Not decrementing further.`);
    }
    
    logActivity(game, player.name, 'END_TURN', `Ended turn. Transactions left: ${player.transactionsRemaining}`, roundAtActionTime);
    
    const currentPlayerIndex = game.players.findIndex(p => p.id === player.id); 
    const nextTurnPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
    const periodStartingPlayerActualIndex = game.players.findIndex(p => p.id === game.state.periodStarter);

    // Check if we've completed a round (returned to period starter)
    let roundCompleted = (nextTurnPlayerIndex === periodStartingPlayerActualIndex);
    let currentRoundForCheck = game.state.roundNumberInPeriod || 1;

    // Remove the allPlayersUsedTurns check as it's not needed for round completion
    console.log(`[endTurn] Round completion check: roundCompleted=${roundCompleted}, currentRound=${currentRoundForCheck}, awaitingAdminDecision=${game.state.awaitingAdminDecision}`);
    console.log(`[endTurn] Player transactions state:`);
    game.players.forEach(p => {
        console.log(`  - ${p.name}: ${p.transactionsRemaining}`);
    });

    if (roundCompleted) {
        if (currentRoundForCheck % MAX_ROUNDS_PER_PERIOD === 0 && !game.state.awaitingAdminDecision) {
            console.log(`[endTurn] Checkpoint reached for admin decision. Round: ${currentRoundForCheck}, Period: ${game.period}. Setting awaitingAdminDecision = true.`);
            game.state.awaitingAdminDecision = true;
            emitGameState(game, 'endturn_awaiting_admin'); 
            return; 
        } else if (!game.state.awaitingAdminDecision) {
            game.state.roundNumberInPeriod++; // Add this line to increment the round number
            console.log(`[endTurn] Round ${currentRoundForCheck} completed. Advancing to Round ${game.state.roundNumberInPeriod}.`);
            if (game.state.activeRightsOffers && Object.keys(game.state.activeRightsOffers).length > 0) {
                console.log(`[endTurn] End of round ${currentRoundForCheck}. Clearing active rights offers.`);
                game.state.activeRightsOffers = {};
            }
            // Remove the transaction reset for all players
            console.log(`[endTurn] New round started. Maintaining existing transactions.`);
        }
    }
    
    if (!game.state.awaitingAdminDecision) {
        const playerWhoseTurnItWas = player;
        const nextPlayerObject = game.players[nextTurnPlayerIndex];

        // Set current turn to the next player - ensure both are updated together
        game.state.currentTurn = nextTurnPlayerIndex;
        game.state.currentTurnPlayerId = nextPlayerObject.id;
        
        // Reset turn start time for new turn
        game.state.currentTurnStartTime = null;
        
        console.log(`[endTurn] Turn advanced to player ${nextPlayerObject.name} (index: ${nextTurnPlayerIndex}, id: ${nextPlayerObject.id})`);
        
        // Only reset transactions for the next player if we're in the same round
        // and they haven't used any transactions yet
        if (!roundCompleted && nextPlayerObject.transactionsRemaining === TRANSACTIONS_PER_PERIOD) {
            nextPlayerObject.transactionsRemaining = TRANSACTIONS_PER_PERIOD;
            console.log(`[endTurn] Still in same round. Reset transactions for next player ${nextPlayerObject.name} to ${TRANSACTIONS_PER_PERIOD}.`);
        } else if (!roundCompleted) {
            console.log(`[endTurn] Still in same round. Next player ${nextPlayerObject.name} already has ${nextPlayerObject.transactionsRemaining} transactions.`);
        } else {
            console.log(`[endTurn] Round advanced. Next player ${nextPlayerObject.name} has ${nextPlayerObject.transactionsRemaining} transactions.`);
        }
        
        console.log(`[endTurn] Player ${player.name} (who just played) TR: ${player.transactionsRemaining}.`);
        console.log(`[endTurn] Upcoming player ${nextPlayerObject.name} TR is: ${nextPlayerObject.transactionsRemaining} for their turn in Round ${game.state.roundNumberInPeriod}.`);
        
        console.log(`[SERVER EndTurn - Before Emit] Player transactions state (after potential TR reset for next player):`);
        game.players.forEach(p_debug => {
            console.log(`  - ${p_debug.name}: ${p_debug.transactionsRemaining}`);
        });

        // Ensure we emit the game state with the updated turn information
        emitGameState(game, 'endturn_turn_advanced');
    }
  });

  // --- NEW ADMIN DECISION HANDLERS (Revised Names) ---
  socket.on('adminResolvePeriodAndDeal', ({ roomID }) => {
    const game = games[roomID];
    if (!game || game.admin !== socket.id || !game.state.awaitingAdminDecision) {
        console.warn(`[adminResolvePeriodAndDeal] Invalid attempt by ${socket.id} in room ${roomID}. Game Admin: ${game?.admin}, Socket ID: ${socket.id}, Awaiting: ${game?.state?.awaitingAdminDecision}`);
        return io.to(socket.id).emit('error', { message: 'Not admin or not awaiting decision for period resolution.' });
    }
    
    updateGameActivity(game); // Update activity timestamp
    if (game.state.pricesResolvedThisCycle) {
        console.warn(`[adminResolvePeriodAndDeal] Prices already resolved this cycle for room ${roomID}.`);
        return io.to(socket.id).emit('error', { message: 'Prices already resolved this cycle.' });
    }

    console.log(`[adminResolvePeriodAndDeal] Admin ${socket.id} chose to RESOLVE PRICES for current period in room ${roomID}.`);
    calculateAndApplyPriceChanges(game); // Step 1: Calculate and apply price changes
    // game.state.pricesResolvedThisCycle is set within calculateAndApplyPriceChanges
    console.log(`[adminResolvePeriodAndDeal] SERVER TRACER: After calculateAndApplyPriceChanges, game.state.pricesResolvedThisCycle is: ${game.state.pricesResolvedThisCycle}`);
    
    // Keep awaitingAdminDecision true until the second step is completed
    game.state.awaitingAdminDecision = true;
    emitGameState(game); // Emit state to update UI (e.g., enable next admin button)
  });

  // New handler for the second step: Advancing to new period and dealing cards
  socket.on('adminAdvanceToNewPeriod_DealCards', ({ roomID }) => {
    const game = games[roomID];
    if (!game || game.admin !== socket.id || !game.state.awaitingAdminDecision) {
        console.warn(`[adminAdvanceToNewPeriod_DealCards] Invalid attempt by ${socket.id} in room ${roomID}. Game Admin: ${game?.admin}, Socket ID: ${socket.id}, Awaiting: ${game?.state?.awaitingAdminDecision}`);
        return io.to(socket.id).emit('error', { message: 'Not admin or not awaiting decision for period advancement.' });
    }
    
    updateGameActivity(game); // Update activity timestamp
    if (!game.state.pricesResolvedThisCycle) {
        console.warn(`[adminAdvanceToNewPeriod_DealCards] Prices not yet resolved for room ${roomID}.`);
        return io.to(socket.id).emit('error', { message: 'Prices must be resolved before advancing to new period.' });
    }

    console.log(`[adminAdvanceToNewPeriod_DealCards] Admin ${socket.id} chose to ADVANCE TO NEW PERIOD in room ${roomID}.`);
    game.state.awaitingAdminDecision = false; // Clear the admin decision flag
    game.state.pricesResolvedThisCycle = false; // Reset for next cycle
    dealNewCardsAndStartNewPeriod(game); // Step 2: Deal new cards and start new period
    emitGameState(game); // Emit state to update UI
  });

  socket.on('exerciseGeneralRights', ({ roomID, targetCompany, desiredRightsShares }) => {
    const game = games[roomID];
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    
    updateGameActivity(game); // Update activity timestamp

    const player = game.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', { message: 'Player not found in game.' });

    // Validate if it's the player's turn
    if (game.players[game.state.currentTurn]?.id !== socket.id) {
        return socket.emit('error', { message: 'Not your turn to exercise rights.' });
    }

    // Validate if player has transactions left for the turn
    // THIS VALIDATION IS NO LONGER NEEDED AS EXERCISING RIGHTS DOESN'T USE A TRANSACTION
    // if ((player.transactionsRemaining || 0) <= 0) { // Check against actual player.transactionsRemaining
    //     return socket.emit('error', { message: 'No transactions left for this turn.' });
    // }
    // ALSO, the (game.state.turnTransactions || 0) >= TRANSACTIONS_PER_PERIOD check was incorrect.
    // It should use player.transactionsRemaining. However, since this action
    // no longer consumes a transaction, this entire block can be reviewed/removed.
    // For now, I will remove the specific check that would block the action if transactions were 0.

    // Validate if the rights offer is active and for the current round
    const offerDetails = game.state.activeRightsOffers ? game.state.activeRightsOffers[targetCompany] : null;
    if (!offerDetails || offerDetails.roundAnnounced !== game.state.roundNumberInPeriod) {
        return socket.emit('error', { message: `No active rights offer for ${getCompanyName(targetCompany, game)} in the current round, or offer details missing.` });
    }

    // Validate if player owns shares in the target company
    const ownedShares = player.portfolio[targetCompany] || 0;
    if (ownedShares <= 0) {
        return socket.emit('error', { message: `You do not own any shares in ${getCompanyName(targetCompany, game)} to exercise rights.` });
    }

    // Validate desiredShares input
    if (typeof desiredRightsShares !== 'number' || desiredRightsShares <= 0) {
        return socket.emit('error', { message: 'Invalid desired number of shares.' });
    }

    // Calculate eligibility and shares to grant
    const maxEligibleForRights = Math.floor(ownedShares / 2);
    if (desiredRightsShares > maxEligibleForRights) {
        return socket.emit('error', { message: `Requested ${desiredRightsShares.toLocaleString()} rights, but you are only eligible for ${maxEligibleForRights.toLocaleString()} for ${getCompanyName(targetCompany, game)}.` });
    }

    const actualSharesToGrant = Math.floor(desiredRightsShares / 1000) * 1000;
    if (actualSharesToGrant <= 0) {
        return socket.emit('error', { message: `Your request for ${desiredRightsShares.toLocaleString()} rights shares would result in 0 actual shares due to the 1000 multiple rule.` });
    }

    // Add share limit check
    const currentOwnedShares = player.portfolio[targetCompany] || 0;
    if (currentOwnedShares + actualSharesToGrant > MAX_SHARES_PER_COMPANY) {
        const canBuy = MAX_SHARES_PER_COMPANY - currentOwnedShares;
        let message = `Cannot exercise rights for ${actualSharesToGrant.toLocaleString()} shares. This would exceed the ${MAX_SHARES_PER_COMPANY.toLocaleString()} share limit for ${getCompanyName(targetCompany, game)}.`;
        if (canBuy > 0) {
            message += ` You can exercise rights for up to ${canBuy.toLocaleString()} more shares.`;
        } else {
            message += ` You already own the maximum allowed.`;
        }
        return socket.emit('error', { message });
    }

    // Calculate cost (using rightsPricePerShare from the offer)
    const rightsPricePerShare = offerDetails.rightsPricePerShare;
    const totalCost = actualSharesToGrant * rightsPricePerShare;

    if (player.cash < totalCost) {
        return socket.emit('error', { message: `Insufficient cash. Need ₹${totalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.` });
    }

    // All checks passed, process the rights exercise
    player.cash -= totalCost;
    player.portfolio[targetCompany] = (player.portfolio[targetCompany] || 0) + actualSharesToGrant;
    // game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // Increment transaction count // Old Way
    // player.transactionsRemaining = Math.max(0, (player.transactionsRemaining || 0) - 1); // New Way - THIS IS THE LINE TO COMMENT OUT

    // *** NEW: Remove the offer for this company as it has been claimed ***
    // if (game.state.activeRightsOffers && game.state.activeRightsOffers[targetCompany]) {
    //     console.log(`[exerciseGeneralRights] Rights offer for ${targetCompany} claimed by ${player.name}. Removing offer.`);
    //     delete game.state.activeRightsOffers[targetCompany];
    // }

    console.log(`[exerciseGeneralRights] Player ${player.name} exercised rights for ${actualSharesToGrant} of ${targetCompany} for ₹${totalCost}. New cash: ${player.cash}. Transactions remaining: ${player.transactionsRemaining}`);
    const generalRightsMessage = `Successfully exercised general rights: Acquired ${actualSharesToGrant.toLocaleString()} shares of ${getCompanyName(targetCompany, game)} at ₹${rightsPricePerShare.toLocaleString()} each.`;
    socket.emit('info', { message: generalRightsMessage });
    logActivity(game, player.name, 'EXERCISE_GENERAL_RIGHTS', generalRightsMessage);
    emitGameState(game);
  });

  socket.on('initiateShortSell', ({ roomID, companyId, quantity }) => {
    console.log('\\n=== SHORT SELL INITIATE START ===');
    console.log('Received short sell request:', { roomID, companyId, quantity });
    const game = games[roomID];
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    
    updateGameActivity(game); // Update activity timestamp
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', { message: 'Player not found.' });

    if (game.players[game.state.currentTurn]?.id !== socket.id) {
        return socket.emit('error', { message: 'Not your turn.' });
    }
    if (player.transactionsRemaining <= 0) { 
        return socket.emit('error', { message: 'No transactions left for this turn.' });
    }
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity % 1000 !== 0) {
        return socket.emit('error', { message: 'Quantity must be a positive multiple of 1000.' });
    }
    const currentPrice = game.state.prices[companyId];
    if (currentPrice === undefined || currentPrice === null) { 
        return socket.emit('error', { message: 'Invalid company or price not available.' });
    }

    const collateralForThisLot = currentPrice * quantity;
    if (player.cash < collateralForThisLot) {
        return socket.emit('error', { message: `Insufficient cash for short collateral. Need ₹${collateralForThisLot.toLocaleString()}, have ₹${player.cash.toLocaleString()}.` });
    }
    player.cash -= collateralForThisLot; // Deduct collateral
    console.log(`[Short Sell New/Update] Player ${player.name} cash -${collateralForThisLot.toLocaleString()} (for short collateral). New cash: ${player.cash.toLocaleString()}`);


    if (!player.shortPositions) player.shortPositions = {};
    const existingShort = player.shortPositions[companyId];

    if (existingShort) {
        // Player is adding to an existing short position
        const oldQuantity = existingShort.quantity;
        const oldAvgPriceOpened = existingShort.priceOpened; // This is the average "collateralized price" for the old quantity

        // Total collateral previously taken for existingShort = oldAvgPriceOpened * oldQuantity
        // New collateral taken = collateralForThisLot (currentPrice * quantity for this new lot)
        // Total collateral effectively taken for this companyId = (oldAvgPriceOpened * oldQuantity) + collateralForThisLot
        const totalCollateralEffectivelyTaken = (oldAvgPriceOpened * oldQuantity) + collateralForThisLot;
        const newTotalQuantity = oldQuantity + quantity;
        
        // The new average price opened should reflect the average collateral per share
        const newAveragePriceOpened = totalCollateralEffectivelyTaken / newTotalQuantity;

        existingShort.quantity = newTotalQuantity;
        existingShort.priceOpened = parseFloat(newAveragePriceOpened.toFixed(2)); // This represents the new average price at which collateral was taken

        console.log(`[Short Sell Update] Player ${player.name} added ${quantity} shares to short on ${getCompanyName(companyId, game)} at current price ${currentPrice.toLocaleString()}.`);
        console.log(`  Collateral for this lot: ${collateralForThisLot.toLocaleString()}. Player cash reduced.`);
        console.log(`  New total short: ${existingShort.quantity.toLocaleString()} shares, New avg open (collateral) price: ${existingShort.priceOpened.toLocaleString()}`);
        logActivity(game, player.name, 'UPDATE_SHORT_SELL', `Added ${quantity.toLocaleString()} shares to short position on ${getCompanyName(companyId, game)} (avg. open price for collateral now ₹${existingShort.priceOpened.toLocaleString()}). Total short: ${existingShort.quantity.toLocaleString()}`);

    } else {
        // New short position
        player.shortPositions[companyId] = {
            quantity: quantity,
            priceOpened: currentPrice // This is the price at which collateral was taken
        };
        console.log(`[Short Sell New] Player ${player.name} initiated new short of ${quantity} shares on ${getCompanyName(companyId, game)} at ${currentPrice.toLocaleString()}.`);
        console.log(`  Collateral for this lot: ${collateralForThisLot.toLocaleString()}. Player cash reduced.`);
        logActivity(game, player.name, 'INITIATE_SHORT_SELL', `Initiated short sell of ${quantity.toLocaleString()} shares of ${getCompanyName(companyId, game)} at ₹${currentPrice.toLocaleString()} (collateral taken).`);
    }
    
    // player.transactionsRemaining = Math.max(0, player.transactionsRemaining - 1);

    console.log(`Player transactions remaining: ${player.transactionsRemaining}`);
    emitGameState(game);
    console.log('=== SHORT SELL INITIATE END ===\\n');
  });

  socket.on('coverShortPosition', ({ roomID, companyId }) => {
    console.log('\\n=== SHORT SELL COVER START ===');
    console.log('Received cover short request:', { roomID, companyId });
    const game = games[roomID];
    if (!game) return socket.emit('error', { message: 'Game not found.' });
    
    updateGameActivity(game); // Update activity timestamp
    
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return socket.emit('error', { message: 'Player not found.' });

    if (game.players[game.state.currentTurn]?.id !== socket.id) {
        return socket.emit('error', { message: 'Not your turn.' });
    }
    // if (player.transactionsRemaining <= 0) { 
    //     return socket.emit('error', { message: 'No transactions left for this turn.' });
    // }

    const shortPosition = player.shortPositions ? player.shortPositions[companyId] : null;
    if (!shortPosition) {
        return socket.emit('error', { message: `No open short position found for ${getCompanyName(companyId, game)}.` });
    }

    const currentMarketPrice = game.state.prices[companyId];
    if (currentMarketPrice === undefined || currentMarketPrice === null) {
        return socket.emit('error', { message: `Current market price for ${getCompanyName(companyId, game)} is not available. Cannot cover.` });
    }

    const quantityCovered = shortPosition.quantity;
    const averagePriceOpenedCollateral = shortPosition.priceOpened; // Average price at which collateral was taken per share

    const totalCollateralHeld = averagePriceOpenedCollateral * quantityCovered;
    const costToBuyBackAtMarket = currentMarketPrice * quantityCovered;

    // Calculate the amount to return to the player's cash
    // This is: (original collateral back) + (profit) or (original collateral back) - (loss)
    // which simplifies to: 2 * totalCollateralHeld - costToBuyBackAtMarket
    const amountToReturnToPlayer = (2 * totalCollateralHeld) - costToBuyBackAtMarket;
    player.cash += amountToReturnToPlayer;

    // Calculate Profit/Loss for logging purposes
    const profitOrLoss = totalCollateralHeld - costToBuyBackAtMarket; 
    // This is equivalent to: (averagePriceOpenedCollateral - currentMarketPrice) * quantityCovered

    delete player.shortPositions[companyId];
    // player.transactionsRemaining = Math.max(0, (player.transactionsRemaining || 0) - 1);

    let PnLMessage = `Profit: ₹${profitOrLoss.toLocaleString()}`;
    if (profitOrLoss < 0) PnLMessage = `Loss: ₹${Math.abs(profitOrLoss).toLocaleString()}`;
    else if (profitOrLoss === 0) PnLMessage = `No profit or loss.`;
    
    console.log(`[Short Sell Cover] Player ${player.name} covered ${quantityCovered.toLocaleString()} shares of ${getCompanyName(companyId, game)}.`);
    console.log(`  Avg Price Opened (Collateralized): ${averagePriceOpenedCollateral.toLocaleString()}, Market Price at Cover: ${currentMarketPrice.toLocaleString()}.`);
    console.log(`  Total Collateral Originally Held: ${totalCollateralHeld.toLocaleString()}`);
    console.log(`  Cost to Buy Back at Market: ${costToBuyBackAtMarket.toLocaleString()}`);
    console.log(`  Amount Change to Player Cash (2*Collateral - CostToBuyBack): +₹${amountToReturnToPlayer.toLocaleString()}`);
    console.log(`  Effective P/L: ₹${profitOrLoss.toLocaleString()}. Player new cash: ${player.cash.toLocaleString()}`);
    console.log(`  Transactions remaining: ${player.transactionsRemaining}`);
    logActivity(game, player.name, 'COVER_SHORT_SELL', `Covered short on ${quantityCovered.toLocaleString()} shares of ${getCompanyName(companyId, game)}. ${PnLMessage}`);
    emitGameState(game);
    console.log('=== SHORT SELL COVER END ===\\n');
  });

  // --- Handle Disconnect --- 
  socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      // Optional: Find player by socket.id across all games and mark them as inactive?
      // This is complex. The token rejoin handles re-establishing connection.
      // We could add logic to remove players after prolonged inactivity based on tokenStore.lastActive
  });
});

// Fly.io uses port 8080, but allow override via environment variable
// Fly.io uses PORT environment variable, default to 8080 for Fly.io, 3000 for local
const PORT = process.env.PORT || (process.env.FLY_APP_NAME ? 8080 : 3000);
const SERVER_START_TIME = new Date().toISOString();
console.log('='.repeat(80));
console.log(`🚀 SERVER STARTING at ${SERVER_START_TIME}`);
console.log(`Starting server on port ${PORT}`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Process environment PORT: ${process.env.PORT || 'not set (using default)'}`);
console.log(`Fly.io app name: ${process.env.FLY_APP_NAME || 'not set (local dev)'}`);
console.log(`Firebase Admin initialized: ${admin && admin.apps.length > 0 ? 'Yes ✅' : 'No ⚠️ (will continue without data saving)'}`);
console.log(`Firebase credentials available: ${process.env.FIREBASE_SERVICE_ACCOUNT ? 'Yes' : process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'Yes (file path)' : 'No'}`);
console.log('='.repeat(80));

// Ensure server starts even if there are issues
try {
  console.log(`[Server] Attempting to start server on 0.0.0.0:${PORT}...`);
  server.listen(PORT, '0.0.0.0', () => {
    console.log('='.repeat(80));
    console.log(`✅ Server successfully running on 0.0.0.0:${PORT}`);
    console.log(`✅ Started at: ${SERVER_START_TIME}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Socket.IO CORS origins configured for localhost and remote-stock-exchange.fly.dev`);
    console.log(`Health check available at: http://0.0.0.0:${PORT}/health`);
    console.log(`Status endpoint available at: http://0.0.0.0:${PORT}/api/status`);
    console.log(`Room cleanup: Every ${CLEANUP_INTERVAL/60000} minutes, expiry: ${ROOM_EXPIRY_TIME/60000} minutes`);
    console.log('='.repeat(80));
  }).on('error', (err) => {
    console.error('='.repeat(80));
    console.error('❌ Server startup error:', err);
    console.error('Error details:', err.message);
    console.error('Error code:', err.code);
    console.error('Stack:', err.stack);
    console.error('='.repeat(80));
    process.exit(1);
  });
} catch (startupError) {
  console.error('='.repeat(80));
  console.error('❌ Fatal error during server.listen():', startupError);
  console.error('Error message:', startupError.message);
  console.error('Stack:', startupError.stack);
  console.error('='.repeat(80));
  process.exit(1);
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  const shutdownTime = new Date().toISOString();
  console.log('='.repeat(80));
  console.log(`⚠️  SIGTERM received at ${shutdownTime}, shutting down gracefully`);
  console.log(`Server uptime: ${process.uptime()} seconds`);
  console.log(`Active rooms at shutdown: ${Object.keys(games).length}`);
  console.log('='.repeat(80));
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  const shutdownTime = new Date().toISOString();
  console.log('='.repeat(80));
  console.log(`⚠️  SIGINT received at ${shutdownTime}, shutting down gracefully`);
  console.log(`Server uptime: ${process.uptime()} seconds`);
  console.log(`Active rooms at shutdown: ${Object.keys(games).length}`);
  console.log('='.repeat(80));
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('='.repeat(80));
  console.error('❌ Uncaught Exception at', new Date().toISOString());
  console.error('Error:', err);
  console.error('Stack:', err.stack);
  console.error('='.repeat(80));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('='.repeat(80));
  console.error('❌ Unhandled Rejection at', new Date().toISOString());
  console.error('Promise:', promise);
  console.error('Reason:', reason);
  console.error('='.repeat(80));
  process.exit(1);
});