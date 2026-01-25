// Dashboard Module
import { 
  onAuthStateChanged,
  signOut 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit,
  doc,
  getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

// UI Elements
const authRequired = document.getElementById('auth-required');
const dashboardContent = document.getElementById('dashboard-content');
const loadingScreen = document.getElementById('loading-screen');
const dashboardUserEmail = document.getElementById('dashboard-user-email');
const dashboardLogoutBtn = document.getElementById('dashboard-logout-btn');
const gamesListContent = document.getElementById('games-list-content');

// Stats elements
const statTotalGames = document.getElementById('stat-total-games');
const statTotalWins = document.getElementById('stat-total-wins');
const statWinRate = document.getElementById('stat-win-rate');
const statBestWorth = document.getElementById('stat-best-worth');
const statAvgWorth = document.getElementById('stat-avg-worth');

let performanceChart = null;

// Check authentication
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // User is logged in
    if (dashboardUserEmail) dashboardUserEmail.textContent = user.email;
    authRequired.style.display = 'none';
    loadingScreen.style.display = 'block';
    dashboardContent.style.display = 'none';
    
    try {
      await loadDashboardData(user.uid);
      loadingScreen.style.display = 'none';
      dashboardContent.style.display = 'block';
    } catch (error) {
      console.error('Error loading dashboard:', error);
      loadingScreen.innerHTML = `<div class="error">Error loading dashboard: ${error.message}</div>`;
    }
  } else {
    // User is not logged in
    authRequired.style.display = 'block';
    dashboardContent.style.display = 'none';
    loadingScreen.style.display = 'none';
  }
});

// Logout handler
if (dashboardLogoutBtn) {
  dashboardLogoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  });
}

async function loadDashboardData(userId) {
  // Load player summary stats
  const playerSummaryRef = doc(db, 'player_summaries', userId);
  const playerSummaryDoc = await getDoc(playerSummaryRef);
  
  if (playerSummaryDoc.exists()) {
    const data = playerSummaryDoc.data();
    updateStats(data);
  } else {
    // No stats yet
    updateStats({
      totalGames: 0,
      totalWins: 0,
      bestFinalWorth: 0,
      totalFinalWorth: 0
    });
  }

  // Load recent games where this player participated
  await loadRecentGames(userId);
  
  // Load performance chart data
  await loadPerformanceChart(userId);
}

function updateStats(data) {
  const totalGames = data.totalGames || 0;
  const totalWins = data.totalWins || 0;
  const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : 0;
  const bestWorth = data.bestFinalWorth || 0;
  const avgWorth = totalGames > 0 ? (data.totalFinalWorth || 0) / totalGames : 0;

  if (statTotalGames) statTotalGames.textContent = totalGames;
  if (statTotalWins) statTotalWins.textContent = totalWins;
  if (statWinRate) statWinRate.textContent = `${winRate}%`;
  if (statBestWorth) statBestWorth.textContent = formatCurrency(bestWorth);
  if (statAvgWorth) statAvgWorth.textContent = formatCurrency(avgWorth);
}

async function loadRecentGames(userId) {
  try {
    // Query player_stats collection for this user
    const statsQuery = query(
      collection(db, 'player_stats'),
      where('playerUuid', '==', userId),
      orderBy('gameEndTime', 'desc'),
      limit(10)
    );
    
    const statsSnapshot = await getDocs(statsQuery);
    
    if (statsSnapshot.empty) {
      gamesListContent.innerHTML = '<p>No games played yet. Start playing to see your game history!</p>';
      return;
    }

    // Get game IDs and fetch game details
    const gameIds = [];
    const statsData = [];
    
    statsSnapshot.forEach(doc => {
      const data = doc.data();
      gameIds.push(data.gameId);
      statsData.push({ id: doc.id, ...data });
    });

    // Fetch game details
    const gamesHtml = [];
    for (const stat of statsData) {
      try {
        const gameQuery = query(
          collection(db, 'games'),
          where('__name__', '==', stat.gameId)
        );
        const gameSnapshot = await getDocs(gameQuery);
        
        let gameData = null;
        gameSnapshot.forEach(doc => {
          gameData = { id: doc.id, ...doc.data() };
        });

        if (gameData) {
          const gameDate = gameData.gameEndTime?.toDate ? gameData.gameEndTime.toDate() : new Date(stat.gameEndTime);
          const players = gameData.players || [];
          const playerRank = players
            .sort((a, b) => b.finalTotalWorth - a.finalTotalWorth)
            .findIndex(p => p.uuid === userId) + 1;
          
          gamesHtml.push(`
            <div class="game-item" onclick="viewGameDetails('${stat.gameId}')">
              <h4>Game ${stat.gameId.substring(0, 8)}...</h4>
              <div class="game-meta">
                <div>Date: ${gameDate.toLocaleDateString()} ${gameDate.toLocaleTimeString()}</div>
                <div>Final Worth: ${formatCurrency(stat.finalTotalWorth)}</div>
                <div>Rank: ${playerRank} of ${players.length}</div>
                <div>Periods: ${gameData.totalPeriods || 'N/A'}</div>
              </div>
            </div>
          `);
        }
      } catch (error) {
        console.error('Error loading game details:', error);
      }
    }

    gamesListContent.innerHTML = gamesHtml.join('');
  } catch (error) {
    console.error('Error loading recent games:', error);
    gamesListContent.innerHTML = '<div class="error">Error loading games: ' + error.message + '</div>';
  }
}

async function loadPerformanceChart(userId) {
  try {
    const statsQuery = query(
      collection(db, 'player_stats'),
      where('playerUuid', '==', userId),
      orderBy('gameEndTime', 'asc')
    );
    
    const statsSnapshot = await getDocs(statsQuery);
    
    const labels = [];
    const finalWorthData = [];
    
    statsSnapshot.forEach(doc => {
      const data = doc.data();
      const gameDate = data.gameEndTime?.toDate ? data.gameEndTime.toDate() : new Date(data.gameEndTime);
      labels.push(gameDate.toLocaleDateString());
      finalWorthData.push(data.finalTotalWorth || 0);
    });

    if (labels.length === 0) {
      document.getElementById('performance-chart').parentElement.innerHTML = '<p>No game data available yet. Play some games to see your performance chart!</p>';
      return;
    }

    const ctx = document.getElementById('performance-chart').getContext('2d');
    
    if (performanceChart) {
      performanceChart.destroy();
    }

    performanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Final Worth',
          data: finalWorthData,
          borderColor: '#4CAF50',
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return formatCurrency(value);
              }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return 'Final Worth: ' + formatCurrency(context.parsed.y);
              }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error loading performance chart:', error);
    document.getElementById('performance-chart').parentElement.innerHTML = '<div class="error">Error loading chart: ' + error.message + '</div>';
  }
}

function formatCurrency(amount) {
  if (amount >= 10000000) {
    return '₹' + (amount / 10000000).toFixed(2) + 'Cr';
  } else if (amount >= 100000) {
    return '₹' + (amount / 100000).toFixed(2) + 'L';
  } else if (amount >= 1000) {
    return '₹' + (amount / 1000).toFixed(2) + 'K';
  }
  return '₹' + amount.toLocaleString();
}

function viewGameDetails(gameId) {
  // TODO: Implement game details view
  alert('Game details view coming soon! Game ID: ' + gameId);
}
