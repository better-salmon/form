import { createFormHook } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";

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
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Watcher API Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Watch field changes and trigger cross-validation
          </p>
        </div>

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
            <label className="flex flex-col gap-2">
              <span className="px-2 text-sm font-medium">User Type</span>
              <div className="relative">
                <select
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value as typeof field.value);
                  }}
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
                    {
                      "border-red-500":
                        field.validationState.type === "invalid",
                      "border-green-500":
                        field.validationState.type === "valid",
                      "border-blue-500":
                        field.validationState.type === "checking",
                      "border-violet-500":
                        field.validationState.type === "waiting",
                      "border-orange-500":
                        field.validationState.type === "warning",
                    },
                  )}
                >
                  <option value="">Select type...</option>
                  <option value="admin">👑 Admin</option>
                  <option value="user">👤 User</option>
                  <option value="guest">🌐 Guest</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  {field.validationState.type === "checking" && <span>🤔</span>}
                  {field.validationState.type === "valid" && <span>✅</span>}
                  {field.validationState.type === "invalid" && <span>❌</span>}
                  {field.validationState.type === "waiting" && <span>⏰</span>}
                  {field.validationState.type === "warning" && <span>⚠️</span>}
                </div>
              </div>
            </label>
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
          watchFields={{
            userType: ({ action, watchedValue, currentField, formApi }) => {
              console.log(
                `Email watcher triggered on ${action} with userType: ${watchedValue}`,
              );

              switch (action) {
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
          }}
        >
          {(field) => (
            <label className="flex flex-col gap-2">
              <span className="px-2 text-sm font-medium">Email Address</span>
              <div className="relative">
                <input
                  type="email"
                  name={field.name}
                  id={field.name}
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  onBlur={field.handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      field.handleSubmit();
                    }
                  }}
                  placeholder="Enter your email address..."
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
                    {
                      "border-red-500":
                        field.validationState.type === "invalid",
                      "border-green-500":
                        field.validationState.type === "valid",
                      "border-blue-500":
                        field.validationState.type === "checking",
                      "border-violet-500":
                        field.validationState.type === "waiting",
                      "border-orange-500":
                        field.validationState.type === "warning",
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

              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <div className="flex items-center space-x-1">
                  <div
                    className={`h-2 w-2 rounded-full ${field.meta.isTouched ? "bg-blue-400" : "bg-gray-300"}`}
                  ></div>
                  <span>Touched: {field.meta.isTouched ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="h-2 w-2 rounded-full bg-purple-400"></div>
                  <span>Changes: {field.meta.numberOfChanges}</span>
                </div>
              </div>
            </label>
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
            <label className="flex flex-col gap-2">
              <span className="px-2 text-sm font-medium">Password</span>
              <div className="relative">
                <input
                  type="password"
                  name={field.name}
                  id={field.name}
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  onBlur={field.handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      field.handleSubmit();
                    }
                  }}
                  placeholder="Enter your password..."
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
                    {
                      "border-red-500":
                        field.validationState.type === "invalid",
                      "border-green-500":
                        field.validationState.type === "valid",
                      "border-blue-500":
                        field.validationState.type === "checking",
                      "border-violet-500":
                        field.validationState.type === "waiting",
                      "border-orange-500":
                        field.validationState.type === "warning",
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
          )}
        </Field>

        {/* Confirm Password Field - Watches password */}
        <Field
          name="confirmPassword"
          validator={({ value, formApi }) => {
            const password = formApi.getField("password").value;

            if (!value) {
              return {
                type: "invalid",
                message: "Please confirm your password",
              };
            }
            if (value !== password) {
              return { type: "invalid", message: "Passwords do not match" };
            }
            return { type: "valid", message: "Passwords match!" };
          }}
          watchFields={{
            password: ({ action, currentField, formApi }) => {
              console.log(`ConfirmPassword watcher triggered on ${action}`);

              if (
                (action === "change" || action === "blur") && // Only validate if user has started typing
                currentField.value
              ) {
                formApi.validate("confirmPassword");
              }

              if (action === "submit") {
                formApi.validate("confirmPassword");
              }
            },
          }}
        >
          {(field) => (
            <label className="flex flex-col gap-2">
              <span className="px-2 text-sm font-medium">Confirm Password</span>
              <div className="relative">
                <input
                  type="password"
                  name={field.name}
                  id={field.name}
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  onBlur={field.handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      field.handleSubmit();
                    }
                  }}
                  placeholder="Confirm your password..."
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
                    {
                      "border-red-500":
                        field.validationState.type === "invalid",
                      "border-green-500":
                        field.validationState.type === "valid",
                      "border-blue-500":
                        field.validationState.type === "checking",
                      "border-violet-500":
                        field.validationState.type === "waiting",
                      "border-orange-500":
                        field.validationState.type === "warning",
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
          )}
        </Field>

        <div className="pt-4">
          <button
            type="submit"
            className="w-full rounded-md border-2 border-blue-300 bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 focus:outline-none"
          >
            Submit Form
          </button>
        </div>
      </div>
    </Form>
  );
}
