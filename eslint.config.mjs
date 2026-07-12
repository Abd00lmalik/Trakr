import { FlatCompat } from "@eslint/eslintrc";
import prettier from "eslint-config-prettier";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "coverage/**", "dist/**"],
  },
  ...compat.extends("next/core-web-vitals"),
  prettier,
];

export default eslintConfig;
