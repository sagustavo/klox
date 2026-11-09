<script setup lang="ts">
import { Sparkles, Play, Pause, ArrowRight, Check, GitBranch, ChevronDown } from 'lucide-vue-next';

definePageMeta({
  layout: 'marketing',
});

const { t, locale } = useI18n();
const localePath = useLocalePath();

// Per-locale SEO, canonical, and hreflang tags (FR-1)
const canonicalUrl = computed(() =>
  locale.value === 'pt-br' ? 'https://klox.dev/pt-br' : 'https://klox.dev/'
);

useSeoMeta({
  title: () => `Klox — ${t('brand.tagline')}`,
  description: () => t('landing.heroSubtitle'),
  ogTitle: () => `Klox — ${t('landing.heroTitle')}`,
  ogDescription: () => t('landing.heroSubtitle'),
  ogType: 'website',
  ogUrl: () => canonicalUrl.value,
  twitterCard: 'summary_large_image',
});

useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
    { rel: 'alternate', hreflang: 'en', href: 'https://klox.dev/' },
    { rel: 'alternate', hreflang: 'pt-BR', href: 'https://klox.dev/pt-br' },
    { rel: 'alternate', hreflang: 'x-default', href: 'https://klox.dev/' },
  ],
});

// Self-playing Command Bar demo state machine (honors prefers-reduced-motion)
type DemoPhase = 'typing' | 'recall' | 'ai' | 'running';
const demoPhase = ref<DemoPhase>('running');
const typedChars = ref(100);
const previewSeconds = ref(1 * 3600 + 42 * 60 + 18);
const isPaused = ref(false);

const fullSampleText = computed(() => t('landing.demoPreview.sampleDescription'));
const visibleSampleText = computed(() => {
  if (demoPhase.value === 'running' || demoPhase.value === 'ai' || demoPhase.value === 'recall') {
    return fullSampleText.value;
  }
  return fullSampleText.value.slice(0, typedChars.value);
});

const demoStatusLabel = computed(() => {
  if (demoPhase.value === 'typing') return t('landing.demoPreview.statusTyping');
  if (demoPhase.value === 'recall') return t('landing.demoPreview.statusRecall');
  if (demoPhase.value === 'ai') return t('landing.demoPreview.statusAiPredicted');
  return t('landing.demoPreview.statusRunning');
});

onMounted(() => {
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    isPaused.value = true;
    demoPhase.value = 'running';
    return;
  }

  let tickCount = 0;
  const interval = setInterval(() => {
    if (isPaused.value) return;
    tickCount += 1;
    previewSeconds.value += 1;

    const cycle = tickCount % 14;
    if (cycle < 3) {
      demoPhase.value = 'typing';
      typedChars.value = Math.min(fullSampleText.value.length, (cycle + 1) * 18);
    } else if (cycle < 5) {
      demoPhase.value = 'recall';
    } else if (cycle < 7) {
      demoPhase.value = 'ai';
    } else {
      demoPhase.value = 'running';
    }
  }, 1000);

  onUnmounted(() => clearInterval(interval));
});
</script>

