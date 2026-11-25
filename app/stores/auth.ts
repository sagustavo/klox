import { mapFirebaseAuthErrorCode } from '~/domain/auth';
import { getFirebaseClient, hasFirebaseConfig } from '~/utils/firebaseClient';
import { useCatalogStore } from './catalog';
import { useOnboardingStore } from './onboarding';
import { usePreferencesStore } from './preferences';
import { useProfileStore } from './profile';
import { useTimeLogsStore } from './timeLogs';
import { useTimerStore } from './timer';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providers: string[];
  isDemo: boolean;
}

interface FirebaseUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  providerData?: ReadonlyArray<{
    providerId?: string | null;
    photoURL?: string | null;
  }>;
}

export interface GoogleSignInResult {
  ok: boolean;
  isNewUser: boolean;
}

const DEMO_SESSION_KEY = 'klox_demo_session';
const AUTH_SESSION_HINT_KEY = 'klox_auth_session';

const DEMO_USER: AuthUser = {
  uid: 'demo-user',
  email: 'demo@klox.dev',
  displayName: 'Demo Engineer',
  photoURL: null,
  providers: ['demo'],
  isDemo: true,
};

function extractGooglePhotoUrl(fbUser: FirebaseUserLike): string | null {
  const googleEntry = fbUser.providerData?.find((p) => p.providerId === 'google.com');
  const candidate = googleEntry?.photoURL?.trim() || fbUser.photoURL?.trim() || '';
  return candidate || null;
}

