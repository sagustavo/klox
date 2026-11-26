<script setup lang="ts">
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  KeyRound,
  Link2,
  Loader2,
  MailCheck,
  Play,
} from 'lucide-vue-next';
import {
  MIN_PASSWORD_LENGTH,
  isValidEmailAddress,
  validateLinkPassword,
  type AuthErrorCode,
} from '~/domain/auth';
import { useAuthStore } from '~/stores/auth';
import { hasFirebaseConfig } from '~/utils/firebaseClient';

definePageMeta({
  layout: 'auth',
});

type AuthPageMode = 'signin' | 'signup' | 'forgot' | 'confirmReset';

const route = useRoute();
const router = useRouter();
const localePath = useLocalePath();
const { locale } = useI18n();
const authStore = useAuthStore();

function extractOobCode(q: typeof route.query): string {
  return typeof q.oobCode === 'string' ? q.oobCode.trim() : '';
}

function resolveInitialMode(): AuthPageMode {
  if (route.query.mode === 'resetPassword' && extractOobCode(route.query)) {
    return 'confirmReset';
  }
  if (route.query.mode === 'forgot') return 'forgot';
  if (route.query.mode === 'signup') return 'signup';
  return 'signin';
}

const mode = ref<AuthPageMode>(resolveInitialMode());
const displayName = ref('');
const email = ref('');
const password = ref('');
const firebaseConfigured = computed(() => hasFirebaseConfig());

// Sign-in post-reset banner (?reset=success or completed in-app reset)
const resetCompleteBanner = ref(false);

// Forgot password state
const resetEmailSent = ref(false);
const resetSentToEmail = ref('');
const resetSentDemo = ref(false);
const resendCooldownSeconds = ref(0);
const forgotEmailTouched = ref(false);

// In-app oobCode password reset state
const activeOobCode = ref(extractOobCode(route.query));
const verifyingCode = ref(mode.value === 'confirmReset');
const verifiedResetEmail = ref('');
const resetCodeError = ref<AuthErrorCode | null>(null);
const newPassword = ref('');
const confirmNewPassword = ref('');
const newPasswordTouched = ref(false);
const confirmNewPasswordTouched = ref(false);

let resendTimerId: ReturnType<typeof setInterval> | null = null;

function clearResendCooldown() {
  if (resendTimerId !== null) {
    clearInterval(resendTimerId);
    resendTimerId = null;
  }
  resendCooldownSeconds.value = 0;
}

function startResendCooldown(seconds = 60) {
  clearResendCooldown();
  resendCooldownSeconds.value = seconds;
  if (!import.meta.client) return;
  resendTimerId = setInterval(() => {
    if (resendCooldownSeconds.value <= 1) {
      clearResendCooldown();
    } else {
      resendCooldownSeconds.value -= 1;
    }
  }, 1000);
}

const forgotEmailInlineError = computed<AuthErrorCode | null>(() => {
  if (!forgotEmailTouched.value) return null;
  return isValidEmailAddress(email.value) ? null : 'AUTH_INVALID_EMAIL';
});

const newPasswordInlineError = computed<AuthErrorCode | null>(() => {
  if (!newPasswordTouched.value) return null;
  return newPassword.value.length < MIN_PASSWORD_LENGTH ? 'AUTH_PASSWORD_TOO_SHORT' : null;
});

const confirmPasswordInlineError = computed<AuthErrorCode | null>(() => {
  if (!confirmNewPasswordTouched.value) return null;
  const check = validateLinkPassword(newPassword.value, confirmNewPassword.value);
  return check.valid ? null : (check.error ?? 'AUTH_PASSWORD_MISMATCH');
});

const showEmailInUseRecovery = computed(
  () =>
    !authStore.pendingLink &&
    mode.value === 'signup' &&
    authStore.errorCode === 'AUTH_EMAIL_IN_USE' &&
    firebaseConfigured.value
);

const headerTitleKey = computed(() => {
  if (authStore.pendingLink) return 'auth.linking.pendingTitle';
  if (mode.value === 'forgot') {
    return resetEmailSent.value ? 'auth.reset.sentTitle' : 'auth.reset.forgotTitle';
  }
  if (mode.value === 'confirmReset') {
    return resetCodeError.value ? 'auth.reset.invalidLinkTitle' : 'auth.reset.confirmTitle';
  }
  return mode.value === 'signup' ? 'auth.signUpTitle' : 'auth.signInTitle';
});

