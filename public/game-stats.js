// Game Stats Module - Loads and displays player stats in a modal
import { doc, getDoc, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth, db } from './firebase-config.js';

let myStatsBtn = null;
let myStatsModal = null;
let statsLoading = null;
let statsData = null;
let statsError = null;
let closeMyStatsBtn = null;
let viewFullDashboardModalBtn = null;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  myStatsBtn = document.getElementById('my-stats-btn');
  myStatsModal = document.getElementById('my-stats-modal');
  statsLoading = document.getElementById('my-stats-loading');
  statsData = document.getElementById('my-stats-data');
  statsError = document.getElementById('my-stats-error');
  closeMyStatsBtn = document.getElementById('close-my-stats-btn');
  viewFullDashboardModalBtn = document.getElementById('view-full-dashboard-modal-btn');

  // Listen for auth state changes to show/hide button
  onAuthStateChanged(auth, (user) => {
    if (user && myStatsBtn) {
      myStatsBtn.style.display = 'inline-block';
    } else if (myStatsBtn) {
      myStatsBtn.style.display = 'none';
    }
  });

  // Open modal button
  if (myStatsBtn) {
    myStatsBtn.addEventListener('click', () => {
      if (auth.currentUser) {
        openMyStatsModal();
      }
    });
  }

  // Close modal button
  if (closeMyStatsBtn) {
    closeMyStatsBtn.addEventListener('click', () => {
      if (myStatsModal) {
        myStatsModal.style.display = 'none';
      }
    });
  }

  // View full dashboard button in modal
  if (viewFullDashboardModalBtn) {
    viewFullDashboardModalBtn.addEventListener('click', () => {
      window.location.href = '/dashboard.html';
    });
  }

  // Close modal when clicking outside
  if (myStatsModal) {
    myStatsModal.addEventListener('click', (e) => {
      if (e.target === myStatsModal) {
        myStatsModal.style.display = 'none';
      }
    });
  }
});

// Function to open the stats modal and load data
async function openMyStatsModal() {
  if (!myStatsModal) {
    console.error('[game-stats] Modal element not found');
    return;
  }
  
  if (!auth.currentUser) {
    console.error('[game-stats] No authenticated user');
    showStatsError('You must be logged in to view stats.');
    myStatsModal.style.display = 'flex';
    return;
  }

  const userId = auth.currentUser.uid;
  console.log('[game-stats] Opening stats modal for user:', userId);

  // Show modal
  myStatsModal.style.display = 'flex';

  // Load stats
  await loadPlayerStats(userId);
}

