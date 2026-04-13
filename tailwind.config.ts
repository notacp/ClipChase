import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                yt: {
                    red: "#E03030",
                    black: "#0F0F0F",
                    gray: "#1E1E1E",
                    "light-gray": "#909090",
                    elevated: "#181818",
                }
            },
        },
    },
    plugins: [],
};
export default config;
