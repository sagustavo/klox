<script setup lang="ts">
import {
  AlertCircle,
  Check,
  CheckCircle2,
  KeyRound,
  Link2,
  Loader2,
  ShieldCheck,
  Unlink,
} from 'lucide-vue-next';
import {
  MIN_PASSWORD_LENGTH,
  validateLinkPassword,
  type AuthErrorCode,
  type LinkableAuthProviderId,
} from '~/domain/auth';
import { useAuthStore } from '~/stores/auth';

const emit = defineEmits<{
  saved: [];
}>();

const { t } = useI18n();
const authStore = useAuthStore();

const passwordFormOpen = ref(false);
const newPassword = ref('');
const confirmPassword = ref('');
const passwordDirty = ref(false);
const passwordTouched = ref(false);
const confirmDirty = ref(false);
const confirmTouched = ref(false);

const newPasswordRef = ref<HTMLInputElement | null>(null);
const confirmPasswordRef = ref<HTMLInputElement | null>(null);

const passwordRulesId = useId();
const newPasswordErrorId = useId();
const confirmPasswordErrorId = useId();

const actionError = ref<AuthErrorCode | null>(null);
const actionSuccess = ref<string | null>(null);
let successTimer: ReturnType<typeof setTimeout> | null = null;

const liveAnnouncement = ref('');
let announceTimer: ReturnType<typeof setTimeout> | null = null;

const unlinkDialogOpen = ref(false);
const unlinkTarget = ref<LinkableAuthProviderId | null>(null);

const passwordLengthInvalid = computed(
  () => passwordTouched.value && newPassword.value.length < MIN_PASSWORD_LENGTH
);
const confirmMismatchInvalid = computed(
  () =>
    confirmTouched.value &&
    newPassword.value.length >= MIN_PASSWORD_LENGTH &&
    confirmPassword.value !== newPassword.value
);

const unlinkTargetLabel = computed(() => {
  if (unlinkTarget.value === 'google.com') return t('settings.auth.googleTitle');
  if (unlinkTarget.value === 'password') return t('settings.auth.emailPasswordTitle');
  return '';
});

function showSuccess(message: string) {
  actionError.value = null;
  actionSuccess.value = message;
  emit('saved');
  if (successTimer) clearTimeout(successTimer);
  successTimer = setTimeout(() => {
    actionSuccess.value = null;
  }, 4000);
}

function scheduleAnnounce(message: string) {
  if (announceTimer) clearTimeout(announceTimer);
  liveAnnouncement.value = '';
  if (!message) return;
  announceTimer = setTimeout(() => {
    liveAnnouncement.value = message;
  }, 400);
}

function resetPasswordForm() {
  passwordFormOpen.value = false;
  newPassword.value = '';
  confirmPassword.value = '';
  passwordDirty.value = false;
  passwordTouched.value = false;
  confirmDirty.value = false;
  confirmTouched.value = false;
}

onBeforeUnmount(() => {
  if (successTimer) clearTimeout(successTimer);
  if (announceTimer) clearTimeout(announceTimer);
});

async function handleLinkGoogle() {
  actionError.value = null;
  actionSuccess.value = null;
  const res = await authStore.linkGoogleProvider();
  if (!res.ok) {
    actionError.value = res.error ?? 'AUTH_GENERIC_ERROR';
    return;
  }
  showSuccess(t('settings.auth.linkedGoogleSuccess'));
}

function openPasswordForm() {
  actionError.value = null;
  actionSuccess.value = null;
  passwordFormOpen.value = true;
  nextTick(() => {
    newPasswordRef.value?.focus({ preventScroll: true });
  });
}

function handleNewPasswordBlur() {
  if (passwordDirty.value || newPassword.value.length > 0) {
    passwordTouched.value = true;
    if (passwordLengthInvalid.value) {
      scheduleAnnounce(t('auth.errors.AUTH_PASSWORD_TOO_SHORT'));
    }
  }
}

function handleConfirmPasswordBlur() {
  if (confirmDirty.value || confirmPassword.value.length > 0) {
    confirmTouched.value = true;
    if (confirmMismatchInvalid.value) {
      scheduleAnnounce(t('auth.errors.AUTH_PASSWORD_MISMATCH'));
    }
  }
}

