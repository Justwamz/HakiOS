import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0a5c3e',
          light: '#0d7a53',
        },
        background: '#f7f5f0',
        surface: '#ffffff',
        border: '#e0ded8',
        text: {
          primary: '#1e1e1a',
          secondary: '#4a4a45',
          muted: '#8a8a82',
        },
        status: {
          overdue: '#c0392b',
          urgent: '#d4820a',
          upcoming: '#1a6b9a',
          'active-bg': '#dcfce7',
          'active-text': '#166534',
          'pending-bg': '#fef9c3',
          'pending-text': '#854d0e',
          'adjourned-bg': '#dbeafe',
          'adjourned-text': '#1e40af',
          'on-appeal-bg': '#ede9fe',
          'on-appeal-text': '#5b21b6',
          'settled-bg': '#d1fae5',
          'settled-text': '#065f46',
          'closed-bg': '#f1f5f9',
          'closed-text': '#475569',
          'dormant-bg': '#f8fafc',
          'dormant-text': '#64748b',
          'conflict-bg': '#fef2f2',
          'conflict-border': '#fecaca',
          'conflict-text': '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
