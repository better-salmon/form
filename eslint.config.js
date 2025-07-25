import "eslint-plugin-only-warn";
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import eslintReact from "@eslint-react/eslint-plugin";
import reactRefresh from "eslint-plugin-react-refresh";
import reactCompiler from "eslint-plugin-react-compiler";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import eslintPluginSonarJs from "eslint-plugin-sonarjs";
import eslintPluginDeMorgan from "eslint-plugin-de-morgan";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["dist", "dist-lib", "node_modules", "dist-ssr"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.recommended,
      reactRefresh.configs.vite,
      reactCompiler.configs.recommended,
      eslintPluginUnicorn.configs.recommended,
      eslintReact.configs["recommended-typescript"],
      jsxA11y.flatConfigs.strict,
      eslintPluginSonarJs.configs.recommended,
      eslintPluginDeMorgan.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: [
          "./tsconfig.node.json",
          "./tsconfig.app.json",
          "./tsconfig.lib.json",
          "./tsconfig.fake.json",
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      curly: "warn",
      eqeqeq: "warn",
      "unicorn/prevent-abbreviations": "off",
      "unicorn/no-null": "off",
      "react-refresh/only-export-components": "off",
      "unicorn/no-typeof-undefined": ["error", { checkGlobalVariables: true }],
      "react-hooks/exhaustive-deps": [
        "warn",
        {
          additionalHooks: "(useIsomorphicEffect)",
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
      "@typescript-eslint/no-invalid-void-type": "off",
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "sonarjs/function-return-type": "off",
    },
  },
]);
