import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Phone() {
  const field = useField({
    name: "phone",
    validators: {
      onSubmit: (props) => {
        console.log("onSubmit phone", props);
        props.fieldApi.setValidationState({
          type: "done",
        });
      },
      onMount: (props) => {
        console.log("onMount phone", props);
        props.fieldApi.setValidationState({
          type: props.value === undefined ? "pending" : "done",
        });
      },
    },
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
          data-done={field.validationState.type === "done" ? "true" : "false"}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void field.handleSubmit();
            }
          }}
          className={cn(
            "rounded-md border-2 border-gray-300 p-2 pr-10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
            {
              "border-red-500": field.validationState.type === "error",
              "border-green-500": field.validationState.type === "done",
            },
          )}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {field.validationState.type === "validating" ||
            (field.value === undefined && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            ))}
          {field.validationState.type === "done" && (
            <span className="text-green-500">✅</span>
          )}
          {field.validationState.type === "error" && (
            <span className="text-red-500">❌</span>
          )}
        </div>
      </div>
    </label>
  );
}
