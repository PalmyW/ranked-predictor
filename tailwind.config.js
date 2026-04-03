/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        shoulders: ['"Big Shoulders"', 'sans-serif'],
      },
      colors: {
        // Neutral grays — palette row 5
        gray: {
          50:  '#F4F5F6',
          100: '#EDEFF0',
          200: '#C2C9CC',
          300: '#9BA3A8',
          400: '#8B9296',
          500: '#7B8285',
          600: '#595F61',
          700: '#383B3D',
          800: '#282A2C',
          900: '#191B1C',
          950: '#0D0E0F',
        },
        // Active / live states — palette row 2 (steel blue)
        blue: {
          50:  '#EBF5FA',
          100: '#D9EDF5',
          200: '#B3D8EC',
          300: '#90CCE5',
          400: '#67A6C0',
          500: '#508398',
          600: '#395F6E',
          700: '#213A44',
          800: '#162630',
          900: '#0B191E',
          950: '#060D10',
        },
        // Logo tiles — palette row 1 (burnt orange)
        slate: {
          100: '#FEE8E2',
          200: '#FDD1C3',
          300: '#FCB29B',
          400: '#FCB29B',
          500: '#FA7146',
          600: '#D64A17',
          700: '#9E340E',
          800: '#661F06',
          900: '#3A1503',
          950: '#320B01',
        },
        // Accents (tiers, save/share buttons) — palette row 1 (burnt orange)
        purple: {
          50:  '#FEF5F2',
          100: '#FEE8E2',
          200: '#FDD1C3',
          300: '#FCB29B',
          400: '#FA7146',
          500: '#D64A17',
          600: '#9E340E',
          700: '#661F06',
          800: '#420D03',
          900: '#320B01',
          950: '#1A0500',
        },
        // Win states — palette row 3 (teal green)
        green: {
          50:  '#ECFFFB',
          100: '#DFFFF2',
          200: '#A0FDD8',
          300: '#5CF5BE',
          400: '#00F2BC',
          500: '#00C699',
          600: '#009F7B',
          700: '#00765B',
          800: '#004D3A',
          900: '#00271C',
          950: '#001610',
        },
      },
    },
  },
  plugins: [],
}
