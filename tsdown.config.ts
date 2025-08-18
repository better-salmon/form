import { defineConfig, type UserConfig } from "tsdown";

export default defineConfig(() => {
  const minify = process.env.MINIFY === "true";

  const entry = [
    "lib/**/*.{ts,tsx}",
    "!lib/**/*.test.ts",
    "!lib/**/*.test.tsx",
    "!lib/**/*.test-d.ts",
    "!lib/**/*.test-d.tsx",
  ];

  if (minify) {
    entry.shift();
    entry.push("lib/create-form-hook.tsx");
  }

  return {
    entry,
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
