<script setup lang="ts">
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  AtSign,
  Check,
  CheckCircle2,
  Download,
  Loader2,
  ShieldAlert,
  Trash2,
  Upload,
  User,
} from 'lucide-vue-next';
import { UNASSIGNED_PROJECT_ID } from '~/domain/invariants';
import {
  DISPLAY_NAME_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  validateDisplayName,
  validateUsername,
  type DisplayNameErrorCode,
  type UsernameErrorCode,
} from '~/domain/profile';
import { useAuthStore } from '~/stores/auth';
import { useCatalogStore } from '~/stores/catalog';
import { usePreferencesStore } from '~/stores/preferences';
import {
  useProfileStore,
  type SaveProfileErrorCode,
  type UsernameAvailabilityStatus,
} from '~/stores/profile';
import { useTimeLogsStore } from '~/stores/timeLogs';
import { useTimerStore } from '~/stores/timer';
import { processAvatarImageFile, type AvatarProcessErrorCode } from '~/utils/avatarImage';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const localePath = useLocalePath();
const authStore = useAuthStore();
const profileStore = useProfileStore();
const catalogStore = useCatalogStore();
const timeLogsStore = useTimeLogsStore();
const timerStore = useTimerStore();
const prefsStore = usePreferencesStore();
const wipe = useWorkspaceWipe();

const fileInputRef = ref<HTMLInputElement | null>(null);
const displayNameInputRef = ref<HTMLInputElement | null>(null);
const usernameInputRef = ref<HTMLInputElement | null>(null);

const displayNameInput = ref('');
const usernameInput = ref('');

const nameTouched = ref(false);
const nameDirty = ref(false);
const usernameTouched = ref(false);
const usernameDirty = ref(false);

const serverError = ref<SaveProfileErrorCode | null>(null);
const avatarError = ref<AvatarProcessErrorCode | 'AVATAR_INVALID_DATA_URL' | 'PROFILE_SAVE_FAILED' | null>(null);
const avatarProcessing = ref(false);

const availabilityStatus = ref<UsernameAvailabilityStatus>('empty');
const isCheckingAvailability = ref(false);
let availabilityTimer: ReturnType<typeof setTimeout> | null = null;
let availabilitySeq = 0;

const savedFlash = ref(false);
let savedFlashTimer: ReturnType<typeof setTimeout> | null = null;

// Single polite live region for screen-reader error announcements
const liveAnnouncement = ref('');
let announceTimer: ReturnType<typeof setTimeout> | null = null;

const wipeDialogOpen = ref(false);

const displayNameHintId = useId();
const displayNameErrorId = useId();
const usernameHintId = useId();
const usernameErrorId = useId();

function flashSaved() {
  savedFlash.value = true;
  if (savedFlashTimer) clearTimeout(savedFlashTimer);
  savedFlashTimer = setTimeout(() => {
    savedFlash.value = false;
  }, 1800);
}

function scheduleAnnounce(message: string) {
  if (announceTimer) clearTimeout(announceTimer);
  liveAnnouncement.value = '';
  if (!message) return;
  announceTimer = setTimeout(() => {
    liveAnnouncement.value = message;
  }, 500);
}

function syncFormFromStore() {
  displayNameInput.value =
    profileStore.profile?.displayName || authStore.user?.displayName || '';
  usernameInput.value = profileStore.profile?.username || '';
  nameTouched.value = false;
  nameDirty.value = false;
  usernameTouched.value = false;
  usernameDirty.value = false;
  serverError.value = null;
  availabilityStatus.value = profileStore.profile?.username ? 'owned' : 'empty';
}

onMounted(async () => {
  await authStore.init();
  const user = authStore.user;
  if (!user) return;
  await Promise.all([
    prefsStore.hydrate(user.uid, authStore.isDemoMode),
    profileStore.hydrate(user.uid, authStore.isDemoMode, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
    }),
    catalogStore.hydrate(user.uid, authStore.isDemoMode),
    timeLogsStore.hydrate(user.uid, authStore.isDemoMode),
    timerStore.hydrate(user.uid, authStore.isDemoMode),
  ]);
  syncFormFromStore();
});

