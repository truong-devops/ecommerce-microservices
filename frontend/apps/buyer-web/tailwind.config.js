/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff2ee',
          100: '#ffe2d9',
          500: '#ef5127',
          600: '#dc3f17',
          700: '#bc2f10'
        }
      },
      boxShadow: {
        card: '0 2px 8px rgba(18, 18, 18, 0.08)'
      }
    }
  },
  plugins: []
};
