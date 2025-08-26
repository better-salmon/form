export function dedupePrimitiveArray<
  TPrimitive extends string | number | boolean | symbol,
>(array: TPrimitive[]): TPrimitive[] {
  return [...new Set(array)];
}
