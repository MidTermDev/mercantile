import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0f1c16",
        panel: "#14241c",
        panel2: "#1b3327",
        line: "#2c4a3a",
        ink: "#e8e2d0",
        mute: "#9db3a4",
        gold: "#e8b923",
        gold2: "#d4a017",
        emerald: "#2ea56a",
        err: "#e06a5a",
      },
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Cinzel"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: { panel: "0 2px 0 0 #0a140f, 0 0 0 1px #2c4a3a" },
    },
  },
  plugins: [],
} satisfies Config;
