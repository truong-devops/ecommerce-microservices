/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff3ef',
          100: '#ffe4dc',
          200: '#ffc7b5',
          500: '#ee4d2d',
          600: '#dc4427',
          700: '#b9381f'
        }
      },
      boxShadow: {
        panel: '0 4px 24px rgba(24, 24, 27, 0.08)'
      }
    }
  },
  plugins: []
};
