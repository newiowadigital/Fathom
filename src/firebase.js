import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ┌─────────────────────────────────────────────────────────┐
// │  REPLACE these values with YOUR Firebase project config  │
// │  Find them at: Firebase Console → Project Settings       │
// │  → Your apps → Web app → Config                         │
// └─────────────────────────────────────────────────────────┘
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

/* While the placeholder config is untouched, Fathom runs in local mode:
   no sign-in, data kept in this browser. Replace the values above to enable accounts + cloud sync. */
export const isConfigured = !String(firebaseConfig.apiKey).startsWith("YOUR_");

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
