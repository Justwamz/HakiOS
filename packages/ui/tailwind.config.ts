import type { Config } from 'tailwindcss'

const config: Config = {
  content: [],    // apps extend this and add their own content globs
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0a5c3e',
          light: '#2d7a4f',
        },
        accent: {
          DEFAULT: '#c49a28',
          light: '#e8c55a',
        },
        surface: '#ffffff',
        background: '#f7f5f0',
        'text-primary': '#1e1e1a',
        'text-secondary': '#4a4a45',
        'text-muted': '#8a8a82',
        border: '#e0ded8',
        status: {
          overdue: '#c0392b',
          urgent: '#d4820a',
          upcoming: '#1a6b9a',
          resolved: '#2d7a4f',
          neutral: '#8a8a82',
        },
        dark: {
          background: '#141412',
          surface: '#1e1e1a',
          'text-primary': '#f0ede6',
          'text-secondary': '#b0ada6',
          border: '#2e2e28',
          primary: '#1a8a5a',
          accent: '#d4aa3a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
