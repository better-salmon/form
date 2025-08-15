import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@lib": path.resolve(__dirname, "./lib"),
    },
  },
  optimizeDeps: {
    include: ["vitest-browser-react"],
  },
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  plugins: [react()],
  test: {
    typecheck: {
      include: ["lib/**/*.test-d.ts"],
      tsconfig: path.resolve(__dirname, "./tsconfig.lib.json"),
    },
    include: ["lib/**/*.test.ts", "lib/**/*.test.tsx"],
    setupFiles: [path.resolve(__dirname, "./test/setup.browser.ts")],
    browser: {
      enabled: false,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
  },
});
