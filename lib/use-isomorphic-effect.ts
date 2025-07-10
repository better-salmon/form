import { useEffect, useLayoutEffect } from "react";

export const useIsomorphicEffect =
  // eslint-disable-next-line unicorn/prefer-global-this, unicorn/no-typeof-undefined
  typeof window === "undefined" ? useEffect : useLayoutEffect;
