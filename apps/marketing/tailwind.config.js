/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1C1816',
        ground: '#F8F5F0',
        cream: '#FAF7F2',
        accent: '#1E5A6E',
        'accent-deep': '#143C4A',
        muted: '#6B6661',
        rule: '#D9D2C7',
        paper: '#EFEAE0',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.025em',
      },
      fontSize: {
        'display-1': ['clamp(3.5rem, 8vw, 7rem)', { lineHeight: '0.95', letterSpacing: '-0.04em' }],
        'display-2': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.035em' }],
        'display-3': ['clamp(1.75rem, 3vw, 2.75rem)', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
      },
      animation: {
        'fade-up': 'fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fadeIn 0.6s ease-out both',
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
