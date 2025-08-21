import { useState } from "react";
import { createForm, type FieldOptions } from "form";
import { cn } from "@/utils/cn";

type DemoForm = {
  value: string;
};

type Mode = "async" | "sync" | "none";

const { useForm, useField, defineField } = createForm<DemoForm>();

export default function AsyncSyncToggleDemo() {
  const { Form } = useForm({
    defaultValues: { value: "" },
  });

  const [mode, setMode] = useState<Mode>("async");

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Async → Sync Toggle Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Type to start async (debounced) validation, then quickly switch to
            sync while it's pending. Observe whether the status leaves "pending"
            without another dispatch.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm">Mode:</span>
          <span
            className="rounded bg-gray-100 px-2 py-1 text-sm"
            data-testid="mode"
          >
            {mode}
          </span>
          <button
            type="button"
            data-testid="switch-to-sync"
            className={cn(
              "rounded bg-gray-500 px-3 py-1 text-sm font-medium text-white hover:bg-gray-600",
              mode === "sync" && "bg-blue-500 hover:bg-blue-600",
            )}
            onClick={() => {
              setMode("sync");
            }}
            disabled={mode === "sync"}
          >
            Switch to sync
          </button>
          <button
            type="button"
            data-testid="switch-to-async"
            className={cn(
              "rounded bg-gray-500 px-3 py-1 text-sm font-medium text-white hover:bg-gray-600",
              mode === "async" && "bg-blue-500 hover:bg-blue-600",
            )}
            onClick={() => {
              setMode("async");
            }}
            disabled={mode === "async"}
          >
            Switch to async
          </button>
          <button
            type="button"
            data-testid="switch-to-none"
            className={cn(
              "rounded bg-gray-500 px-3 py-1 text-sm font-medium text-white hover:bg-gray-600",
              mode === "none" && "bg-blue-500 hover:bg-blue-600",
            )}
            onClick={() => {
              setMode("none");
            }}
            disabled={mode === "none"}
          >
            Switch to none
          </button>
        </div>

        <ValueField mode={mode} />
      </div>
    </Form>
  );
}

const valueFieldOptionsNone = defineField({
  name: "value",
});

const valueFieldOptionsAsync = defineField({
  name: "value",
  debounceMs: 1200,
  respondAsync: async (context) => {
    await new Promise((r) => setTimeout(r, 1000));
    return context.helpers.validation.valid();
  },
});

const valueFieldOptionsSync = defineField({
  name: "value",
  respond: (context) => {
    return context.helpers.validation.valid();
  },
});

function ValueField({ mode }: Readonly<{ mode: Mode }>) {
  let options: FieldOptions<DemoForm, "value">;

  if (mode === "async") {
    options = valueFieldOptionsAsync;
  } else if (mode === "sync") {
    options = valueFieldOptionsSync;
  } else {
    options = valueFieldOptionsNone;
  }

  const field = useField(options);

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Value</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          data-testid="field-input"
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className={
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          }
          placeholder="Type, then quickly press Switch to sync"
        />
        <div className="mt-1 text-sm">
          <span className="font-medium">Status:</span>{" "}
          <span data-testid="status">{field.validation.type}</span>
        </div>
      </div>
    </label>
  );
}
