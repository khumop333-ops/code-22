import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0e14",
          900: "#11151d",
          850: "#161b26",
          800: "#1c2230",
          700: "#283042",
          600: "#3a455c",
        },
        accent: {
          DEFAULT: "#7c9cff",
          dim: "#5a78d6",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
