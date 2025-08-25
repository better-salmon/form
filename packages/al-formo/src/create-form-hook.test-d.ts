/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable sonarjs/assertions-in-tests */

import { describe, expectTypeOf, it } from "vitest";
import { createForm } from "@al-formo/create-form-hook";
import type { RespondContext } from "@al-formo/create-form-hook";
import type { FieldEvent } from "@al-formo/create-form-hook";
import type { UseFormReturn } from "@al-formo/create-form-hook";
import type { StandardSchemaV1 } from "@standard-schema/spec";

describe("defineField option variants", () => {
  type Form = {
    name: string;
    email: string;
  };

  const { defineField } = createForm<Form>();

  it("no validation: only name allowed; extras alone should error", () => {
    defineField({ name: "name" });

    // watch without respond/respondAsync → not allowed
    defineField({
      name: "name",
      // @ts-expect-error watch require respond/respondAsync
      watch: { fields: { email: true } },
    });

    // standardSchema alone → not allowed
    // @ts-expect-error schema requires respond/respondAsync
    defineField({
      name: "name",
      standardSchema: {} as unknown as StandardSchemaV1<string>,
    });

    // debounceMs alone → not allowed
    // @ts-expect-error debounceMs requires respondAsync
    defineField({ name: "name", debounceMs: 200 });
  });

  it("sync-only: respond allowed, debounceMs disallowed, watch OK", () => {
    const fieldOption = defineField({
      name: "name",
      watch: {
        self: ["change", "blur"] as unknown as FieldEvent[],
        fields: { email: true },
      },
      respond: (context) => {
        expectTypeOf(context.value).toBeString();
        // schedule helper not available in sync-only context
        expectTypeOf(context.helpers).not.toHaveProperty("schedule");

        const issues = context.helpers.validateWithSchema();
        expectTypeOf(issues).toExtend<readonly unknown[] | undefined>();
        return context.helpers.validation.valid();
      },
    });

    expectTypeOf(fieldOption).toExtend<{ name: "name" }>();

    // self-referencing field in watch.fields should error
    defineField({
      name: "name",
      // @ts-expect-error cannot reference itself in watch.fields
      watch: { fields: { name: true } },
      respond: (c) => c.helpers.validation.valid(),
    });

    // unknown field in watch.fields should error
    defineField({
      name: "name",
      // @ts-expect-error unknown key "age"
      watch: { fields: { age: true } },
      respond: (c) => c.helpers.validation.valid(),
    });

    // invalid event string should error
    defineField({
      name: "name",
      watch: {
        // @ts-expect-error invalid event name
        self: ["focus"],
      },
      respond: (c) => c.helpers.validation.valid(),
    });

    // debounceMs is not allowed in sync-only
    // @ts-expect-error debounceMs is not allowed when only respond is provided
    defineField({
      name: "name",
      respond: (c) => c.helpers.validation.valid(),
      debounceMs: 100,
    });
  });

  it("async-only: respondAsync allowed, debounceMs allowed; respond disallowed unless both are provided", () => {
    defineField({
      name: "name",
      respondAsync: async (context) => {
        expectTypeOf(context.value).toBeString();
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();

        const issues = await context.helpers.validateWithSchemaAsync();
        expectTypeOf(issues).toExtend<readonly unknown[] | undefined>();

        return context.helpers.validation.valid();
      },
      debounceMs: 250,
      watch: { fields: { email: ["change", "submit"] } },
    });

    // returning invalid type from respondAsync should error
    defineField({
      name: "name",
      // @ts-expect-error respondAsync must return Promise<FinalValidationStatus>
      respondAsync: async () => {
        await Promise.resolve();
        return undefined;
      },
    });

    // respond + debounceMs without respondAsync → invalid combination
    // @ts-expect-error debounceMs requires respondAsync when respond is present
    defineField({
      name: "name",
      respond: (c) => c.helpers.validation.valid(),
      debounceMs: 100,
    });
  });

  it("sync+async: both respond and respondAsync allowed; schedule helper available in respond", () => {
    defineField({
      name: "name",
      standardSchema: {} as unknown as StandardSchemaV1<string>,
      respond: (context) => {
        // schedule is available when respondAsync is also provided
        const flow = context.helpers.schedule.auto(100);
        expectTypeOf(flow).toExtend<{ type: "async" }>();
        // also allowed to return a final status
        return context.helpers.validation.valid();
      },
      respondAsync: async (context) => {
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        await context.helpers.validateWithSchemaAsync();
        return context.helpers.validation.valid();
      },
      debounceMs: 50,
    });
  });

  it("standardSchema type must match field value type", () => {
    // correct schema type (string) for name
    defineField({
      name: "name",
      standardSchema: {} as unknown as StandardSchemaV1<string>,
      respond: (context) => context.helpers.validation.valid(),
    });

    // wrong schema type (number) for name should error
    defineField({
      name: "name",
      // @ts-expect-error schema type must be StandardSchemaV1<string>
      standardSchema: {} as unknown as StandardSchemaV1<number>,
      respond: (context) => context.helpers.validation.valid(),
    });
  });
});