async function handleSubmitPasswordLink() {
  actionError.value = null;
  actionSuccess.value = null;
  passwordTouched.value = true;
  confirmTouched.value = true;

  const check = validateLinkPassword(newPassword.value, confirmPassword.value);
  if (!check.valid) {
    if (check.error === 'AUTH_PASSWORD_TOO_SHORT') {
      newPasswordRef.value?.focus();
      scheduleAnnounce(t('auth.errors.AUTH_PASSWORD_TOO_SHORT'));
    } else {
      confirmPasswordRef.value?.focus();
      scheduleAnnounce(t('auth.errors.AUTH_PASSWORD_MISMATCH'));
    }
    return;
  }

  const res = await authStore.linkEmailPassword(newPassword.value, confirmPassword.value);
  if (!res.ok) {
    actionError.value = res.error ?? 'AUTH_GENERIC_ERROR';
    return;
  }

  resetPasswordForm();
  showSuccess(t('settings.auth.linkedPasswordSuccess'));
}

function requestUnlink(providerId: LinkableAuthProviderId) {
  actionError.value = null;
  unlinkTarget.value = providerId;
  unlinkDialogOpen.value = true;
}

async function confirmUnlink() {
  if (!unlinkTarget.value) return;
  const target = unlinkTarget.value;
  const res = await authStore.unlinkProvider(target);
  unlinkDialogOpen.value = false;
  unlinkTarget.value = null;
  if (!res.ok) {
    actionError.value = res.error ?? 'AUTH_GENERIC_ERROR';
    return;
  }
  showSuccess(
    t('settings.auth.unlinkedSuccess', {
      provider:
        target === 'google.com'
          ? t('settings.auth.googleTitle')
          : t('settings.auth.emailPasswordTitle'),
    })
  );
}
</script>

