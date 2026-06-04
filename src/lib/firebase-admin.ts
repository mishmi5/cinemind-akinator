import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const apps = getApps();

if (!apps.length) {
  const useEmulator = process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST;
  let credentialOptions = applicationDefault();
  
  if (useEmulator) {
    credentialOptions = applicationDefault();
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credentialOptions = cert(serviceAccount);
    } catch (e) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY", e);
    }
  }

  initializeApp({
    credential: credentialOptions,
    projectId: process.env.FIREBASE_PROJECT_ID || 'cinemind-70cc9'
  });
}

export const adminDb = getFirestore();
export const adminAuth = getAuth();
