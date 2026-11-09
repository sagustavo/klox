import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export interface FirebaseClientServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let cachedServices: FirebaseClientServices | null = null;
let initPromise: Promise<FirebaseClientServices | null> | null = null;

/**
 * Checks whether Firebase public runtime config is populated.
 * When false (or when `?demo=1` is in the URL), Klox runs in local Demo Mode (ADR-0002).
 */
export function hasFirebaseConfig(): boolean {
  const config = useRuntimeConfig().public;
  return Boolean(config.firebaseApiKey && config.firebaseProjectId && config.firebaseAuthDomain);
}

/**
 * Lazily loads the Firebase modular SDK ONLY when called from `/app/**` or `/login`.
 * Guarantees the prerendered marketing landing page bundle contains zero Firebase code (ADR-0001).
 */
export async function getFirebaseClient(): Promise<FirebaseClientServices | null> {
  if (import.meta.server) return null;
  if (cachedServices) return cachedServices;
  if (!hasFirebaseConfig()) return null;

  if (!initPromise) {
    initPromise = (async () => {
      const pub = useRuntimeConfig().public;
      const [{ initializeApp, getApps }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);

      const existing = getApps()[0];
      const app =
        existing ??
        initializeApp({
          apiKey: String(pub.firebaseApiKey),
          authDomain: String(pub.firebaseAuthDomain),
          projectId: String(pub.firebaseProjectId),
          storageBucket: String(pub.firebaseStorageBucket || ''),
          messagingSenderId: String(pub.firebaseMessagingSenderId || ''),
          appId: String(pub.firebaseAppId || ''),
        });

      const auth = getAuth(app);
      const db = getFirestore(app);
      cachedServices = { app, auth, db };
      return cachedServices;
    })();
  }

  return initPromise;
}
