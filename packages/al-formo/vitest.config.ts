import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@al-formo": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    typecheck: {
      enabled: true,
      include: ["src/**/*.test-d.ts"],
      tsconfig: path.resolve(__dirname, "./tsconfig.lib.json"),
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
