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
const SUSPEND_CARD_COUNT = 4;

const TRANSACTIONS_PER_PERIOD = 3;
const MAX_ROUNDS_PER_PERIOD = 3; // Define max rounds

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

  // Add suspend cards
  for (let i = 0; i < SUSPEND_CARD_COUNT; i++) {
      deck.push({ type: 'suspend', sub: 'suspend' });
  }

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
    activeSuspensions: {}
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
  console.log(`[initGame] Initial currentTurn set to index: ${game.state.currentTurn}`);

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
        activeSuspensions: game.state.activeSuspensions || {}
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

  let deltas = {};
  COMPANIES.forEach(company => {
    deltas[company.id] = 0;
  });

  // Process price cards in hands, respecting suspensions
  game.players.forEach(player => {
    (player.hand || []).forEach(card => {
      if (card.type === 'price') {
        // Check if the company price change is suspended
        // For now, let's assume ANY suspension blocks price change from cards
        // TODO: Decide if suspension should be player-specific or global
        if (!game.state.activeSuspensions[card.company]) {
            deltas[card.company] += card.change;
        } else {
            console.log(`[resolvePeriod] Price change for ${card.company} (change: ${card.change}) skipped due to suspension.`);
        }
      }
    });
  });

  // Update prices (already respects suspensions via delta calculation)
  Object.keys(game.state.prices).forEach(company => {
    game.state.prices[company] = Math.max(0, game.state.prices[company] + deltas[company]);
  });

  // Clear played cards, suspensions, and transaction count for the next period
  game.state.played = [];
  game.state.activeSuspensions = {}; // Clear suspensions after they are applied
  game.state.trans = 0;
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
  game.state.currentTurn = 0; // Start period with first player
  game.state.turnTransactions = 0;
  game.state.roundNumberInPeriod = 1; // Reset to Round 1 for the new period

  console.log(`[resolvePeriod] Period ${game.period} resolved. Starting Round ${game.state.roundNumberInPeriod}, Turn Index: ${game.state.currentTurn}`);
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

