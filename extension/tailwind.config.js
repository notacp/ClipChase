/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        "yt-black": "#0F0F0F",
        "yt-red": "#E03030",
        "yt-gray": "#1E1E1E",
        "yt-light-gray": "#909090",
        "yt-elevated": "#181818",
        "yt-dark-gray": "#272727",
        "yt-hover": "#3d3d3d",
      },
    },
  },
  plugins: [],
};
