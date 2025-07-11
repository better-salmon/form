import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Name() {
  const field = useField({
    name: "name",
    validators: {
      onChange: (props) => {
        console.log("onChange name", props);
        props.fieldApi.setDone(false);
        props.fieldApi.setIssue();
      },
      onSubmit: (props) => {
        console.log("onSubmit name", props);
        // props.fieldApi.setIssue("Name is required");
        // props.fieldApi.setDone(true);
      },
      onSubmitAsync: async (props) => {
        console.log("onSubmitAsync name", props);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        props.fieldApi.setDone(true);
      },
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
          data-done={field.meta.isDone ? "true" : "false"}
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
    </label>
  );
}
