import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBlAhlya-NNp8gCxGPBIPxxCgDa6l9AXo8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "assetide.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "your-card-collection-2026",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "your-card-collection-2026.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "620171462959",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:620171462959:web:28ecb209a009d16db679da",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-8Q7GPWY0PW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check for bot protection
// Note: You need to enable App Check in Firebase Console and get reCAPTCHA Enterprise site key
// For development, you can use debug tokens
if (typeof window !== 'undefined') {
  // Enable debug mode for localhost (remove in production or use environment variable)
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-undef
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  const appCheckKey = import.meta.env.VITE_APPCHECK_SITE_KEY;
  if (appCheckKey) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckKey),
        isTokenAutoRefreshEnabled: true
      });
      console.log('✅ Firebase App Check initialized');
    } catch (error) {
      // App Check is optional - app will work without it but with less protection
      console.warn('⚠️ App Check not configured:', error.message);
    }
  }
}

// Initialize services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
export const ensureAuthPersistence = async () => {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    try {
      await setPersistence(auth, browserSessionPersistence);
    } catch (innerErr) {
      console.warn("⚠️ Auth persistence unavailable:", innerErr?.message || innerErr);
    }
  }
};

export default app;
