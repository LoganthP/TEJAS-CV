/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          dark: '#0a0d12',
          card: '#0f141b',
          surface: '#121820',
          hover: '#18202b',
        },
        decision: {
          accept: '#34d399',
          review: '#fbbf24',
          quarantine: '#f43f5e',
        },
        accent: {
          cyan: '#22d3ee',
          violet: '#a78bfa',
        },
        severity: {
          info: '#94a3b8',
          low: '#38bdf8',
          medium: '#fbbf24',
          high: '#fb923c',
          critical: '#f43f5e',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        'glass-edge': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
        'glow-cyan': '0 0 25px -5px rgba(34, 211, 238, 0.3)',
        'glow-accept': '0 0 30px -5px rgba(52, 211, 153, 0.4)',
        'glow-review': '0 0 30px -5px rgba(251, 191, 36, 0.4)',
        'glow-quarantine': '0 0 30px -5px rgba(244, 63, 94, 0.4)',
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' },
        }
      }
    },
  },
  plugins: [],
}
