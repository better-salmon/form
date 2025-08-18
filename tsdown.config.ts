import { defineConfig, type UserConfig } from "tsdown";

export default defineConfig(() => {
  const minify = process.env.MINIFY === "true";

  const testEntries = [
    "!lib/**/*.test.ts",
    "!lib/**/*.test.tsx",
    "!lib/**/*.test-d.ts",
    "!lib/**/*.test-d.tsx",
  ];

  const entriesSet = new Set(testEntries);

  if (minify) {
    entriesSet.add("lib/create-form-hook.tsx");
  } else {
    entriesSet.add("lib/**/*.{ts,tsx}");
  }

  return {
    entry: [...entriesSet],
    outDir: "dist-lib",
    clean: true,
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
