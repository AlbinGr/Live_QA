import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#17302b',
        forest: '#12352f',
        pine: '#1c5c4f',
        mint: '#dff2e9',
        cream: '#f7f5ee',
        coral: '#e7684f',
        gold: '#eabf5a',
      },
      boxShadow: {
        card: '0 20px 50px -28px rgba(18, 53, 47, 0.35)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