onBeforeUnmount(() => {
  if (availabilityTimer) clearTimeout(availabilityTimer);
  if (savedFlashTimer) clearTimeout(savedFlashTimer);
  if (announceTimer) clearTimeout(announceTimer);
});

const nameValidation = computed(() => validateDisplayName(displayNameInput.value));
const usernameValidation = computed(() =>
  validateUsername(usernameInput.value, { allowEmpty: true })
);

const displayNameErrorCode = computed<DisplayNameErrorCode | null>(() => {
  if (!nameTouched.value) return null;
  if (!nameValidation.value.valid) return nameValidation.value.error ?? 'DISPLAY_NAME_EMPTY';
  return null;
});

const usernameErrorCode = computed<UsernameErrorCode | 'USERNAME_TAKEN' | null>(() => {
  if (serverError.value === 'USERNAME_TAKEN') return 'USERNAME_TAKEN';
  if (availabilityStatus.value === 'taken' && usernameValidation.value.normalized) {
    return 'USERNAME_TAKEN';
  }
  if (!usernameTouched.value) return null;
  if (!usernameValidation.value.valid) {
    return usernameValidation.value.error ?? 'USERNAME_INVALID_CHARS';
  }
  return null;
});

const hasUnsavedChanges = computed(() => {
  const currentName = profileStore.profile?.displayName ?? '';
  const currentHandle = profileStore.profile?.username ?? '';
  return (
    nameValidation.value.normalized !== currentName ||
    usernameValidation.value.normalized !== currentHandle
  );
});

const canSubmit = computed(() => {
  if (profileStore.saving || isCheckingAvailability.value) return false;
  if (!nameValidation.value.valid || !usernameValidation.value.valid) return false;
  if (availabilityStatus.value === 'taken') return false;
  return hasUnsavedChanges.value;
});

const connectedProviderLabels = computed(() => {
  if (authStore.isDemoMode) {
    const labels: string[] = [];
    if (authStore.providerStatus.hasGoogle) labels.push(t('profile.providerGoogle'));
    if (authStore.providerStatus.hasPassword) labels.push(t('profile.providerEmail'));
    return labels.length > 0 ? labels : [t('profile.providerDemo')];
  }
  const labels: string[] = [];
  if (authStore.providerStatus.hasGoogle) labels.push(t('profile.providerGoogle'));
  if (authStore.providerStatus.hasPassword) labels.push(t('profile.providerEmail'));
  return labels.length > 0 ? labels : [t('profile.providerEmail')];
});

const avatarSourceLabel = computed(() => {
  if (profileStore.hasCustomAvatar) return t('profile.avatarSourceCustom');
  if (profileStore.hasGooglePhoto) return t('profile.avatarSourceGoogle');
  return t('profile.avatarSourceInitials');
});

const userProjectCount = computed(
  () =>
    catalogStore.projects.filter(
      (p) => p.systemKey !== 'unassigned' && p.id !== UNASSIGNED_PROJECT_ID
    ).length
);

watch(usernameInput, (val) => {
  serverError.value = null;
  if (availabilityTimer) clearTimeout(availabilityTimer);

  const check = validateUsername(val, { allowEmpty: true });
  if (!check.valid) {
    isCheckingAvailability.value = false;
    availabilityStatus.value = 'invalid';
    return;
  }
  if (!check.normalized) {
    isCheckingAvailability.value = false;
    availabilityStatus.value = 'empty';
    return;
  }
  if (check.normalized === profileStore.profile?.username) {
    isCheckingAvailability.value = false;
    availabilityStatus.value = 'owned';
    return;
  }

  isCheckingAvailability.value = true;
  const seq = ++availabilitySeq;
  availabilityTimer = setTimeout(async () => {
    const res = await profileStore.checkUsernameAvailability(val);
    if (seq !== availabilitySeq) return;
    availabilityStatus.value = res.status;
    isCheckingAvailability.value = false;
  }, 350);
});

