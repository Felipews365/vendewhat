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
        /** Landing / marketing — teal + coral (alternativa ao roxo+ciano do ref.) */
        landing: {
          primary: "#0f766e",
          "primary-hover": "#115e59",
          "primary-muted": "#0d9488",
          accent: "#ea580c",
          "accent-hover": "#c2410c",
          "accent-soft": "#fff7ed",
          ink: "#134e4a",
        },
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
