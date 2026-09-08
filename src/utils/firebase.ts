import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

/**
 * Firebase core (project wandersync-e31dc).
 * Anonymous auth = invisible per-device ID, zero login screens.
 * Invite codes pair phones; Firestore/Storage carry the shared trip.
 */

const firebaseConfig = {
  apiKey: 'AIzaSyDtVcEOc5_nEZ0rkm4aKlBH3a_SyOLtDGo',
  authDomain: 'wandersync-e31dc.firebaseapp.com',
  projectId: 'wandersync-e31dc',
  storageBucket: 'wandersync-e31dc.firebasestorage.app',
  messagingSenderId: '178924875934',
  appId: '1:178924875934:web:2c29f8cbf5ba51023bcb8f',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let authReady: Promise<User> | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function firebaseAuth(): Auth {
  if (!auth) auth = getAuth(firebaseApp());
  return auth;
}

export function firebaseDb(): Firestore {
  if (!db) db = getFirestore(firebaseApp());
  return db;
}

export function firebaseStorage(): FirebaseStorage {
  if (!storage) storage = getStorage(firebaseApp());
  return storage;
}

/** Signed-in anonymous user (signs in silently on first call, cached after). */
export function ensureCloudUser(): Promise<User> {
  if (!authReady) {
    authReady = new Promise((resolve, reject) => {
      const a = firebaseAuth();
      const unsub = onAuthStateChanged(a, (user) => {
        if (user) {
          unsub();
          resolve(user);
        } else {
          signInAnonymously(a).catch(reject);
        }
      }, reject);
    });
  }
  return authReady;
}

/** 6-char invite code (no confusing 0/O/1/I). */
export function makeInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  for (let i = 0; i < 6; i++) code += chars[buf[i] % chars.length];
  return code;
}
