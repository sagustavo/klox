import { tenantStorageKey } from '~/domain/auth';
import { publishDomainEvent } from '~/domain/events';
import {
  getUserInitials,
  isValidAvatarDataUrl,
  resolveEffectiveAvatarUrl,
  validateDisplayName,
  validateUsername,
  type DisplayNameErrorCode,
  type UsernameErrorCode,
} from '~/domain/profile';
import type { UserProfile } from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useAuthStore } from './auth';

const STORAGE_PROFILE_KEY = 'klox_user_profile';

export type UsernameAvailabilityStatus =
  | 'empty'
  | 'available'
  | 'owned'
  | 'taken'
  | 'invalid'
  | 'error';

export type SaveProfileErrorCode =
  | DisplayNameErrorCode
  | UsernameErrorCode
  | 'USERNAME_TAKEN'
  | 'PROFILE_SAVE_FAILED';

function sanitizeHttpsPhotoUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return /^https:\/\/.+/.test(trimmed) && trimmed.length <= 2048 ? trimmed : null;
}

export const useProfileStore = defineStore('profile', () => {
  const profile = ref<UserProfile | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const loadedUid = ref<string | null>(null);
  const activeUid = ref<string | null>(null);

  let activeHydratePromise: Promise<void> | null = null;
  let activeHydrateUid: string | null = null;

  const effectiveAvatarUrl = computed(() => resolveEffectiveAvatarUrl(profile.value));
  const initials = computed(() =>
    getUserInitials(profile.value?.displayName, profile.value?.email)
  );
  const hasCustomAvatar = computed(() => Boolean(profile.value?.customAvatarUrl));
  const hasGooglePhoto = computed(() => Boolean(profile.value?.googlePhotoUrl));

  function persistLocal() {
    if (import.meta.server || !activeUid.value || !profile.value) return;
    try {
      localStorage.setItem(
        tenantStorageKey(STORAGE_PROFILE_KEY, activeUid.value),
        JSON.stringify(profile.value)
      );
    } catch {
      // Ignore quota errors
    }
  }

  function loadLocal(uid: string): UserProfile | null {
    if (import.meta.server) return null;
    try {
      const raw = localStorage.getItem(tenantStorageKey(STORAGE_PROFILE_KEY, uid));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<UserProfile>;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        uid,
        email: typeof parsed.email === 'string' ? parsed.email : null,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
        username:
          typeof parsed.username === 'string' && parsed.username.trim()
            ? parsed.username.trim()
            : null,
        googlePhotoUrl: sanitizeHttpsPhotoUrl(parsed.googlePhotoUrl),
        customAvatarUrl: isValidAvatarDataUrl(parsed.customAvatarUrl)
          ? parsed.customAvatarUrl!
          : null,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
      };
    } catch {
      return null;
    }
  }

  function reset() {
    profile.value = null;
    loading.value = false;
    saving.value = false;
    loadedUid.value = null;
    activeUid.value = null;
    activeHydratePromise = null;
    activeHydrateUid = null;
  }

  async function hydrate(
    uid: string,
    isDemo: boolean,
    authSnapshot?: {
      email?: string | null;
      displayName?: string | null;
      photoURL?: string | null;
    }
  ): Promise<void> {
    if (import.meta.server) return;
    if (activeHydratePromise && activeHydrateUid === uid) {
      return activeHydratePromise;
    }

    const cached = loadLocal(uid);
    const snapshotEmail = authSnapshot?.email ?? cached?.email ?? null;
    const snapshotGooglePhoto =
      sanitizeHttpsPhotoUrl(authSnapshot?.photoURL) ?? cached?.googlePhotoUrl ?? null;
    const snapshotDisplayName =
      authSnapshot?.displayName?.trim() ||
      cached?.displayName?.trim() ||
      snapshotEmail?.split('@')[0] ||
      'User';

    activeUid.value = uid;
    profile.value = {
      uid,
      email: snapshotEmail,
      displayName: cached?.displayName?.trim() || snapshotDisplayName,
      username: cached?.username ?? null,
      googlePhotoUrl: snapshotGooglePhoto,
      customAvatarUrl: cached?.customAvatarUrl ?? null,
      updatedAt: cached?.updatedAt,
    };
    persistLocal();

    if (isDemo) {
      loadedUid.value = uid;
      loading.value = false;
      return;
    }

    if (loadedUid.value === uid && !authSnapshot?.photoURL) {
      return;
    }

    loading.value = true;
    activeHydrateUid = uid;
    activeHydratePromise = (async () => {
      try {
        const fb = await getFirebaseClient();
        if (!fb) return;

        const { doc, getDoc } = await import('firebase/firestore');
        const snap = await getDoc(doc(fb.db, 'users', uid));

        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          const remoteDisplay =
            typeof data.displayName === 'string' ? data.displayName.trim() : '';
          const remoteUsername =
            typeof data.username === 'string' && data.username.trim()
              ? data.username.trim()
              : null;
          const remotePhoto = sanitizeHttpsPhotoUrl(
            typeof data.photoURL === 'string' ? data.photoURL : null
          );
          const remoteCustomAvatar =
            typeof data.customAvatarUrl === 'string' && isValidAvatarDataUrl(data.customAvatarUrl)
              ? data.customAvatarUrl
              : null;
          const remoteUpdatedAt =
            typeof data.updatedAt === 'string' ? data.updatedAt : undefined;

          const resolvedDisplayName = remoteDisplay || snapshotDisplayName;
          const resolvedGooglePhoto =
            sanitizeHttpsPhotoUrl(authSnapshot?.photoURL) ?? remotePhoto ?? null;

          profile.value = {
            uid,
            email: snapshotEmail ?? (typeof data.email === 'string' ? data.email : null),
            displayName: resolvedDisplayName,
            username: remoteUsername,
            googlePhotoUrl: resolvedGooglePhoto,
            customAvatarUrl: remoteCustomAvatar,
            updatedAt: remoteUpdatedAt,
          };
        } else {
          profile.value = {
            uid,
            email: snapshotEmail,
            displayName: snapshotDisplayName,
            username: null,
            googlePhotoUrl: sanitizeHttpsPhotoUrl(authSnapshot?.photoURL),
            customAvatarUrl: null,
          };
        }

        persistLocal();
        loadedUid.value = uid;

        const authStore = useAuthStore();
        authStore.syncProfileIdentity({
          displayName: profile.value.displayName,
          photoURL: profile.value.googlePhotoUrl,
        });
      } catch (err) {
        console.warn('[Klox profile hydrate fallback to local]', err);
      } finally {
        loading.value = false;
        activeHydratePromise = null;
        activeHydrateUid = null;
      }
    })();

    return activeHydratePromise;
  }

  async function checkUsernameAvailability(rawUsername: string): Promise<{
    status: UsernameAvailabilityStatus;
    normalized: string;
    error?: UsernameErrorCode;
  }> {
    const check = validateUsername(rawUsername, { allowEmpty: true });
    if (!check.valid) {
      return { status: 'invalid', normalized: check.normalized, error: check.error };
    }
    if (!check.normalized) {
      return { status: 'empty', normalized: '' };
    }
    if (check.normalized === profile.value?.username) {
      return { status: 'owned', normalized: check.normalized };
    }

    const authStore = useAuthStore();
    if (authStore.isDemoMode) {
      return { status: 'available', normalized: check.normalized };
    }

    const fb = await getFirebaseClient();
    if (!fb) {
      return { status: 'available', normalized: check.normalized };
    }

    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(fb.db, 'usernames', check.normalized));
      if (!snap.exists()) {
        return { status: 'available', normalized: check.normalized };
      }
      const ownerUid = snap.data()?.uid;
      if (ownerUid && ownerUid === activeUid.value) {
        return { status: 'owned', normalized: check.normalized };
      }
      return { status: 'taken', normalized: check.normalized };
    } catch (err) {
      console.warn('[Klox username availability check error]', err);
      return { status: 'error', normalized: check.normalized };
    }
  }

  async function saveProfile(params: {
    displayName: string;
    username: string;
  }): Promise<{ ok: boolean; error?: SaveProfileErrorCode }> {
    const nameCheck = validateDisplayName(params.displayName);
    if (!nameCheck.valid) {
      return { ok: false, error: nameCheck.error };
    }

    const handleCheck = validateUsername(params.username, { allowEmpty: true });
    if (!handleCheck.valid) {
      return { ok: false, error: handleCheck.error };
    }

    const authStore = useAuthStore();
    const uid = authStore.user?.uid ?? activeUid.value ?? 'demo-user';
    const isDemo = authStore.isDemoMode;
    const nowIso = new Date().toISOString();
    const nextUsername = handleCheck.normalized || null;

    saving.value = true;
    try {
      if (!isDemo) {
        const fb = await getFirebaseClient();
        if (fb) {
          const { doc, runTransaction } = await import('firebase/firestore');
          await runTransaction(fb.db, async (tx) => {
            const userRef = doc(fb.db, 'users', uid);
            const userSnap = await tx.get(userRef);
            const rawPrev = userSnap.data()?.username;
            const prevUsername =
              typeof rawPrev === 'string' && rawPrev.trim() ? rawPrev.trim() : null;

            let prevHandleUid: string | null = null;
            let prevHandleExists = false;
            if (prevUsername && prevUsername !== nextUsername) {
              const prevHandleSnap = await tx.get(doc(fb.db, 'usernames', prevUsername));
              prevHandleExists = prevHandleSnap.exists();
              const prevData = prevHandleSnap.data() as { uid?: string } | undefined;
              prevHandleUid = typeof prevData?.uid === 'string' ? prevData.uid : null;
            }

            let nextHandleExists = false;
            if (nextUsername && nextUsername !== prevUsername) {
              const nextHandleSnap = await tx.get(doc(fb.db, 'usernames', nextUsername));
              nextHandleExists = nextHandleSnap.exists();
              const nextData = nextHandleSnap.data() as { uid?: string } | undefined;
              if (nextHandleExists && nextData?.uid !== uid) {
                throw new Error('USERNAME_TAKEN');
              }
            }

            if (
              prevUsername &&
              prevUsername !== nextUsername &&
              prevHandleExists &&
              prevHandleUid === uid
            ) {
              tx.delete(doc(fb.db, 'usernames', prevUsername));
            }

            if (nextUsername && nextUsername !== prevUsername && !nextHandleExists) {
              tx.set(doc(fb.db, 'usernames', nextUsername), {
                uid,
                createdAt: nowIso,
              });
            }

            tx.set(
              userRef,
              {
                displayName: nameCheck.normalized,
                email: profile.value?.email ?? authStore.user?.email ?? null,
                username: nextUsername,
                photoURL: sanitizeHttpsPhotoUrl(
                  profile.value?.googlePhotoUrl ?? authStore.user?.photoURL
                ),
                updatedAt: nowIso,
              },
              { merge: true }
            );
          });

          if (fb.auth.currentUser) {
            const { updateProfile } = await import('firebase/auth');
            await updateProfile(fb.auth.currentUser, {
              displayName: nameCheck.normalized,
            });
          }
        }
      }

      const current = profile.value;
      profile.value = {
        uid,
        email: current?.email ?? authStore.user?.email ?? null,
        displayName: nameCheck.normalized,
        username: nextUsername,
        googlePhotoUrl: current?.googlePhotoUrl ?? authStore.user?.photoURL ?? null,
        customAvatarUrl: current?.customAvatarUrl ?? null,
        updatedAt: nowIso,
      };
      activeUid.value = uid;
      loadedUid.value = uid;
      persistLocal();

      authStore.syncProfileIdentity({ displayName: nameCheck.normalized });
      publishDomainEvent({ type: 'ProfileUpdated', at: nowIso });
      return { ok: true };
    } catch (err: unknown) {
      console.error('[Klox saveProfile error]', err);
      const message = err instanceof Error ? err.message : '';
      if (message === 'USERNAME_TAKEN') {
        return { ok: false, error: 'USERNAME_TAKEN' };
      }
      return { ok: false, error: 'PROFILE_SAVE_FAILED' };
    } finally {
      saving.value = false;
    }
  }

  async function updateCustomAvatar(
    dataUrl: string | null
  ): Promise<{ ok: boolean; error?: 'AVATAR_INVALID_DATA_URL' | 'PROFILE_SAVE_FAILED' }> {
    if (dataUrl !== null && !isValidAvatarDataUrl(dataUrl)) {
      return { ok: false, error: 'AVATAR_INVALID_DATA_URL' };
    }

    const authStore = useAuthStore();
    const uid = authStore.user?.uid ?? activeUid.value ?? 'demo-user';
    const isDemo = authStore.isDemoMode;
    const nowIso = new Date().toISOString();

    saving.value = true;
    try {
      if (!isDemo) {
        const fb = await getFirebaseClient();
        if (fb) {
          const { doc, setDoc } = await import('firebase/firestore');
          await setDoc(
            doc(fb.db, 'users', uid),
            {
              customAvatarUrl: dataUrl,
              photoURL: sanitizeHttpsPhotoUrl(
                profile.value?.googlePhotoUrl ?? authStore.user?.photoURL
              ),
              updatedAt: nowIso,
            },
            { merge: true }
          );
        }
      }

      const current = profile.value;
      profile.value = {
        uid,
        email: current?.email ?? authStore.user?.email ?? null,
        displayName: current?.displayName ?? authStore.user?.displayName ?? 'User',
        username: current?.username ?? null,
        googlePhotoUrl: current?.googlePhotoUrl ?? authStore.user?.photoURL ?? null,
        customAvatarUrl: dataUrl,
        updatedAt: nowIso,
      };
      activeUid.value = uid;
      loadedUid.value = uid;
      persistLocal();

      publishDomainEvent({ type: 'ProfileUpdated', at: nowIso });
      return { ok: true };
    } catch (err) {
      console.error('[Klox updateCustomAvatar error]', err);
      return { ok: false, error: 'PROFILE_SAVE_FAILED' };
    } finally {
      saving.value = false;
    }
  }

  return {
    profile,
    loading,
    saving,
    effectiveAvatarUrl,
    initials,
    hasCustomAvatar,
    hasGooglePhoto,
    hydrate,
    checkUsernameAvailability,
    saveProfile,
    updateCustomAvatar,
    reset,
  };
});
