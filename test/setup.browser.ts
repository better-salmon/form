// Enable React act environment for React 18/19 in Vitest browser mode
// See https://react.dev/reference/react/act#act-in-tests for details
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import "vitest-browser-react";

import { configure } from "vitest-browser-react/pure";

configure({
  // disabled by default
  reactStrictMode: true,
});