function handleDisplayNameBlur() {
  if (nameDirty.value || !nameValidation.value.valid) {
    nameTouched.value = true;
    if (displayNameErrorCode.value) {
      scheduleAnnounce(t(`profile.errors.${displayNameErrorCode.value}`));
    }
  }
}

function handleUsernameBlur() {
  if (usernameDirty.value || !usernameValidation.value.valid) {
    usernameTouched.value = true;
    if (usernameErrorCode.value) {
      scheduleAnnounce(t(`profile.errors.${usernameErrorCode.value}`));
    }
  }
}

async function handleSaveProfile() {
  nameTouched.value = true;
  usernameTouched.value = true;
  serverError.value = null;

  if (!nameValidation.value.valid) {
    displayNameInputRef.value?.focus();
    scheduleAnnounce(t(`profile.errors.${displayNameErrorCode.value}`));
    return;
  }
  if (!usernameValidation.value.valid || availabilityStatus.value === 'taken') {
    usernameInputRef.value?.focus();
    if (usernameErrorCode.value) {
      scheduleAnnounce(t(`profile.errors.${usernameErrorCode.value}`));
    }
    return;
  }

  const res = await profileStore.saveProfile({
    displayName: displayNameInput.value,
    username: usernameInput.value,
  });

  if (!res.ok) {
    serverError.value = res.error ?? 'PROFILE_SAVE_FAILED';
    if (res.error === 'USERNAME_TAKEN') {
      availabilityStatus.value = 'taken';
      usernameInputRef.value?.focus();
    }
    scheduleAnnounce(t(`profile.errors.${serverError.value}`));
    return;
  }

  displayNameInput.value = profileStore.profile?.displayName ?? displayNameInput.value;
  usernameInput.value = profileStore.profile?.username ?? '';
  availabilityStatus.value = usernameInput.value ? 'owned' : 'empty';
  nameTouched.value = false;
  usernameTouched.value = false;
  liveAnnouncement.value = '';
  flashSaved();
}

function triggerAvatarPicker() {
  fileInputRef.value?.click();
}

async function handleAvatarFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  avatarError.value = null;
  avatarProcessing.value = true;
  try {
    const processed = await processAvatarImageFile(file);
    if (!processed.ok) {
      avatarError.value = processed.error;
      return;
    }
    const saved = await profileStore.updateCustomAvatar(processed.dataUrl);
    if (!saved.ok) {
      avatarError.value = saved.error ?? 'PROFILE_SAVE_FAILED';
      return;
    }
    flashSaved();
  } finally {
    avatarProcessing.value = false;
  }
}

async function handleRemoveCustomAvatar() {
  avatarError.value = null;
  avatarProcessing.value = true;
  try {
    const res = await profileStore.updateCustomAvatar(null);
    if (!res.ok) {
      avatarError.value = res.error ?? 'PROFILE_SAVE_FAILED';
      return;
    }
    flashSaved();
  } finally {
    avatarProcessing.value = false;
  }
}

function openWipeDialog() {
  wipe.resetStatus();
  wipeDialogOpen.value = true;
}

