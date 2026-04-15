import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        tg: {
          blue: '#2AABEE',
          'blue-dark': '#229ED9',
          bg: '#FFFFFF',
          'bg-secondary': '#F4F4F5',
          'bg-dark': '#17212B',
          'bg-dark-secondary': '#232E3C',
          'bg-dark-tertiary': '#0E1621',
          sidebar: '#F4F4F5',
          'sidebar-dark': '#232E3C',
          text: '#000000',
          'text-secondary': '#707579',
          'text-dark': '#FFFFFF',
          'text-dark-secondary': '#8D9BA8',
          bubble: '#EFFDDE',
          'bubble-dark': '#2B5278',
          'bubble-in': '#FFFFFF',
          'bubble-in-dark': '#182533',
          border: '#E4E4E7',
          'border-dark': '#2B3A4A',
          green: '#4FAE4E',
          red: '#E53935',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'typing-dot': 'typing-dot 1.4s infinite ease-in-out',
        'message-in': 'message-in 0.2s ease-out',
        'fade-in': 'fade-in 0.15s ease-out',
        'slide-up': 'slide-up 0.2s ease-out',
      },
      keyframes: {
        'typing-dot': {
          '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '30%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        'message-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      boxShadow: {
        bubble: '0 1px 2px rgba(0,0,0,0.12)',
        panel: '0 4px 24px rgba(0,0,0,0.08)',
        modal: '0 8px 40px rgba(0,0,0,0.16)',
      },
    },
  },
  plugins: [],
}

export default config