async function runVerifyOobCode(code: string) {
  activeOobCode.value = code;
  verifyingCode.value = true;
  resetCodeError.value = null;
  verifiedResetEmail.value = '';
  const res = await authStore.verifyResetCode(code);
  verifyingCode.value = false;
  if (res.ok && res.email) {
    verifiedResetEmail.value = res.email;
  } else {
    resetCodeError.value = res.error ?? 'AUTH_INVALID_ACTION_CODE';
  }
}

function stripResetSuccessQuery() {
  if (!import.meta.client || route.query.reset !== 'success') return;
  const nextQuery = { ...route.query };
  delete nextQuery.reset;
  void router.replace({ query: nextQuery });
}

onMounted(() => {
  if (route.query.reset === 'success') {
    resetCompleteBanner.value = true;
    stripResetSuccessQuery();
  }
  const code = extractOobCode(route.query);
  if (mode.value === 'confirmReset' && code) {
    void runVerifyOobCode(code);
  }
});

watch(
  () => route.query.reset,
  (val) => {
    if (val === 'success') {
      resetCompleteBanner.value = true;
      stripResetSuccessQuery();
    }
  }
);

watch(
  () => [route.query.mode, route.query.oobCode] as const,
  ([qMode, qOob]) => {
    const code = typeof qOob === 'string' ? qOob.trim() : '';
    if (qMode === 'resetPassword' && code) {
      mode.value = 'confirmReset';
      void runVerifyOobCode(code);
      return;
    }
    if (qMode === 'signup') {
      mode.value = 'signup';
    } else if (qMode === 'forgot') {
      mode.value = 'forgot';
    } else if (qMode === 'signin') {
      mode.value = 'signin';
    } else if (!qMode && (mode.value === 'signup' || mode.value === 'confirmReset')) {
      mode.value = 'signin';
    }
  }
);

watch(
  () => authStore.pendingLink,
  (pending) => {
    if (pending) {
      mode.value = 'signin';
      email.value = pending.email;
      password.value = '';
    }
  }
);

onBeforeUnmount(() => {
  clearResendCooldown();
  authStore.clearPendingLink();
});

async function handleSubmit() {
  if (authStore.pendingLink) {
    const ok = await authStore.completePendingGoogleLinkWithPassword(password.value);
    if (ok) {
      await navigateTo(localePath('/app'));
    }
    return;
  }

  resetCompleteBanner.value = false;

  const ok =
    mode.value === 'signup'
      ? await authStore.signUpWithEmail(email.value, password.value, displayName.value)
      : await authStore.signInWithEmail(email.value, password.value);

  if (ok) {
    await navigateTo(localePath(mode.value === 'signup' ? '/app/welcome' : '/app'));
  }
}

function buildResetContinueUrl(): string | undefined {
  if (!import.meta.client) return undefined;
  return `${window.location.origin}${localePath('/login')}?reset=success`;
}

async function handleForgotSubmit() {
  authStore.errorCode = null;
  forgotEmailTouched.value = true;
  if (!isValidEmailAddress(email.value)) return;

  const res = await authStore.sendPasswordReset({
    email: email.value,
    locale: locale.value,
    continueUrl: buildResetContinueUrl(),
  });

  if (res.ok) {
    resetEmailSent.value = true;
    resetSentToEmail.value = email.value.trim();
    resetSentDemo.value = Boolean(res.isDemo);
    startResendCooldown(60);
  }
}

async function handleResendReset() {
  if (resendCooldownSeconds.value > 0 || authStore.loading) return;
  const targetEmail = resetSentToEmail.value || email.value;
  const res = await authStore.sendPasswordReset({
    email: targetEmail,
    locale: locale.value,
    continueUrl: buildResetContinueUrl(),
  });
  if (res.ok) {
    resetSentDemo.value = Boolean(res.isDemo);
    startResendCooldown(60);
  }
}

async function handleConfirmResetSubmit() {
  authStore.errorCode = null;
  newPasswordTouched.value = true;
  confirmNewPasswordTouched.value = true;

  const check = validateLinkPassword(newPassword.value, confirmNewPassword.value);
  if (!check.valid) return;

  const res = await authStore.confirmResetPassword({
    oobCode: activeOobCode.value,
    newPassword: newPassword.value,
    confirmPassword: confirmNewPassword.value,
  });

  if (res.ok) {
    email.value = verifiedResetEmail.value || email.value;
    password.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
    newPasswordTouched.value = false;
    confirmNewPasswordTouched.value = false;
    resetCompleteBanner.value = true;
    mode.value = 'signin';
    if (import.meta.client) {
      void router.replace({ query: {} });
    }
  }
}

