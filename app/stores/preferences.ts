import { DEFAULT_PREFERENCES, detectBrowserPreferences } from '~/domain/preferences';
import type { UserPreferences } from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';

const STORAGE_KEY = 'klox_user_preferences';

export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = ref<UserPreferences>({ ...DEFAULT_PREFERENCES });
  const initialized = ref(false);

  function loadLocal(): UserPreferences {
    if (import.meta.server) return { ...DEFAULT_PREFERENCES };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserPreferences>;
        return { ...detectBrowserPreferences(window.navigator), ...parsed };
      }
    } catch {
      // Ignore malformed storage
    }
    const detected = detectBrowserPreferences(window.navigator);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(detected));
    } catch {
      // Ignore storage quota errors
    }
    return detected;
  }

  function saveLocal(next: UserPreferences) {
    if (import.meta.server) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }

  async function hydrate(uid?: string | null, isDemo = true) {
    const local = loadLocal();
    preferences.value = local;
    initialized.value = true;

    if (!uid || isDemo) return;

    const fb = await getFirebaseClient();
    if (!fb) return;

    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(fb.db, 'users', uid));
      const remotePrefs = snap.data()?.preferences as Partial<UserPreferences> | undefined;
      if (remotePrefs) {
        const merged: UserPreferences = { ...local, ...remotePrefs };
        preferences.value = merged;
        saveLocal(merged);
      }
    } catch (err) {
      console.warn('[Klox preferences hydrate fallback to local]', err);
    }
  }

  async function updatePreferences(
    patch: Partial<UserPreferences>,
    uid?: string | null,
    isDemo = true
  ) {
    const next: UserPreferences = {
      ...preferences.value,
      ...patch,
    };
    preferences.value = next;
    saveLocal(next);

    if (!uid || isDemo) return;

    const fb = await getFirebaseClient();
    if (!fb) return;

    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(
        doc(fb.db, 'users', uid),
        {
          preferences: next,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error('[Klox preferences Firestore sync error]', err);
    }
  }

  return {
    preferences,
    initialized,
    hydrate,
    updatePreferences,
  };
});
