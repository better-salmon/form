import { defineConfig, type UserConfig } from "tsdown";

export default defineConfig(({ watch }) => {
  const minify = process.env.MINIFY === "true";

  const testEntries = [
    "!src/**/*.test.ts",
    "!src/**/*.test.tsx",
    "!src/**/*.test-d.ts",
    "!src/**/*.test-d.tsx",
  ];

  const entriesSet = new Set(testEntries);

  if (minify) {
    entriesSet.add("src/create-form-hook.tsx");
  } else {
    entriesSet.add("src/**/*.{ts,tsx}");
  }

  return {
    entry: [...entriesSet],
    outDir: "dist",
    clean: !watch,
    watch,
    target: "chrome138",
    platform: "browser",
    unbundle: !minify,
    dts: {
      tsconfig: "tsconfig.lib.json",
    },
    inputOptions: {
      checks: {
        circularDependency: true,
      },
    },
    minify,
  } satisfies UserConfig;
});
