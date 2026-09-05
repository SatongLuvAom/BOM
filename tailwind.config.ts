import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Sarabun', 'Segoe UI', 'sans-serif'],
        mono: ['SFMono-Regular', 'IBM Plex Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // Existing utility-based screens share the same neutral surface palette.
        slate: {
          50: '#f5f5f7', 100: '#ededf0', 200: '#e5e5e8', 300: '#c7c7cc',
          400: '#85858c', 500: '#626268', 600: '#515157', 700: '#3a3a40',
          800: '#2c2c31', 900: '#232327', 950: '#1d1d1f',
        },
        blue: {
          50: '#f0f6ff', 100: '#e0edff', 200: '#c3dcff', 300: '#99c4ff',
          400: '#59a2ff', 500: '#1683ef', 600: '#0071e3', 700: '#0066cc',
          800: '#0055aa', 900: '#163f73', 950: '#172c49',
        },
      },
    },
  },
  plugins: [],
}

export default config
