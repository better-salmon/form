import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    "lib/**/*.{ts,tsx}",
    "!lib/**/__tests__/**",
    "!lib/**/*.test.ts",
    "!lib/**/*.test.tsx",
    "!lib/**/types-tests/**",
  ],
  outDir: "dist-lib",
  clean: true,
  target: "chrome138",
  platform: "browser",
  unbundle: true,
  dts: {
    tsconfig: "tsconfig.lib.json",
  },
  inputOptions: {
    checks: {
      circularDependency: true,
    },
  },
});
