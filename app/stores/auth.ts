import type { FirebaseError } from 'firebase/app';
import type { AuthCredential } from 'firebase/auth';
import {
  canUnlinkProvider,
  doEmailsMatch,
  extractAuthProviderStatus,
  isContinueUriError,
  isNonEnumeratingResetError,
  isValidEmailAddress,
  mapFirebaseAuthErrorCode,
  normalizeEmail,
  tenantStorageKey,
  toFirebaseAuthLanguageCode,
  validateLinkPassword,
  type AuthErrorCode,
  type LinkableAuthProviderId,
} from '~/domain/auth';
import { publishDomainEvent } from '~/domain/events';
import { getFirebaseClient, hasFirebaseConfig } from '~/utils/firebaseClient';
import { useAdoStore } from './ado';
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

export interface PendingAccountLink {
  email: string;
  providerId: 'google.com';
}

const DEMO_SESSION_KEY = 'klox_demo_session';
const AUTH_SESSION_HINT_KEY = 'klox_auth_session';
const DEMO_PROVIDERS_KEY = 'klox_demo_auth_providers';

const DEMO_USER: AuthUser = {
  uid: 'demo-user',
  email: 'demo@klox.dev',
  displayName: 'Demo Engineer',
  photoURL: null,
  providers: ['password'],
  isDemo: true,
};

function loadDemoProviders(uid: string): LinkableAuthProviderId[] {
  if (import.meta.server) return ['password'];
  try {
    const raw = localStorage.getItem(tenantStorageKey(DEMO_PROVIDERS_KEY, uid));
    if (!raw) return ['password'];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ['password'];
    const valid = parsed.filter(
      (id): id is LinkableAuthProviderId => id === 'google.com' || id === 'password'
    );
    return valid.length > 0 ? Array.from(new Set(valid)) : ['password'];
  } catch {
    return ['password'];
  }
}

