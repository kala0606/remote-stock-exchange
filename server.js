const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

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
const WINDFALLS = ['LOAN','DEBENTURE','RIGHTS'];

const TRANSACTIONS_PER_PERIOD = 3;
const MAX_ROUNDS_PER_PERIOD = 3; // Define max rounds
const CHAIRMAN_SHARE_THRESHOLD = 100000; // Threshold for chairman
const PRESIDENT_SHARE_THRESHOLD = 50000; // Threshold for president

// Setup Express and Socket.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));

// Game state storage
const games = {};

// --- NEW Session Token Storage ---
// Store: token -> { roomID, playerName, socketId, isAdminInitial, lastActive }
const tokenStore = {}; 

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
  const minRemainingCards = 50; // Desired minimum cards left in deck after dealing

  // Calculate N, the scaling factor for deck units. Ensure N is at least 1.
  // A single deck unit (78 cards) is based on 3 copies of each price card variant and 2 of each windfall.
  const cardsInOneDeckUnit = (COMPANIES.length * COMPANIES[0].moves.length * 3) + (WINDFALLS.length * 2);
  
  const cardsNeededForDealingAndBuffer = (numPlayers * 10) + minRemainingCards;
  const N = Math.max(1, Math.ceil(cardsNeededForDealingAndBuffer / cardsInOneDeckUnit));

  const effectivePriceCardCopies = 3 * N;
  const effectiveWindfallCardCopies = 2 * N;

  console.log(`[buildDeck] Building deck for ${numPlayers} players. Min remaining desired: ${minRemainingCards}. Scaling factor N=${N}. PriceCardCopies=${effectivePriceCardCopies}, WindfallCardCopies=${effectiveWindfallCardCopies}.`);

  // Add price movement cards
  COMPANIES.forEach(company => {
    company.moves.forEach(change => {
      for (let i = 0; i < effectivePriceCardCopies; i++) {
        deck.push({ type: 'price', company: company.id, change });
      }
    });
  });

  // Add windfall cards
  WINDFALLS.forEach(windfall => {
    for (let i = 0; i < effectiveWindfallCardCopies; i++) {
      deck.push({ type: 'windfall', sub: windfall });
    }
  });

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

  game.state = {
    prices: {...initialPrices},
    init: {...initialPrices},
    historicalWorthData: [], // NEW: Initialize historical worth data array
    priceLog: [], // NEW: Initialize server-side price log
    trans: 0,
    played: [],
    currentTurn: 0, 
    roundNumberInPeriod: 1, 
    activeRightsOffers: {},
    chairmen: {}, // { companyId: [playerId1, playerId2, ...] }
    presidents: {}, // { companyId: [playerId1, playerId2, ...] }
    awaitingAdminDecision: false, // ADDED: Flag for admin choice
    pricesResolvedThisCycle: false // ADDED: Flag to track if prices have been resolved in the current admin decision cycle
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
  // Set initial turn based on rotary rule (will be 0 for period 1)
  if (game.players.length > 0) {
    game.state.currentTurn = (game.period - 1) % game.players.length;
  } else {
    game.state.currentTurn = 0; // Should not happen with players
  }
  console.log(`[initGame] Initial currentTurn set to index: ${game.state.currentTurn} for Period ${game.period}`);

  // Deal 10 cards to each player and set initial transactions
  game.players.forEach((player, index) => {
    player.hand = game.deck.splice(0, 10);
    player.transactionsRemaining = TRANSACTIONS_PER_PERIOD; // Initialize transactions
  });

  game.gameStarted = true;
  console.log(`[initGame] Game started flag set to true. Emitting initial game state...`);
  recordHistoricalWorth(game, 0); // NEW: Record initial worth for all players at period 0
  emitGameState(game);
}

