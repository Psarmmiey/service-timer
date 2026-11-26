import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "electron.vite.config.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
