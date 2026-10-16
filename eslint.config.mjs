import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The URL rules (KNOWLEDGE.md §4) match control characters on purpose, and
      // some reason templates contain non-breaking spaces as typed in the spec.
      "no-control-regex": "off",
      "no-irregular-whitespace": "off",
    },
  },
]);
