export function dedupePrimitiveArray<
  T extends string | number | boolean | symbol,
>(array: T[]): T[] {
  return [...new Set(array)];
}