function emitGameState(game, context = 'normal') {
  if (!game || !game.players) {
      console.error('[emitGameState] Error: Invalid game object.');
      return;
  }
  game.players.forEach(player => {
    const currentAdminId = game.admin;
    const currentPlayerId = player.id;
    const isAdmin = currentPlayerId === currentAdminId;
    
    const currentTurnPlayer = game.players[game.state.currentTurn];
    const currentTurnPlayerId = currentTurnPlayer ? currentTurnPlayer.id : null;
    const isYourTurn = currentTurnPlayerId ? currentPlayerId === currentTurnPlayerId : false;
    
    // Create company name mapping
    const companyNameMapping = COMPANIES.reduce((acc, company) => {
        acc[company.id] = company.name;
        return acc;
    }, {});

    const stateToSend = {
      players: game.players.map(p => ({ 
        id: p.id,
        uuid: p.uuid, // ADDED: Send UUID to client
        name: p.name,
        portfolio: p.portfolio || {}, 
        cash: p.cash,
        shortPositions: p.shortPositions || {},
        transactionsRemaining: p.transactionsRemaining, // Include transactionsRemaining
        isAdmin: p.id === game.admin 
      })),
      state: { 
        prices: game.state.prices,
        init: game.state.init || {},
        historicalWorthData: game.state.historicalWorthData || [], // NEW: Send historical data
        priceLog: game.state.priceLog || [], // NEW: Send server-authoritative price log
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
        awaitingAdminDecision: game.state.awaitingAdminDecision, // ADDED: Send this flag to client
        pricesResolvedThisCycle: game.state.pricesResolvedThisCycle // ADDED: Send this flag to client
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
  console.log(`[calculateAndApplyPriceChanges] Calculating price changes for Period ${game.period}, Room ${Object.keys(games).find(key => games[key] === game)}`);

  const allPriceCardEffects = [];
  game.players.forEach(player => {
    (player.hand || []).forEach(card => {
      if (card.type === 'price' && !card.played) {
        allPriceCardEffects.push({
          playerId: player.id,
          playerName: player.name,
          companyId: card.company,
          change: card.change,
          status: 'active',
          originalCardRef: card
        });
      }
    });
  });

  // --- NEW: Only ONE negative card can be negated per period, chairman supersedes president ---
  let mostNegativeEffect = null;
  allPriceCardEffects.forEach(effect => {
    if (effect.status === 'active' && effect.change < 0) {
      if (!mostNegativeEffect || effect.change < mostNegativeEffect.change) {
        mostNegativeEffect = effect;
      }
    }
  });

  if (mostNegativeEffect) {
    const companyId = mostNegativeEffect.companyId;
    const playerId = mostNegativeEffect.playerId;
    let negatedBy = null;
    // Check for chairman first
    if (game.state.chairmen && game.state.chairmen[companyId] && game.state.chairmen[companyId].length > 0) {
      mostNegativeEffect.status = 'negated_by_chairman';
      negatedBy = 'chairman';
      const chairmanNames = game.state.chairmen[companyId].map(pid => game.players.find(p=>p.id === pid)?.name || 'A chairman').join(', ');
      logActivity(game, null, 'CHAIRMAN_POWER', 
        `Chairman power for ${getCompanyName(companyId, game)} (by ${chairmanNames}) negated a ${mostNegativeEffect.change} price card effect (player: ${mostNegativeEffect.playerName}).`
      );
    } else if (game.state.presidents && game.state.presidents[companyId] && game.state.presidents[companyId].includes(playerId)) {
      mostNegativeEffect.status = 'negated_by_president';
      negatedBy = 'president';
      const player = game.players.find(p => p.id === playerId);
      logActivity(game, player.name, 'PRESIDENT_POWER', 
        `President power for ${getCompanyName(companyId, game)} negated their own ${mostNegativeEffect.change} price card effect.`
      );
    }
    // If neither, do not negate
  }
  // --- END NEW LOGIC ---

  let deltas = {};
  COMPANIES.forEach(company => { deltas[company.id] = 0; });
  allPriceCardEffects.forEach(effect => {
    if (effect.status === 'active') {
      deltas[effect.companyId] += effect.change;
    }
  });

  Object.keys(game.state.prices).forEach(company => {
    game.state.prices[company] = Math.max(0, game.state.prices[company] + deltas[company]);
  });
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
  game.deck = buildDeck(); 
  game.discard = [];
  game.players.forEach(player => {
    player.hand = game.deck.splice(0, 10);
    player.transactionsRemaining = TRANSACTIONS_PER_PERIOD; // Reset for ALL players at start of new period
  });
  console.log(`[dealNewCardsAndStartNewPeriod] Reset transactions for ALL players to ${TRANSACTIONS_PER_PERIOD} for start of Period ${game.period}`);

  if (game.players.length > 0) {
    game.state.currentTurn = (game.period - 1) % game.players.length;
  } else {
    game.state.currentTurn = 0;
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
  console.log('Client connected:', socket.id);

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

      // Update player's socket ID in the game state
      player.id = socket.id;

      // Update game.admin if this player was the initial admin
      // We use isAdminInitial stored with the token for robustness
      if (isAdminInitial && game.admin === oldSocketId) {
          console.log(`[rejoinWithToken] Updating game admin from ${game.admin} to ${socket.id}`);
          game.admin = socket.id;
      } else if (isAdminInitial && game.admin !== oldSocketId) {
          // This might happen if admin was transferred, we should respect the current game.admin
          console.warn(`[rejoinWithToken] Rejoining player ${playerName} was initial admin, but current game admin (${game.admin}) is different. Not changing game admin.`);
      }

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
      const roomID = Math.random().toString(36).substr(2, 4).toUpperCase();
      console.log('Creating room:', roomID);
      
      games[roomID] = {
        players: [],
        deck: [],
        discard: [],
        period: 0,
        state: null,
        admin: null // Admin ID will be set on first join
      };
      
      socket.join(roomID);
      console.log('Room created:', roomID);
      
      if (typeof callback === 'function') {
    callback(roomID);
      }
    } catch (error) {
      console.error('Error creating room:', error);
      if (typeof callback === 'function') {
        callback(null);
      }
    }
  });

  socket.on('joinRoom', ({ roomID, name }, callback) => {
    console.log('Join attempt:', roomID, name);
    const game = games[roomID];
    if (!game) {
      console.log('Room not found:', roomID);
      return callback({ error: 'Room not found' });
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
      name,
      cash: START_CASH,
      portfolio: {},
      hand: [],
      shortPositions: {}
    };
    game.players.push(player);
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
            finalPortfolioValue: calculatePlayerTotalWorth(p, game.state.prices) - p.cash // Recalculate for safety
        })),
        historicalWorthData: game.state.historicalWorthData || []
    };

    io.to(roomID).emit('gameSummaryReceived', summaryData);
    logActivity(game, game.players.find(p => p.id === game.admin)?.name || 'Admin', 'GAME_ENDED', `Game has been ended by the admin.`);
    
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
        player.cash += 200000;
        actualCardInHand.played = true;
        // game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // LOAN usually doesn't count as transaction
        logActivity(game, player.name, 'PLAY_CARD', `Played LOAN card, received ₹200,000.`);
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
        const message = debentureValue > 0 ? `Debenture card yielded ₹${debentureValue.toLocaleString()}` : 'Debenture card played, no eligible stocks.';
        socket.emit('info', { message });
        logActivity(game, player.name, 'PLAY_CARD', message);
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

        const rightsPricePerShare = Math.ceil(initialPrice / 2);
        const totalCost = actualSharesToGrant * rightsPricePerShare;
        if (player.cash < totalCost) return socket.emit('error', { message: `Insufficient cash for your Rights. Need ₹${totalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.` });

        player.cash -= totalCost;
        player.portfolio[targetCompany] = (player.portfolio[targetCompany] || 0) + actualSharesToGrant;
        actualCardInHand.played = true;
        // game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // DECIDE IF PERSONAL RIGHTS ISSUE IS A TRANSACTION
        const rightsMessage = `Your Rights Issue: Acquired ${actualSharesToGrant.toLocaleString()} shares of ${getCompanyName(targetCompany, game)} for ₹${totalCost.toLocaleString()}.`;
        console.log(`[Windfall RIGHTS Personal] Player ${player.name} got ${actualSharesToGrant} of ${targetCompany}. Cash: ${player.cash}`);
        socket.emit('info', { message: rightsMessage });
        logActivity(game, player.name, 'PLAY_CARD_RIGHTS', rightsMessage);

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

    const player = game.players.find(p => p.id === socket.id);
    if (!player || game.state.currentTurnPlayerId !== player.id) { // Ensure player object exists for the check
        console.warn(`[pass] Invalid pass attempt by player ${player?.name || socket.id}. Not their turn or player not found. Current turn: ${game.state.currentTurnPlayerId}`);
        return socket.emit('error', { message: 'It\'s not your turn.' });
    }

    const roundAtActionTime = game.state.roundNumberInPeriod;
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
    const periodStartingPlayerActualIndex = (game.period - 1 + game.players.length) % game.players.length; // Ensure positive index

    let roundCompleted = (nextTurnPlayerIndex === periodStartingPlayerActualIndex);
    let currentRoundForCheck = game.state.roundNumberInPeriod || 1;

    if (roundCompleted) {
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
        game.state.currentTurnPlayerId = game.players[nextTurnPlayerIndex].id;
        game.state.currentTurn = nextTurnPlayerIndex; // Also update currentTurn index
        
        const nextPlayer = game.players[nextTurnPlayerIndex];
        if (nextPlayer) {
            // If the round did NOT advance, reset for the next player (they haven't had full T_P_P for this turn yet).
            // If the round DID advance, all players (including next) were already reset by the block above.
            if (!roundCompleted) {
                nextPlayer.transactionsRemaining = TRANSACTIONS_PER_PERIOD;
                console.log(`[pass] Still in same round. Reset transactions for next player ${nextPlayer.name} to ${TRANSACTIONS_PER_PERIOD}.`);
            } else {
                 console.log(`[pass] Round advanced or admin decision. Transactions for ${nextPlayer.name} were already handled (or will be after admin).`);
            }
        }
        console.log(`[pass] Advanced turn. New Turn Player ID: ${game.state.currentTurnPlayerId}, Round: ${game.state.roundNumberInPeriod}`);
        emitGameState(game, 'pass_turn_advanced');
    }
  });

  socket.on('endTurn', ({ roomID }) => {
    const game = games[roomID];
    if (!game || !game.players || game.players.length === 0) {
        console.warn(`[endTurn] Game or players not found for roomID: ${roomID}`);
        return socket.emit('error', { message: 'Game or players not found.' });
    }
    
    const player = game.players.find(p => p.id === socket.id); 

    if (!player || player.id !== game.players[game.state.currentTurn]?.id) { 
        console.warn(`[endTurn] Invalid endTurn attempt by socket ${socket.id}. Current turn player ID: ${game.players[game.state.currentTurn]?.id}, Player found: ${!!player}`);
        io.to(socket.id).emit('error', { message: 'It\'s not your turn or invalid state.' });
        return;
    }

    const roundAtActionTime = game.state.roundNumberInPeriod;

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
    const periodStartingPlayerActualIndex = (game.period - 1 + game.players.length) % game.players.length;


    let roundCompleted = (nextTurnPlayerIndex === periodStartingPlayerActualIndex);
    let currentRoundForCheck = game.state.roundNumberInPeriod || 1;

    if (roundCompleted) {
        if (currentRoundForCheck % MAX_ROUNDS_PER_PERIOD === 0 && !game.state.awaitingAdminDecision) {
            console.log(`[endTurn] Checkpoint reached for admin decision. Round: ${currentRoundForCheck}, Period: ${game.period}. Setting awaitingAdminDecision = true.`);
            game.state.awaitingAdminDecision = true;
            // For admin decision, transaction reset for the next player (if any) will be handled when admin action advances the game.
            emitGameState(game, 'endturn_awaiting_admin'); 
            return; 
        } else if (!game.state.awaitingAdminDecision) {
            game.state.roundNumberInPeriod++;
            console.log(`[endTurn] Round ${currentRoundForCheck} completed. Advancing to Round ${game.state.roundNumberInPeriod}.`);
            if (game.state.activeRightsOffers && Object.keys(game.state.activeRightsOffers).length > 0) {
                console.log(`[endTurn] End of round ${currentRoundForCheck}. Clearing active rights offers.`);
                game.state.activeRightsOffers = {};
            }
        }
    }
    
    if (!game.state.awaitingAdminDecision) {
        const playerWhoseTurnItWas = player; // Save ref to current player, already named 'player'
        const nextPlayerObject = game.players[nextTurnPlayerIndex];

        // Set current turn to the next player
        game.state.currentTurnPlayerId = nextPlayerObject.id;
        game.state.currentTurn = nextTurnPlayerIndex; 
        
        // Reset transactions for the player whose turn it is NOW
        // nextPlayerObject.transactionsRemaining = TRANSACTIONS_PER_PERIOD; // THIS LINE IS NOW COMMENTED OUT
        
        // Log states for clarity
        // Player variable is the one who just finished their turn.
        console.log(`[endTurn] Player ${player.name} (who just played) TR: ${player.transactionsRemaining}.`);
        // console.log(`[endTurn] Upcoming player ${nextPlayerObject.name} TR set to: ${nextPlayerObject.transactionsRemaining} for their turn in Round ${game.state.roundNumberInPeriod}.`);
        console.log(`[endTurn] Upcoming player ${nextPlayerObject.name} TR is: ${nextPlayerObject.transactionsRemaining} (not reset this turn) for their turn in Round ${game.state.roundNumberInPeriod}.`);
        
        console.log(`[SERVER EndTurn - Before Emit] Player transactions state (after potential TR reset for next player):`);
        game.players.forEach(p_debug => {
            console.log(`  - ${p_debug.name}: ${p_debug.transactionsRemaining}`);
        });

        emitGameState(game, 'endturn_turn_advanced'); 
    }
  });

  // --- NEW ADMIN DECISION HANDLERS (Revised Names) ---
  socket.on('adminResolvePeriodAndDeal', ({ roomID }) => { // RENAMED and REPURPOSED for the new flow
    const game = games[roomID];
    if (!game || game.admin !== socket.id || !game.state.awaitingAdminDecision) {
        // console.warn(`[adminResolvePeriodAndDeal -> now adminEndCurrentPeriod_ResolvePrices] Invalid attempt by ${socket.id} in room ${roomID}.`);
        // Replaced console.warn with a more specific one that includes current state for debugging
        console.warn(`[adminEndCurrentPeriod_ResolvePrices] Invalid attempt by ${socket.id} in room ${roomID}. Game Admin: ${game?.admin}, Socket ID: ${socket.id}, Awaiting: ${game?.state?.awaitingAdminDecision}`);
        return io.to(socket.id).emit('error', { message: 'Not admin or not awaiting decision for period resolution.' });
    }
    if (game.state.pricesResolvedThisCycle) {
        console.warn(`[adminEndCurrentPeriod_ResolvePrices] Prices already resolved this cycle for room ${roomID}.`);
        return io.to(socket.id).emit('error', { message: 'Prices already resolved this cycle.' });
    }

    console.log(`[adminEndCurrentPeriod_ResolvePrices] Admin ${socket.id} chose to RESOLVE PRICES for current period in room ${roomID}.`);
    calculateAndApplyPriceChanges(game); // Step 1: Calculate and apply price changes
    // game.state.pricesResolvedThisCycle is set within calculateAndApplyPriceChanges
    console.log(`[adminEndCurrentPeriod_ResolvePrices] SERVER TRACER: After calculateAndApplyPriceChanges, game.state.pricesResolvedThisCycle is: ${game.state.pricesResolvedThisCycle}`);
    emitGameState(game); // Emit state to update UI (e.g., enable next admin button)
  });

  // New handler for the second step: Advancing to new period and dealing cards
  socket.on('adminAdvanceToNewPeriod_DealCards', ({ roomID }) => {
    const game = games[roomID];
    if (!game || game.admin !== socket.id || !game.state.awaitingAdminDecision) {
        // console.warn(`[adminAdvanceToNewPeriod_DealCards] Invalid attempt by ${socket.id} in room ${roomID}. Not admin or not in decision state.`);
        console.warn(`[adminAdvanceToNewPeriod_DealCards] Invalid attempt by ${socket.id} in room ${roomID}. Game Admin: ${game?.admin}, Socket ID: ${socket.id}, Awaiting: ${game?.state?.awaitingAdminDecision}, PricesResolved: ${game?.state?.pricesResolvedThisCycle}`);
        return io.to(socket.id).emit('error', { message: 'Not admin or game not in admin decision state.' });
    }
    if (!game.state.pricesResolvedThisCycle) {
        console.warn(`[adminAdvanceToNewPeriod_DealCards] Prices not yet resolved this cycle for room ${roomID}. Admin must resolve prices first.`);
        return io.to(socket.id).emit('error', { message: 'Prices must be resolved first before advancing the period.' });
    }

    console.log(`[adminAdvanceToNewPeriod_DealCards] Admin ${socket.id} chose to ADVANCE TO NEW PERIOD & DEAL CARDS for room ${roomID}.`);
    dealNewCardsAndStartNewPeriod(game); // Step 2: Deal new cards and start new period
    // game.state.awaitingAdminDecision and game.state.pricesResolvedThisCycle are reset within dealNewCardsAndStartNewPeriod
    emitGameState(game);
  });

  socket.on('exerciseGeneralRights', ({ roomID, targetCompany, desiredRightsShares }) => {
    const game = games[roomID];
    if (!game) return socket.emit('error', { message: 'Game not found.' });

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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));