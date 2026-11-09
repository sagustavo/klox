import { subscribeDomainEvents } from '~/domain/events';
import {
  ALL_CHECKLIST_ITEMS,
  applyDomainEventToOnboarding,
  createDefaultOnboardingState,
  getStarterProjectTemplates,
} from '~/domain/onboarding';
import type { OnboardingProfile, OnboardingState, SupportedLocale } from '~/domain/types';
import { getFirebaseClient } from '~/utils/firebaseClient';
import { useAuthStore } from './auth';
import { useCatalogStore } from './catalog';

const STORAGE_ONBOARDING_KEY = 'klox_onboarding_state';
const STORAGE_CHECKLIST_DISMISSED_KEY = 'klox_checklist_dismissed';

export const useOnboardingStore = defineStore('onboarding', () => {
  const state = ref<OnboardingState>(createDefaultOnboardingState());
  const isChecklistDismissed = ref(false);
  const isTourActive = ref(false);
  const tourStep = ref(1);
  const isHelpSheetOpen = ref(false);
  const loadedUid = ref<string | null>(null);
  let unsubscribeEvents: (() => void) | null = null;

  const completedCount = computed(() => {
    return ALL_CHECKLIST_ITEMS.filter((id) => Boolean(state.value.checklist[id])).length;
  });

  const totalChecklistCount = computed(() => ALL_CHECKLIST_ITEMS.length);

  function persistLocal() {
    if (import.meta.server) return;
    try {
      localStorage.setItem(STORAGE_ONBOARDING_KEY, JSON.stringify(state.value));
      localStorage.setItem(
        STORAGE_CHECKLIST_DISMISSED_KEY,
        isChecklistDismissed.value ? '1' : '0'
      );
    } catch {
      // Ignore quota errors
    }
  }

  async function syncRemote(uid: string | undefined, isDemo: boolean) {
    if (!uid || isDemo || import.meta.server) return;
    const fb = await getFirebaseClient();
    if (!fb) return;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(
        doc(fb.db, 'users', uid),
        { onboarding: state.value, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      console.warn('[Klox onboarding sync fallback]', err);
    }
  }

  function ensureEventSubscription() {
    if (unsubscribeEvents || import.meta.server) return;
    unsubscribeEvents = subscribeDomainEvents((event) => {
      const next = applyDomainEventToOnboarding(state.value, event);
      if (next !== state.value) {
        state.value = next;
        persistLocal();
        const authStore = useAuthStore();
        void syncRemote(authStore.user?.uid, authStore.isDemoMode);
      }

      // Auto-advance interactive tour steps when real actions occur
      if (isTourActive.value) {
        if (event.type === 'AiAutofillUsed' && tourStep.value === 4) {
          tourStep.value = 5;
        } else if (event.type === 'TimerStarted' && tourStep.value <= 5) {
          tourStep.value = 6;
        } else if (event.type === 'TimerStopped' && tourStep.value === 6) {
          completeTour();
        }
      }
    });
  }

  async function hydrate(uid: string, isDemo: boolean): Promise<void> {
    if (import.meta.server) return;
    ensureEventSubscription();
    if (loadedUid.value === uid) return;

    try {
      const raw = localStorage.getItem(STORAGE_ONBOARDING_KEY);
      if (raw) {
        state.value = JSON.parse(raw) as OnboardingState;
      }
      isChecklistDismissed.value = localStorage.getItem(STORAGE_CHECKLIST_DISMISSED_KEY) === '1';
      loadedUid.value = uid;

      if (isDemo) return;
      const fb = await getFirebaseClient();
      if (!fb) return;

      const { doc, getDoc } = await import('firebase/firestore');
      const snap = await getDoc(doc(fb.db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data() as { onboarding?: OnboardingState };
        if (data.onboarding) {
          state.value = {
            ...createDefaultOnboardingState(),
            ...data.onboarding,
            checklist: {
              ...state.value.checklist,
              ...(data.onboarding.checklist ?? {}),
            },
          };
          persistLocal();
        }
      }
    } catch (err) {
      console.warn('[Klox onboarding hydrate fallback]', err);
    }
  }

  async function completeWizard(params: {
    uid: string;
    isDemo: boolean;
    profile: OnboardingProfile;
    seedStarterCatalog: boolean;
    locale: SupportedLocale;
    startTourAfter: boolean;
  }): Promise<void> {
    if (params.seedStarterCatalog) {
      const catalogStore = useCatalogStore();
      const templates = getStarterProjectTemplates(params.profile, params.locale);
      for (const tpl of templates) {
        const proj = await catalogStore.createProject({
          uid: params.uid,
          isDemo: params.isDemo,
          name: tpl.name,
          color: tpl.color,
          isBillableDefault: tpl.isBillableDefault,
        });
        for (const tagName of tpl.tags) {
          await catalogStore.createTag({
            uid: params.uid,
            isDemo: params.isDemo,
            projectId: proj.id,
            name: tagName,
          });
        }
      }
    }

    state.value = {
      ...state.value,
      wizardStatus: 'completed',
      profile: params.profile,
    };
    persistLocal();
    await syncRemote(params.uid, params.isDemo);

    if (params.startTourAfter) {
      startTour();
    }
  }

  async function skipWizard(uid: string, isDemo: boolean): Promise<void> {
    state.value = {
      ...state.value,
      wizardStatus: 'skipped',
    };
    persistLocal();
    await syncRemote(uid, isDemo);
  }

  function startTour() {
    tourStep.value = 1;
    isTourActive.value = true;
    isHelpSheetOpen.value = false;
  }

  function nextTourStep() {
    if (tourStep.value < 6) {
      tourStep.value += 1;
    } else {
      completeTour();
    }
  }

  function completeTour() {
    isTourActive.value = false;
    state.value = {
      ...state.value,
      tutorialCompletedAt: new Date().toISOString(),
    };
    persistLocal();
    const authStore = useAuthStore();
    void syncRemote(authStore.user?.uid, authStore.isDemoMode);
  }

  function dismissChecklist() {
    isChecklistDismissed.value = true;
    persistLocal();
  }

  function restoreChecklist() {
    isChecklistDismissed.value = false;
    isHelpSheetOpen.value = false;
    persistLocal();
  }

  return {
    state,
    isChecklistDismissed,
    isTourActive,
    tourStep,
    isHelpSheetOpen,
    completedCount,
    totalChecklistCount,
    hydrate,
    completeWizard,
    skipWizard,
    startTour,
    nextTourStep,
    completeTour,
    dismissChecklist,
    restoreChecklist,
  };
});
