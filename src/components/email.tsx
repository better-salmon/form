import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Email() {
  const field = useField({
    name: "email",
    validators: {},
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Email</span>
      <div className="relative">
        <input
          type="email"
          name={field.name}
          data-done={field.validationState.type === "done" ? "true" : "false"}
          value={field.value}
          onBlur={field.handleBlur}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              field.handleSubmit();
            }
          }}
          className={cn(
            "rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
            {
              "border-red-500": field.validationState.type === "error",
              "border-green-500": field.validationState.type === "done",
              "border-blue-500": field.validationState.type === "validating",
              "border-yellow-500": field.validationState.type === "debouncing",
            },
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {field.validationState.type === "validating" && <span>🤔</span>}
          {field.validationState.type === "done" && <span>✅</span>}
          {field.validationState.type === "error" && <span>❌</span>}
          {field.validationState.type === "debouncing" && <span>⏰</span>}
        </div>
      </div>
    </label>
  );
}
