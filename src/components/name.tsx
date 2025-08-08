import { useField, type FieldOptions } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

import { z } from "zod";

const NameSchema = z.object({
  firstName: z
    .string()
    .min(1, "First name is required")
    .max(10, "First name is too long"),
  lastName: z.string().min(1, "Last name is required"),
});

const nameFieldOptions = {
  name: "name",
  debounceMs: 1000,
  standardSchema: NameSchema,
  validator: (props) => {
    console.log("sync validator", props);
    const issues = props.validateWithStandardSchema();

    switch (props.action) {
      case "change": {
        if (issues?.length && issues[0].message) {
          return props.createValidation.warning(issues[0].message);
        }
        return props.createValidation.pending();
      }
      case "submit": {
        return props.createValidation.async.auto(1000);
      }
      case "mount": {
        return props.createValidation.async.force(0);
      }
    }
  },
  asyncValidator: async (props) => {
    console.log("async validator", props);

    await fetch(
      `http://localhost:3001/ok?delay=1000&value=${props.value.firstName}`,
      {
        signal: props.getAbortSignal(),
      },
    );

    return props.createValidation.warning("Name is too long");
  },
} satisfies FieldOptions;

export function Name() {
  const field = useField(nameFieldOptions);

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Name</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value.firstName}
          onBlur={field.handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              field.handleSubmit();
            }
          }}
          onChange={(e) => {
            field.handleChange({
              ...field.value,
              firstName: e.target.value,
            });
          }}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
            {
              "border-red-500": field.validationState.type === "invalid",
              "border-green-500": field.validationState.type === "valid",
              "border-blue-500": field.validationState.type === "checking",
              "border-violet-500": field.validationState.type === "waiting",
              "border-orange-500": field.validationState.type === "warning",
            },
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {field.validationState.type === "checking" && <span>🤔</span>}
          {field.validationState.type === "valid" && <span>✅</span>}
          {field.validationState.type === "invalid" && <span>❌</span>}
          {field.validationState.type === "waiting" && <span>⏰</span>}
          {field.validationState.type === "warning" && <span>⚠️</span>}
        </div>
      </div>
    </label>
  );
}
