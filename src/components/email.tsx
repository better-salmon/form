import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";

export function Email() {
  const field = useField({
    name: "email",
    validators: {
      onSubmit: (props) => {
        console.log("onSubmit email", props);

        if (props.value.length === 0) {
          props.fieldApi.setIssue("Email is required");
        } else {
          props.fieldApi.setDone(true);
        }
      },
      onChange: (props) => {
        console.log("onChange email", props);
        props.fieldApi.setDone(false);
        props.fieldApi.setIssue();
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
          data-done={field.meta.isDone ? "true" : "false"}
          value={field.value}
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
          {field.meta.issue && <span className="text-red-500">❌</span>}
        </div>
      </div>
    </label>
  );
}
