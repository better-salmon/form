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
          // data-done={field.validationState.type === "done" ? "true" : "false"}
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
            // {
            //   "border-red-500": field.validationState.type === "error",
            //   "border-green-500": field.validationState.type === "done",
            //   "border-blue-500": field.validationState.type === "validating",
            //   "border-yellow-500": field.validationState.type === "debouncing",
            // },
          )}
        />
        {/* <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {field.value === undefined && <span>🙈</span>}
          {field.validationState.type === "validating" && <span>🤔</span>}
          {field.validationState.type === "done" && <span>✅</span>}
          {field.validationState.type === "error" && <span>❌</span>}
          {field.validationState.type === "debouncing" && <span>⏰</span>}
        </div> */}
      </div>
    </label>
  );
}