function openForgotPassword() {
  authStore.errorCode = null;
  authStore.clearPendingLink();
  resetCompleteBanner.value = false;
  resetEmailSent.value = false;
  resetSentDemo.value = false;
  forgotEmailTouched.value = false;
  clearResendCooldown();
  mode.value = 'forgot';
}

function backToSignIn() {
  authStore.errorCode = null;
  authStore.clearPendingLink();
  resetEmailSent.value = false;
  forgotEmailTouched.value = false;
  resetCodeError.value = null;
  newPassword.value = '';
  confirmNewPassword.value = '';
  newPasswordTouched.value = false;
  confirmNewPasswordTouched.value = false;
  clearResendCooldown();
  mode.value = 'signin';
  if (import.meta.client && (route.query.mode || route.query.oobCode)) {
    void router.replace({ query: {} });
  }
}

async function handleGoogle() {
  const result = await authStore.signInWithGoogle();
  if (result.ok) {
    const shouldOnboard = firebaseConfigured.value
      ? result.isNewUser
      : mode.value === 'signup';
    await navigateTo(localePath(shouldOnboard ? '/app/welcome' : '/app'));
  }
}

async function handleVerifyGoogleAndLinkPassword() {
  const res = await authStore.signInWithGoogleAndLinkPassword(email.value, password.value);
  if (res.ok) {
    await navigateTo(localePath('/app'));
  }
}

function switchToSignInFromRecovery() {
  authStore.errorCode = null;
  authStore.clearPendingLink();
  mode.value = 'signin';
}

function cancelPendingLink() {
  authStore.errorCode = null;
  authStore.clearPendingLink();
  password.value = '';
}

async function handleDemo() {
  authStore.enterDemoMode();
  await navigateTo(localePath('/app?demo=1'));
}

function toggleMode() {
  authStore.errorCode = null;
  authStore.clearPendingLink();
  resetCompleteBanner.value = false;
  mode.value = mode.value === 'signup' ? 'signin' : 'signup';
}
</script>