io.on('connection', socket => {
  console.log('Client connected:', socket.id);

  // --- NEW REJOIN WITH TOKEN HANDLER ---
  socket.on('rejoinWithToken', (token, callback) => {
      console.log(`[rejoinWithToken] Attempting rejoin with token: ${token}`);
      const sessionData = tokenStore[token];

      if (!sessionData) {
          console.log(`[rejoinWithToken] Token not found: ${token}`);
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

    console.log('Player after buy:', {
        name: player.name,
        cash: player.cash,
        portfolio: JSON.stringify(player.portfolio)
    });

    game.state.turnTransactions = (game.state.turnTransactions || 0) + 1;
    game.state.trans++;

    console.log('=== BUY TRANSACTION END ===\n');
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
    emitGameState(game);
  });

  socket.on('windfall', ({ roomID, card, targetCompany }) => {
    const game = games[roomID];
    if (!game) return;
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    const cardIndex = player.hand.findIndex(c => 
      c.type === 'windfall' && c.sub === card.sub);
    if (cardIndex === -1) return;

    // --- VALIDATE TURN ---
    if (game.state.currentTurn !== game.players.findIndex(p => p.id === socket.id)) {
        return socket.emit('error', { message: 'Not your turn.' });
    }
    // --- END VALIDATE TURN ---

    const windfallCard = player.hand.splice(cardIndex, 1)[0];
    game.discard.push(windfallCard);

    switch (windfallCard.sub) {
      case 'LOAN':
        player.cash += 100000;
        break;
      case 'DEBENTURE':
        Object.entries(game.state.prices).forEach(([company, price]) => {
          if (price <= 0 && player.portfolio[company]) {
            player.cash += game.state.init[company] * player.portfolio[company];
            delete player.portfolio[company];
          }
        });
        break;
      case 'RIGHTS':
        // *** NEW RIGHTS LOGIC ***
        if (!targetCompany) {
            // Put card back in hand if no company was selected (shouldn't happen with modal)
            player.hand.push(windfallCard);
            game.discard.pop();
            return socket.emit('error', { message: 'No company selected for Rights Issue.'});
        }
        if (!game.state.init || !game.state.init[targetCompany]){
             player.hand.push(windfallCard);
             game.discard.pop();
            return socket.emit('error', { message: 'Cannot find initial price for selected company.' });
        }
        if (!player.portfolio || !(player.portfolio[targetCompany] > 0)) {
             player.hand.push(windfallCard);
             game.discard.pop();
             return socket.emit('error', { message: `You do not own shares in ${targetCompany}.` });
        }

        const initialPrice = game.state.init[targetCompany];
        const ownedShares = player.portfolio[targetCompany];
        const rightsShares = Math.floor(ownedShares / 2);
        const rightsPricePerShare = Math.ceil(initialPrice / 2); // Round up cost? Or floor? Let's ceil.
        const totalCost = rightsShares * rightsPricePerShare;

        console.log(`[windfall RIGHTS] Player: ${player.name}, Company: ${targetCompany}, Owned: ${ownedShares}, InitialPrice: ${initialPrice}, RightsShares: ${rightsShares}, Price/Share: ${rightsPricePerShare}, TotalCost: ${totalCost}`);

        if (rightsShares <= 0) {
            player.hand.push(windfallCard);
            game.discard.pop();
            return socket.emit('error', { message: `Not enough shares owned in ${targetCompany} to exercise rights.` });
        }
        if (player.cash < totalCost) {
            player.hand.push(windfallCard);
            game.discard.pop();
            return socket.emit('error', { message: `Insufficient cash for rights issue. Need ₹${totalCost.toLocaleString()}, have ₹${player.cash.toLocaleString()}.` });
        }

        // Execute Rights Issue
        player.cash -= totalCost;
        player.portfolio[targetCompany] += rightsShares;
        console.log(`[windfall RIGHTS] Success. Player cash: ${player.cash}, ${targetCompany} shares: ${player.portfolio[targetCompany]}`);
        // *** END NEW RIGHTS LOGIC ***
        break;
    }

    game.state.trans++;
    emitGameState(game);
  });

  socket.on('suspend', ({ roomID, company }) => {
    const game = games[roomID];
    if (!game) return;
    game.state.played.push({ type: 'freeze', company });
    emitGameState(game);
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
        currentRound++; // Tentatively increment round number
        console.log(`[pass] End of round detected. Tentative next round: ${currentRound}.`);
        
        // --- Check if max rounds reached --- 
        if (currentRound > MAX_ROUNDS_PER_PERIOD) {
            console.log(`[pass] MAX ROUNDS (${MAX_ROUNDS_PER_PERIOD}) reached. Resolving Period ${game.period}.`);
            resolvePeriod(roomID); // Resolve the period automatically
            return; // Stop further processing for this event, resolvePeriod handles emit
        }
         // If max rounds not reached, update the round number in state
        game.state.roundNumberInPeriod = currentRound;
    }
    
    // Advance turn (only if period wasn't resolved)
    game.state.currentTurn = nextTurnIndex;
    game.state.turnTransactions = 0; // Reset transactions for the new player's turn
    
    console.log(`[pass] Advanced turn. New Turn Index: ${game.state.currentTurn}, Round: ${game.state.roundNumberInPeriod}`);
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
        currentRound++; // Tentatively increment round number
        console.log(`[endTurn] End of round detected. Tentative next round: ${currentRound}.`);
        
        // --- Check if max rounds reached --- 
        if (currentRound > MAX_ROUNDS_PER_PERIOD) {
            console.log(`[endTurn] MAX ROUNDS (${MAX_ROUNDS_PER_PERIOD}) reached. Resolving Period ${game.period}.`);
            resolvePeriod(roomID); // Resolve the period automatically
            return; // Stop further processing for this event, resolvePeriod handles emit
        }
         // If max rounds not reached, update the round number in state
        game.state.roundNumberInPeriod = currentRound;
    }
    
    // Advance turn (only if period wasn't resolved)
    game.state.currentTurn = nextTurnIndex;
    game.state.turnTransactions = 0; // Reset transactions for the new player's turn

    console.log(`[endTurn] Advanced turn. New Turn Index: ${game.state.currentTurn}, Round: ${game.state.roundNumberInPeriod}`);
    emitGameState(game);
  });

  socket.on('advancePeriod', ({ roomID }) => {
    const game = games[roomID];
    if (!game) return;
    const player = game.players.find(p => p.id === socket.id);
    
    // Only Admin can advance the period
    if (!player || !player.isAdmin) {
        console.log(`Non-admin player ${player?.name} (${socket.id}) tried to advance period in room ${roomID}.`);
        // Optionally emit an error back to the player
        // io.to(socket.id).emit('error', { message: 'Only the admin can advance the period.' });
        return;
    }

    console.log(`Admin ${player.name} is advancing period for room ${roomID}.`);
    resolvePeriod(roomID);
  });

  // --- NEW SUSPEND CARD HANDLER ---
  socket.on('playSuspendCard', ({ roomID, card, targetCompany }) => {
      const game = games[roomID];
      const player = game?.players.find(p => p.id === socket.id);

      if (!game || !player) {
          return socket.emit('error', { message: 'Game or player not found.' });
      }
      if (game.state.currentTurn !== game.players.findIndex(p => p.id === socket.id)) {
          return socket.emit('error', { message: 'Not your turn.' });
      }
      if (!player.hand || !Array.isArray(player.hand)) {
           console.error(`[playSuspendCard] Player ${player.name} has invalid hand:`, player.hand);
           return socket.emit('error', { message: 'Invalid player hand data.' });
       }

      // Find the specific suspend card instance in hand
      const cardIndex = player.hand.findIndex(c => c.type === 'suspend'); 
      if (cardIndex === -1) {
          return socket.emit('error', { message: 'Suspend card not found in your hand.' });
      }
      
      // Validate the target company exists and player owns shares
      if (!COMPANIES.some(c => c.id === targetCompany)) {
          return socket.emit('error', { message: 'Invalid company selected.'});
      }
      if (!player.portfolio || !(player.portfolio[targetCompany] > 0)) {
           return socket.emit('error', { message: `You do not own shares in ${targetCompany} to suspend.` });
      }
      
      // Check if already suspended
      if (game.state.activeSuspensions[targetCompany]) {
          return socket.emit('error', { message: `${targetCompany} price change is already suspended.`});
      }

      console.log(`[playSuspendCard] Player ${player.name} is suspending ${targetCompany}`);

      // Remove card from hand and add to discard (or just remove)
      const playedCard = player.hand.splice(cardIndex, 1)[0];
      game.discard = game.discard || [];
      game.discard.push(playedCard);

      // Apply suspension
      game.state.activeSuspensions = game.state.activeSuspensions || {};
      game.state.activeSuspensions[targetCompany] = player.id; // Store who suspended it

      // Emit updated game state to all players
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