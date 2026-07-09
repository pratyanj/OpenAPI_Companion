import type { Config } from 'tailwindcss'

// Theming (DD-025): light/dark via the `.dark` class toggled by ThemeManager
// (Sprint 3). Colors map to CSS variables defined in src/styles/index.css so
// tokens can switch without a rebuild. See planning/09_UI_PLAN.md §0.
export default {
  content: ['./src/**/*.{ts,tsx,html}', './index.html'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'var(--oac-bg)',
        surface: 'var(--oac-surface)',
        border: 'var(--oac-border)',
        text: 'var(--oac-text)',
        muted: 'var(--oac-muted)',
        primary: 'var(--oac-primary)',
        success: 'var(--oac-success)',
        warning: 'var(--oac-warning)',
        danger: 'var(--oac-danger)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
