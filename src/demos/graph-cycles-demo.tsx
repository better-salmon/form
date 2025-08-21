import { createForm } from "@lib/create-form-hook";

type GraphForm = {
  a2: string;
  b2: string;
  a3: string;
  b3: string;
  c3: string;
};

const { useForm, useField, defineField } = createForm<GraphForm>();

export default function GraphCyclesDemo() {
  const { Form } = useForm({
    defaultValues: { a2: "", b2: "", a3: "", b3: "", c3: "" },
  });

  return (
    <Form className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4 p-6">
        <div className="mb-2">
          <h2 className="text-xl font-bold">Graph Cycles Demo</h2>
          <p className="mt-1 text-sm text-gray-600">
            Demonstrates dispatch edge cutoffs for cyclic graphs.
          </p>
        </div>

        <section className="rounded-md border border-gray-200 p-4">
          <h3 className="mb-3 text-lg font-semibold">Two-node cycle A↔B</h3>
          <p className="mb-3 text-xs text-gray-600">
            A change sets B; B change sets A. Visited-edge cutoff prevents
            loops.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <A2Field />
            <B2Field />
          </div>
        </section>

        <section className="rounded-md border border-gray-200 p-4">
          <h3 className="mb-3 text-lg font-semibold">
            Three-node cycle A→B→C→A
          </h3>
          <p className="mb-3 text-xs text-gray-600">
            A change sets B, B sets C, C sets A. Each edge executes once.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <A3Field />
            <B3Field />
            <C3Field />
          </div>
        </section>
      </div>
    </Form>
  );
}

// ===== Two-node cycle: A2 ↔ B2 =====
const a2Options = defineField({
  name: "a2",
  watch: { fields: { b2: ["change"] } },
  respond: (context) => {
    if (context.action !== "change") {
      return context.helpers.validation.idle();
    }
    const nextB = `A→B:${context.value}`;
    if (context.form.getSnapshot("b2").value !== nextB) {
      context.form.setValue("b2", nextB);
    }
    return context.helpers.validation.idle();
  },
});

const b2Options = defineField({
  name: "b2",
  watch: { fields: { a2: ["change"] } },
  respond: (context) => {
    if (context.action !== "change") {
      return context.helpers.validation.idle();
    }
    const nextA = `B→A:${context.value}`;
    if (context.form.getSnapshot("a2").value !== nextA) {
      context.form.setValue("a2", nextA);
    }
    return context.helpers.validation.idle();
  },
});

function A2Field() {
  const field = useField(a2Options);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">A</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className="w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          placeholder="Type to trigger A↔B cycle"
        />
        <div className="mt-1 text-xs text-gray-600">
          changes: {field.meta.changeCount}
        </div>
      </div>
    </label>
  );
}

function B2Field() {
  const field = useField(b2Options);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">B</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className="w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          placeholder="Type to trigger A↔B cycle"
        />
        <div className="mt-1 text-xs text-gray-600">
          changes: {field.meta.changeCount}
        </div>
      </div>
    </label>
  );
}

// ===== Three-node cycle: A3 → B3 → C3 → A3 =====
const a3Options = defineField({
  name: "a3",
  watch: { fields: { c3: ["change"] } },
  respond: (context) => {
    if (context.action !== "change") {
      return context.helpers.validation.idle();
    }
    const nextB = `A→B:${context.value}`;
    if (context.form.getSnapshot("b3").value !== nextB) {
      context.form.setValue("b3", nextB);
    }
    return context.helpers.validation.idle();
  },
});

const b3Options = defineField({
  name: "b3",
  watch: { fields: { a3: ["change"] } },
  respond: (context) => {
    if (context.action !== "change") {
      return context.helpers.validation.idle();
    }
    const nextC = `B→C:${context.value}`;
    if (context.form.getSnapshot("c3").value !== nextC) {
      context.form.setValue("c3", nextC);
    }
    return context.helpers.validation.idle();
  },
});

const c3Options = defineField({
  name: "c3",
  watch: { fields: { b3: ["change"] } },
  respond: (context) => {
    if (context.action !== "change") {
      return context.helpers.validation.idle();
    }
    const nextA = `C→A:${context.value}`;
    if (context.form.getSnapshot("a3").value !== nextA) {
      context.form.setValue("a3", nextA);
    }
    return context.helpers.validation.idle();
  },
});

function A3Field() {
  const field = useField(a3Options);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">A</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className="w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          placeholder="Type to trigger A→B→C→A cycle"
        />
        <div className="mt-1 text-xs text-gray-600">
          changes: {field.meta.changeCount}
        </div>
      </div>
    </label>
  );
}

function B3Field() {
  const field = useField(b3Options);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">B</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className="w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          placeholder="Type to trigger A→B→C→A cycle"
        />
        <div className="mt-1 text-xs text-gray-600">
          changes: {field.meta.changeCount}
        </div>
      </div>
    </label>
  );
}

function C3Field() {
  const field = useField(c3Options);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">C</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className="w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          placeholder="Type to trigger A→B→C→A cycle"
        />
        <div className="mt-1 text-xs text-gray-600">
          changes: {field.meta.changeCount}
        </div>
      </div>
    </label>
  );
}
