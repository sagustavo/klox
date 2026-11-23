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
    '/app': { ssr: false },
    '/app/**': { ssr: false },
    '/pt-br/app': { ssr: false },
    '/pt-br/app/**': { ssr: false },
    '/login': { ssr: false },
    '/pt-br/login': { ssr: false },
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
});
