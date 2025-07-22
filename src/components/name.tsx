import { useField } from "@/hooks/my-form";
import { cn } from "@/utils/cn";
// import { z } from "zod";

// const NameSchema = z.object({
//   firstName: z.string().min(1, "First name is required"),
//   lastName: z.string().min(1, "Last name is required"),
// });

export function Name() {
  const field = useField({
    name: "name",
    debounce: 1000,
    synchronousValidator: (props) => {
      console.log("synchronousValidator", props);
      switch (props.action) {
        case "change": {
          if (props.value.firstName.length > 10) {
            return {
              type: "warning",
              message: "Name is too long",
            };
          }
          return {
            type: "pending",
          };
        }
        case "submit": {
          return {
            type: "auto",
          };
        }
        case "mount": {
          return {
            type: "pending",
          };
        }
      }
    },
    asynchronousValidator: async (props) => {
      console.log("asynchronousValidator", props);
      await fetch(
        `http://localhost:3001/ok?delay=1000&value=${props.value.firstName}`,
        {
          signal: props.signal,
        },
      );

      return {
        type: "warning",
        message: "Name is too long",
      };
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
          // data-done={field.validationState.type === "done" ? "true" : "false"}
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