<template>
  <UiInstrumentPanel id="sign-in-methods" signal-line>
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4 border-b border-border-hairline pb-4">
      <div>
        <div class="flex items-center gap-2">
          <ShieldCheck class="h-4 w-4 text-signal" aria-hidden="true" />
          <h2 class="display-wide text-lg text-text-primary">
            {{ $t('settings.auth.title') }}
          </h2>
        </div>
        <p class="mt-1.5 text-sm text-text-muted">
          {{ $t('settings.auth.subtitle') }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span
          v-if="authStore.isDemoMode"
          class="tabular-telemetry border border-signal/40 bg-signal-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-signal"
        >
          {{ $t('app.demoBanner') }}
        </span>
        <span
          class="tabular-telemetry border border-border-hairline bg-bg-primary px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-text-primary"
        >
          {{ $t('settings.auth.connectedCount', { count: authStore.providerStatus.connectedCount }) }}
        </span>
      </div>
    </div>

    <p v-if="authStore.isDemoMode" class="mt-4 text-xs text-text-faint">
      {{ $t('settings.auth.demoNote') }}
    </p>

    <!-- Feedback Banners -->
    <div
      v-if="actionSuccess"
      role="status"
      class="mt-4 flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/10 p-3 text-ui text-emerald-500"
    >
      <CheckCircle2 class="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{{ actionSuccess }}</span>
    </div>

    <div
      v-if="actionError"
      role="alert"
      class="mt-4 flex items-start gap-2 border border-destructive/50 bg-destructive/10 p-3 text-ui text-destructive"
    >
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{{ $t(`auth.errors.${actionError}`) }}</span>
    </div>

    <!-- Connected Providers Grid -->
    <div class="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <!-- 1. Google OAuth Card -->
      <div class="flex flex-col justify-between gap-4 border border-border-hairline bg-bg-primary p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border-hairline bg-bg-elevated"
              aria-hidden="true"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </span>

            <div>
              <h3 class="text-sm font-semibold text-text-primary">
                {{ $t('settings.auth.googleTitle') }}
              </h3>
              <p class="mt-1 text-xs leading-relaxed text-text-muted">
                {{ $t('settings.auth.googleDesc') }}
              </p>
            </div>
          </div>

          <span
            class="shrink-0 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            :class="
              authStore.providerStatus.hasGoogle
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                : 'border-border-hairline bg-bg-elevated text-text-muted'
            "
          >
            {{
              authStore.providerStatus.hasGoogle
                ? $t('settings.auth.statusConnected')
                : $t('settings.auth.statusNotConnected')
            }}
          </span>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border-hairline pt-3">
          <template v-if="authStore.providerStatus.hasGoogle">
            <span class="text-xs text-text-faint">
              {{
                authStore.providerStatus.canUnlinkGoogle
                  ? authStore.user?.email
                  : $t('settings.auth.primaryMethodHint')
              }}
            </span>

            <button
              v-if="authStore.providerStatus.canUnlinkGoogle"
              type="button"
              data-testid="unlink-google-button"
              :disabled="authStore.linking"
              class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-muted transition-colors hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
              @click="requestUnlink('google.com')"
            >
              <Unlink class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('settings.auth.unlinkButton') }}</span>
            </button>
          </template>

          <button
            v-else
            type="button"
            data-testid="link-google-button"
            :disabled="authStore.linking"
            class="btn-press inline-flex h-9 items-center gap-2 border border-signal/60 bg-signal-soft px-3.5 text-xs font-semibold uppercase tracking-wider text-signal transition-colors hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
            @click="handleLinkGoogle"
          >
            <Loader2 v-if="authStore.linking" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            <Link2 v-else class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ authStore.linking ? $t('settings.auth.linkingGoogle') : $t('settings.auth.linkGoogleButton') }}</span>
          </button>
        </div>
      </div>

      <!-- 2. Email & Password Card -->
      <div class="flex flex-col justify-between gap-4 border border-border-hairline bg-bg-primary p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3">
            <span
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-border-hairline bg-bg-elevated text-signal"
              aria-hidden="true"
            >
              <KeyRound class="h-4 w-4" />
            </span>

            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-text-primary">
                {{ $t('settings.auth.emailPasswordTitle') }}
              </h3>
              <p class="mt-1 text-xs leading-relaxed text-text-muted">
                {{ $t('settings.auth.emailPasswordDesc') }}
              </p>
              <div
                v-if="authStore.user?.email"
                class="tabular-telemetry mt-1.5 truncate text-xs text-text-primary"
              >
                {{ authStore.user.email }}
              </div>
            </div>
          </div>

          <span
            class="shrink-0 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
            :class="
              authStore.providerStatus.hasPassword
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                : 'border-border-hairline bg-bg-elevated text-text-muted'
            "
          >
            {{
              authStore.providerStatus.hasPassword
                ? $t('settings.auth.statusConnected')
                : $t('settings.auth.statusNotConnected')
            }}
          </span>
        </div>

        <!-- Inline Set-Password Form (when Email/Password not linked) -->
        <form
          v-if="!authStore.providerStatus.hasPassword && passwordFormOpen"
          class="space-y-3 border-t border-border-hairline pt-3"
          novalidate
          @submit.prevent="handleSubmitPasswordLink"
        >
          <p :id="passwordRulesId" class="text-xs text-text-faint">
            {{ $t('settings.auth.passwordRulesHint', { min: MIN_PASSWORD_LENGTH }) }}
          </p>

          <div>
            <label for="link-new-password" class="label-eyebrow block text-text-muted">
              {{ $t('settings.auth.newPasswordLabel') }}
            </label>
            <input
              id="link-new-password"
              ref="newPasswordRef"
              v-model="newPassword"
              type="password"
              required
              :minlength="MIN_PASSWORD_LENGTH"
              autocomplete="new-password"
              :aria-invalid="passwordLengthInvalid ? 'true' : 'false'"
              :aria-describedby="
                passwordLengthInvalid
                  ? `${passwordRulesId} ${newPasswordErrorId}`
                  : passwordRulesId
              "
              class="mt-1.5 h-9 w-full border bg-bg-elevated px-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
              :class="
                passwordLengthInvalid
                  ? 'border-destructive focus:border-destructive'
                  : 'border-border-input focus:border-signal'
              "
              @input="passwordDirty = true"
              @blur="handleNewPasswordBlur"
            />
            <p
              v-if="passwordLengthInvalid"
              :id="newPasswordErrorId"
              class="mt-1 flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{{ $t('auth.errors.AUTH_PASSWORD_TOO_SHORT') }}</span>
            </p>
          </div>

          <div>
            <label for="link-confirm-password" class="label-eyebrow block text-text-muted">
              {{ $t('settings.auth.confirmPasswordLabel') }}
            </label>
            <input
              id="link-confirm-password"
              ref="confirmPasswordRef"
              v-model="confirmPassword"
              type="password"
              required
              :minlength="MIN_PASSWORD_LENGTH"
              autocomplete="new-password"
              :aria-invalid="confirmMismatchInvalid ? 'true' : 'false'"
              :aria-describedby="confirmMismatchInvalid ? confirmPasswordErrorId : undefined"
              class="mt-1.5 h-9 w-full border bg-bg-elevated px-3 text-sm text-text-primary placeholder:text-text-faint focus:outline-none"
              :class="
                confirmMismatchInvalid
                  ? 'border-destructive focus:border-destructive'
                  : 'border-border-input focus:border-signal'
              "
              @input="confirmDirty = true"
              @blur="handleConfirmPasswordBlur"
            />
            <p
              v-if="confirmMismatchInvalid"
              :id="confirmPasswordErrorId"
              class="mt-1 flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{{ $t('auth.errors.AUTH_PASSWORD_MISMATCH') }}</span>
            </p>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              :disabled="authStore.linking"
              class="btn-press h-8 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-muted hover:text-text-primary disabled:opacity-50"
              @click="resetPasswordForm"
            >
              {{ $t('confirm.cancelAction') }}
            </button>
            <button
              type="submit"
              data-testid="submit-link-password"
              :disabled="authStore.linking"
              class="btn-launch h-8 px-3.5"
            >
              <Loader2 v-if="authStore.linking" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <Check v-else class="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {{
                  authStore.linking
                    ? $t('settings.auth.linkingPassword')
                    : $t('settings.auth.linkPasswordSubmit')
                }}
              </span>
            </button>
          </div>
        </form>

        <!-- Footer Controls -->
        <div
          v-else
          class="flex flex-wrap items-center justify-between gap-2 border-t border-border-hairline pt-3"
        >
          <template v-if="authStore.providerStatus.hasPassword">
            <span class="text-xs text-text-faint">
              {{
                authStore.providerStatus.canUnlinkPassword
                  ? $t('settings.auth.readyEmailSignIn')
                  : $t('settings.auth.primaryMethodHint')
              }}
            </span>

            <button
              v-if="authStore.providerStatus.canUnlinkPassword"
              type="button"
              data-testid="unlink-password-button"
              :disabled="authStore.linking"
              class="btn-press inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-muted transition-colors hover:border-destructive/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
              @click="requestUnlink('password')"
            >
              <Unlink class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ $t('settings.auth.unlinkButton') }}</span>
            </button>
          </template>

          <button
            v-else
            type="button"
            data-testid="open-link-password-button"
            :disabled="authStore.linking || !authStore.user?.email"
            class="btn-press inline-flex h-9 items-center gap-2 border border-signal/60 bg-signal-soft px-3.5 text-xs font-semibold uppercase tracking-wider text-signal transition-colors hover:border-accent hover:bg-accent hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
            @click="openPasswordForm"
          >
            <KeyRound class="h-3.5 w-3.5" aria-hidden="true" />
            <span>{{ $t('settings.auth.setPasswordButton') }}</span>
          </button>
        </div>
      </div>
    </div>

    <div aria-live="polite" class="sr-only">
      {{ liveAnnouncement }}
    </div>

    <!-- Unlink Provider Confirmation Dialog -->
    <UiConfirmDialog
      v-model:open="unlinkDialogOpen"
      :title="$t('settings.auth.unlinkDialogTitle', { provider: unlinkTargetLabel })"
      :description="$t('settings.auth.unlinkDialogDesc', { provider: unlinkTargetLabel })"
      :confirm-label="$t('settings.auth.unlinkConfirmAction')"
      :loading="authStore.linking"
      test-id="unlink-provider-dialog"
      @confirm="confirmUnlink"
      @cancel="unlinkTarget = null"
    />
  </UiInstrumentPanel>
</template>
