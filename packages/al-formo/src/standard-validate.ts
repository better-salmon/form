import type { StandardSchemaV1 } from "@standard-schema/spec";

export function standardValidate<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  input: StandardSchemaV1.InferInput<TSchema>,
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

export async function standardValidateAsync<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  input: StandardSchemaV1.InferInput<TSchema>,
) {
  const result = await schema["~standard"].validate(input);

  if (!result.issues) {
    return;
  }

  return result.issues;
}
