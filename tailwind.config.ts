import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#C5A46D",
        white: "#FFFFFF",
        beige: "#EAE3D9",
        "beige-light": "#F5F1EB",
        charcoal: "#2E2E2E",
        midnight: "#1F2B38",
        muted: "#8a8070",
      },
      fontFamily: {
        playfair: ["var(--font-playfair)", "Georgia", "serif"],
        lato: ["var(--font-lato)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
