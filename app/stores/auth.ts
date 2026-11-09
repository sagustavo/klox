import { getFirebaseClient, hasFirebaseConfig } from '~/utils/firebaseClient';
import { usePreferencesStore } from './preferences';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isDemo: boolean;
}

const DEMO_SESSION_KEY = 'klox_demo_session';

const DEMO_USER: AuthUser = {
  uid: 'demo-user',
  email: 'demo@klox.dev',
  displayName: 'Demo Engineer',
  isDemo: true,
};

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const ready = ref(false);
  const loading = ref(false);
  const errorCode = ref<string | null>(null);

  let initPromise: Promise<void> | null = null;

  const isAuthenticated = computed(() => Boolean(user.value));
  const isDemoMode = computed(() => Boolean(user.value?.isDemo));

  async function init(forceDemo = false): Promise<void> {
    if (import.meta.server) return;
    const prefsStore = usePreferencesStore();

    if (forceDemo || !hasFirebaseConfig()) {
      const savedDemo = localStorage.getItem(DEMO_SESSION_KEY);
      if (forceDemo || !hasFirebaseConfig() || savedDemo === '1') {
        localStorage.setItem(DEMO_SESSION_KEY, '1');
        user.value = { ...DEMO_USER };
        await prefsStore.hydrate(user.value.uid, true);
      }
      ready.value = true;
      return;
    }

    if (localStorage.getItem(DEMO_SESSION_KEY) === '1') {
      user.value = { ...DEMO_USER };
      await prefsStore.hydrate(user.value.uid, true);
      ready.value = true;
      return;
    }

    if (initPromise) return initPromise;

    initPromise = new Promise<void>((resolve) => {
      getFirebaseClient()
        .then(async (fb) => {
          if (!fb) {
            user.value = { ...DEMO_USER };
            await prefsStore.hydrate(user.value.uid, true);
            ready.value = true;
            resolve();
            return;
          }
          const { onAuthStateChanged } = await import('firebase/auth');
          fb.auth.languageCode = prefsStore.preferences.locale === 'pt-br' ? 'pt-BR' : 'en';

          onAuthStateChanged(fb.auth, async (fbUser) => {
            if (fbUser) {
              user.value = {
                uid: fbUser.uid,
                email: fbUser.email,
                displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
                isDemo: false,
              };
              await prefsStore.hydrate(fbUser.uid, false);
            } else {
              user.value = null;
              await prefsStore.hydrate(null, true);
            }
            ready.value = true;
            resolve();
          });
        })
        .catch(() => {
          ready.value = true;
          resolve();
        });
    });

    return initPromise;
  }

  function enterDemoMode() {
    if (import.meta.server) return;
    localStorage.setItem(DEMO_SESSION_KEY, '1');
    user.value = { ...DEMO_USER };
    ready.value = true;
    const prefsStore = usePreferencesStore();
    prefsStore.hydrate(DEMO_USER.uid, true);
  }

  async function signInWithEmail(email: string, password: string): Promise<boolean> {
    errorCode.value = null;
    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        enterDemoMode();
        return true;
      }
      localStorage.removeItem(DEMO_SESSION_KEY);
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      await signInWithEmailAndPassword(fb.auth, email.trim(), password);
      return true;
    } catch (err: unknown) {
      errorCode.value = mapFirebaseAuthError(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    displayName?: string
  ): Promise<boolean> {
    errorCode.value = null;
    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        enterDemoMode();
        return true;
      }
      localStorage.removeItem(DEMO_SESSION_KEY);
      const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
      const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password);
      if (displayName?.trim()) {
        await updateProfile(cred.user, { displayName: displayName.trim() });
      }
      return true;
    } catch (err: unknown) {
      errorCode.value = mapFirebaseAuthError(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signInWithGoogle(): Promise<boolean> {
    errorCode.value = null;
    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        enterDemoMode();
        return true;
      }
      localStorage.removeItem(DEMO_SESSION_KEY);
      const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(fb.auth, provider);
      return true;
    } catch (err: unknown) {
      errorCode.value = mapFirebaseAuthError(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signOutUser(): Promise<void> {
    if (import.meta.client) {
      localStorage.removeItem(DEMO_SESSION_KEY);
    }
    const fb = await getFirebaseClient();
    if (fb && !user.value?.isDemo) {
      const { signOut } = await import('firebase/auth');
      await signOut(fb.auth);
    }
    user.value = null;
  }

  async function getIdToken(): Promise<string | null> {
    if (!user.value || user.value.isDemo) return null;
    const fb = await getFirebaseClient();
    if (!fb?.auth.currentUser) return null;
    return fb.auth.currentUser.getIdToken();
  }

  return {
    user,
    ready,
    loading,
    errorCode,
    isAuthenticated,
    isDemoMode,
    init,
    enterDemoMode,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOutUser,
    getIdToken,
  };
});

function mapFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'AUTH_INVALID_CREDENTIALS';
  }
  if (code.includes('email-already-in-use')) {
    return 'AUTH_EMAIL_IN_USE';
  }
  if (code.includes('weak-password')) {
    return 'AUTH_WEAK_PASSWORD';
  }
  if (code.includes('popup-closed-by-user')) {
    return 'AUTH_POPUP_CLOSED';
  }
  return 'AUTH_GENERIC_ERROR';
}
