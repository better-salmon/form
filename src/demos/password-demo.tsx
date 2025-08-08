import { createFormHook } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";
import type { Branded } from "@/types/types";

type PasswordForm = {
  password: Branded<string, "password">;
  confirmPassword: Branded<string, "password">;
};

const { useForm, useField, useFieldDependencies } =
  createFormHook<PasswordForm>();

export function PasswordDemo() {
  const { Form } = useForm({
    defaultValues: {
      password: "" as Branded<string, "password">,
      confirmPassword: "" as Branded<string, "password">,
    },
  });

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Password Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Linked validators with real-time validation
          </p>
        </div>

        <div className="space-y-4">
          <PasswordField />
          <ConfirmPasswordField />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            className="w-full rounded-md border-2 border-blue-300 bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 focus:outline-none"
          >
            Create Account
          </button>
        </div>
      </div>

      <div className="rounded border p-4">
        <h3 className="mb-2 text-lg font-semibold">Field Dependencies</h3>
        <FieldInfo />
      </div>
    </Form>
  );
}

function FieldInfo() {
  const field = useFieldDependencies(["confirmPassword", "password"]);

  return (
    <div className="overflow-hidden">
      <pre className="overflow-x-auto rounded border bg-gray-50 p-3 text-xs">
        <code className="font-mono">{JSON.stringify(field, null, 2)}</code>
      </pre>
    </div>
  );
}

function PasswordField() {
  const field = useField({
    name: "password",
    validator: (props) => {
      if (!props.value) {
        return props.createValidation.invalid("Password is required");
      }

      if (props.value.length < 6) {
        return props.createValidation.invalid(
          "Password must be at least 6 characters",
        );
      }

      return props.createValidation.valid("Strong password!");
    },
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Password</span>
      <div className="relative">
        <input
          type="password"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value as Branded<string, "password">);
          }}
          onBlur={field.handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              field.handleSubmit();
            }
          }}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
            {
              "border-red-500": field.validationState.type === "invalid",
              "border-green-500": field.validationState.type === "valid",
              "border-blue-500": field.validationState.type === "checking",
              "border-violet-500": field.validationState.type === "waiting",
              "border-orange-500": field.validationState.type === "warning",
            },
          )}
          placeholder="Enter your password..."
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

function ConfirmPasswordField() {
  const field = useField({
    name: "confirmPassword",
    validator: (props) => {
      const passwordField = props.formApi.getField("password");
      console.log("passwordField", passwordField);

      if (!props.value) {
        return props.createValidation.invalid("Please confirm your password");
      }
      if (props.value !== passwordField.value) {
        return props.createValidation.invalid("Passwords do not match");
      }
      return props.createValidation.valid("Passwords match!");
    },
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Confirm Password</span>
      <div className="relative">
        <input
          type="password"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value as Branded<string, "password">);
          }}
          onBlur={field.handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              field.handleSubmit();
            }
          }}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
            {
              "border-red-500": field.validationState.type === "invalid",
              "border-green-500": field.validationState.type === "valid",
              "border-blue-500": field.validationState.type === "checking",
              "border-violet-500": field.validationState.type === "waiting",
              "border-orange-500": field.validationState.type === "warning",
            },
          )}
          placeholder="Confirm your password..."
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
