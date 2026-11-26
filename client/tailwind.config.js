/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        hand: ['Caveat', 'Segoe Print', 'Bradley Hand', 'cursive'],
      },
      colors: {
        felt: { DEFAULT: '#2f9e63', dark: '#237a4c', light: '#e6f4ec' },
        ink: '#16241c',
        cream: '#f7f1e5',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        pop: { '0%': { transform: 'scale(.85)', opacity: 0 }, '100%': { transform: 'scale(1)', opacity: 1 } },
        fall: {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: 1 },
          '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: 0.9 },
        },
        'heart-break': {
          '0%': { transform: 'scale(1)' },
          '20%': { transform: 'scale(1.55) rotate(-14deg)' },
          '45%': { transform: 'scale(.8) rotate(10deg)' },
          '100%': { transform: 'scale(1)' },
        },
        'float-up': {
          '0%': { transform: 'translateY(0) scale(.6)', opacity: 0 },
          '15%': { transform: 'translateY(-8px) scale(1.2)', opacity: 1 },
          '100%': { transform: 'translateY(-70px) scale(1)', opacity: 0 },
        },
        'card-flip': { '0%': { transform: 'rotateY(0deg)' }, '50%': { transform: 'rotateY(90deg)' }, '100%': { transform: 'rotateY(0deg)' } },
        'card-shuffle': { '0%,100%': { transform: 'translateX(0) rotate(0)' }, '25%': { transform: 'translateX(var(--dx,24px)) rotate(6deg)' }, '75%': { transform: 'translateX(calc(var(--dx,24px) * -1)) rotate(-6deg)' } },
        'spin-slow': { to: { transform: 'rotate(360deg)' } },
        'turn-pulse': {
          '0%, 100%': { boxShadow: '0 6px 20px rgba(22,36,28,.18), 0 0 0 0 rgba(242,161,0,.55)' },
          '50%': { boxShadow: '0 6px 20px rgba(22,36,28,.18), 0 0 0 10px rgba(242,161,0,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .35s ease-out both',
        pop: 'pop .25s ease-out both',
        fall: 'fall linear infinite',
        'heart-break': 'heart-break .6s ease-out',
        'spin-slow': 'spin-slow 40s linear infinite',
        'turn-pulse': 'turn-pulse 1.6s ease-in-out infinite',
        'card-flip': 'card-flip .9s ease-in-out infinite',
        'card-shuffle': 'card-shuffle .8s ease-in-out infinite',
        'float-up': 'float-up 1.4s ease-out both',
      },
    },
  },
  plugins: [],
};