<template>
  <UiInstrumentPanel
    signal-line
    :padded="false"
    class="w-full max-w-md p-8 shadow-2xl sm:p-10"
  >
    <h1 class="display-wide text-2xl text-text-primary">
      {{ $t(headerTitleKey) }}
    </h1>
    <p class="mt-2 text-sm text-text-muted">
      <template v-if="mode === 'forgot' && !resetEmailSent">
        {{ $t('auth.reset.forgotSubtitle') }}
      </template>
      <template v-else-if="mode === 'confirmReset' && verifiedResetEmail && !resetCodeError">
        {{ $t('auth.reset.confirmSubtitle', { email: verifiedResetEmail }) }}
      </template>
      <template v-else>
        {{ $t('auth.subtitle') }}
      </template>
    </p>

    <div
      v-if="!firebaseConfigured && mode !== 'confirmReset'"
      class="mt-5 flex items-start gap-2.5 border border-signal/40 bg-signal-soft p-3 text-ui text-signal"
    >
      <Info class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ $t('auth.demoHint') }}</span>
    </div>

    <!-- Password Reset Completed Confirmation Banner (?reset=success or completed oobCode) -->
    <div
      v-if="resetCompleteBanner && mode === 'signin' && !authStore.pendingLink"
      data-testid="password-reset-complete-banner"
      role="status"
      aria-live="polite"
      class="mt-5 flex items-start gap-2.5 border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-sm text-emerald-700 dark:text-emerald-300"
    >
      <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{{ $t('auth.reset.resetCompleteBanner') }}</span>
    </div>

    <!-- Pending Google Account Link Guidance (account-exists-with-different-credential) -->
    <div
      v-if="authStore.pendingLink"
      data-testid="pending-google-link-banner"
      role="status"
      class="mt-5 space-y-2 border border-signal/50 bg-signal-soft p-3.5 text-ui text-text-primary"
    >
      <div class="flex items-start gap-2.5">
        <Link2 class="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
        <p class="text-xs leading-relaxed">
          {{ $t('auth.linking.pendingBody', { email: authStore.pendingLink.email }) }}
        </p>
      </div>
      <button
        type="button"
        class="text-xs font-medium text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        @click="cancelPendingLink"
      >
        {{ $t('auth.linking.pendingCancel') }}
      </button>
    </div>

    <!-- Blocking Auth Error Banner -->
    <div
      v-if="
        authStore.errorCode &&
        authStore.errorCode !== 'AUTH_ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL' &&
        mode !== 'confirmReset'
      "
      role="alert"
      class="mt-5 space-y-2 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <div class="flex items-start gap-2.5">
        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
        <span>{{ $t(`auth.errors.${authStore.errorCode}`) }}</span>
      </div>

      <p
        v-if="
          mode === 'signin' &&
          authStore.errorCode === 'AUTH_INVALID_CREDENTIALS' &&
          firebaseConfigured &&
          !authStore.pendingLink
        "
        class="border-t border-destructive/30 pt-2 text-xs text-text-muted"
      >
        {{ $t('auth.linking.googleSignInTip') }}
      </p>
    </div>

    <!-- Guided Recovery when Email Already In Use on Sign Up -->
    <div
      v-if="showEmailInUseRecovery"
      data-testid="email-in-use-recovery"
      class="mt-3 space-y-3 border border-signal/40 bg-signal-soft p-3.5 text-xs text-text-primary"
    >
      <p class="leading-relaxed text-text-muted">
        {{ $t('auth.linking.emailInUseHint') }}
      </p>
      <div class="flex flex-col gap-2">
        <button
          type="button"
          data-testid="verify-google-link-password"
          :disabled="authStore.loading"
          class="btn-press inline-flex h-9 w-full items-center justify-center gap-2 border border-signal/60 bg-bg-primary px-3 text-xs font-semibold uppercase tracking-wider text-signal transition-colors hover:border-accent hover:bg-accent hover:text-white disabled:opacity-50"
          @click="handleVerifyGoogleAndLinkPassword"
        >
          <Link2 class="h-3.5 w-3.5" aria-hidden="true" />
          <span>{{ $t('auth.linking.verifyGoogleAndLink') }}</span>
        </button>
        <button
          type="button"
          class="text-xs font-medium text-signal hover:underline"
          @click="switchToSignInFromRecovery"
        >
          {{ $t('auth.linking.switchToSignIn') }}
        </button>
      </div>
    </div>

    <!-- MODE 1: FORGOT PASSWORD FLOW -->
    <div v-if="mode === 'forgot'" class="mt-7 space-y-5">
      <div
        v-if="resetEmailSent"
        data-testid="password-reset-sent-banner"
        role="status"
        aria-live="polite"
        class="space-y-3 border border-emerald-500/40 bg-emerald-500/10 p-4 text-text-primary"
      >
        <div class="flex items-start gap-3">
          <MailCheck class="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden="true" />
          <p class="text-sm leading-relaxed">
            {{ $t('auth.reset.sentBody', { email: resetSentToEmail }) }}
          </p>
        </div>

        <p
          v-if="resetSentDemo"
          data-testid="password-reset-demo-note"
          class="border-t border-emerald-500/25 pt-2.5 text-xs text-text-muted"
        >
          {{ $t('auth.reset.sentDemoNote') }}
        </p>

        <button
          type="button"
          data-testid="resend-reset-button"
          :disabled="resendCooldownSeconds > 0 || authStore.loading"
          class="btn-orbit h-10 w-full disabled:opacity-50"
          @click="handleResendReset"
        >
          <span class="tabular-telemetry">
            {{
              resendCooldownSeconds > 0
                ? $t('auth.reset.resendCooldown', { seconds: resendCooldownSeconds })
                : $t('auth.reset.resendButton')
            }}
          </span>
        </button>
      </div>

      <form v-else class="space-y-4" novalidate @submit.prevent="handleForgotSubmit">
        <div>
          <label
            for="reset-email"
            class="label-eyebrow block text-text-muted"
          >
            {{ $t('auth.emailLabel') }}
          </label>
          <input
            id="reset-email"
            v-model="email"
            type="email"
            inputmode="email"
            autocomplete="email"
            :placeholder="$t('auth.emailPlaceholder')"
            :aria-invalid="Boolean(forgotEmailInlineError)"
            :aria-describedby="forgotEmailInlineError ? 'forgot-email-error' : undefined"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            @blur="forgotEmailTouched = true"
            @input="authStore.errorCode = null"
          />
          <p
            v-if="forgotEmailInlineError"
            id="forgot-email-error"
            role="alert"
            class="mt-1.5 text-xs text-destructive"
          >
            {{ $t(`auth.errors.${forgotEmailInlineError}`) }}
          </p>
        </div>

        <button
          type="submit"
          data-testid="send-reset-submit"
          :disabled="authStore.loading"
          class="btn-launch h-11 w-full"
        >
          <span>
            {{ authStore.loading ? $t('auth.reset.sendingButton') : $t('auth.reset.sendButton') }}
          </span>
          <ArrowRight class="h-4 w-4" aria-hidden="true" />
        </button>
      </form>

      <button
        type="button"
        data-testid="back-to-signin-from-forgot"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        @click="backToSignIn"
      >
        <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ $t('auth.reset.backToSignIn') }}</span>
      </button>
    </div>

    <!-- MODE 2: IN-APP OOBCODE PASSWORD RESET CONFIRMATION -->
    <div v-else-if="mode === 'confirmReset'" class="mt-7 space-y-5">
      <div
        v-if="verifyingCode"
        role="status"
        aria-live="polite"
        class="flex items-center gap-3 border border-border-hairline bg-bg-primary p-4 text-sm text-text-muted"
      >
        <Loader2 class="h-4 w-4 animate-spin text-signal" aria-hidden="true" />
        <span>{{ $t('auth.reset.verifyingLink') }}</span>
      </div>

      <div v-else-if="resetCodeError" class="space-y-4">
        <div
          role="alert"
          class="flex items-start gap-2.5 border border-destructive/50 bg-destructive/10 p-3.5 text-sm text-destructive"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{{ $t(`auth.errors.${resetCodeError}`) }}</span>
        </div>

        <button
          type="button"
          class="btn-launch h-11 w-full"
          @click="openForgotPassword"
        >
          <span>{{ $t('auth.reset.requestNewLink') }}</span>
          <ArrowRight class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form v-else class="space-y-4" novalidate @submit.prevent="handleConfirmResetSubmit">
        <div
          v-if="authStore.errorCode"
          role="alert"
          class="flex items-start gap-2.5 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{{ $t(`auth.errors.${authStore.errorCode}`) }}</span>
        </div>

        <div>
          <label
            for="confirm-new-password"
            class="label-eyebrow block text-text-muted"
          >
            {{ $t('auth.reset.newPasswordLabel') }}
          </label>
          <p class="mt-1 text-xs text-text-faint">
            {{ $t('auth.reset.passwordRuleHint') }}
          </p>
          <input
            id="confirm-new-password"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            :minlength="MIN_PASSWORD_LENGTH"
            :placeholder="$t('auth.passwordPlaceholder')"
            :aria-invalid="Boolean(newPasswordInlineError)"
            :aria-describedby="newPasswordInlineError ? 'confirm-new-password-error' : undefined"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            @blur="newPasswordTouched = true"
          />
          <p
            v-if="newPasswordInlineError"
            id="confirm-new-password-error"
            role="alert"
            class="mt-1.5 text-xs text-destructive"
          >
            {{ $t(`auth.errors.${newPasswordInlineError}`) }}
          </p>
        </div>

        <div>
          <label
            for="confirm-repeat-password"
            class="label-eyebrow block text-text-muted"
          >
            {{ $t('auth.reset.confirmPasswordLabel') }}
          </label>
          <input
            id="confirm-repeat-password"
            v-model="confirmNewPassword"
            type="password"
            autocomplete="new-password"
            :minlength="MIN_PASSWORD_LENGTH"
            :placeholder="$t('auth.passwordPlaceholder')"
            :aria-invalid="Boolean(confirmPasswordInlineError)"
            :aria-describedby="confirmPasswordInlineError ? 'confirm-repeat-password-error' : undefined"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
            @blur="confirmNewPasswordTouched = true"
          />
          <p
            v-if="confirmPasswordInlineError"
            id="confirm-repeat-password-error"
            role="alert"
            class="mt-1.5 text-xs text-destructive"
          >
            {{ $t(`auth.errors.${confirmPasswordInlineError}`) }}
          </p>
        </div>

        <button
          type="submit"
          data-testid="confirm-reset-submit"
          :disabled="authStore.loading"
          class="btn-launch h-11 w-full"
        >
          <KeyRound class="h-4 w-4" aria-hidden="true" />
          <span>
            {{ authStore.loading ? $t('auth.reset.updatingButton') : $t('auth.reset.confirmSubmit') }}
          </span>
        </button>
      </form>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-xs font-medium text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
        @click="backToSignIn"
      >
        <ArrowLeft class="h-3.5 w-3.5" aria-hidden="true" />
        <span>{{ $t('auth.reset.backToSignIn') }}</span>
      </button>
    </div>

    <!-- MODE 3: SIGN IN / SIGN UP (EXISTING FLOWS PRESERVED) -->
    <div v-else class="mt-7 space-y-5">
      <template v-if="!authStore.pendingLink">
        <UiGoogleButton
          :label="$t('auth.googleButton')"
          :disabled="authStore.loading"
          :loading="authStore.loading"
          @click="handleGoogle"
        />

        <div class="flex items-center gap-3 text-xs font-medium uppercase tracking-widest text-text-faint">
          <span class="h-px flex-1 bg-border-hairline" />
          <span>{{ $t('auth.orDivider') }}</span>
          <span class="h-px flex-1 bg-border-hairline" />
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div v-if="mode === 'signup' && !authStore.pendingLink">
          <label
            for="auth-display-name"
            class="label-eyebrow block text-text-muted"
          >
            {{ $t('auth.displayNameLabel') }}
          </label>
          <input
            id="auth-display-name"
            v-model="displayName"
            type="text"
            autocomplete="name"
            :placeholder="$t('auth.displayNamePlaceholder')"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
        </div>

        <div>
          <label
            for="auth-email"
            class="label-eyebrow block text-text-muted"
          >
            {{ $t('auth.emailLabel') }}
          </label>
          <input
            id="auth-email"
            v-model="email"
            type="email"
            required
            :disabled="Boolean(authStore.pendingLink)"
            autocomplete="email"
            :placeholder="$t('auth.emailPlaceholder')"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none disabled:opacity-65"
          />
        </div>

        <div>
          <div class="flex items-center justify-between gap-2">
            <label
              for="auth-password"
              class="label-eyebrow block text-text-muted"
            >
              {{ $t('auth.passwordLabel') }}
            </label>
            <button
              v-if="mode === 'signin' && !authStore.pendingLink"
              type="button"
              data-testid="forgot-password-link"
              class="text-xs font-medium text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              @click="openForgotPassword"
            >
              {{ $t('auth.reset.forgotLink') }}
            </button>
          </div>
          <input
            id="auth-password"
            v-model="password"
            type="password"
            required
            :minlength="MIN_PASSWORD_LENGTH"
            :autocomplete="
              mode === 'signup' && !authStore.pendingLink ? 'new-password' : 'current-password'
            "
            :placeholder="$t('auth.passwordPlaceholder')"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
        </div>

        <button
          type="submit"
          :disabled="authStore.loading"
          class="btn-launch h-11 w-full"
        >
          <span>
            {{
              authStore.pendingLink
                ? $t('auth.linking.pendingSubmit')
                : mode === 'signup'
                  ? $t('auth.submitSignUp')
                  : $t('auth.submitSignIn')
            }}
          </span>
          <ArrowRight class="h-4 w-4" />
        </button>
      </form>

      <button
        v-if="!authStore.pendingLink"
        type="button"
        class="btn-orbit h-10 w-full"
        @click="handleDemo"
      >
        <Play class="h-3.5 w-3.5 text-signal" />
        <span>{{ $t('auth.demoButton') }}</span>
      </button>
    </div>

    <div class="mt-7 space-y-2 border-t border-border-hairline pt-5 text-center text-ui text-text-muted">
      <div v-if="(mode === 'signin' || mode === 'signup') && !authStore.pendingLink">
        <span>
          {{ mode === 'signup' ? $t('auth.switchToSignInPrompt') : $t('auth.switchToSignUpPrompt') }}
        </span>
        {{ ' ' }}
        <button
          type="button"
          class="font-medium text-signal hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
          @click="toggleMode"
        >
          {{ mode === 'signup' ? $t('auth.switchToSignInAction') : $t('auth.switchToSignUpAction') }}
        </button>
      </div>

      <div class="text-xs text-text-faint">
        <span>{{ $t('auth.supportPrompt') }}</span>
        {{ ' ' }}
        <a
          href="mailto:contact@klox.dev"
          class="text-signal hover:underline"
        >
          contact@klox.dev
        </a>
      </div>
    </div>
  </UiInstrumentPanel>
</template>
