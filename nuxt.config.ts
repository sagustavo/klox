// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-05-01',
  future: {
    compatibilityVersion: 4,
  },
  devtools: { enabled: false },
  telemetry: false,
  ssr: true,

  routeRules: {
    '/': { prerender: true },
    '/pt-br': { prerender: true },
    '/app': {
      ssr: false,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    '/app/**': {
      ssr: false,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    '/pt-br/app': {
      ssr: false,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    '/pt-br/app/**': {
      ssr: false,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    '/login': {
      ssr: false,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    '/pt-br/login': {
      ssr: false,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    '/api/**': { cors: false },
  },

  modules: [
    '@nuxtjs/tailwindcss',
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@pinia/nuxt',
    '@vueuse/nuxt',
  ],

  css: ['~/assets/css/tokens.css'],

  app: {
    pageTransition: { name: 'orbital-page', mode: 'out-in' },
    head: {
      title: 'Klox — Keyboard-First Time Tracking & Analytics',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark light' },
        {
          name: 'description',
          content:
            'Fast, keyboard-first time tracking with instant suggestions, AI auto-fill, clear analytics, and Toggl Track CSV support.',
        },
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/images/klox-favicon.png' },
        { rel: 'apple-touch-icon', href: '/images/klox-favicon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Michroma&display=swap',
        },
      ],
    },
  },

  colorMode: {
    classSuffix: '',
    preference: 'dark',
    fallback: 'dark',
    storageKey: 'klox_color_mode',
  },

  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    lazy: true,
    langDir: 'locales',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.ts' },
      { code: 'pt-br', language: 'pt-BR', name: 'Português (BR)', file: 'pt-BR.ts' },
    ],
    bundle: {
      optimizeTranslationDirective: false,
    },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'klox_locale',
      redirectOn: 'root',
    },
  },

  runtimeConfig: {
    geminiApiKey: '',
    geminiModel: 'gemini-3.8-flash',
    adoEncryptionKey: '',
    public: {
      firebaseApiKey: '',
      firebaseAuthDomain: '',
      firebaseProjectId: '',
      firebaseStorageBucket: '',
      firebaseMessagingSenderId: '',
      firebaseAppId: '',
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'three-vendor';
            }
          },
        },
      },
    },
  },

  hooks: {
    'build:manifest'(manifest) {
      const webglRoots = Object.entries(manifest).filter(([key]) =>
        key.includes('OrbitalHorizonScene')
      );
      const usedElsewhere = new Set<string>();
      for (const [key, entry] of Object.entries(manifest)) {
        if (key.includes('OrbitalHorizonScene')) {
          continue;
        }
        for (const imp of entry.imports ?? []) {
          usedElsewhere.add(imp);
        }
      }
      for (const [, entry] of webglRoots) {
        entry.prefetch = false;
        entry.preload = false;
        for (const imp of entry.imports ?? []) {
          if (!usedElsewhere.has(imp) && manifest[imp]) {
            manifest[imp].prefetch = false;
            manifest[imp].preload = false;
          }
        }
      }
    },
  },
});
