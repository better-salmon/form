import base from "@repo/shared-eslint/base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    extends: [base],
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.lib.json",
          "./tsconfig.lib.test.json",
          "./tsconfig.node.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]);
