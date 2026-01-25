// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCAqx0mwhOtkmOHEck655FHseUgOTR6TX4",
  authDomain: "remotestockexchange.firebaseapp.com",
  projectId: "remotestockexchange",
  storageBucket: "remotestockexchange.firebasestorage.app",
  messagingSenderId: "845523859376",
  appId: "1:845523859376:web:392d39afd6f502883f0875",
  measurementId: "G-T7DZBNWQJB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);