function extractProviderIds(fbUser: FirebaseUserLike): string[] {
  const ids = (fbUser.providerData ?? [])
    .map((p) => p.providerId)
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const ready = ref(false);
  const loading = ref(false);
  const errorCode = ref<string | null>(null);

  let listenerPromise: Promise<void> | null = null;
  let initialAuthResolved = false;

  const isAuthenticated = computed(() => Boolean(user.value));
  const isDemoMode = computed(() => Boolean(user.value?.isDemo));

  function resetTenantStores() {
    useCatalogStore().reset();
    useTimeLogsStore().reset();
    useTimerStore().reset();
    useOnboardingStore().reset();
    useProfileStore().reset();
  }

  function toAuthUser(
    fbUser: FirebaseUserLike,
    overrideDisplayName?: string,
    fallbackDisplayName?: string
  ): AuthUser {
    const cleanOverride = overrideDisplayName?.trim();
    return {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName:
        cleanOverride ||
        fbUser.displayName ||
        fallbackDisplayName ||
        fbUser.email?.split('@')[0] ||
        'User',
      photoURL: extractGooglePhotoUrl(fbUser),
      providers: extractProviderIds(fbUser),
      isDemo: false,
    };
  }

  function syncProfileIdentity(patch: {
    displayName?: string | null;
    photoURL?: string | null;
  }) {
    if (!user.value) return;
    user.value = {
      ...user.value,
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      ...(patch.photoURL !== undefined ? { photoURL: patch.photoURL } : {}),
    };
  }

  async function applySignedInFirebaseUser(
    fbUser: FirebaseUserLike,
    overrideDisplayName?: string
  ): Promise<void> {
    if (import.meta.client) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    }

    const sameRealUser = Boolean(
      user.value && !user.value.isDemo && user.value.uid === fbUser.uid
    );
    const nextUser = toAuthUser(
      fbUser,
      overrideDisplayName,
      sameRealUser ? (user.value?.displayName ?? undefined) : undefined
    );

    if (!sameRealUser) {
      resetTenantStores();
    }

    user.value = nextUser;
    ready.value = true;

    if (!sameRealUser) {
      const prefsStore = usePreferencesStore();
      const profileStore = useProfileStore();
      await Promise.all([
        prefsStore.hydrate(nextUser.uid, false),
        profileStore.hydrate(nextUser.uid, false, {
          email: nextUser.email,
          displayName: nextUser.displayName,
          photoURL: nextUser.photoURL,
        }),
      ]);
    }
  }

  function activateDemoState() {
    if (import.meta.server) return;
    if (user.value && user.value.uid !== DEMO_USER.uid) {
      resetTenantStores();
    }
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    localStorage.setItem(DEMO_SESSION_KEY, '1');
    user.value = { ...DEMO_USER };
    ready.value = true;
    void useProfileStore().hydrate(DEMO_USER.uid, true, {
      email: DEMO_USER.email,
      displayName: DEMO_USER.displayName,
      photoURL: null,
    });
  }

  function ensureFirebaseAuthListener(): Promise<void> {
    if (listenerPromise) return listenerPromise;

    const prefsStore = usePreferencesStore();
    listenerPromise = new Promise<void>((resolve) => {
      getFirebaseClient()
        .then(async (fb) => {
          if (!fb) {
            activateDemoState();
            await prefsStore.hydrate(DEMO_USER.uid, true);
            initialAuthResolved = true;
            resolve();
            return;
          }

          const { onAuthStateChanged } = await import('firebase/auth');
          fb.auth.languageCode = prefsStore.preferences.locale === 'pt-br' ? 'pt-BR' : 'en';

          onAuthStateChanged(fb.auth, async (fbUser) => {
            if (fbUser) {
              await applySignedInFirebaseUser(fbUser);
            } else if (import.meta.client && localStorage.getItem(DEMO_SESSION_KEY) === '1') {
              activateDemoState();
              await prefsStore.hydrate(DEMO_USER.uid, true);
            } else {
              if (import.meta.client) {
                localStorage.removeItem(AUTH_SESSION_HINT_KEY);
              }
              if (user.value) {
                resetTenantStores();
              }
              user.value = null;
              ready.value = true;
              await prefsStore.hydrate(null, true);
            }
            initialAuthResolved = true;
            resolve();
          });
        })
        .catch(async () => {
          if (import.meta.client && localStorage.getItem(DEMO_SESSION_KEY) === '1') {
            activateDemoState();
            await prefsStore.hydrate(DEMO_USER.uid, true);
          } else {
            user.value = null;
            ready.value = true;
          }
          initialAuthResolved = true;
          resolve();
        });
    });

    return listenerPromise;
  }

  async function init(forceDemo = false): Promise<void> {
    if (import.meta.server) return;
    const prefsStore = usePreferencesStore();

    if (forceDemo || !hasFirebaseConfig()) {
      activateDemoState();
      await prefsStore.hydrate(DEMO_USER.uid, true);
      return;
    }

    await ensureFirebaseAuthListener();

    // Defensive sync if a sign-in just completed while initialAuthResolved was already true
    if (initialAuthResolved && (!user.value || user.value.isDemo)) {
      const fb = await getFirebaseClient();
      if (fb?.auth.currentUser) {
        await applySignedInFirebaseUser(fb.auth.currentUser);
      }
    }
  }

  function enterDemoMode() {
    if (import.meta.server) return;
    activateDemoState();
    const prefsStore = usePreferencesStore();
    void prefsStore.hydrate(DEMO_USER.uid, true);
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
      const cred = await signInWithEmailAndPassword(fb.auth, email.trim(), password);
      await applySignedInFirebaseUser(cred.user);
      void ensureFirebaseAuthListener();
      return true;
    } catch (err: unknown) {
      console.error('[Klox Auth Error]', err);
      errorCode.value = mapFirebaseAuthErrorCode(err);
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
      await applySignedInFirebaseUser(cred.user, displayName);
      void ensureFirebaseAuthListener();
      return true;
    } catch (err: unknown) {
      console.error('[Klox Auth Error]', err);
      errorCode.value = mapFirebaseAuthErrorCode(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signInWithGoogle(): Promise<GoogleSignInResult> {
    errorCode.value = null;
    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        enterDemoMode();
        return { ok: true, isNewUser: false };
      }
      localStorage.removeItem(DEMO_SESSION_KEY);
      const { GoogleAuthProvider, getAdditionalUserInfo, signInWithPopup } = await import(
        'firebase/auth'
      );
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(fb.auth, provider);
      const isNewUser = Boolean(getAdditionalUserInfo(cred)?.isNewUser);
      await applySignedInFirebaseUser(cred.user);
      void ensureFirebaseAuthListener();
      return { ok: true, isNewUser };
    } catch (err: unknown) {
      console.error('[Klox Auth Error]', err);
      errorCode.value = mapFirebaseAuthErrorCode(err);
      return { ok: false, isNewUser: false };
    } finally {
      loading.value = false;
    }
  }

  async function signOutUser(): Promise<void> {
    if (import.meta.client) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    }
    const fb = await getFirebaseClient();
    if (fb) {
      const { signOut } = await import('firebase/auth');
      await signOut(fb.auth);
    }
    user.value = null;
    resetTenantStores();
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
    syncProfileIdentity,
    getIdToken,
  };
});
