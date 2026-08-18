import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#140f08",
        panel: "#241a0f",
        panel2: "#30240f",
        line: "#4f3d20",
        ink: "#efe4cb",
        mute: "#b39c74",
        gold: "#eeb92e",
        gold2: "#b8892a",
        emerald: "#5aa869",
        err: "#d9694a",
        parch: "#e9dbb6",
        "parch-ink": "#2c2013",
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
