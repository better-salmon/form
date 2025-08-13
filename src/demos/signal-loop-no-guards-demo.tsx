import { createSignalFormHook } from "@lib/create-form-hook-signals";
import { cn } from "@/utils/cn";

type Form = {
  a: string;
  b: string;
};

const { useSignalForm, useSignalField } = createSignalFormHook<Form>();

function FieldA() {
  const field = useSignalField({
    name: "a",
    on: { from: { b: ["change"] } },
    respond: ({ action, cause, form, helpers }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      const next = form.getField("b").value + "a";
      form.setValue("a", next);
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Field A</span>
      <input
        type="text"
        value={field.value}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          field.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Type start and watch"
      />
      <div className="text-xs text-gray-500">
        Changes: {field.meta.numberOfChanges}
      </div>
    </label>
  );
}

function FieldB() {
  const field = useSignalField({
    name: "b",
    on: { from: { a: ["change"] } },
    respond: ({ action, cause, form, helpers }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      const next = form.getField("a").value + "b";
      form.setValue("b", next);
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Field B</span>
      <input
        type="text"
        value={field.value}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          field.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Auto-updates from A"
      />
      <div className="text-xs text-gray-500">
        Changes: {field.meta.numberOfChanges}
      </div>
    </label>
  );
}

export function SignalsLoopNoGuardsDemo() {
  const { Form: FormRoot } = useSignalForm({
    defaultValues: { a: "", b: "" },
    watcherMaxSteps: 1000,
  });

  return (
    <FormRoot className="space-y-6">
      <div className="space-y-4 p-6">
        <h2 className="text-xl font-semibold">Signals Loop (No Guards)</h2>
        <p className="text-sm text-gray-600">
          Two fields that set each other on every change. Should not freeze due
          to edge-visited protection.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FieldA />
          <FieldB />
        </div>
      </div>
    </FormRoot>
  );
}
