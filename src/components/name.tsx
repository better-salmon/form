import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

async function isNameValid(name: string, signal: AbortSignal) {
  const response = await fetch(
    `http://localhost:3001/${name.length % 2 === 0 ? "ok" : "error"}?delay=1000&value=${name}`,
    {
      signal,
    },
  );

  return response.ok;
}

export function Name() {
  const field = useField({
    name: "name",
    validators: {
      onSubmit: () => {
        return;
      },
      onSubmitAsync: async (props) => {
        const isValid = await isNameValid(props.value.firstName, props.signal);

        if (!isValid) {
          return {
            type: "error",
            message: "Failed to fetch",
          };
        }

        return {
          type: "done",
        };
      },
      onChange: () => {
        return {
          type: "pending",
        };
      },
      onChangeAsync: async (props) => {
        const isValid = await isNameValid(props.value.firstName, props.signal);

        if (!isValid) {
          return {
            type: "error",
            message: "Failed to fetch",
          };
        }

        return {
          type: "done",
        };
      },
      onChangeAsyncDebounce: 1000,
    },
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Name</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value.firstName}
          onBlur={field.handleBlur}
          data-done={field.validationState.type === "done" ? "true" : "false"}
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
