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
