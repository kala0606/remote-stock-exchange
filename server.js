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
  { id:'HDF', name: 'HDFC Bank', initial:25, moves:[15,10,-5,-15] },
  { id:'TIS', name: 'Tata Steel', initial:40, moves:[20,10,-10,-20] },
  { id:'ONG', name: 'ONGC Ltd', initial:55, moves:[25,15,-10,-25] },
  { id:'REL', name: 'Reliance Industries', initial:75, moves:[30,25,-15,-30] },
  { id:'INF', name: 'Infosys Ltd', initial:80, moves:[30,20,-10,-5] }
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

function buildDeck() {
  let deck = [];
  
  // Add price movement cards
  COMPANIES.forEach(company => {
    company.moves.forEach(change => {
      deck.push({ type: 'price', company: company.id, change });
      deck.push({ type: 'price', company: company.id, change });
    });
  });

  // Add windfall cards
  WINDFALLS.forEach(windfall => {
    deck.push({ type: 'windfall', sub: windfall });
    deck.push({ type: 'windfall', sub: windfall });
  });

  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  console.log(`[buildDeck] Deck built with ${deck.length} cards (Currency cards removed).`);
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
    trans: 0,
    played: [],
    currentTurn: 0, 
    roundNumberInPeriod: 1, 
    activeRightsOffers: {},
    chairmen: {}, // { companyId: [playerId1, playerId2, ...] }
    presidents: {} // { companyId: [playerId1, playerId2, ...] }
  };
  game.period = 1;
  game.deck = buildDeck();
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

  // Deal 10 cards to each player
  game.players.forEach((player, index) => {
    player.hand = game.deck.splice(0, 10);
    console.log(`[initGame] Dealt hand to player ${player.name}`);
  });

  console.log(`[initGame] Emitting initial game state...`);
  emitGameState(game);
}

function emitGameState(game, context = 'normal') {
  if (!game || !game.players) {
      console.error('[emitGameState] Error: Invalid game object.');
      return;
  }
  console.log(`[emitGameState${context === 'rejoin' ? ' REJOIN' : ''}] Emitting state for Period: ${game.period}, Turn Index: ${game.state.currentTurn}, Admin ID: ${game.admin}`);
  game.players.forEach(player => {
    const currentAdminId = game.admin;
    const currentPlayerId = player.id;
    const isAdmin = currentPlayerId === currentAdminId;
    
    const currentTurnPlayer = game.players[game.state.currentTurn];
    const currentTurnPlayerId = currentTurnPlayer ? currentTurnPlayer.id : null;
    const isYourTurn = currentTurnPlayerId ? currentPlayerId === currentTurnPlayerId : false;
    
    // --- Extra Logging for Rejoin Context --- 
    if (context === 'rejoin') {
        console.log(`  [emitGameState REJOIN Check] Emitting to ${player.name} (${currentPlayerId})`);
        console.log(`    isAdmin Check: currentPlayerId (${currentPlayerId}) === currentAdminId (${currentAdminId}) => ${isAdmin}`);
        console.log(`    isYourTurn Check: currentPlayerId (${currentPlayerId}) === currentTurnPlayerId (${currentTurnPlayerId}) => ${isYourTurn}`);
    }
    // --- End Extra Logging --- 

    console.log(`[emitGameState${context === 'rejoin' ? ' REJOIN' : ''}] Emitting to ${player.name} (${player.id}): isAdmin=${isAdmin}, isYourTurn=${isYourTurn}`);
    
    // Create company name mapping
    const companyNameMapping = COMPANIES.reduce((acc, company) => {
        acc[company.id] = company.name;
        return acc;
    }, {});

    const stateToSend = {
      players: game.players.map(p => ({ 
        id: p.id,
        name: p.name,
        portfolio: p.portfolio || {}, 
        cash: p.cash 
      })),
      state: { 
        prices: game.state.prices,
        init: game.state.init || {},
        companyNames: companyNameMapping,
        period: game.period,
        currentTurn: game.state.currentTurn,
        roundNumberInPeriod: game.state.roundNumberInPeriod,
        activeRightsOffers: game.state.activeRightsOffers || {},
        chairmen: game.state.chairmen || {},
        presidents: game.state.presidents || {}
      },
      hand: player.hand, 
      isAdmin: isAdmin, 
      isYourTurn: isYourTurn 
    };

    io.to(player.id).emit('gameState', stateToSend);
  });
}