describe("narrow form type", () => {
  type Form = {
    mode: "on" | "off";
    magicNumber: 42;
  };

  const { defineField } = createForm<Form>();
  it("should keep the type of the field value narrow", () => {
    defineField({
      name: "mode",
      respond: (context) => {
        expectTypeOf(context.value).toEqualTypeOf<"on" | "off">();
        expectTypeOf(context.value).not.toEqualTypeOf<string>();

        expectTypeOf(context.current.value).toEqualTypeOf<"on" | "off">();
        expectTypeOf(context.current.value).not.toEqualTypeOf<string>();
      },
    });
  });

  it("should keep the type of the other fields narrow", () => {
    defineField({
      name: "magicNumber",
      respond: (context) => {
        expectTypeOf(
          context.form.getSnapshot("magicNumber").value,
        ).toEqualTypeOf<42>();

        expectTypeOf(
          context.form.getSnapshot("magicNumber").value,
        ).not.toEqualTypeOf<number>();
      },
    });
  });
});

describe("generic D (details) propagation", () => {
  type Form = { name: string };
  type Details = { code: "A" | "B" };

  const { defineField } = createForm<Form, Details>();

  it("validation helpers accept and return Details; snapshots carry Details", () => {
    defineField({
      name: "name",
      respond: (context) => {
        const ok = context.helpers.validation.valid({ details: { code: "A" } });
        expectTypeOf(ok).toExtend<{ details?: Details }>();

        // @ts-expect-error wrong details shape
        context.helpers.validation.invalid({ details: { code: 123 } });

        expectTypeOf(context.current.validation).toExtend<{
          details?: Details;
        }>();
        return ok;
      },
    });
  });
});

describe("respond/respondAsync return-type discipline", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("respond cannot be async (must not return Promise)", () => {
    defineField({
      name: "name",
      // @ts-expect-error respond must not be async
      respond: async (context) => {
        await Promise.resolve();
        return context.helpers.validation.valid();
      },
    });
  });

  it("respondAsync must return a Promise<FinalValidationStatus>", () => {
    defineField({
      name: "name",
      // @ts-expect-error must return Promise<FinalValidationStatus>
      respondAsync: (context) => context.helpers.validation.valid(),
    });
  });
});

describe("schedule return gating", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("can return schedule when respondAsync exists", () => {
    defineField({
      name: "name",
      respond: (context: RespondContext<Form, "name">) =>
        context.helpers.schedule.auto(100),
      respondAsync: async (context) => {
        await Promise.resolve();
        return context.helpers.validation.valid();
      },
    });
  });

  it("cannot return schedule in sync-only", () => {
    defineField({
      name: "name",
      // @ts-expect-error schedule return is unavailable in sync-only
      respond: (context) => context.helpers.schedule.run(0),
    });
  });
});

