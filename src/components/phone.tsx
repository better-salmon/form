import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Phone() {
  const field = useField({
    name: "phone",
    validators: {
      onSubmit: (props) => {
        console.log("onSubmit phone", props);
        props.fieldApi.setDone(true);
      },
      onMount: (props) => {
        console.log("onMount phone", props);
        props.fieldApi.setDone(props.value !== undefined);
      },
    },
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Phone</span>
      {field.value === undefined ? (
        "loading"
      ) : (
        <div className="relative">
          <input
            type="tel"
            name={field.name}
            value={field.value}
            data-done={field.meta.isDone ? "true" : "false"}
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
              "border-red-500": field.meta.issue,
              "border-green-500": field.meta.isDone,
            })}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {field.meta.isValidating && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
            )}
            {field.meta.isDone && !field.meta.isValidating && (
              <span className="text-green-500">✅</span>
            )}
          </div>
        </div>
      )}
    </label>
  );
}
