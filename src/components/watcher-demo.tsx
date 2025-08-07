import { createFormHook } from "@lib/create-form-hook";

// Create typed form hook
const { useForm } = createFormHook<{
  userType: "admin" | "user" | "guest" | "";
  email: string;
  password: string;
  confirmPassword: string;
}>();

export function WatcherDemo() {
  const { Form, Field } = useForm({
    defaultValues: {
      userType: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  return (
    <Form className="mx-auto max-w-md space-y-4 rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-xl font-bold">Watcher API Demo</h2>

      {/* User Type Field */}
      <Field
        name="userType"
        validator={({ value }) => {
          if (!value) {
            return { type: "invalid", message: "Please select user type" };
          }
          return { type: "valid" };
        }}
      >
        {(field) => (
          <div>
            <label
              htmlFor={field.name}
              className="mb-1 block text-sm font-medium"
            >
              User Type
            </label>
            <select
              value={field.value}
              onChange={(e) => {
                field.handleChange(e.target.value as typeof field.value);
              }}
              className="w-full rounded border px-3 py-2"
            >
              <option value="">Select type...</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="guest">Guest</option>
            </select>
            {field.validationState.type === "invalid" && (
              <p className="mt-1 text-sm text-red-500">
                {field.validationState.message}
              </p>
            )}
          </div>
        )}
      </Field>

      {/* Email Field - Watches userType */}
      <Field
        name="email"
        validator={({ value, formApi }) => {
          const userType = formApi.getField("userType").value;

          if (userType === "guest") {
            return { type: "valid", message: "Email optional for guests" };
          }

          if (!value) {
            return { type: "invalid", message: "Email is required" };
          }

          if (userType === "admin" && !value.includes("@admin.com")) {
            return {
              type: "invalid",
              message: "Admin email must be from @admin.com domain",
            };
          }

          return { type: "valid" };
        }}
        watchFields={[
          {
            field: "userType",
            do: ({ when, watchedValue, currentField, formApi }) => {
              console.log(
                `Email watcher triggered on ${when} with userType: ${watchedValue}`,
              );

              switch (when) {
                case "change": {
                  if (
                    watchedValue === "guest" ||
                    (watchedValue === "admin" &&
                      currentField.value &&
                      !currentField.value.includes("@admin.com"))
                  ) {
                    formApi.setValue("email", "");
                  }
                  formApi.validate("email");
                  break;
                }

                case "submit": {
                  formApi.validate("email");
                  break;
                }
              }
            },
          },
        ]}
      >
        {(field) => (
          <div>
            <label
              htmlFor={field.name}
              className="mb-1 block text-sm font-medium"
            >
              Email
            </label>
            <input
              type="email"
              name={field.name}
              id={field.name}
              value={field.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onBlur={field.handleBlur}
              placeholder="Enter email..."
              className="w-full rounded border px-3 py-2"
            />
            {field.validationState.type === "invalid" && (
              <p className="mt-1 text-sm text-red-500">
                {field.validationState.message}
              </p>
            )}
            {field.validationState.type === "valid" &&
              field.validationState.message && (
                <p className="mt-1 text-sm text-green-500">
                  {field.validationState.message}
                </p>
              )}
            <p className="mt-1 text-xs text-gray-500">
              Touched: {field.meta.isTouched ? "Yes" : "No"} | Changes:{" "}
              {field.meta.numberOfChanges}
            </p>
          </div>
        )}
      </Field>

      {/* Password Field */}
      <Field
        name="password"
        validator={({ value }) => {
          if (!value) {
            return { type: "invalid", message: "Password is required" };
          }
          if (value.length < 6) {
            return {
              type: "invalid",
              message: "Password must be at least 6 characters",
            };
          }
          return { type: "valid" };
        }}
      >
        {(field) => (
          <div>
            <label
              htmlFor={field.name}
              className="mb-1 block text-sm font-medium"
            >
              Password
            </label>
            <input
              type="password"
              name={field.name}
              id={field.name}
              value={field.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onBlur={field.handleBlur}
              placeholder="Enter password..."
              className="w-full rounded border px-3 py-2"
            />
            {field.validationState.type === "invalid" && (
              <p className="mt-1 text-sm text-red-500">
                {field.validationState.message}
              </p>
            )}
          </div>
        )}
      </Field>

      {/* Confirm Password Field - Watches password */}
      <Field
        name="confirmPassword"
        validator={({ value, formApi }) => {
          const password = formApi.getField("password").value;

          if (!value) {
            return { type: "invalid", message: "Please confirm your password" };
          }
          if (value !== password) {
            return { type: "invalid", message: "Passwords do not match" };
          }
          return { type: "valid", message: "Passwords match!" };
        }}
        watchFields={[
          {
            field: "password",
            do: ({ when, currentField, formApi }) => {
              console.log(`ConfirmPassword watcher triggered on ${when}`);

              if (
                (when === "change" || when === "blur") && // Only validate if user has started typing
                currentField.value
              ) {
                formApi.validate("confirmPassword");
              }

              if (when === "submit") {
                formApi.validate("confirmPassword");
              }
            },
          },
        ]}
      >
        {(field) => (
          <div>
            <label
              htmlFor={field.name}
              className="mb-1 block text-sm font-medium"
            >
              Confirm Password
            </label>
            <input
              type="password"
              name={field.name}
              id={field.name}
              value={field.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              onBlur={field.handleBlur}
              placeholder="Confirm password..."
              className="w-full rounded border px-3 py-2"
            />
            {field.validationState.type === "invalid" && (
              <p className="mt-1 text-sm text-red-500">
                {field.validationState.message}
              </p>
            )}
            {field.validationState.type === "valid" &&
              field.validationState.message && (
                <p className="mt-1 text-sm text-green-500">
                  {field.validationState.message}
                </p>
              )}
          </div>
        )}
      </Field>

      <button
        type="submit"
        className="w-full rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
      >
        Submit Form
      </button>
    </Form>
  );
}
