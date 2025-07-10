import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "lib/**/*.{ts,tsx}",
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
