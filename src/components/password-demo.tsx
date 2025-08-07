import { createFormHook } from "@lib/create-form-hook";

type PasswordForm = {
  password: string;
  confirmPassword: string;
};

const { useForm, useField, useFieldDependencies } =
  createFormHook<PasswordForm>();

export function PasswordDemo() {
  const { Form } = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <Form>
      <div className="space-y-4 p-4">
        <h2 className="text-xl font-bold">Password Demo - Linked Validators</h2>

        <PasswordField />
        <ConfirmPasswordField />
        <FieldInfo />

        <button
          type="submit"
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Submit
        </button>
      </div>
    </Form>
  );
}

function FieldInfo() {
  const field = useFieldDependencies(["confirmPassword", "password"]);

  return (
    <div className="space-y-4 p-4">
      <pre>{JSON.stringify(field, null, 2)}</pre>
    </div>
  );
}

function PasswordField() {
  const field = useField({
    name: "password",
    validator: ({ value }) => {
      if (!value) {
        return { type: "invalid", message: "Password is required" };
      }

      if (value.length < 6) {
        return {
          type: "invalid",
          message: "Password must be at least 6 characters",
        };
      }

      return { type: "valid", message: "Strong password!" };
    },
    // asyncValidator: async ({ value }) => {
    //   await new Promise((resolve) => setTimeout(resolve, 1000));

    // },
  });

  return (
    <div>
      <label htmlFor={field.name} className="mb-1 block text-sm font-medium">
        Password
      </label>
      <input
        type="password"
        name={field.name}
        value={field.value}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        className="w-full rounded border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        placeholder="Enter password"
      />
      {field.validationState.type === "invalid" && (
        <p className="mt-1 text-sm text-red-500">
          {field.validationState.message}
        </p>
      )}
      {field.validationState.type === "valid" && (
        <p className="mt-1 text-sm text-green-500">✓ Valid password</p>
      )}
    </div>
  );
}

function ConfirmPasswordField() {
  const field = useField({
    name: "confirmPassword",
    validator: ({ value, formApi }) => {
      const passwordField = formApi.getField("password");
      console.log("passwordField", passwordField);

      if (!value) {
        return { type: "invalid", message: "Please confirm your password" };
      }
      if (value !== passwordField.value) {
        return { type: "invalid", message: "Passwords do not match" };
      }
      return { type: "valid", message: "Passwords match!" };
    },
    // asyncValidator: async ({ value, formApi }) => {
    //   await new Promise((resolve) => setTimeout(resolve, 1000));

    // },
  });

  return (
    <div>
      <label htmlFor={field.name} className="mb-1 block text-sm font-medium">
        Confirm Password
      </label>
      <input
        type="password"
        name={field.name}
        value={field.value}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        className="w-full rounded border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        placeholder="Confirm password"
      />
      {field.validationState.type === "invalid" && (
        <p className="mt-1 text-sm text-red-500">
          {field.validationState.message}
        </p>
      )}
      {field.validationState.type === "valid" && (
        <p className="mt-1 text-sm text-green-500">
          {field.validationState.message}
        </p>
      )}
    </div>
  );
}
