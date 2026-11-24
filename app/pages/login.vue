<script setup lang="ts">
import { AlertCircle, ArrowRight, Info, Play } from 'lucide-vue-next';
import { useAuthStore } from '~/stores/auth';
import { hasFirebaseConfig } from '~/utils/firebaseClient';

definePageMeta({
  layout: 'auth',
});

const route = useRoute();
const localePath = useLocalePath();
const authStore = useAuthStore();

const mode = ref<'signin' | 'signup'>(route.query.mode === 'signup' ? 'signup' : 'signin');
const displayName = ref('');
const email = ref('');
const password = ref('');
const firebaseConfigured = computed(() => hasFirebaseConfig());

watch(
  () => route.query.mode,
  (val) => {
    mode.value = val === 'signup' ? 'signup' : 'signin';
  }
);

async function handleSubmit() {
  const ok =
    mode.value === 'signup'
      ? await authStore.signUpWithEmail(email.value, password.value, displayName.value)
      : await authStore.signInWithEmail(email.value, password.value);

  if (ok) {
    await navigateTo(localePath(mode.value === 'signup' ? '/app/welcome' : '/app'));
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

async function handleDemo() {
  authStore.enterDemoMode();
  await navigateTo(localePath('/app?demo=1'));
}

function toggleMode() {
  authStore.errorCode = null;
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
      {{ mode === 'signup' ? $t('auth.signUpTitle') : $t('auth.signInTitle') }}
    </h1>
    <p class="mt-2 text-sm text-text-muted">
      {{ $t('auth.subtitle') }}
    </p>

    <div
      v-if="!firebaseConfigured"
      class="mt-5 flex items-start gap-2.5 border border-signal/40 bg-signal-soft p-3 text-ui text-signal"
    >
      <Info class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ $t('auth.demoHint') }}</span>
    </div>

    <div
      v-if="authStore.errorCode"
      role="alert"
      class="mt-5 flex items-start gap-2.5 border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" />
      <span>{{ $t(`auth.errors.${authStore.errorCode}`) }}</span>
    </div>

    <div class="mt-7 space-y-5">
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

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div v-if="mode === 'signup'">
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
            autocomplete="email"
            :placeholder="$t('auth.emailPlaceholder')"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
        </div>

        <div>
          <label
            for="auth-password"
            class="label-eyebrow block text-text-muted"
          >
            {{ $t('auth.passwordLabel') }}
          </label>
          <input
            id="auth-password"
            v-model="password"
            type="password"
            required
            minlength="6"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            :placeholder="$t('auth.passwordPlaceholder')"
            class="mt-2 h-11 w-full border border-border-input bg-bg-primary px-3.5 text-sm text-text-primary placeholder:text-text-faint focus:border-signal focus:outline-none"
          />
        </div>

        <button
          type="submit"
          :disabled="authStore.loading"
          class="btn-launch h-11 w-full"
        >
          <span>{{ mode === 'signup' ? $t('auth.submitSignUp') : $t('auth.submitSignIn') }}</span>
          <ArrowRight class="h-4 w-4" />
        </button>
      </form>

      <button
        type="button"
        class="btn-orbit h-10 w-full"
        @click="handleDemo"
      >
        <Play class="h-3.5 w-3.5 text-signal" />
        <span>{{ $t('auth.demoButton') }}</span>
      </button>
    </div>

    <div class="mt-7 space-y-2 border-t border-border-hairline pt-5 text-center text-ui text-text-muted">
      <div>
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