function resolvePeriod(roomID) {
  const game = games[roomID];
  if (!game) return;

  console.log(`[resolvePeriod] Resolving Period ${game.period} for room ${roomID}`);

  // Step 1: Gather all potential price changes
  const allPriceCardEffects = [];
  game.players.forEach(player => {
    (player.hand || []).forEach(card => {
      if (card.type === 'price' && !card.played) { // Ensure card hasn't been played (e.g. by other means, though price cards usually aren't 'played')
        allPriceCardEffects.push({
          playerId: player.id,
          playerName: player.name,
          companyId: card.company,
          change: card.change,
          status: 'active', // 'active', 'negated_by_president', 'negated_by_chairman'
          originalCardRef: card // Optional, for debugging or more complex logic later
        });
      }
    });
  });

  // Step 2: Apply President Powers
  if (game.state.presidents && Object.keys(game.state.presidents).length > 0) {
    game.players.forEach(player => {
      for (const companyId in game.state.presidents) {
        if (game.state.presidents.hasOwnProperty(companyId) && game.state.presidents[companyId].includes(player.id)) {
          // This player is President of this companyId
          let mostNegativeEffectForPresident = null;
          allPriceCardEffects.forEach(effect => {
            if (effect.playerId === player.id && effect.companyId === companyId && effect.status === 'active' && effect.change < 0) {
              if (!mostNegativeEffectForPresident || effect.change < mostNegativeEffectForPresident.change) {
                mostNegativeEffectForPresident = effect;
              }
            }
          });

          if (mostNegativeEffectForPresident) {
            mostNegativeEffectForPresident.status = 'negated_by_president';
            logActivity(game, player.name, 'PRESIDENT_POWER', 
              `President power for ${getCompanyName(companyId, game)} negated their own ${mostNegativeEffectForPresident.change} price card effect.`
            );
          }
        }
      }
    });
  }

  // Step 3: Apply Chairman Powers
  if (game.state.chairmen && Object.keys(game.state.chairmen).length > 0) {
    for (const companyId in game.state.chairmen) {
      if (game.state.chairmen.hasOwnProperty(companyId) && game.state.chairmen[companyId].length > 0) {
        // Chairmen exist for this company
        let mostNegativeEffectForCompany = null;
        allPriceCardEffects.forEach(effect => {
          if (effect.companyId === companyId && effect.status === 'active' && effect.change < 0) {
            if (!mostNegativeEffectForCompany || effect.change < mostNegativeEffectForCompany.change) {
              mostNegativeEffectForCompany = effect;
            }
          }
        });

        if (mostNegativeEffectForCompany) {
          mostNegativeEffectForCompany.status = 'negated_by_chairman';
          const chairmanNames = game.state.chairmen[companyId].map(pid => game.players.find(p=>p.id === pid)?.name || 'A chairman').join(', ');
          logActivity(game, null, 'CHAIRMAN_POWER', 
            `Chairman power for ${getCompanyName(companyId, game)} (by ${chairmanNames}) negated a ${mostNegativeEffectForCompany.change} price card effect (player: ${mostNegativeEffectForCompany.playerName}).`
          );
        }
      }
    }
  }
  
  // Step 4: Calculate Final Deltas
  let deltas = {};
  COMPANIES.forEach(company => {
    deltas[company.id] = 0;
  });
  allPriceCardEffects.forEach(effect => {
    if (effect.status === 'active') {
      deltas[effect.companyId] += effect.change;
    }
  });

  // Step 5: Update Prices
  Object.keys(game.state.prices).forEach(company => {
    game.state.prices[company] = Math.max(0, game.state.prices[company] + deltas[company]);
  });

  // Clear played cards, and transaction count for the next period
  game.state.played = [];
  game.state.trans = 0;
  game.state.activeRightsOffers = {};
  game.period++;

  // Deal new cards EVERY period after the first one
  // game.period has already been incremented, so period 1 is initial deal (in initGame)
  // This means we deal for period 2, 3, 4, etc.
  if (game.period > 1) { 
    console.log(`[resolvePeriod] Period ${game.period}: Dealing new cards.`);
    // Collect and reshuffle cards
    game.deck = buildDeck(); 
    game.discard = [];
    
    // Deal new hands
    game.players.forEach(player => {
      player.hand = game.deck.splice(0, 10);
      console.log(`[resolvePeriod] Dealt 10 cards to player ${player.name}`);
    });
  } else {
    // This case (game.period <= 1 after increment) should ideally not happen if resolvePeriod is called correctly after period 1.
    // But as a safeguard, or for period 1 if called (though initGame handles period 1 deal):
    console.log(`[resolvePeriod] Period ${game.period}: Not dealing new cards via resolvePeriod (either period 1 or an issue).`);
  }

  // Reset turn-specific counters for the new period
  if (game.players.length > 0) {
    game.state.currentTurn = (game.period - 1) % game.players.length; // NEW WAY: Rotary start player
  } else {
    game.state.currentTurn = 0; // Fallback if no players (should not happen in active game)
  }
  game.state.turnTransactions = 0;
  game.state.roundNumberInPeriod = 1; // Reset to Round 1 for the new period

  console.log(`[resolvePeriod] Period ${game.period -1} resolved. Starting Period ${game.period}, Round ${game.state.roundNumberInPeriod}, Turn Index: ${game.state.currentTurn}`);
  logActivity(game, null, 'PERIOD_RESOLVED', `Period ${game.period -1 } resolved. Prices updated. New cards dealt. Starting Period ${game.period}, Round ${game.state.roundNumberInPeriod}. Player ${game.players[game.state.currentTurn]?.name} starts.`);
  emitGameState(game); // Emit updated state after resolving
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
function logActivity(game, playerName, actionType, detailsOverride = null) {
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
        period: game.period,
        round: game.state.roundNumberInPeriod,
        playerName: playerName, // Can be null for system messages like "Period Resolved"
        actionType: actionType, // e.g., "BUY", "SELL", "PLAY_CARD"
        details: details,       // e.g., "Bought 1000 HDF", "Played LOAN card"
        timestamp: Date.now()
    };

    const roomID = Object.keys(games).find(key => games[key] === game);
    if (roomID) {
        io.to(roomID).emit('activityLog', logEntry);
        // Also console log for server records
        console.log(`[Activity Log - P${logEntry.period}R${logEntry.round}] ${playerName ? playerName + ': ' : ''}${logEntry.details}`);
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
          if (Object.keys(tokenStore).length < 10) {
            console.log('[rejoinWithToken] Existing tokens:', Object.keys(tokenStore));
          }
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
      name,
      cash: START_CASH,
      portfolio: {},
      hand: []
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

    game.state.turnTransactions = (game.state.turnTransactions || 0) + 1;
    game.state.trans++;

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

    game.state.turnTransactions = (game.state.turnTransactions || 0) + 1;
    game.state.trans++;

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
    if (!game || !game.players || game.players.length === 0) return;
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || playerIndex !== game.state.currentTurn) {
        console.warn(`[pass] Invalid pass attempt by player index ${playerIndex} (current turn: ${game.state.currentTurn})`);
        io.to(socket.id).emit('error', { message: 'It\'s not your turn or invalid state.' });
        return;
    }

    console.log(`[pass] Player ${game.players[playerIndex].name} (Turn ${playerIndex}, Round ${game.state.roundNumberInPeriod}) is passing.`);

    // Add remaining transactions to total
    const remainingTransactions = TRANSACTIONS_PER_PERIOD - (game.state.turnTransactions || 0);
    game.state.trans += Math.max(0, remainingTransactions);
    
    // Calculate next turn index
    const nextTurnIndex = (game.state.currentTurn + 1) % game.players.length;
    let roundCompleted = (nextTurnIndex === 0);
    let currentRound = game.state.roundNumberInPeriod || 1;

    if (roundCompleted) {
        currentRound++;
        if (game.state.activeRightsOffers && Object.keys(game.state.activeRightsOffers).length > 0) {
            console.log(`[pass] End of round. Clearing ${Object.keys(game.state.activeRightsOffers).length} active rights offer(s).`);
            game.state.activeRightsOffers = {}; // Clear active rights offers at end of a full round
        }
        if (currentRound > MAX_ROUNDS_PER_PERIOD) {
            console.log(`[pass] MAX ROUNDS (${MAX_ROUNDS_PER_PERIOD}) reached. Resolving Period ${game.period}.`);
            resolvePeriod(roomID);
            return;
        } else {
            game.state.roundNumberInPeriod = currentRound;
        }
    }
    
    // Advance turn (only if period wasn't resolved)
    game.state.currentTurn = nextTurnIndex;
    game.state.turnTransactions = 0; // Reset transactions for the new player's turn
    
    console.log(`[pass] Advanced turn. New Turn Index: ${game.state.currentTurn}, Round: ${game.state.roundNumberInPeriod}`);
    logActivity(game, game.players[playerIndex]?.name, 'PASS_TURN', `Passed turn.`);
    emitGameState(game);
  });

  socket.on('endTurn', ({ roomID }) => {
    const game = games[roomID];
    if (!game || !game.players || game.players.length === 0) return;
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1 || playerIndex !== game.state.currentTurn) {
        console.warn(`[endTurn] Invalid endTurn attempt by player index ${playerIndex} (current turn: ${game.state.currentTurn})`);
        io.to(socket.id).emit('error', { message: 'It\'s not your turn or invalid state.' });
        return;
    }

    console.log(`[endTurn] Player ${game.players[playerIndex].name} (Turn ${playerIndex}, Round ${game.state.roundNumberInPeriod}) is ending turn.`);

    // Add remaining transactions to total
    const remainingTransactions = TRANSACTIONS_PER_PERIOD - (game.state.turnTransactions || 0);
    game.state.trans += Math.max(0, remainingTransactions);
    
    // Calculate next turn index
    const nextTurnIndex = (game.state.currentTurn + 1) % game.players.length;
    let roundCompleted = (nextTurnIndex === 0); 
    let currentRound = game.state.roundNumberInPeriod || 1;

    if (roundCompleted) {
        currentRound++;
        if (game.state.activeRightsOffers && Object.keys(game.state.activeRightsOffers).length > 0) {
            console.log(`[endTurn] End of round. Clearing ${Object.keys(game.state.activeRightsOffers).length} active rights offer(s).`);
            game.state.activeRightsOffers = {}; // Clear active rights offers at end of a full round
        }
        if (currentRound > MAX_ROUNDS_PER_PERIOD) {
            console.log(`[endTurn] MAX ROUNDS (${MAX_ROUNDS_PER_PERIOD}) reached. Resolving Period ${game.period}.`);
            resolvePeriod(roomID);
            return; 
        } else {
            game.state.roundNumberInPeriod = currentRound;
        }
    }
    
    // Advance turn (only if period wasn't resolved)
    game.state.currentTurn = nextTurnIndex;
    game.state.turnTransactions = 0; // Reset transactions for the new player's turn
    
    console.log(`[endTurn] Advanced turn. New Turn Index: ${game.state.currentTurn}, Round: ${game.state.roundNumberInPeriod}`);
    logActivity(game, game.players[playerIndex]?.name, 'END_TURN', `Ended turn.`);
    emitGameState(game);
  });

  // --- NEW: Handler for players exercising a general rights offer ---
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
    if ((game.state.turnTransactions || 0) >= TRANSACTIONS_PER_PERIOD) {
        return socket.emit('error', { message: 'No transactions left for this turn.' });
    }

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
    game.state.turnTransactions = (game.state.turnTransactions || 0) + 1; // Increment transaction count

    // *** NEW: Remove the offer for this company as it has been claimed ***
    if (game.state.activeRightsOffers && game.state.activeRightsOffers[targetCompany]) {
        console.log(`[exerciseGeneralRights] Rights offer for ${targetCompany} claimed by ${player.name}. Removing offer.`);
        delete game.state.activeRightsOffers[targetCompany];
    }

    console.log(`[exerciseGeneralRights] Player ${player.name} exercised rights for ${actualSharesToGrant} of ${targetCompany} for ₹${totalCost}. New cash: ${player.cash}. Transactions this turn: ${game.state.turnTransactions}`);
    const generalRightsMessage = `Successfully exercised general rights: Acquired ${actualSharesToGrant.toLocaleString()} shares of ${getCompanyName(targetCompany, game)} at ₹${rightsPricePerShare.toLocaleString()} each.`;
    socket.emit('info', { message: generalRightsMessage });
    logActivity(game, player.name, 'EXERCISE_GENERAL_RIGHTS', generalRightsMessage);
    emitGameState(game);
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