describe("form API type-safety", () => {
  type Form = { name: string; count: 42 };
  const { defineField } = createForm<Form>();

  it("setValue/reset/submit enforce field names and types", () => {
    defineField({
      name: "name",
      respond: (context) => {
        context.form.setValue("name", "ok");
        // @ts-expect-error wrong type for 'name'
        context.form.setValue("name", 123);

        context.form.setValue("count", 42 as const);
        // @ts-expect-error must be the literal 42
        context.form.setValue("count", 41);

        context.form.reset("name");
        // @ts-expect-error unknown field
        context.form.reset("age");

        context.form.submit(["name", "count"] as const);
        // @ts-expect-error array contains unknown field
        context.form.submit(["age"] as const);

        return context.helpers.validation.valid();
      },
    });
  });
});

describe("watch shape", () => {
  type Form = { name: string; email: string };
  const { defineField } = createForm<Form>();

  it("supports boolean and empty arrays in fields; mount event allowed", () => {
    defineField({
      name: "name",
      watch: {
        self: ["mount"] as FieldEvent[],
        fields: { email: true },
      },
      respond: (c) => c.helpers.validation.valid(),
    });

    defineField({
      name: "name",
      watch: { fields: { email: [] } },
      respond: (c) => c.helpers.validation.valid(),
    });
  });

  it("rejects invalid event names in fields", () => {
    defineField({
      name: "name",
      watch: {
        fields: {
          email: [
            // @ts-expect-error invalid event name
            "focus",
          ],
        },
      },
      respond: (c) => c.helpers.validation.valid(),
    });
  });
});

describe("optional field schema and value types", () => {
  type Form = { age?: number };
  const { defineField } = createForm<Form>();

  it("context.value is number | undefined and schema must match", () => {
    defineField({
      name: "age",
      respond: (context) => {
        expectTypeOf(context.value).toEqualTypeOf<number | undefined>();
        return context.helpers.validation.valid();
      },
      standardSchema: {} as unknown as StandardSchemaV1<number | undefined>,
    });

    defineField({
      name: "age",
      // @ts-expect-error schema type must be StandardSchemaV1<number | undefined>
      standardSchema: {} as unknown as StandardSchemaV1<string | undefined>,
      respond: (context) => context.helpers.validation.valid(),
    });
  });
});

describe("RespondAsyncContext members", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("meta, validation, signal are correctly typed", () => {
    defineField({
      name: "name",
      respondAsync: async (context) => {
        await Promise.resolve();
        expectTypeOf(context.current.meta).toExtend<{
          isTouched: boolean;
          changeCount: number;
          submitCount: number;
        }>();
        expectTypeOf(context.current.validation).toHaveProperty("type");
        expectTypeOf(context.signal).toEqualTypeOf<AbortSignal>();
        return context.helpers.validation.valid();
      },
    });
  });
});

// =====================================
// Additional high-priority type tests
// =====================================

describe("defineField: name must be keyof T", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("rejects non-key names", () => {
    // @ts-expect-error "age" is not a key of Form
    defineField({ name: "age", respond: (c) => c.helpers.validation.valid() });
  });
});

describe("useForm API surface", () => {
  type Form = { name: string };
  const { useForm } = createForm<Form>();

  it("accepts correct options and returns UseFormReturn<T, D>", () => {
    expectTypeOf(useForm).parameter(0).toEqualTypeOf<{
      defaultValues: Form;
      debounceMs?: number;
      maxDispatchSteps?: number;
    }>();
    type Ret = ReturnType<typeof useForm>;
    expectTypeOf<Ret>().toEqualTypeOf<UseFormReturn<Form>>();
  });
});

describe("RespondContext.cause discriminant", () => {
  type Form = { name: string; email: string };
  type Cause = RespondContext<Form, "name">["cause"];

  it("self vs cross-field discriminates correctly", () => {
    expectTypeOf<Cause>().toEqualTypeOf<
      | { isSelf: true; field: "name"; action: FieldEvent }
      | { isSelf: false; field: "email"; action: FieldEvent }
    >();
  });
});

describe("form helpers option bags typing", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("setValue/reset options accept only known keys", () => {
    defineField({
      name: "name",
      respond: (context) => {
        context.form.setValue("name", "x", {
          markTouched: true,
          incrementChanges: false,
          dispatch: true,
        });
        // @ts-expect-error unknown option key
        context.form.setValue("name", "x", { bogus: true });

        context.form.reset("name", {
          meta: true,
          validation: true,
          dispatch: false,
        });
        // @ts-expect-error unknown option key
        context.form.reset("name", { foo: true });

        return context.helpers.validation.valid();
      },
    });
  });
});

