<script setup lang="ts">
import { Sparkles, Play, ArrowRight } from 'lucide-vue-next';

definePageMeta({
  layout: 'marketing',
});

const localePath = useLocalePath();

// Self-ticking preview counter on client (static 01:42:18 during SSR/prerender)
const previewSeconds = ref(1 * 3600 + 42 * 60 + 18);

onMounted(() => {
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;
  const timer = setInterval(() => {
    previewSeconds.value += 1;
  }, 1000);
  onUnmounted(() => clearInterval(timer));
});
</script>

<template>
  <div>
    <!-- Hero Section -->
    <section class="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
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

      <!-- Command Timer Bar Telemetry Preview -->
      <div class="mt-14 border border-border-hairline bg-bg-elevated p-4 sm:p-6">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono uppercase tracking-wider text-text-muted">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 bg-accent animate-pulse" />
            <span>{{ $t('landing.demoPreview.statusRunning') }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge keys="N" active />
              <span>{{ $t('landing.shortcutFocus') }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge keys="Tab" />
              <span>{{ $t('landing.shortcutCycle') }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge :keys="['⌘', 'I']" />
              <span>{{ $t('landing.shortcutAi') }}</span>
            </span>
            <span class="inline-flex items-center gap-1.5">
              <BrandKeycapBadge keys="S" />
              <span>{{ $t('landing.shortcutStop') }}</span>
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3 border border-border-hairline bg-bg-primary p-3 lg:grid-cols-12 lg:items-center">
          <div class="lg:col-span-5 flex items-center gap-2 text-sm text-text-primary font-medium truncate">
            <span class="text-accent font-mono">&gt;</span>
            <span class="truncate">{{ $t('landing.demoPreview.sampleDescription') }}</span>
          </div>

          <div class="lg:col-span-4 flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1.5 border border-border-hairline bg-bg-elevated px-2.5 py-1 text-xs font-medium">
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

      <!-- 4 Core Architectural Pillars -->
      <div class="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
  </div>
</template>
