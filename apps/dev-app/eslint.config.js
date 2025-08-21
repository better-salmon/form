import base from "@repo/shared-eslint/base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    extends: [base],
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.app.json",
          "./tsconfig.node.json",
          "./tsconfig.playwright.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