describe("FinalValidationStatus issues are readonly", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("invalid/warning issues cannot be mutated", () => {
    defineField({
      name: "name",
      respond: (context) => {
        const bad = context.helpers.validation.invalid();
        // @ts-expect-error issues is readonly
        bad.issues.push({ message: "x" } as unknown as StandardSchemaV1.Issue);
        return bad;
      },
    });
  });
});

describe("schema helpers return exact Issue[] | undefined", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("validateWithSchema/Async return StandardSchemaV1.Issue[] | undefined", () => {
    defineField({
      name: "name",
      standardSchema: {} as unknown as StandardSchemaV1<string>,
      respond: (context: RespondContext<Form, "name">) => {
        expectTypeOf(context.helpers.validateWithSchema()).toEqualTypeOf<
          readonly StandardSchemaV1.Issue[] | undefined
        >();
        return context.helpers.validation.valid();
      },
      respondAsync: async (context) => {
        expectTypeOf(
          await context.helpers.validateWithSchemaAsync(),
        ).toEqualTypeOf<readonly StandardSchemaV1.Issue[] | undefined>();
        return context.helpers.validation.valid();
      },
    });
  });
});

describe("Details D propagates through FormApi and async context", () => {
  type Form = { name: string };
  type Details = { code: "A" | "B" };
  const { defineField } = createForm<Form, Details>();

  it("FormApi.getSnapshot and context.validation carry Details", () => {
    defineField({
      name: "name",
      respond: (context: RespondContext<Form, "name", Details>) => {
        expectTypeOf(context.form.getSnapshot("name").validation).toExtend<{
          details?: Details;
        }>();
        return context.helpers.validation.valid({ details: { code: "A" } });
      },
      respondAsync: async (context) => {
        await Promise.resolve();
        expectTypeOf(context.current.validation).toExtend<{
          details?: Details;
        }>();
        return context.helpers.validation.valid();
      },
    });
  });
});

describe("watch edge cases: self [] and fields include 'mount'", () => {
  type Form = { name: string; email: string };
  const { defineField } = createForm<Form>();

  it("accepts empty self watch and 'mount' in fields", () => {
    defineField({
      name: "name",
      watch: { self: [], fields: { email: ["mount"] } },
      respond: (c) => c.helpers.validation.valid(),
    });

    defineField({
      name: "name",
      watch: { self: ["submit"] },
      respond: (c) => c.helpers.validation.valid(),
    });
  });
});

describe("single-field form: watch.fields must be empty", () => {
  type Form = { only: string };
  const { defineField } = createForm<Form>();

  it("rejects any key in watch.fields", () => {
    defineField({
      name: "only",
      // @ts-expect-error no cross-field watch allowed in single-field form
      watch: { fields: { only: true } },
      respond: (c) => c.helpers.validation.valid(),
    });
  });
});

describe("FieldSnapshot members", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("exposes isMounted: boolean", () => {
    defineField({
      name: "name",
      respond: (context) => {
        expectTypeOf(context.current.isMounted).toBeBoolean();
        return context.helpers.validation.valid();
      },
    });
  });
});

describe("validation helper constructors union coverage", () => {
  type Form = { name: string };
  const { defineField } = createForm<Form>();

  it("constructors produce the FinalValidationStatus union", () => {
    defineField({
      name: "name",
      respond: (context) => {
        const statuses = [
          context.helpers.validation.valid(),
          context.helpers.validation.invalid(),
          context.helpers.validation.warning(),
          context.helpers.validation.idle(),
        ] as const;
        expectTypeOf(statuses[0]).toHaveProperty("type");
        type StatusType = (typeof statuses)[number]["type"];
        expectTypeOf<StatusType>().toEqualTypeOf<
          "valid" | "invalid" | "warning" | "idle"
        >();
        return context.helpers.validation.valid();
      },
    });
  });
});
