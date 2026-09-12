import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9edff",
          400: "#4da3ff",
          500: "#1e7fe0",
          600: "#1564b4",
          700: "#124f8c",
        },
      },
    },
  },
  plugins: [],
};
export default config;
