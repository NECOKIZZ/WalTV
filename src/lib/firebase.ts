// Firebase is now ONLY used for Firestore (the social/data layer).
// Authentication is handled entirely by Enoki zkLogin \u2014 see src/lib/sui.ts
// and the AuthProvider in src/lib/auth-context.tsx. Storage is handled by
// Walrus \u2014 see src/lib/walrus.ts. The user's identity in Firestore is their
// Sui address; there is no Firebase Auth user layer.

import { FirebaseApp, FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';

type FirebaseEnv = Record<string, string | undefined>;

const env = import.meta.env as FirebaseEnv;

function readEnv(key: string, legacyKey: string) {
  return env[key] ?? env[legacyKey];
}

function readBooleanEnv(key: string) {
  return env[key]?.toLowerCase() === 'true';
}

export const firebaseConfig: FirebaseOptions = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET', 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID'),
};

const firebaseCoreConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

export const firebaseEnabled = firebaseCoreConfig.every(
  (value) => typeof value === 'string' && value.trim().length > 0,
);

export const app: FirebaseApp | null = firebaseEnabled
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const db: Firestore | null = app ? getFirestore(app) : null;

const useEmulators = Boolean(app) && readBooleanEnv('VITE_USE_FIREBASE_EMULATORS');

if (useEmulators && db) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

export default app;
