import eslint from "@eslint/js";
import hooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "build/**", "examples/**", "worker/**", "db/**", "drizzle/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: hooks.configs.flat.recommended.rules,
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: { globals: { URL: "readonly" } },
  },
);
