import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Email() {
  const field = useField({
    name: "email",
    validators: {
      onSubmit: (props) => {
        console.log("onSubmit email", props);

        if (props.value.length === 0) {
          return {
            type: "error",
            message: "Email is required",
          };
        }

        return {
          type: "done",
        };
      },
      onBlur: (props) => {
        console.log("onBlur email", props);
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              type: "done",
            });
          }, 1000);
        });
      },
      onChange: (props) => {
        console.log("onChange email", props);
        return {
          type: "pending",
        };
      },
    },
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
          className={cn("rounded-md border-2 border-gray-300 p-2 pr-10", {
            "border-red-500": field.validationState.type === "error",
            "border-green-500": field.validationState.type === "done",
          })}
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {field.validationState.type === "validating" && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
          )}
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
