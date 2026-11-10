/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        blush: {
          50: "#FFF5F8",
          100: "#FDE8F0",
          200: "#FBD1E1",
          300: "#F9A8C9",
          400: "#F285B2",
          500: "#E96E9F",
          600: "#DB5C8E",
          700: "#B84474",
        },
        sage: {
          100: "#E8F4EC",
          200: "#CDE8D7",
          300: "#A8D5BA",
          400: "#86C19F",
          700: "#3F7D5A",
        },
        peach: {
          100: "#FFEFD9",
          200: "#FFD6A5",
          700: "#A5681F",
        },
        ink: "#4A4453",
      },
      fontFamily: {
        script: ['"Pacifico"', "cursive"],
        sans: ['"Poppins"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn .35s ease-out both",
        "pulse-soft": "pulse 2.2s cubic-bezier(.4,0,.6,1) infinite",
      },
    },
  },
  plugins: [],
};
