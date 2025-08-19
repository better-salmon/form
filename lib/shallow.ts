/* eslint-disable sonarjs/different-types-comparison */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    return false;
  }

  const aKeys = Object.keys(a as object);
  const bKeys = Object.keys(b as object);
  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (const aKey of aKeys) {
    const key = aKey as keyof T & string;

    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false;
    }

    if (!Object.is(a[key], b[key])) {
      return false;
    }
  }

  return true;
}