<template>
  <div class="space-y-24 pb-20">
    <!-- Hero Section -->
    <section class="mx-auto max-w-6xl px-4 pt-14 sm:px-6 sm:pt-20">
      <div class="max-w-3xl">
        <div
          class="tabular-telemetry mb-5 inline-flex items-center gap-2 border border-border-hairline bg-bg-elevated px-3 py-1 text-[11px] font-mono uppercase tracking-widest text-accent"
        >
          <span class="h-1.5 w-1.5 bg-accent" />
          <span>{{ $t('landing.badge') }}</span>
        </div>

        <h1 class="text-4xl font-semibold tracking-tight text-text-primary sm:text-6xl leading-[1.06]">
          {{ $t('landing.heroTitle') }}
        </h1>

        <p class="mt-5 max-w-2xl text-base sm:text-lg text-text-muted leading-relaxed">
          {{ $t('landing.heroSubtitle') }}
        </p>

        <div class="mt-8 flex flex-wrap items-center gap-3">
          <NuxtLink
            :to="localePath('/login?mode=signup')"
            class="inline-flex h-11 items-center gap-2 bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            <span>{{ $t('landing.ctaPrimary') }}</span>
            <ArrowRight class="h-4 w-4" />
          </NuxtLink>

          <NuxtLink
            :to="localePath('/app?demo=1')"
            class="inline-flex h-11 items-center gap-2 border border-border-hairline bg-bg-elevated px-5 text-sm font-medium text-text-primary hover:bg-bg-hover transition-colors"
          >
            <Play class="h-3.5 w-3.5 text-accent" />
            <span>{{ $t('landing.ctaDemo') }}</span>
          </NuxtLink>
        </div>
      </div>

      <!-- Self-Playing Command Timer Bar Telemetry Demo -->
      <div class="mt-14 border border-border-hairline bg-bg-elevated p-4 sm:p-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-text-muted">
          <div class="flex items-center gap-2.5">
            <span class="h-2 w-2 bg-accent animate-pulse" />
            <span class="text-accent font-semibold">{{ demoStatusLabel }}</span>
            <button
              type="button"
              class="inline-flex items-center gap-1 border border-border-hairline bg-bg-primary px-2 py-0.5 text-[10px] text-text-muted hover:text-text-primary"
              :aria-label="isPaused ? $t('landing.demoPreview.playDemo') : $t('landing.demoPreview.pauseDemo')"
              @click="isPaused = !isPaused"
            >
              <Play v-if="isPaused" class="h-2.5 w-2.5" />
              <Pause v-else class="h-2.5 w-2.5" />
              <span>{{ isPaused ? $t('landing.demoPreview.playDemo') : $t('landing.demoPreview.pauseDemo') }}</span>
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge keys="N" :active="demoPhase === 'typing'" />
              <span>{{ $t('landing.shortcutFocus') }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge keys="Tab" :active="demoPhase === 'recall'" />
              <span>{{ $t('landing.shortcutCycle') }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge :keys="['⌘', 'I']" :active="demoPhase === 'ai'" />
              <span>{{ $t('landing.shortcutAi') }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge keys="S" :active="demoPhase === 'running'" />
              <span>{{ $t('landing.shortcutStop') }}</span>
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 border border-border-hairline bg-bg-primary p-3 lg:grid-cols-12 lg:items-center">
          <div class="lg:col-span-5 flex items-center gap-2 text-sm text-text-primary font-medium truncate">
            <span class="text-accent font-mono">&gt;</span>
            <span class="truncate">{{ visibleSampleText }}</span>
            <span v-if="demoPhase === 'typing'" class="h-4 w-1.5 bg-accent animate-pulse" />
          </div>

          <div class="lg:col-span-4 flex flex-wrap items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors"
              :class="
                demoPhase === 'ai'
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border-hairline bg-bg-elevated text-text-primary'
              "
            >
              <span class="h-2 w-2 bg-accent" />
              <span>{{ $t('landing.demoPreview.sampleProject') }}</span>
            </span>
            <span class="border border-border-hairline bg-bg-elevated px-2 py-0.5 text-[11px] font-mono text-text-muted">
              #{{ $t('landing.demoPreview.sampleTag1') }}
            </span>
            <span class="border border-border-hairline bg-bg-elevated px-2 py-0.5 text-[11px] font-mono text-text-muted">
              #{{ $t('landing.demoPreview.sampleTag2') }}
            </span>
            <span class="inline-flex items-center gap-1 border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-mono text-accent">
              <Sparkles class="h-2.5 w-2.5" />
              <span>{{ $t('landing.demoPreview.billable') }}</span>
            </span>
          </div>

          <div class="lg:col-span-3 flex items-center justify-between lg:justify-end gap-4 border-t border-border-hairline pt-2 lg:border-t-0 lg:pt-0">
            <BrandTimerDigits :seconds="previewSeconds" running size="md" />
            <span class="inline-flex h-8 items-center gap-1.5 border border-border-hairline bg-bg-elevated px-3 text-xs font-mono uppercase text-text-primary">
              <span>STOP</span>
              <BrandKeycapBadge keys="S" />
            </span>
          </div>
        </div>
      </div>

      <!-- 4 Core Architectural Pillars (#features) -->
      <div id="features" class="mt-14 scroll-mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-mono uppercase tracking-wider text-accent">01</span>
            <BrandKeycapBadge keys="N" />
          </div>
          <h2 class="text-sm font-semibold text-text-primary">
            {{ $t('landing.pillars.keyboard.title') }}
          </h2>
          <p class="mt-2 text-xs text-text-muted leading-relaxed">
            {{ $t('landing.pillars.keyboard.body') }}
          </p>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-mono uppercase tracking-wider text-accent">02</span>
            <BrandKeycapBadge :keys="['⌘', 'I']" />
          </div>
          <h2 class="text-sm font-semibold text-text-primary">
            {{ $t('landing.pillars.ai.title') }}
          </h2>
          <p class="mt-2 text-xs text-text-muted leading-relaxed">
            {{ $t('landing.pillars.ai.body') }}
          </p>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-mono uppercase tracking-wider text-accent">03</span>
            <BrandKeycapBadge keys="TAG" />
          </div>
          <h2 class="text-sm font-semibold text-text-primary">
            {{ $t('landing.pillars.analytics.title') }}
          </h2>
          <p class="mt-2 text-xs text-text-muted leading-relaxed">
            {{ $t('landing.pillars.analytics.body') }}
          </p>
        </div>

        <div class="border border-border-hairline bg-bg-elevated p-5">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-mono uppercase tracking-wider text-accent">04</span>
            <BrandKeycapBadge keys="CSV" />
          </div>
          <h2 class="text-sm font-semibold text-text-primary">
            {{ $t('landing.pillars.toggl.title') }}
          </h2>
          <p class="mt-2 text-xs text-text-muted leading-relaxed">
            {{ $t('landing.pillars.toggl.body') }}
          </p>
        </div>
      </div>
    </section>

    <!-- Phase 2 Enterprise Teaser: Azure DevOps CompletedWork Sync -->
    <section class="mx-auto max-w-6xl px-4 sm:px-6">
      <div class="border border-accent/40 bg-bg-elevated p-6 sm:p-8">
        <div class="flex flex-wrap items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-accent">
          <GitBranch class="h-3.5 w-3.5" />
          <span>{{ $t('landing.adoTeaser.badge') }}</span>
        </div>
        <h2 class="mt-3 text-xl sm:text-2xl font-semibold tracking-tight text-text-primary">
          {{ $t('landing.adoTeaser.title') }}
        </h2>
        <p class="mt-2 max-w-3xl text-xs sm:text-sm text-text-muted leading-relaxed">
          {{ $t('landing.adoTeaser.body') }}
        </p>

        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs font-mono">
          <div class="flex items-center gap-2 border border-border-hairline bg-bg-primary px-3 py-2.5 text-text-primary">
            <Check class="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{{ $t('landing.adoTeaser.bullet1') }}</span>
          </div>
          <div class="flex items-center gap-2 border border-border-hairline bg-bg-primary px-3 py-2.5 text-text-primary">
            <Check class="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{{ $t('landing.adoTeaser.bullet2') }}</span>
          </div>
          <div class="flex items-center gap-2 border border-border-hairline bg-bg-primary px-3 py-2.5 text-text-primary">
            <Check class="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{{ $t('landing.adoTeaser.bullet3') }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing Section (#pricing) -->
    <section id="pricing" class="mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <div class="mb-8">
        <div class="text-[11px] font-mono uppercase tracking-widest text-accent">
          {{ $t('landing.pricing.badge') }}
        </div>
        <h2 class="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-text-primary">
          {{ $t('landing.pricing.title') }}
        </h2>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <!-- Free POC Tier -->
        <div class="border-2 border-accent bg-bg-elevated p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="text-lg font-semibold text-text-primary">
                {{ $t('landing.pricing.freeTier.name') }}
              </h3>
              <div class="text-right">
                <span class="tabular-telemetry font-mono text-2xl font-bold text-accent">
                  {{ $t('landing.pricing.freeTier.price') }}
                </span>
                <span class="ml-1 text-[11px] font-mono text-text-muted">
                  / {{ $t('landing.pricing.freeTier.period') }}
                </span>
              </div>
            </div>
            <p class="mt-2 text-xs text-text-muted">
              {{ $t('landing.pricing.freeTier.desc') }}
            </p>

            <ul class="mt-6 space-y-2.5 text-xs text-text-primary">
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-accent shrink-0" />
                <span>{{ $t('landing.pricing.freeTier.f1') }}</span>
              </li>
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-accent shrink-0" />
                <span>{{ $t('landing.pricing.freeTier.f2') }}</span>
              </li>
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-accent shrink-0" />
                <span>{{ $t('landing.pricing.freeTier.f3') }}</span>
              </li>
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-accent shrink-0" />
                <span>{{ $t('landing.pricing.freeTier.f4') }}</span>
              </li>
            </ul>
          </div>

          <div class="mt-8">
            <NuxtLink
              :to="localePath('/login?mode=signup')"
              class="inline-flex h-10 w-full items-center justify-center gap-2 bg-accent px-4 text-xs font-mono font-semibold uppercase tracking-wider text-white hover:bg-accent-hover transition-colors"
            >
              <span>{{ $t('landing.pricing.freeTier.cta') }}</span>
              <ArrowRight class="h-3.5 w-3.5" />
            </NuxtLink>
          </div>
        </div>

        <!-- Pro & Enterprise Placeholder -->
        <div class="border border-border-hairline bg-bg-elevated p-6 sm:p-8 flex flex-col justify-between opacity-90">
          <div>
            <div class="flex items-baseline justify-between gap-2">
              <h3 class="text-lg font-semibold text-text-primary">
                {{ $t('landing.pricing.proTier.name') }}
              </h3>
              <div class="text-right">
                <span class="tabular-telemetry font-mono text-lg font-semibold text-text-muted">
                  {{ $t('landing.pricing.proTier.price') }}
                </span>
                <span class="ml-1 text-[11px] font-mono text-text-muted">
                  · {{ $t('landing.pricing.proTier.period') }}
                </span>
              </div>
            </div>
            <p class="mt-2 text-xs text-text-muted">
              {{ $t('landing.pricing.proTier.desc') }}
            </p>

            <ul class="mt-6 space-y-2.5 text-xs text-text-muted">
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-text-muted shrink-0" />
                <span>{{ $t('landing.pricing.proTier.f1') }}</span>
              </li>
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-text-muted shrink-0" />
                <span>{{ $t('landing.pricing.proTier.f2') }}</span>
              </li>
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-text-muted shrink-0" />
                <span>{{ $t('landing.pricing.proTier.f3') }}</span>
              </li>
              <li class="flex items-center gap-2">
                <Check class="h-3.5 w-3.5 text-text-muted shrink-0" />
                <span>{{ $t('landing.pricing.proTier.f4') }}</span>
              </li>
            </ul>
          </div>

          <div class="mt-8">
            <span class="inline-flex h-10 w-full items-center justify-center border border-border-hairline bg-bg-primary px-4 text-xs font-mono uppercase tracking-wider text-text-muted">
              {{ $t('landing.pricing.proTier.cta') }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ Section (#faq) using native <details> -->
    <section id="faq" class="mx-auto max-w-4xl scroll-mt-20 px-4 sm:px-6">
      <h2 class="text-2xl font-semibold tracking-tight text-text-primary mb-6">
        {{ $t('landing.faq.title') }}
      </h2>

      <div class="space-y-3">
        <details
          v-for="itemKey in ['q1', 'q2', 'q3', 'q4'] as const"
          :key="itemKey"
          class="group border border-border-hairline bg-bg-elevated p-4"
        >
          <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-text-primary">
            <span>{{ $t(`landing.faq.${itemKey}.q`) }}</span>
            <ChevronDown class="h-4 w-4 shrink-0 text-text-muted transition-transform group-open:rotate-180" />
          </summary>
          <p class="mt-3 border-t border-border-hairline pt-3 text-xs sm:text-sm text-text-muted leading-relaxed">
            {{ $t(`landing.faq.${itemKey}.a`) }}
          </p>
        </details>
      </div>
    </section>
  </div>
</template>
