import { useState } from "react";
import {
  QueryClient,
  useQuery,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useForm } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";

const queryClient = new QueryClient();

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
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
      console.log(
        "onDoneChange",
        changedFields.map((field) => fieldsMap[field].validationState.type),
      );
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
        validators={{}}
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
                    "border-red-500": field.validationState.type === "error",
                    "border-green-500": field.validationState.type === "done",
                    "border-blue-500":
                      field.validationState.type === "validating",
                    "border-yellow-500":
                      field.validationState.type === "debouncing",
                  },
                )}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                {field.validationState.type === "validating" && <span>🤔</span>}
                {field.validationState.type === "done" && <span>✅</span>}
                {field.validationState.type === "error" && <span>❌</span>}
                {field.validationState.type === "debouncing" && <span>⏰</span>}
              </div>
            </div>
          </label>
        )}
      />
      <Field
        name="email"
        validators={{}}
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
                    field.handleSubmit();
                  }
                }}
                className={cn(
                  "rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
                  {
                    "border-red-500": field.validationState.type === "error",
                    "border-green-500": field.validationState.type === "done",
                    "border-blue-500":
                      field.validationState.type === "validating",
                    "border-yellow-500":
                      field.validationState.type === "debouncing",
                  },
                )}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                {field.validationState.type === "validating" && <span>🤔</span>}
                {field.validationState.type === "done" && <span>✅</span>}
                {field.validationState.type === "error" && <span>❌</span>}
                {field.validationState.type === "debouncing" && <span>⏰</span>}
              </div>
            </div>
          </label>
        )}
      />
      <Field
        name="phone"
        validators={{}}
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
                    field.handleSubmit();
                  }
                }}
                className={cn(
                  "rounded-md border-2 border-gray-300 p-2 pr-10 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500",
                  {
                    "border-red-500": field.validationState.type === "error",
                    "border-green-500": field.validationState.type === "done",
                    "border-blue-500":
                      field.validationState.type === "validating",
                    "border-yellow-500":
                      field.validationState.type === "debouncing",
                  },
                )}
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                {field.value === undefined && <span>🙈</span>}
                {field.validationState.type === "validating" && <span>🤔</span>}
                {field.validationState.type === "done" && <span>✅</span>}
                {field.validationState.type === "error" && <span>❌</span>}
                {field.validationState.type === "debouncing" && <span>⏰</span>}
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
