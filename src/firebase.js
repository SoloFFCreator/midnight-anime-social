import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getDatabase } from 'firebase/database'

// This is the same Firebase project used by Midnight Anime streaming.
// The values are Firebase's public web-app identifiers, not admin credentials.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyClcy2YXqryJAkg_wy1W4RLqkYMIsEg2Rk',
  // The OAuth handler belongs to this Firebase project. Add the app's custom
  // origin separately under Firebase Authentication > Authorized domains.
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'mid-night-anime.firebaseapp.com',
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://mid-night-anime-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'mid-night-anime',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'mid-night-anime.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '655330045563',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:655330045563:web:ca9f6f48b91c284634bcde',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-SCB0QBXWLG',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getDatabase(app)
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })
