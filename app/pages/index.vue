<script setup lang="ts">
import { ArrowRight, Check, ChevronDown, GitBranch, Pause, Play } from 'lucide-vue-next';
import { buildLandingJsonLd, OG_IMAGE_URL } from '~/utils/seoSchema';

definePageMeta({
  layout: 'marketing',
});

const { t, locale } = useI18n();
const localePath = useLocalePath();

// Per-locale SEO, canonical, hreflang, JSON-LD, and LCP hero preload (FR-1)
const canonicalUrl = computed(() =>
  locale.value === 'pt-br' ? 'https://klox.dev/pt-br' : 'https://klox.dev/'
);

useSeoMeta({
  title: () => t('landing.seo.title'),
  description: () => t('landing.seo.description'),
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogSiteName: 'Klox',
  ogTitle: () => t('landing.seo.ogTitle'),
  ogDescription: () => t('landing.seo.description'),
  ogType: 'website',
  ogUrl: () => canonicalUrl.value,
  ogLocale: () => (locale.value === 'pt-br' ? 'pt_BR' : 'en_US'),
  ogLocaleAlternate: () => (locale.value === 'pt-br' ? 'en_US' : 'pt_BR'),
  ogImage: OG_IMAGE_URL,
  ogImageWidth: 1200,
  ogImageHeight: 630,
  ogImageType: 'image/jpeg',
  ogImageAlt: () => t('landing.seo.ogImageAlt'),
  twitterCard: 'summary_large_image',
  twitterTitle: () => t('landing.seo.ogTitle'),
  twitterDescription: () => t('landing.seo.description'),
  twitterImage: OG_IMAGE_URL,
  twitterImageAlt: () => t('landing.seo.ogImageAlt'),
});

const faqKeys = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

const landingJsonLd = computed(() =>
  buildLandingJsonLd({
    locale: locale.value === 'pt-br' ? 'pt-br' : 'en',
    canonicalUrl: canonicalUrl.value,
    description: t('landing.seo.description'),
    features: [0, 1, 2, 3, 4, 5].map((idx) => t(`landing.seo.schemaFeatures.${idx}`)),
    faqs: faqKeys.map((k) => ({
      question: t(`landing.faq.${k}.q`),
      answer: t(`landing.faq.${k}.a`),
    })),
    freeOfferName: t('landing.pricing.freeTier.name'),
    freeOfferDescription: t('landing.pricing.freeTier.desc'),
    proOfferName: t('landing.pricing.proTier.name'),
    proOfferDescription: t('landing.pricing.proTier.desc'),
  })
);

useHead({
  link: [
    { rel: 'canonical', href: canonicalUrl },
    { rel: 'alternate', hreflang: 'en', href: 'https://klox.dev/' },
    { rel: 'alternate', hreflang: 'pt-BR', href: 'https://klox.dev/pt-br' },
    { rel: 'alternate', hreflang: 'x-default', href: 'https://klox.dev/' },
    {
      rel: 'preload',
      as: 'image',
      href: '/images/klox-orbit.jpg',
      fetchpriority: 'high',
    },
  ],
  script: [
    {
      key: 'klox-jsonld',
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify(landingJsonLd.value),
    },
  ],
});

const motionPaused = ref(false);
const landingRootRef = ref<HTMLElement | null>(null);
const heroSectionRef = ref<HTMLElement | null>(null);
const heroInView = ref(true);
const webglTakeover = ref(false);
let mql: MediaQueryList | null = null;
let heroObserver: IntersectionObserver | null = null;

useScrollReveal(landingRootRef, motionPaused);

function handleReducedMotionChange(event: MediaQueryListEvent) {
  if (event.matches) {
    motionPaused.value = true;
  }
}

onMounted(() => {
  if (window.matchMedia) {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mql.matches) {
      motionPaused.value = true;
    }
    mql.addEventListener('change', handleReducedMotionChange);
  }

  if (heroSectionRef.value && typeof IntersectionObserver !== 'undefined') {
    heroObserver = new IntersectionObserver(
      (entries) => {
        heroInView.value = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.01 }
    );
    heroObserver.observe(heroSectionRef.value);
  }
});

onBeforeUnmount(() => {
  mql?.removeEventListener('change', handleReducedMotionChange);
  heroObserver?.disconnect();
  heroObserver = null;
});

const heroStats = [
  { valueKey: 'landing.hero.stats.recallValue', labelKey: 'landing.hero.stats.recallLabel' },
  { valueKey: 'landing.hero.stats.keysValue', labelKey: 'landing.hero.stats.keysLabel' },
  { valueKey: 'landing.hero.stats.dedupeValue', labelKey: 'landing.hero.stats.dedupeLabel' },
  { valueKey: 'landing.hero.stats.aiValue', labelKey: 'landing.hero.stats.aiLabel' },
] as const;

const advantages = [
  { id: 'keyboard', index: '01 / 04', key: 'keyboard' },
  { id: 'ai', index: '02 / 04', key: 'ai' },
  { id: 'analytics', index: '03 / 04', key: 'analytics' },
  { id: 'toggl', index: '04 / 04', key: 'toggl' },
] as const;
</script>

<template>
  <div ref="landingRootRef" :class="{ 'motion-paused': motionPaused }">
    <!-- Section 1: Atmospheric Orbital Horizon Hero -->
    <section
      id="top"
      ref="heroSectionRef"
      class="relative flex min-h-screen flex-col overflow-hidden pt-16"
    >
      <img
        src="/images/klox-orbit.jpg"
        :alt="$t('landing.hero.orbitAlt')"
        width="1920"
        height="1088"
        fetchpriority="high"
        decoding="async"
        class="absolute inset-0 h-full w-full object-cover object-bottom transition-opacity duration-1000 ease-out"
        :class="webglTakeover ? 'opacity-0' : 'opacity-100'"
      />
      <div
        class="bg-void-fade absolute inset-0 transition-opacity duration-1000 ease-out dark:hidden"
        :class="webglTakeover ? 'opacity-0' : 'opacity-100'"
        aria-hidden="true"
      />
      <ClientOnly>
        <LandingOrbitalHorizon
          :paused="motionPaused"
          :active="heroInView"
          @active-takeover="webglTakeover = $event"
        />
      </ClientOnly>
      <div
        class="bg-hero-webgl-scrim pointer-events-none absolute inset-0"
        aria-hidden="true"
      />

      <div class="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 sm:py-20 lg:pt-12 lg:pb-28">
        <p class="label-eyebrow animate-rise text-text-muted">
          <BrandMissionClock :paused="motionPaused" />
          <span class="mx-3 text-text-faint">//</span>
          <span>{{ $t('landing.hero.missionLabel') }}</span>
        </p>

        <BrandTypewriterHeadline
          :lines="[
            $t('landing.hero.headlineLine1'),
            $t('landing.hero.headlineLine2'),
            $t('landing.hero.headlineLine3'),
          ]"
          :paused="motionPaused"
          class="mt-8"
        />

        <p
          class="hero-copy-shadow animate-rise mt-8 max-w-xl text-base leading-relaxed text-text-primary/90 sm:text-lg"
          style="animation-delay: 240ms"
        >
          {{ $t('landing.heroSubtitle') }}
        </p>

        <div
          class="animate-rise mt-10 flex flex-wrap items-center gap-4"
          style="animation-delay: 360ms"
        >
          <NuxtLink :to="localePath('/login?mode=signup')" class="btn-launch h-12 px-8">
            <span>{{ $t('landing.hero.ctaPrimary') }}</span>
            <ArrowRight class="h-4 w-4" aria-hidden="true" />
          </NuxtLink>

          <NuxtLink :to="localePath('/app?demo=1')" class="btn-orbit h-12 px-8">
            <Play class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
            <span>{{ $t('landing.hero.ctaDemo') }}</span>
          </NuxtLink>

          <a
            href="#features"
            class="label-eyebrow hero-copy-shadow inline-flex h-12 items-center px-3 text-text-primary/80 transition-colors hover:text-text-primary"
          >
            {{ $t('landing.hero.ctaSpecs') }} ↓
          </a>
        </div>
      </div>

      <!-- Bottom 4-Column Telemetry Strip -->
      <div class="relative border-t border-border-hairline bg-bg-primary/65 backdrop-blur-sm">
        <dl class="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4">
          <div
            v-for="(stat, idx) in heroStats"
            :key="stat.labelKey"
            class="flex flex-col-reverse py-6"
            :class="[
              idx > 0 && 'md:border-l md:border-border-hairline md:pl-6',
              idx % 2 === 1 && 'border-l border-border-hairline pl-6',
            ]"
          >
            <dt class="label-eyebrow mt-2 text-text-muted">
              {{ $t(stat.labelKey) }}
            </dt>
            <dd class="display-wide tabular-telemetry text-xl text-text-primary sm:text-2xl">
              {{ $t(stat.valueKey) }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <!-- Section 2: 4 Editorial Advantage Instrument Panels (#features) -->
    <section
      id="features"
      aria-labelledby="features-heading"
      class="relative scroll-mt-16 border-t border-border-hairline bg-bg-primary"
    >
      <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
        <div
          data-scroll-reveal
          class="flex flex-col justify-between gap-6 md:flex-row md:items-end"
        >
          <div>
            <p class="label-eyebrow text-signal">{{ $t('landing.advantages.eyebrow') }}</p>
            <h2 id="features-heading" class="display-wide mt-4 max-w-2xl text-3xl text-text-primary sm:text-5xl">
              {{ $t('landing.advantages.title') }}
            </h2>
          </div>

          <div class="max-w-sm space-y-4">
            <p class="text-base leading-relaxed text-text-muted">
              {{ $t('landing.advantages.subtitle') }}
            </p>
            <button
              type="button"
              class="btn-press inline-flex h-9 items-center gap-2 border border-border-hairline bg-bg-elevated px-3 text-xs font-medium text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              @click="motionPaused = !motionPaused"
            >
              <Play v-if="motionPaused" class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
              <Pause v-else class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
              <span>
                {{
                  motionPaused
                    ? $t('landing.advantages.playMotion')
                    : $t('landing.advantages.pauseMotion')
                }}
              </span>
            </button>
          </div>
        </div>

        <div class="mt-16 divide-y divide-border-hairline border-y border-border-hairline sm:mt-20">
          <article
            v-for="item in advantages"
            :key="item.id"
            data-scroll-reveal
            class="grid items-center gap-10 py-14 sm:py-16 lg:grid-cols-12 lg:gap-16"
          >
            <div class="lg:col-span-5">
              <span class="label-eyebrow text-text-faint">{{ item.index }}</span>
              <h3 class="display-wide mt-5 text-xl text-text-primary sm:text-2xl">
                {{ $t(`landing.pillars.${item.key}.title`) }}
              </h3>
              <p class="mt-5 text-base leading-relaxed text-text-muted">
                <BrandWithKeys :text="$t(`landing.pillars.${item.key}.body`)" />
              </p>
            </div>

            <div class="lg:col-span-7">
              <LandingKeyboardVisual v-if="item.key === 'keyboard'" :paused="motionPaused" />
              <LandingRecallVisual v-else-if="item.key === 'ai'" :paused="motionPaused" />
              <LandingTelemetryVisual v-else-if="item.key === 'analytics'" :paused="motionPaused" />
              <LandingCsvVisual v-else :paused="motionPaused" />
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- Section 3: Live Azure DevOps Integration -->
    <section aria-labelledby="ado-heading" class="mx-auto max-w-7xl px-4 pb-24 sm:px-6 sm:pb-28">
      <div data-scroll-reveal>
        <UiInstrumentPanel signal-line class="p-6 sm:p-10">
          <div class="label-eyebrow inline-flex items-center gap-2 text-signal">
            <span class="h-1.5 w-1.5 rounded-full bg-signal motion-safe:animate-pulse" aria-hidden="true" />
            <GitBranch class="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{{ $t('landing.adoTeaser.badge') }}</span>
          </div>

          <h2 id="ado-heading" class="display-wide mt-4 text-2xl text-text-primary sm:text-3xl">
            {{ $t('landing.adoTeaser.title') }}
          </h2>

          <p class="mt-4 max-w-3xl text-base leading-relaxed text-text-muted">
            {{ $t('landing.adoTeaser.body') }}
          </p>

          <ul class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <li class="flex items-start gap-2.5 border border-border-hairline bg-bg-primary p-4 text-sm text-text-primary">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('landing.adoTeaser.bullet1') }}</span>
            </li>
            <li class="flex items-start gap-2.5 border border-border-hairline bg-bg-primary p-4 text-sm text-text-primary">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('landing.adoTeaser.bullet2') }}</span>
            </li>
            <li class="flex items-start gap-2.5 border border-border-hairline bg-bg-primary p-4 text-sm text-text-primary">
              <Check class="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
              <span>{{ $t('landing.adoTeaser.bullet3') }}</span>
            </li>
          </ul>

          <div class="mt-8 flex flex-wrap items-center gap-3">
            <NuxtLink :to="localePath('/login?mode=signup')" class="btn-launch h-10 px-6">
              <span>{{ $t('landing.adoTeaser.ctaPrimary') }}</span>
              <ArrowRight class="h-4 w-4" aria-hidden="true" />
            </NuxtLink>
            <NuxtLink :to="localePath('/app?demo=1')" class="btn-orbit h-10 px-6">
              <Play class="h-3.5 w-3.5 text-signal" aria-hidden="true" />
              <span>{{ $t('landing.adoTeaser.ctaDemo') }}</span>
            </NuxtLink>
          </div>
        </UiInstrumentPanel>
      </div>
    </section>

    <!-- Section 4: Pricing Matrix (#pricing) -->
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      class="relative scroll-mt-16 overflow-hidden border-t border-border-hairline bg-bg-primary"
    >
      <div
        class="grid-lines pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        aria-hidden="true"
      />
      <div class="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-28">
        <div data-scroll-reveal class="text-center">
          <p class="label-eyebrow text-signal">{{ $t('landing.pricing.badge') }}</p>
          <h2 id="pricing-heading" class="display-wide mt-4 text-3xl text-text-primary sm:text-5xl">
            {{ $t('landing.pricing.title') }}
          </h2>
          <p class="mx-auto mt-5 max-w-md text-base text-text-muted">
            {{ $t('landing.pricing.subtitle') }}
          </p>
        </div>

        <div class="mx-auto mt-16 grid max-w-4xl gap-px border border-border-hairline bg-border-hairline md:grid-cols-2">
          <!-- Free Plan (Highlighted) -->
          <article
            data-scroll-reveal
            class="glow-signal relative flex flex-col bg-bg-primary p-8 sm:p-10"
          >
            <div class="signal-line absolute inset-x-0 top-0" aria-hidden="true" />
            <div class="flex items-center justify-between gap-2">
              <h3 class="display-wide text-lg tracking-[0.28em] text-text-primary">
                {{ $t('landing.pricing.freeTier.name') }}
              </h3>
              <span class="label-eyebrow text-signal">
                {{ $t('landing.pricing.recommended') }}
              </span>
            </div>

            <p class="mt-3 min-h-12 text-sm leading-relaxed text-text-muted">
              {{ $t('landing.pricing.freeTier.desc') }}
            </p>

            <div class="mt-8 flex items-baseline gap-3">
              <span class="display-wide tabular-telemetry text-5xl text-text-primary sm:text-6xl">
                {{ $t('landing.pricing.freeTier.price') }}
              </span>
              <span class="label-eyebrow text-text-muted">
                / {{ $t('landing.pricing.freeTier.period') }}
              </span>
            </div>

            <ul class="mt-10 flex-1 space-y-4 text-sm text-text-primary">
              <li
                v-for="fKey in ['f1', 'f2', 'f3', 'f4', 'f5'] as const"
                :key="fKey"
                class="flex items-start gap-3"
              >
                <Check class="mt-0.5 h-4 w-4 shrink-0 text-signal" aria-hidden="true" />
                <BrandWithKeys :text="$t(`landing.pricing.freeTier.${fKey}`)" />
              </li>
            </ul>

            <NuxtLink
              :to="localePath('/login?mode=signup')"
              class="btn-launch mt-10 h-12 w-full"
            >
              <span>{{ $t('landing.pricing.freeTier.cta') }}</span>
              <ArrowRight class="h-4 w-4" aria-hidden="true" />
            </NuxtLink>
          </article>

          <!-- Pro Plan (Roadmap Placeholder) -->
          <article
            data-scroll-reveal
            class="relative flex flex-col bg-bg-primary p-8 sm:p-10"
          >
            <div class="flex items-center justify-between gap-2">
              <h3 class="display-wide text-lg tracking-[0.28em] text-text-primary">
                {{ $t('landing.pricing.proTier.name') }}
              </h3>
              <span class="label-eyebrow text-text-faint">
                {{ $t('landing.pricing.proTier.period') }}
              </span>
            </div>

            <p class="mt-3 min-h-12 text-sm leading-relaxed text-text-muted">
              {{ $t('landing.pricing.proTier.desc') }}
            </p>

            <div class="mt-8 flex items-baseline gap-3">
              <span class="display-wide text-4xl text-text-muted sm:text-5xl">
                {{ $t('landing.pricing.proTier.price') }}
              </span>
            </div>

            <ul class="mt-10 flex-1 space-y-4 text-sm text-text-muted">
              <li
                v-for="fKey in ['f1', 'f2', 'f3', 'f4', 'f5'] as const"
                :key="fKey"
                class="flex items-start gap-3"
              >
                <Check class="mt-0.5 h-4 w-4 shrink-0 text-text-faint" aria-hidden="true" />
                <BrandWithKeys :text="$t(`landing.pricing.proTier.${fKey}`)" />
              </li>
            </ul>

            <span class="label-eyebrow mt-10 inline-flex h-12 w-full items-center justify-center border border-border-hairline bg-bg-elevated px-6 text-text-muted">
              {{ $t('landing.pricing.proTier.cta') }}
            </span>
          </article>
        </div>
      </div>
    </section>

    <!-- Section 5: FAQ (#faq) -->
    <section
      id="faq"
      aria-labelledby="faq-heading"
      class="scroll-mt-16 border-t border-border-hairline bg-bg-primary"
    >
      <div data-scroll-reveal class="mx-auto max-w-4xl px-4 py-24 sm:px-6">
        <h2 id="faq-heading" class="display-wide mb-10 text-2xl text-text-primary sm:text-4xl">
          {{ $t('landing.faq.title') }}
        </h2>

        <div class="divide-y divide-border-hairline border-y border-border-hairline">
          <details
            v-for="itemKey in faqKeys"
            :key="itemKey"
            class="orbital-details group py-5"
          >
            <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal">
              <span>{{ $t(`landing.faq.${itemKey}.q`) }}</span>
              <ChevronDown class="h-4 w-4 shrink-0 text-text-muted motion-safe:transition-transform motion-safe:duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div class="mt-4 space-y-2 text-sm leading-relaxed text-text-muted">
              <p>{{ $t(`landing.faq.${itemKey}.a`) }}</p>
              <p v-if="itemKey === 'q5'">
                <a
                  href="mailto:contact@klox.dev"
                  class="text-signal hover:underline"
                >
                  contact@klox.dev
                </a>
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  </div>
</template>
