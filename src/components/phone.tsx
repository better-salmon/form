import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Phone() {
  const field = useField({
    name: "phone",
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Phone</span>

      <div className="relative">
        <input
          type="tel"
          name={field.name}
          value={field.value ?? ""}
          disabled={field.value === undefined}
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
            "rounded-md border-2 border-gray-300 p-2 pr-10 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
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
          {field.value === undefined && <span>🙈</span>}
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
