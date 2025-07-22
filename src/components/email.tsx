import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Email() {
  const field = useField({
    name: "email",
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Email</span>
      <div className="relative">
        <input
          type="email"
          name={field.name}
          // data-done={field.validationState.type === "done" ? "true" : "false"}
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
