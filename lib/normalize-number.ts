/**
 * Generic number normalizer with bounds, integer coercion, and fallback.
 */
export function normalizeNumber(
  value: unknown,
  options: {
    fallback: number;
    min?: number;
    max?: number;
    integer?: "floor" | "ceil" | "round";
  },
): number {
  const { fallback, min, max, integer } = options;

  let normalized =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

  switch (integer) {
    case "ceil": {
      normalized = Math.ceil(normalized);
      break;
    }
    case "round": {
      normalized = Math.round(normalized);
      break;
    }
    case "floor": {
      normalized = Math.floor(normalized);
      break;
    }
  }

  if (typeof min === "number") {
    normalized = Math.max(min, normalized);
  }
  if (typeof max === "number") {
    normalized = Math.min(max, normalized);
  }
  return normalized;
}

/**
 * Normalizes a debounce value to a non-negative finite integer milliseconds value.
 * Non-finite/invalid -> 0. Decimals are rounded to better match intent.
 */
export function normalizeDebounceMs(value: unknown): number {
  return normalizeNumber(value, { fallback: 0, min: 0, integer: "round" });
}
