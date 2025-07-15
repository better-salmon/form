import { useState } from "react";
import {
  QueryClient,
  useQuery,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useForm } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";

const queryClient = new QueryClient();

function focusNextField(name: string) {
  queueMicrotask(() => {
    const input = document.querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    );
    if (input) {
      input.focus();
      return;
    }
  });
}

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function focusSubmitButton() {
  queueMicrotask(() => {
    const button = document.querySelector<HTMLButtonElement>(
      "button[type='submit']",
    );
    if (button) {
      button.focus();
    }
  });
}

async function getPhone() {
  return new Promise<string>((resolve) =>
    setTimeout(() => {
      resolve("0987654321");
    }, 1000),
  );
}

function App() {
  const [count, setCount] = useState(0);
  const { data: phone } = useQuery({
    queryKey: ["phone"],
    queryFn: getPhone,
  });
  const { Form, Field, SubscribeTo } = useForm({
    defaultValues: {
      name: {
        firstName: "John",
        lastName: "Doe",
      },
      email: "john.doe@example.com",
      phone,
    },
    onDoneChange: ({ fieldsMap, changedFields }) => {
      console.log("onDoneChange", fieldsMap, changedFields);
      for (const [name, field] of Object.entries(fieldsMap)) {
        if (field.validationState.type !== "done") {
          focusNextField(name);
          return;
        }
      }

      focusSubmitButton();
    },
  });

  return (
    <Form
      className="flex h-screen flex-col items-center justify-center gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <h3 className="text-2xl font-bold">All in one file</h3>
      <Field
        name="name"
        validators={{
          onChange: (props) => {
            console.log("onChange name", props);
            props.fieldApi.setValidationState({
              type: "pending",
            });
          },
          onSubmit: (props) => {
            console.log("onSubmit name", props);
            // props.fieldApi.setIssue("Name is required");
            // props.fieldApi.setDone(true);
          },
          onSubmitAsync: async (props) => {
            console.log("onSubmitAsync name", props);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            props.fieldApi.setValidationState({
              type: "done",
            });
          },
        }}
        render={(field) => (
          <label className="flex flex-col gap-2">
            <span className="px-2 text-sm font-medium">Name</span>
            <div className="relative">
              <input
                type="text"
                name={field.name}
                value={field.value.firstName}
                onBlur={field.handleBlur}
                data-done={
                  field.validationState.type === "done" ? "true" : "false"
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    void field.handleSubmit();
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
        )}
      />
      <Field
        name="email"
        validators={{
          onSubmit: (props) => {
            console.log("onSubmit email", props);

            if (props.value.length === 0) {
              props.fieldApi.setValidationState({
                type: "error",
                message: "Email is required",
              });
            } else {
              props.fieldApi.setValidationState({
                type: "done",
              });
            }
          },
          onChange: (props) => {
            console.log("onChange email", props);
            props.fieldApi.setValidationState({
              type: "pending",
            });
          },
        }}
        render={(field) => (
          <label className="flex flex-col gap-2">
            <span className="px-2 text-sm font-medium">Email</span>
            <div className="relative">
              <input
                type="email"
                name={field.name}
                data-done={
                  field.validationState.type === "done" ? "true" : "false"
                }
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
        )}
      />
      <Field
        name="phone"
        validators={{
          onSubmit: (props) => {
            console.log("onSubmit phone", props);
            props.fieldApi.setValidationState({
              type: "done",
            });
          },
          onMount: (props) => {
            console.log("onMount phone", props);
            props.fieldApi.setValidationState({
              type: props.value === undefined ? "pending" : "done",
            });
          },
        }}
        render={(field) => (
          <label className="flex flex-col gap-2">
            <span className="px-2 text-sm font-medium">Phone</span>

            <div className="relative">
              <input
                type="tel"
                name={field.name}
                value={field.value ?? ""}
                disabled={field.value === undefined}
                data-done={
                  field.validationState.type === "done" ? "true" : "false"
                }
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
                className={cn(
                  "rounded-md border-2 border-gray-300 p-2 pr-10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
                  {
                    "border-red-500": field.validationState.type === "error",
                    "border-green-500": field.validationState.type === "done",
                  },
                )}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                {field.validationState.type === "validating" ||
                  (field.value === undefined && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                  ))}
                {field.validationState.type === "done" && (
                  <span className="text-green-500">✅</span>
                )}
                {field.validationState.type === "error" && (
                  <span className="text-red-500">❌</span>
                )}
              </div>
            </div>
          </label>
        )}
      />
      <SubscribeTo
        dependencies={["email", "phone", "name"]}
        render={(fieldsMap) => {
          const isSomeValidating = Object.values(fieldsMap).some(
            (field) => field.validationState.type === "validating",
          );

          const isEveryDone = Object.values(fieldsMap).every(
            (field) => field.validationState.type === "done",
          );

          const isDisabled = isSomeValidating || !isEveryDone;
          return (
            <button
              type="submit"
              disabled={isDisabled}
              className="rounded-md border-2 border-gray-300 bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              Next
            </button>
          );
        }}
      />
      <button
        type="button"
        onClick={() => {
          setCount((c) => c + 1);
        }}
        className="cursor-pointer rounded-md border-2 border-gray-300 bg-blue-500 p-2 text-white hover:bg-blue-600"
      >
        Button was clicked {count} times (render optimization showcase)
      </button>
    </Form>
  );
}

export default App;
