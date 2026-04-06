/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff4ef',
          100: '#ffe7dc',
          500: '#ee4d2d',
          600: '#db4729',
          700: '#b83f25'
        }
      },
      boxShadow: {
        panel: '0 4px 24px rgba(24, 24, 27, 0.08)'
      }
    }
  },
  plugins: []
};