async function handleConfirmWipe() {
  const res = await wipe.executeBackupAndWipe();
  if (res.ok) {
    wipeDialogOpen.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline pb-4">
      <div>
        <h1 class="display-wide text-xl sm:text-2xl text-text-primary">
          {{ $t('profile.title') }}
        </h1>
        <p class="mt-1.5 text-sm text-text-muted">
          {{ $t('profile.subtitle') }}
        </p>
      </div>

      <span
        v-if="savedFlash"
        class="inline-flex items-center gap-1.5 border border-signal/40 bg-signal-soft px-2.5 py-1 text-xs font-semibold uppercase text-signal"
      >
        <Check class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ $t('profile.savedBadge') }}</span>
      </span>
    </div>

    <!-- Section 1: Identity & Avatar -->
    <UiInstrumentPanel signal-line>
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <!-- Avatar Column -->
        <div class="flex flex-col items-start gap-4 border-b border-border-hairline pb-6 lg:col-span-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <div class="label-eyebrow flex items-center gap-2 text-signal">
            <User class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('profile.avatarSectionTitle') }}</span>
          </div>

          <div class="flex items-center gap-4">
            <UiUserAvatar
              size="xl"
              :src="profileStore.effectiveAvatarUrl"
              :name="profileStore.profile?.displayName || authStore.user?.displayName"
              :email="profileStore.profile?.email || authStore.user?.email"
            />

            <div class="min-w-0 space-y-1.5">
              <div class="text-sm font-semibold text-text-primary truncate">
                {{ profileStore.profile?.displayName || authStore.user?.displayName }}
              </div>
              <div
                v-if="profileStore.profile?.username"
                class="tabular-telemetry text-xs font-medium text-signal"
              >
                @{{ profileStore.profile.username }}
              </div>
              <span
                class="inline-flex border border-border-hairline bg-bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
              >
                {{ avatarSourceLabel }}
              </span>
            </div>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            class="sr-only"
            :aria-label="$t('profile.uploadAvatarButton')"
            @change="handleAvatarFileChange"
          />

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="profile-avatar-upload"
              :disabled="avatarProcessing || profileStore.saving"
              class="btn-press inline-flex h-9 items-center gap-2 border border-signal/60 bg-signal-soft px-3.5 text-xs font-semibold uppercase tracking-wider text-signal transition-colors hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
              @click="triggerAvatarPicker"
            >
              <Loader2 v-if="avatarProcessing" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Upload v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ avatarProcessing ? $t('profile.avatarProcessing') : $t('profile.uploadAvatarButton') }}</span>
            </button>

            <button
              v-if="profileStore.hasCustomAvatar"
              type="button"
              data-testid="profile-avatar-remove"
              :disabled="avatarProcessing || profileStore.saving"
              class="btn-press inline-flex h-9 items-center gap-1.5 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-muted transition-colors hover:border-destructive/50 hover:bg-bg-hover hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
              @click="handleRemoveCustomAvatar"
            >
              <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('profile.removeAvatarButton') }}</span>
            </button>
          </div>

          <p class="text-xs leading-relaxed text-text-faint">
            {{ $t('profile.avatarHelp') }}
          </p>

          <div
            v-if="avatarError"
            role="alert"
            class="flex w-full items-start gap-2 border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive"
          >
            <AlertCircle class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{{ $t(`profile.errors.${avatarError}`) }}</span>
          </div>
        </div>

        <!-- Identity Form Column -->
        <div class="lg:col-span-8">
          <form class="space-y-5" novalidate @submit.prevent="handleSaveProfile">
            <div
              v-if="serverError && serverError !== 'USERNAME_TAKEN'"
              role="alert"
              class="flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{{ $t(`profile.errors.${serverError}`) }}</span>
            </div>

            <!-- Display Name -->
            <div>
              <label for="profile-display-name" class="label-eyebrow block text-text-muted">
                {{ $t('profile.displayNameLabel') }}
              </label>
              <p :id="displayNameHintId" class="mt-1 text-xs text-text-faint">
                {{ $t('profile.displayNameHint') }}
              </p>
              <input
                id="profile-display-name"
                ref="displayNameInputRef"
                v-model="displayNameInput"
                type="text"
                required
                :maxlength="DISPLAY_NAME_MAX_LENGTH"
                autocomplete="name"
                :placeholder="$t('profile.displayNamePlaceholder')"
                :aria-invalid="displayNameErrorCode ? 'true' : 'false'"
                :aria-describedby="
                  displayNameErrorCode
                    ? `${displayNameHintId} ${displayNameErrorId}`
                    : displayNameHintId
                "
                class="mt-2 h-10 w-full border bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
                :class="
                  displayNameErrorCode
                    ? 'border-destructive focus:border-destructive'
                    : 'border-border-input focus:border-signal'
                "
                @input="nameDirty = true"
                @blur="handleDisplayNameBlur"
              />
              <p
                v-if="displayNameErrorCode"
                :id="displayNameErrorId"
                class="mt-1.5 flex items-center gap-1.5 text-xs text-destructive"
              >
                <AlertCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{{ $t(`profile.errors.${displayNameErrorCode}`) }}</span>
              </p>
            </div>

            <!-- Unique Username -->
            <div>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <label for="profile-username" class="label-eyebrow block text-text-muted">
                  {{ $t('profile.usernameLabel') }}
                </label>

                <span
                  v-if="isCheckingAvailability"
                  class="inline-flex items-center gap-1 text-[11px] font-medium text-text-muted"
                >
                  <Loader2 class="h-3 w-3 animate-spin text-signal" aria-hidden="true" />
                  <span>{{ $t('profile.usernameChecking') }}</span>
                </span>
                <span
                  v-else-if="availabilityStatus === 'available' && usernameValidation.normalized"
                  class="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500"
                >
                  <CheckCircle2 class="h-3 w-3" aria-hidden="true" />
                  <span>{{ $t('profile.usernameAvailable') }}</span>
                </span>
                <span
                  v-else-if="availabilityStatus === 'owned' && usernameValidation.normalized"
                  class="inline-flex items-center gap-1 text-[11px] font-medium text-signal"
                >
                  <Check class="h-3 w-3" aria-hidden="true" />
                  <span>{{ $t('profile.usernameOwned') }}</span>
                </span>
              </div>

              <p :id="usernameHintId" class="mt-1 text-xs text-text-faint">
                {{ $t('profile.usernameHint') }}
              </p>

              <div
                class="mt-2 flex h-10 w-full items-center border bg-bg-primary focus-within:border-signal"
                :class="
                  usernameErrorCode
                    ? 'border-destructive focus-within:border-destructive'
                    : 'border-border-input'
                "
              >
                <span
                  class="inline-flex h-full items-center border-r border-border-hairline bg-bg-elevated px-3 text-text-muted"
                  aria-hidden="true"
                >
                  <AtSign class="h-3.5 w-3.5" />
                </span>
                <input
                  id="profile-username"
                  ref="usernameInputRef"
                  v-model="usernameInput"
                  type="text"
                  :maxlength="USERNAME_MAX_LENGTH"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                  :placeholder="$t('profile.usernamePlaceholder')"
                  :aria-invalid="usernameErrorCode ? 'true' : 'false'"
                  :aria-describedby="
                    usernameErrorCode
                      ? `${usernameHintId} ${usernameErrorId}`
                      : usernameHintId
                  "
                  class="tabular-telemetry h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
                  @input="usernameDirty = true"
                  @blur="handleUsernameBlur"
                />
              </div>

              <p
                v-if="usernameErrorCode"
                :id="usernameErrorId"
                class="mt-1.5 flex items-center gap-1.5 text-xs text-destructive"
              >
                <AlertCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{{ $t(`profile.errors.${usernameErrorCode}`) }}</span>
              </p>
            </div>

            <!-- Read-only Email + Provider -->
            <div class="grid grid-cols-1 gap-3 border-t border-border-hairline pt-4 sm:grid-cols-2">
              <div>
                <div class="label-eyebrow text-text-muted">
                  {{ $t('profile.emailLabel') }}
                </div>
                <div class="tabular-telemetry mt-1 truncate text-sm text-text-primary">
                  {{ profileStore.profile?.email || authStore.user?.email || '—' }}
                </div>
              </div>

              <div>
                <div class="label-eyebrow text-text-muted">
                  {{ $t('profile.providerLabel') }}
                </div>
                <div class="mt-1 flex flex-wrap items-center gap-1.5">
                  <span
                    v-for="label in connectedProviderLabels"
                    :key="label"
                    class="inline-flex border border-border-hairline bg-bg-primary px-2.5 py-0.5 text-xs font-medium text-text-primary"
                  >
                    {{ label }}
                  </span>
                </div>
                <NuxtLink
                  :to="localePath('/app/settings#sign-in-methods')"
                  class="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-signal hover:underline"
                >
                  <span>{{ $t('profile.manageSignInMethods') }}</span>
                  <ArrowRight class="h-3 w-3" aria-hidden="true" />
                </NuxtLink>
              </div>
            </div>

            <div class="flex items-center justify-end border-t border-border-hairline pt-4">
              <button
                type="submit"
                data-testid="profile-save-button"
                :disabled="!canSubmit"
                class="btn-launch h-10 px-5"
              >
                <Loader2 v-if="profileStore.saving" class="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{{ profileStore.saving ? $t('profile.savingButton') : $t('profile.saveButton') }}</span>
              </button>
            </div>
          </form>

          <div aria-live="polite" class="sr-only">
            {{ liveAnnouncement }}
          </div>
        </div>
      </div>
    </UiInstrumentPanel>

    <!-- Section 2: Year-at-a-Glance Activity Heatmap -->
    <ProfileActivityHeatmap />

    <!-- Section 3: Danger Zone (Backup-First Wipe All Data) -->
    <UiInstrumentPanel class="border-destructive/40">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-2xl space-y-2">
          <div class="label-eyebrow flex items-center gap-2 text-destructive">
            <ShieldAlert class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('wipe.sectionEyebrow') }}</span>
          </div>
          <h2 class="display-wide text-base sm:text-lg text-text-primary">
            {{ $t('wipe.title') }}
          </h2>
          <p class="text-sm leading-relaxed text-text-muted">
            {{ $t('wipe.description') }}
          </p>
          <p class="text-xs text-text-faint">
            {{ $t('wipe.preservesNote') }}
          </p>
        </div>

        <button
          type="button"
          data-testid="wipe-workspace-trigger"
          class="btn-press inline-flex h-10 shrink-0 items-center gap-2 border border-destructive/60 bg-destructive/15 px-4 text-xs font-semibold uppercase tracking-wider text-destructive transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          @click="openWipeDialog"
        >
          <Trash2 class="h-4 w-4" aria-hidden="true" />
          <span>{{ $t('wipe.triggerButton') }}</span>
        </button>
      </div>

      <!-- Post-Wipe Confirmation & Backup Re-Download Banner -->
      <div
        v-if="wipe.stage.value === 'done' && wipe.lastResult.value"
        data-testid="wipe-success-banner"
        class="mt-5 flex flex-col gap-3 border border-emerald-500/40 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex items-start gap-2.5 text-sm">
          <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
          <div>
            <div class="font-semibold uppercase tracking-wider text-emerald-500">
              {{ $t('wipe.successTitle') }}
            </div>
            <p class="mt-1 text-ui text-text-primary">
              {{
                t('wipe.successBody', {
                  projects: wipe.lastResult.value.deletedProjects,
                  tags: wipe.lastResult.value.deletedTags,
                  tasks: wipe.lastResult.value.deletedTasks,
                  logs: wipe.lastResult.value.deletedLogs,
                })
              }}
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button
            v-if="wipe.lastBackup.value"
            type="button"
            data-testid="wipe-redownload-backup"
            class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-primary px-3 text-xs font-medium text-text-primary transition-colors hover:border-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
            @click="wipe.redownloadLastBackup()"
          >
            <Download class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
            <span>{{ $t('wipe.redownloadBackup') }}</span>
          </button>

          <NuxtLink
            :to="localePath('/app/import')"
            class="btn-press inline-flex h-9 items-center gap-1.5 border border-signal/60 bg-signal-soft px-3 text-xs font-semibold uppercase tracking-wider text-signal transition-colors hover:border-accent hover:bg-accent hover:text-white"
          >
            <span>{{ $t('wipe.goToImport') }}</span>
            <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
          </NuxtLink>
        </div>
      </div>
    </UiInstrumentPanel>

    <!-- Backup-First Typed Confirmation Wipe Modal -->
    <ProfileWipeWorkspaceDialog
      v-model:open="wipeDialogOpen"
      :project-count="userProjectCount"
      :tag-count="catalogStore.tags.length"
      :task-count="catalogStore.tasks.length"
      :log-count="timeLogsStore.logs.length"
      :has-active-timer="timerStore.isRunning"
      :stage="wipe.stage.value"
      :is-streaming="timeLogsStore.streaming"
      :error-message="wipe.errorMessage.value"
      @confirm="handleConfirmWipe"
    />
  </div>
</template>
