// Enable React act environment for React 18/19 in Vitest browser mode
// See https://react.dev/reference/react/act#act-in-tests for details
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Only configure vitest-browser-react in actual browser runs
if (typeof document !== "undefined") {
  await import("vitest-browser-react");
  const { configure } = await import("vitest-browser-react/pure");
  configure({
    reactStrictMode: true,
  });
}
