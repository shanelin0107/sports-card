import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "brand-gradient":   "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
        "brand-gradient-r": "linear-gradient(to right, #6366f1 0%, #3b82f6 100%)",
      },
      boxShadow: {
        "brand":    "0 0 24px rgba(99, 102, 241, 0.18)",
        "brand-sm": "0 0 12px rgba(99, 102, 241, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
