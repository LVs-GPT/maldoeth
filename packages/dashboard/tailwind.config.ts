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
        maldo: {
          300: "#5cffb0",
          400: "#00e87a",
          500: "#00c968",
          600: "#00a857",
        },
      },
    },
  },
  plugins: [],
};
export default config;
