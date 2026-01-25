// Authentication Module
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth } from './firebase-config.js';

// Global auth state
window.authState = {
  user: null,
  mode: 'guest', // 'guest' or 'logged-in'
  userId: null
};

// UI Elements
const authScreen = document.getElementById('auth-screen');
const lobby = document.getElementById('lobby');
const loginForm = document.getElementById('login-form');
const userInfo = document.getElementById('user-info');
const loginModeBtn = document.getElementById('loginModeBtn');
const guestModeBtn = document.getElementById('guestModeBtn');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const backToModeBtn = document.getElementById('backToModeBtn');
const logoutBtn = document.getElementById('logoutBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const authError = document.getElementById('auth-error');
const userEmail = document.getElementById('user-email');
const modeText = document.getElementById('mode-text');
const switchToDashboardBtn = document.getElementById('switchToDashboardBtn');

// Event Listeners
if (loginModeBtn) {
  loginModeBtn.addEventListener('click', () => {
    loginForm.style.display = 'block';
  });
}

if (guestModeBtn) {
  guestModeBtn.addEventListener('click', () => {
    window.authState.mode = 'guest';
    window.authState.userId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    showLobby();
  });
}

if (backToModeBtn) {
  backToModeBtn.addEventListener('click', () => {
    loginForm.style.display = 'none';
    authError.style.display = 'none';
  });
}

if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
      showAuthError('Please enter email and password');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the UI update
    } catch (error) {
      showAuthError(error.message);
    }
  });
}

if (signupBtn) {
  signupBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password) {
      showAuthError('Please enter email and password');
      return;
    }
    if (password.length < 6) {
      showAuthError('Password must be at least 6 characters');
      return;
    }
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will handle the UI update
    } catch (error) {
      showAuthError(error.message);
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.authState.user = null;
      window.authState.mode = 'guest';
      window.authState.userId = null;
      showAuthScreen();
    } catch (error) {
      console.error('Logout error:', error);
    }
  });
}

if (switchToDashboardBtn) {
  switchToDashboardBtn.addEventListener('click', () => {
    window.location.href = '/dashboard.html';
  });
}

// Monitor auth state
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.authState.user = user;
    window.authState.mode = 'logged-in';
    window.authState.userId = user.uid;
    updateUIForLoggedIn(user);
    showLobby();
  } else {
    // User is not logged in, but might be in guest mode
    if (window.authState.mode === 'guest') {
      showLobby();
    } else {
      showAuthScreen();
    }
  }
});

function showAuthError(message) {
  authError.textContent = message;
  authError.style.display = 'block';
  setTimeout(() => {
    authError.style.display = 'none';
  }, 5000);
}

function showAuthScreen() {
  if (authScreen) authScreen.style.display = 'block';
  if (lobby) lobby.style.display = 'none';
  loginForm.style.display = 'none';
  userInfo.style.display = 'none';
}

function showLobby() {
  if (authScreen) authScreen.style.display = 'none';
  if (lobby) lobby.style.display = 'block';
  loginForm.style.display = 'none';
  userInfo.style.display = 'none';
  updateModeIndicator();
}

function updateUIForLoggedIn(user) {
  if (userEmail) userEmail.textContent = user.email;
  if (userInfo) userInfo.style.display = 'block';
  updateModeIndicator();
}

function updateModeIndicator() {
  if (modeText) {
    if (window.authState.mode === 'logged-in') {
      modeText.textContent = `Mode: Logged in (${window.authState.user?.email || 'User'})`;
      if (switchToDashboardBtn) switchToDashboardBtn.style.display = 'inline-block';
    } else {
      modeText.textContent = 'Mode: Guest';
      if (switchToDashboardBtn) switchToDashboardBtn.style.display = 'none';
    }
  }
}

// Initialize: Show auth screen if not already authenticated
if (!window.authState.user && window.authState.mode !== 'guest') {
  showAuthScreen();
}
