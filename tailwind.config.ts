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
        whatsapp: {
          DEFAULT: "#25D366",
          dark: "#128C7E",
        },
        /** Loja pública — estilo boutique / moda feminina */
        boutique: {
          DEFAULT: "#c9a8ac",
          dark: "#a67c82",
          deeper: "#7d4e55",
          wine: "#5c2e36",
          light: "#f8f2f3",
          muted: "#ede4e5",
          cream: "#faf8f8",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)"],
        mono: ["var(--font-geist-mono)"],
      },
    },
  },
  plugins: [],
};

export default config;
