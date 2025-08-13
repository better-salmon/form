import { useState } from "react";
import { createSignalFormHook } from "@lib/create-form-hook-signals";
import { cn } from "@/utils/cn";

type Form = { a: string; b: string; c: string; d: string };

const { useSignalForm, useSignalField } = createSignalFormHook<Form>();

function FieldA() {
  const f = useSignalField({
    name: "a",
    on: { from: { d: ["change"] } },
    respond: ({ action, cause, form, helpers }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      form.setValue("a", form.getField("d").value + "a");
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Field A</span>
      <input
        type="text"
        value={f.value}
        onChange={(e) => {
          f.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          f.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Type to trigger from A"
      />
      <div className="text-xs text-gray-500">
        Changes: {f.meta.numberOfChanges}
      </div>
    </label>
  );
}

function FieldB() {
  const f = useSignalField({
    name: "b",
    on: { from: { a: ["change"] } },
    respond: ({ action, cause, form, helpers }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      form.setValue("b", form.getField("a").value + "b");
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Field B</span>
      <input
        type="text"
        value={f.value}
        onChange={(e) => {
          f.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          f.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Type to trigger from B"
      />
      <div className="text-xs text-gray-500">
        Changes: {f.meta.numberOfChanges}
      </div>
    </label>
  );
}

function FieldC() {
  const f = useSignalField({
    name: "c",
    on: { from: { b: ["change"] } },
    respond: ({ action, cause, form, helpers }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      form.setValue("c", form.getField("b").value + "c");
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Field C</span>
      <input
        type="text"
        value={f.value}
        onChange={(e) => {
          f.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          f.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Type to trigger from C"
      />
      <div className="text-xs text-gray-500">
        Changes: {f.meta.numberOfChanges}
      </div>
    </label>
  );
}

function FieldD() {
  const f = useSignalField({
    name: "d",
    on: { from: { c: ["change"] } },
    respond: ({ action, cause, form, helpers }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      form.setValue("d", form.getField("c").value + "d");
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Field D</span>
      <input
        type="text"
        value={f.value}
        onChange={(e) => {
          f.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          f.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Type to trigger from D"
      />
      <div className="text-xs text-gray-500">
        Changes: {f.meta.numberOfChanges}
      </div>
    </label>
  );
}

export function SignalsFourCycleWorkingDemo() {
  const [maxSteps] = useState<number>(3);
  const { Form: FormRoot } = useSignalForm({
    defaultValues: { a: "", b: "", c: "", d: "" },
    watcherMaxSteps: maxSteps,
  });

  return (
    <FormRoot className="space-y-6">
      <div className="space-y-4 p-6">
        <h2 className="text-xl font-semibold">
          Signals 4-Field Cycle (Working)
        </h2>
        <p className="text-sm text-gray-600">
          A → B → C → D → A with watcherMaxSteps={maxSteps}. Should warn and
          bail when chain length exceeds limit.
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FieldA />
          <FieldB />
          <FieldC />
          <FieldD />
        </div>
      </div>
    </FormRoot>
  );
}
