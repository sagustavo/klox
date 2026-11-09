<script setup lang="ts">
import { Play, ArrowRight, AlertCircle } from 'lucide-vue-next';
import { useAuthStore } from '~/stores/auth';
import { hasFirebaseConfig } from '~/utils/firebaseClient';

definePageMeta({
  layout: 'marketing',
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
  const ok = await authStore.signInWithGoogle();
  if (ok) {
    await navigateTo(localePath(mode.value === 'signup' ? '/app/welcome' : '/app'));
  }
}

async function handleDemo() {
  authStore.enterDemoMode();
  await navigateTo(localePath('/app?demo=1'));
}
</script>

<template>
  <div class="mx-auto max-w-md px-4 py-14 sm:py-20">
    <div class="border border-border-hairline bg-bg-elevated p-6 sm:p-8">
      <div class="mb-6 flex items-center justify-between">
        <BrandKloxLogo size="sm" />
        <div class="inline-flex border border-border-hairline bg-bg-primary text-xs font-mono">
          <button
            type="button"
            class="px-2.5 py-1 transition-colors"
            :class="
              mode === 'signin'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            "
            @click="mode = 'signin'"
          >
            {{ $t('auth.modeSignIn') }}
          </button>
          <button
            type="button"
            class="px-2.5 py-1 transition-colors"
            :class="
              mode === 'signup'
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            "
            @click="mode = 'signup'"
          >
            {{ $t('auth.modeSignUp') }}
          </button>
        </div>
      </div>

      <h1 class="text-xl font-semibold tracking-tight text-text-primary">
        {{ mode === 'signup' ? $t('auth.signUpTitle') : $t('auth.signInTitle') }}
      </h1>
      <p class="mt-1.5 text-xs text-text-muted">
        {{ $t('auth.subtitle') }}
      </p>

      <div
        v-if="!firebaseConfigured"
        class="mt-4 border border-accent/40 bg-accent/10 p-2.5 text-[11px] font-mono text-accent"
      >
        {{ $t('auth.demoHint') }}
      </div>

      <div
        v-if="authStore.errorCode"
        class="mt-4 flex items-center gap-2 border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-400"
      >
        <AlertCircle class="h-4 w-4 shrink-0" />
        <span>{{ $t(`auth.errors.${authStore.errorCode}`) }}</span>
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="handleSubmit">
        <div v-if="mode === 'signup'">
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('auth.displayNameLabel') }}
          </label>
          <input
            v-model="displayName"
            type="text"
            autocomplete="name"
            :placeholder="$t('auth.displayNamePlaceholder')"
            class="mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('auth.emailLabel') }}
          </label>
          <input
            v-model="email"
            type="email"
            required
            autocomplete="email"
            :placeholder="$t('auth.emailPlaceholder')"
            class="mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
          />
        </div>

        <div>
          <label class="block text-xs font-mono uppercase tracking-wider text-text-muted">
            {{ $t('auth.passwordLabel') }}
          </label>
          <input
            v-model="password"
            type="password"
            required
            minlength="6"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            :placeholder="$t('auth.passwordPlaceholder')"
            class="mt-1.5 h-9 w-full border border-border-hairline bg-bg-primary px-3 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-accent focus:outline-none"
          />
        </div>

        <button
          type="submit"
          :disabled="authStore.loading"
          class="inline-flex h-10 w-full items-center justify-center gap-2 bg-accent px-4 text-xs font-mono uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          <span>{{ mode === 'signup' ? $t('auth.submitSignUp') : $t('auth.submitSignIn') }}</span>
          <ArrowRight class="h-3.5 w-3.5" />
        </button>
      </form>

      <div class="my-5 flex items-center gap-3 text-[10px] font-mono uppercase text-text-muted">
        <span class="h-px flex-1 bg-border-hairline" />
        <span>{{ $t('auth.orDivider') }}</span>
        <span class="h-px flex-1 bg-border-hairline" />
      </div>

      <div class="space-y-2.5">
        <button
          type="button"
          :disabled="authStore.loading"
          class="inline-flex h-9 w-full items-center justify-center gap-2 border border-border-hairline bg-bg-primary px-4 text-xs font-medium text-text-primary hover:bg-bg-hover transition-colors"
          @click="handleGoogle"
        >
          <span>{{ $t('auth.googleButton') }}</span>
        </button>

        <button
          type="button"
          class="inline-flex h-9 w-full items-center justify-center gap-2 border border-border-hairline bg-bg-primary px-4 text-xs font-mono text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          @click="handleDemo"
        >
          <Play class="h-3 w-3 text-accent" />
          <span>{{ $t('auth.demoButton') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