// Function to load player stats from Firestore
async function loadPlayerStats(userId) {
  console.log('[game-stats] Loading stats for userId:', userId);
  
  if (!userId) {
    console.warn('[game-stats] No userId provided');
    showStatsError();
    return;
  }

  // Check if db is available
  if (!db) {
    console.error('[game-stats] Firestore not initialized - db is null');
    showStatsError('Firestore not initialized. Please refresh the page.');
    return;
  }

  try {
    // Show loading state
    if (statsLoading) statsLoading.style.display = 'block';
    if (statsData) statsData.style.display = 'none';
    if (statsError) statsError.style.display = 'none';

    console.log('[game-stats] Querying Firestore for player_summaries/', userId);
    
    // Get player summary from Firestore using Firebase UID
    const playerSummaryRef = doc(db, 'player_summaries', userId);
    let playerSummaryDoc = await getDoc(playerSummaryRef);

    console.log('[game-stats] Document exists (by Firebase UID):', playerSummaryDoc.exists());
    
    // If not found by Firebase UID, try to find by querying player_stats with firebaseUid
    if (!playerSummaryDoc.exists()) {
      console.log('[game-stats] No document found by Firebase UID, checking player_stats collection...');
      try {
        const statsQuery = query(
          collection(db, 'player_stats'),
          where('firebaseUid', '==', userId)
        );
        const statsSnapshot = await getDocs(statsQuery);
        
        if (!statsSnapshot.empty) {
          console.log('[game-stats] Found stats in player_stats collection, but no summary document. This might be a new account.');
          // Show default values but indicate stats might exist
          displayPlayerStats({
            totalGames: 0,
            totalWins: 0,
            bestFinalWorth: 0,
            totalFinalWorth: 0
          });
          return;
        }
      } catch (queryError) {
        console.warn('[game-stats] Error querying player_stats:', queryError);
        // If it's a permissions error, show a helpful message
        if (queryError.code === 'permission-denied') {
          throw new Error('Permission denied. Please check Firestore security rules allow reading player_summaries and player_stats collections.');
        }
        throw queryError;
      }
    }
    
    if (playerSummaryDoc.exists()) {
      const data = playerSummaryDoc.data();
      console.log('[game-stats] Stats data:', data);
      displayPlayerStats(data);
    } else {
      console.log('[game-stats] No stats document found - showing default values');
      // No stats yet - show default values
      displayPlayerStats({
        totalGames: 0,
        totalWins: 0,
        bestFinalWorth: 0,
        totalFinalWorth: 0
      });
    }
  } catch (error) {
    console.error('[game-stats] Error loading player stats:', error);
    console.error('[game-stats] Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Provide helpful error messages based on error code
    let errorMessage = 'Unable to load statistics.';
    if (error.code === 'permission-denied') {
      errorMessage = 'Permission denied. Please check Firestore security rules. See FIRESTORE_RULES.md for setup instructions.';
    } else if (error.code === 'unavailable') {
      errorMessage = 'Firestore is temporarily unavailable. Please try again later.';
    } else if (error.message) {
      errorMessage = `Error: ${error.message}`;
    }
    
    showStatsError(errorMessage);
  }
}

// Function to display player stats in the modal
function displayPlayerStats(data) {
  const totalGames = data.totalGames || 0;
  const totalWins = data.totalWins || 0;
  const totalLosses = totalGames - totalWins;
  const winRate = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : 0;
  const bestWorth = data.bestFinalWorth || 0;
  const avgWorth = totalGames > 0 ? (data.totalFinalWorth || 0) / totalGames : 0;
  const totalWorth = data.totalFinalWorth || 0;

  // Update UI elements
  const gamesEl = document.getElementById('modal-stat-games');
  const winsEl = document.getElementById('modal-stat-wins');
  const lossesEl = document.getElementById('modal-stat-losses');
  const winrateEl = document.getElementById('modal-stat-winrate');
  const bestEl = document.getElementById('modal-stat-best');
  const avgEl = document.getElementById('modal-stat-avg');
  const totalEl = document.getElementById('modal-stat-total');

  if (gamesEl) gamesEl.textContent = totalGames;
  if (winsEl) winsEl.textContent = totalWins;
  if (lossesEl) lossesEl.textContent = totalLosses;
  if (winrateEl) winrateEl.textContent = `${winRate}%`;
  if (bestEl) bestEl.textContent = formatCurrency(bestWorth);
  if (avgEl) avgEl.textContent = formatCurrency(avgWorth);
  if (totalEl) totalEl.textContent = formatCurrency(totalWorth);

  // Show data, hide loading
  if (statsLoading) statsLoading.style.display = 'none';
  if (statsData) statsData.style.display = 'block';
  if (statsError) statsError.style.display = 'none';
}

// Function to show error state
function showStatsError(message) {
  if (statsLoading) statsLoading.style.display = 'none';
  if (statsData) statsData.style.display = 'none';
  if (statsError) {
    statsError.style.display = 'block';
    if (message) {
      statsError.textContent = message;
    }
  }
}

// Helper function to format currency
function formatCurrency(amount) {
  if (amount >= 10000000) {
    return '₹' + (amount / 10000000).toFixed(2) + 'Cr';
  } else if (amount >= 100000) {
    return '₹' + (amount / 100000).toFixed(2) + 'L';
  } else if (amount >= 1000) {
    return '₹' + (amount / 1000).toFixed(2) + 'K';
  }
  return '₹' + Math.round(amount).toLocaleString();
}
