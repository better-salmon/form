import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/test/e2e/**",
      "node_modules/**",
      "dist/**",
    ],
  },
});
