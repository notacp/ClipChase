/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        "yt-black": "#141414",
        "yt-red": "#FF4500",
        "yt-gray": "#1c1c1c",
        "yt-light-gray": "#7a7a7a",
        "yt-elevated": "#191919",
        "yt-dark-gray": "#2a2a2a",
        "yt-hover": "#3d3d3d",
        "yt-text": "#e8e8e8",
        "yt-tert": "#3d3d3d",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.75)" },
        },
        fadeSlideUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 1.1s ease-in-out infinite",
        fadeSlideUp: "fadeSlideUp 0.3s ease",
      },
    },
  },
  plugins: [],
};
