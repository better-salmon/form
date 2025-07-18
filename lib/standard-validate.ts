import type { StandardSchemaV1 } from "@standard-schema/spec";

export function standardValidate<T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
) {
  const result = schema["~standard"].validate(input);

  if (result instanceof Promise) {
    throw new TypeError("Schema validation must be synchronous");
  }

  if (!result.issues) {
    return;
  }

  return result.issues;
}

export async function standardValidateAsync<T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
) {
  const result = await schema["~standard"].validate(input);

  if (!result.issues) {
    return;
  }

  return result.issues;
}