function saveDemoProviders(uid: string, providers: readonly string[]): void {
  if (import.meta.server) return;
  try {
    const valid = providers.filter(
      (id): id is LinkableAuthProviderId => id === 'google.com' || id === 'password'
    );
    localStorage.setItem(tenantStorageKey(DEMO_PROVIDERS_KEY, uid), JSON.stringify(valid));
  } catch {
    // Ignore storage quota errors
  }
}

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
  const linking = ref(false);
  const errorCode = ref<AuthErrorCode | null>(null);
  const pendingLink = ref<PendingAccountLink | null>(null);

  let pendingAuthCredential: AuthCredential | null = null;
  let listenerPromise: Promise<void> | null = null;
  let initialAuthResolved = false;

  const isAuthenticated = computed(() => Boolean(user.value));
  const isDemoMode = computed(() => Boolean(user.value?.isDemo));
  const providerStatus = computed(() => extractAuthProviderStatus(user.value?.providers ?? []));

  function clearPendingLink() {
    pendingLink.value = null;
    pendingAuthCredential = null;
  }

  function resetTenantStores() {
    useCatalogStore().reset();
    useTimeLogsStore().reset();
    useTimerStore().reset();
    useOnboardingStore().reset();
    useProfileStore().reset();
    useAdoStore().reset();
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
    user.value = {
      ...DEMO_USER,
      providers: loadDemoProviders(DEMO_USER.uid),
    };
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
          fb.auth.languageCode = toFirebaseAuthLanguageCode(prefsStore.preferences.locale);

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

  async function refreshCurrentUserState(): Promise<void> {
    const fb = await getFirebaseClient();
    const fbUser = fb?.auth.currentUser;
    if (!fbUser) return;
    await fbUser.reload();
    const refreshed = fb.auth.currentUser ?? fbUser;
    const nextUser = toAuthUser(
      refreshed,
      undefined,
      user.value?.displayName ?? undefined
    );
    user.value = nextUser;
    useProfileStore().syncGooglePhotoUrl(nextUser.photoURL);
  }

  async function signInWithGoogle(): Promise<GoogleSignInResult> {
    errorCode.value = null;
    clearPendingLink();
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
      const fbCode = (err as { code?: string })?.code || '';
      if (fbCode === 'auth/account-exists-with-different-credential') {
        const { GoogleAuthProvider } = await import('firebase/auth');
        const pendingCred = GoogleAuthProvider.credentialFromError(err as FirebaseError);
        const collisionEmail =
          ((err as { customData?: { email?: string } })?.customData?.email ?? '').trim();
        if (pendingCred && collisionEmail) {
          pendingAuthCredential = pendingCred;
          pendingLink.value = { email: collisionEmail, providerId: 'google.com' };
          errorCode.value = 'AUTH_ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL';
          return { ok: false, isNewUser: false };
        }
      }
      errorCode.value = mapFirebaseAuthErrorCode(err);
      return { ok: false, isNewUser: false };
    } finally {
      loading.value = false;
    }
  }

  async function completePendingGoogleLinkWithPassword(password: string): Promise<boolean> {
    if (!pendingLink.value?.email || !pendingAuthCredential) {
      errorCode.value = 'AUTH_GENERIC_ERROR';
      return false;
    }

    errorCode.value = null;
    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        enterDemoMode();
        clearPendingLink();
        return true;
      }

      localStorage.removeItem(DEMO_SESSION_KEY);
      const { linkWithCredential, signInWithEmailAndPassword } = await import('firebase/auth');
      const cred = await signInWithEmailAndPassword(
        fb.auth,
        pendingLink.value.email.trim(),
        password
      );
      try {
        await linkWithCredential(cred.user, pendingAuthCredential);
      } catch (linkErr: unknown) {
        const linkCode = (linkErr as { code?: string })?.code || '';
        if (!linkCode.includes('provider-already-linked')) {
          throw linkErr;
        }
      }

      await cred.user.reload();
      const finalUser = fb.auth.currentUser ?? cred.user;
      clearPendingLink();
      await applySignedInFirebaseUser(finalUser);
      await refreshCurrentUserState();
      void ensureFirebaseAuthListener();
      publishDomainEvent({
        type: 'AuthProviderLinked',
        at: new Date().toISOString(),
        providerId: 'google.com',
      });
      return true;
    } catch (err: unknown) {
      console.error('[Klox Pending Google Link Error]', err);
      errorCode.value = mapFirebaseAuthErrorCode(err);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function signInWithGoogleAndLinkPassword(
    email: string,
    password: string
  ): Promise<{ ok: boolean; linked: boolean; error?: AuthErrorCode }> {
    errorCode.value = null;
    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        enterDemoMode();
        return { ok: true, linked: false };
      }

      localStorage.removeItem(DEMO_SESSION_KEY);
      const {
        EmailAuthProvider,
        GoogleAuthProvider,
        linkWithCredential,
        signInWithPopup,
        signOut,
      } = await import('firebase/auth');

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
        login_hint: email.trim(),
      });
      const cred = await signInWithPopup(fb.auth, provider);

      if (!doEmailsMatch(cred.user.email, email)) {
        await signOut(fb.auth);
        errorCode.value = 'AUTH_EMAIL_MISMATCH';
        return { ok: false, linked: false, error: 'AUTH_EMAIL_MISMATCH' };
      }

      const currentProviders = extractProviderIds(cred.user);
      let linked = false;
      if (!currentProviders.includes('password') && password.length >= 6 && cred.user.email) {
        const emailCred = EmailAuthProvider.credential(cred.user.email, password);
        await linkWithCredential(cred.user, emailCred);
        await cred.user.reload();
        linked = true;
      }

      const finalUser = fb.auth.currentUser ?? cred.user;
      clearPendingLink();
      await applySignedInFirebaseUser(finalUser);
      await refreshCurrentUserState();
      void ensureFirebaseAuthListener();
      if (linked) {
        publishDomainEvent({
          type: 'AuthProviderLinked',
          at: new Date().toISOString(),
          providerId: 'password',
        });
      }
      return { ok: true, linked };
    } catch (err: unknown) {
      console.error('[Klox Google Verify & Link Password Error]', err);
      const mapped = mapFirebaseAuthErrorCode(err);
      errorCode.value = mapped;
      return { ok: false, linked: false, error: mapped };
    } finally {
      loading.value = false;
    }
  }

  async function linkEmailPassword(
    password: string,
    confirmPassword: string
  ): Promise<{ ok: boolean; error?: AuthErrorCode }> {
    const passCheck = validateLinkPassword(password, confirmPassword);
    if (!passCheck.valid) {
      return { ok: false, error: passCheck.error };
    }

    if (!user.value) {
      return { ok: false, error: 'AUTH_GENERIC_ERROR' };
    }
    if (!user.value.email) {
      return { ok: false, error: 'AUTH_NO_EMAIL_FOR_PASSWORD_LINK' };
    }
    if (providerStatus.value.hasPassword) {
      return { ok: false, error: 'AUTH_PROVIDER_ALREADY_LINKED' };
    }

    linking.value = true;
    try {
      if (user.value.isDemo) {
        const nextProviders = Array.from(new Set([...user.value.providers, 'password']));
        user.value = { ...user.value, providers: nextProviders };
        saveDemoProviders(user.value.uid, nextProviders);
        publishDomainEvent({
          type: 'AuthProviderLinked',
          at: new Date().toISOString(),
          providerId: 'password',
        });
        return { ok: true };
      }

      const fb = await getFirebaseClient();
      const currentUser = fb?.auth.currentUser;
      if (!fb || !currentUser || !currentUser.email) {
        return { ok: false, error: 'AUTH_GENERIC_ERROR' };
      }

      const {
        EmailAuthProvider,
        GoogleAuthProvider,
        linkWithCredential,
        reauthenticateWithPopup,
      } = await import('firebase/auth');

      const emailCred = EmailAuthProvider.credential(currentUser.email, password);
      try {
        await linkWithCredential(currentUser, emailCred);
      } catch (err: unknown) {
        const fbCode = (err as { code?: string })?.code || '';
        if (fbCode.includes('requires-recent-login') && providerStatus.value.hasGoogle) {
          const googleProvider = new GoogleAuthProvider();
          googleProvider.setCustomParameters({
            prompt: 'select_account',
            login_hint: currentUser.email,
          });
          await reauthenticateWithPopup(currentUser, googleProvider);
          await linkWithCredential(currentUser, emailCred);
        } else {
          throw err;
        }
      }

      await refreshCurrentUserState();
      publishDomainEvent({
        type: 'AuthProviderLinked',
        at: new Date().toISOString(),
        providerId: 'password',
      });
      return { ok: true };
    } catch (err: unknown) {
      console.error('[Klox linkEmailPassword Error]', err);
      return { ok: false, error: mapFirebaseAuthErrorCode(err) };
    } finally {
      linking.value = false;
    }
  }

  async function linkGoogleProvider(): Promise<{ ok: boolean; error?: AuthErrorCode }> {
    if (!user.value) {
      return { ok: false, error: 'AUTH_GENERIC_ERROR' };
    }
    if (providerStatus.value.hasGoogle) {
      return { ok: false, error: 'AUTH_PROVIDER_ALREADY_LINKED' };
    }

    linking.value = true;
    try {
      if (user.value.isDemo) {
        const nextProviders = Array.from(new Set([...user.value.providers, 'google.com']));
        user.value = { ...user.value, providers: nextProviders };
        saveDemoProviders(user.value.uid, nextProviders);
        publishDomainEvent({
          type: 'AuthProviderLinked',
          at: new Date().toISOString(),
          providerId: 'google.com',
        });
        return { ok: true };
      }

      const fb = await getFirebaseClient();
      const currentUser = fb?.auth.currentUser;
      if (!fb || !currentUser) {
        return { ok: false, error: 'AUTH_GENERIC_ERROR' };
      }

      const { GoogleAuthProvider, linkWithPopup } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
        ...(currentUser.email ? { login_hint: currentUser.email } : {}),
      });
      await linkWithPopup(currentUser, provider);

      await refreshCurrentUserState();
      publishDomainEvent({
        type: 'AuthProviderLinked',
        at: new Date().toISOString(),
        providerId: 'google.com',
      });
      return { ok: true };
    } catch (err: unknown) {
      console.error('[Klox linkGoogleProvider Error]', err);
      return { ok: false, error: mapFirebaseAuthErrorCode(err) };
    } finally {
      linking.value = false;
    }
  }

  async function unlinkProvider(
    providerId: LinkableAuthProviderId
  ): Promise<{ ok: boolean; error?: AuthErrorCode }> {
    if (!user.value) {
      return { ok: false, error: 'AUTH_GENERIC_ERROR' };
    }
    if (!canUnlinkProvider(user.value.providers, providerId)) {
      return { ok: false, error: 'AUTH_CANNOT_UNLINK_LAST_PROVIDER' };
    }

    linking.value = true;
    try {
      if (user.value.isDemo) {
        const nextProviders = user.value.providers.filter((id) => id !== providerId);
        user.value = { ...user.value, providers: nextProviders };
        saveDemoProviders(user.value.uid, nextProviders);
        publishDomainEvent({
          type: 'AuthProviderUnlinked',
          at: new Date().toISOString(),
          providerId,
        });
        return { ok: true };
      }

      const fb = await getFirebaseClient();
      const currentUser = fb?.auth.currentUser;
      if (!fb || !currentUser) {
        return { ok: false, error: 'AUTH_GENERIC_ERROR' };
      }

      const { unlink } = await import('firebase/auth');
      await unlink(currentUser, providerId);
      await refreshCurrentUserState();
      publishDomainEvent({
        type: 'AuthProviderUnlinked',
        at: new Date().toISOString(),
        providerId,
      });
      return { ok: true };
    } catch (err: unknown) {
      console.error('[Klox unlinkProvider Error]', err);
      return { ok: false, error: mapFirebaseAuthErrorCode(err) };
    } finally {
      linking.value = false;
    }
  }

  async function sendPasswordReset(params: {
    email: string;
    locale: string;
    continueUrl?: string;
  }): Promise<{ ok: boolean; isDemo?: boolean; error?: AuthErrorCode }> {
    errorCode.value = null;
    const cleanEmail = normalizeEmail(params.email);
    if (!isValidEmailAddress(cleanEmail)) {
      errorCode.value = 'AUTH_INVALID_EMAIL';
      return { ok: false, error: 'AUTH_INVALID_EMAIL' };
    }

    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        publishDomainEvent({
          type: 'PasswordResetRequested',
          at: new Date().toISOString(),
        });
        return { ok: true, isDemo: true };
      }

      fb.auth.languageCode = toFirebaseAuthLanguageCode(params.locale);
      const { sendPasswordResetEmail } = await import('firebase/auth');

      try {
        if (params.continueUrl) {
          await sendPasswordResetEmail(fb.auth, cleanEmail, { url: params.continueUrl });
        } else {
          await sendPasswordResetEmail(fb.auth, cleanEmail);
        }
      } catch (err: unknown) {
        if (params.continueUrl && isContinueUriError(err)) {
          await sendPasswordResetEmail(fb.auth, cleanEmail);
        } else {
          throw err;
        }
      }

      publishDomainEvent({
        type: 'PasswordResetRequested',
        at: new Date().toISOString(),
      });
      return { ok: true };
    } catch (err: unknown) {
      if (isNonEnumeratingResetError(err)) {
        publishDomainEvent({
          type: 'PasswordResetRequested',
          at: new Date().toISOString(),
        });
        return { ok: true };
      }
      console.error('[Klox Password Reset Error]', err);
      const mapped = mapFirebaseAuthErrorCode(err);
      errorCode.value = mapped;
      return { ok: false, error: mapped };
    } finally {
      loading.value = false;
    }
  }

  async function verifyResetCode(
    oobCode: string
  ): Promise<{ ok: boolean; email?: string; error?: AuthErrorCode }> {
    errorCode.value = null;
    const cleanCode = oobCode.trim();
    if (!cleanCode) {
      return { ok: false, error: 'AUTH_INVALID_ACTION_CODE' };
    }

    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        return { ok: false, error: 'AUTH_INVALID_ACTION_CODE' };
      }
      const { verifyPasswordResetCode } = await import('firebase/auth');
      const verifiedEmail = await verifyPasswordResetCode(fb.auth, cleanCode);
      return { ok: true, email: verifiedEmail };
    } catch (err: unknown) {
      console.error('[Klox Verify Password Reset Code Error]', err);
      const mapped = mapFirebaseAuthErrorCode(err);
      errorCode.value = mapped;
      return { ok: false, error: mapped };
    }
  }

  async function confirmResetPassword(params: {
    oobCode: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<{ ok: boolean; error?: AuthErrorCode }> {
    errorCode.value = null;
    const passCheck = validateLinkPassword(params.newPassword, params.confirmPassword);
    if (!passCheck.valid) {
      errorCode.value = passCheck.error ?? 'AUTH_PASSWORD_TOO_SHORT';
      return { ok: false, error: errorCode.value };
    }

    const cleanCode = params.oobCode.trim();
    if (!cleanCode) {
      errorCode.value = 'AUTH_INVALID_ACTION_CODE';
      return { ok: false, error: 'AUTH_INVALID_ACTION_CODE' };
    }

    loading.value = true;
    try {
      const fb = await getFirebaseClient();
      if (!fb) {
        errorCode.value = 'AUTH_INVALID_ACTION_CODE';
        return { ok: false, error: 'AUTH_INVALID_ACTION_CODE' };
      }
      const { confirmPasswordReset } = await import('firebase/auth');
      await confirmPasswordReset(fb.auth, cleanCode, params.newPassword);
      publishDomainEvent({
        type: 'PasswordResetCompleted',
        at: new Date().toISOString(),
      });
      return { ok: true };
    } catch (err: unknown) {
      console.error('[Klox Confirm Password Reset Error]', err);
      const mapped = mapFirebaseAuthErrorCode(err);
      errorCode.value = mapped;
      return { ok: false, error: mapped };
    } finally {
      loading.value = false;
    }
  }

  async function signOutUser(): Promise<void> {
    clearPendingLink();
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

  async function getIdToken(forceRefresh = false): Promise<string | null> {
    if (!user.value || user.value.isDemo) return null;
    const fb = await getFirebaseClient();
    if (!fb?.auth.currentUser) return null;
    return fb.auth.currentUser.getIdToken(forceRefresh);
  }

  return {
    user,
    ready,
    loading,
    linking,
    errorCode,
    pendingLink,
    providerStatus,
    isAuthenticated,
    isDemoMode,
    init,
    enterDemoMode,
    clearPendingLink,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    completePendingGoogleLinkWithPassword,
    signInWithGoogleAndLinkPassword,
    linkEmailPassword,
    linkGoogleProvider,
    unlinkProvider,
    sendPasswordReset,
    verifyResetCode,
    confirmResetPassword,
    signOutUser,
    syncProfileIdentity,
    getIdToken,
  };
});
