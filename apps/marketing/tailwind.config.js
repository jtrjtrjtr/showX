/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        ground: '#FAFAFA',
        cream: '#F4F4F0',
        accent: '#E4FF1A',
        'accent-deep': '#B8CC00',
        muted: '#6B6B6B',
        rule: '#E0E0DC',
        paper: '#EDEDE8',
        signal: '#FF3B3B',
      },
      fontFamily: {
        display: ['"GT America"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
      },
      fontSize: {
        'display-1': ['clamp(3.5rem, 8vw, 7.5rem)', { lineHeight: '0.95', letterSpacing: '-0.04em' }],
        'display-2': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.035em' }],
        'display-3': ['clamp(1.75rem, 3vw, 2.75rem)', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
      },
      animation: {
        'fade-up': 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fadeIn 0.6s ease-out both',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
