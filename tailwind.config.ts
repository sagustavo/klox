import type { Config } from 'tailwindcss';

export default <Partial<Config>>{
  darkMode: 'class',
  content: ['./app/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'oklch(var(--bg-primary-ch) / <alpha-value>)',
          elevated: 'oklch(var(--bg-elevated-ch) / <alpha-value>)',
          secondary: 'oklch(var(--bg-secondary-ch) / <alpha-value>)',
          hover: 'oklch(var(--bg-hover-ch) / <alpha-value>)',
        },
        border: {
          hairline: 'var(--border-hairline)',
          subtle: 'var(--border-subtle)',
          input: 'var(--border-input)',
        },
        text: {
          primary: 'oklch(var(--text-primary-ch) / <alpha-value>)',
          muted: 'oklch(var(--text-muted-ch) / <alpha-value>)',
          faint: 'oklch(var(--text-faint-ch) / <alpha-value>)',
        },
        signal: {
          DEFAULT: 'oklch(var(--signal-ch) / <alpha-value>)',
          soft: 'var(--signal-soft)',
        },
        accent: {
          DEFAULT: 'oklch(var(--accent-ch) / <alpha-value>)',
          hover: 'oklch(var(--accent-hover-ch) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'oklch(var(--destructive-ch) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['"Michroma"', '"Michroma Fallback"', 'ui-sans-serif', 'sans-serif'],
        sans: ['"Geist"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        ui: ['0.8125rem', { lineHeight: '1.45' }],
      },
      borderRadius: {
        orbital: '2px',
      },
    },
  },
};
