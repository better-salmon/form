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
        if (!field.meta.isDone) {
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
      <Field
        name="name"
        validators={{
          onBlur: (props) => {
            console.log("onBlur name", props);
            if (props.value.firstName.length === 0) {
              props.fieldApi.setIssue("Name is required");
            } else {
              props.fieldApi.setDone(true);
            }
          },
          onSubmit: (props) => {
            console.log("onSubmit name", props);
            if (props.value.firstName.length === 0) {
              props.fieldApi.setIssue("Name is required");
            } else {
              props.fieldApi.setDone(true);
            }
          },
          onChange: (props) => {
            console.log("onChange name", props);
            props.fieldApi.setDone(false);
            props.fieldApi.setIssue();
          },
        }}
        render={(field) => (
          <label className="flex flex-col gap-2">
            <span className="px-2 text-sm font-medium">Name</span>
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
              className={cn("rounded-md border-2 border-gray-300 p-2", {
                "border-red-500": field.meta.issue,
                "border-green-500": field.meta.isDone,
              })}
            />
          </label>
        )}
      />
      <Field
        name="email"
        validators={{
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
        }}
        render={(field) => (
          <label className="flex flex-col gap-2">
            <span className="px-2 text-sm font-medium">Email</span>
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
                  field.handleSubmit();
                }
              }}
              className={cn("rounded-md border-2 border-gray-300 p-2", {
                "border-red-500": field.meta.issue,
                "border-green-500": field.meta.isDone,
              })}
            />
          </label>
        )}
      />

      <Field
        name="phone"
        validators={{
          onSubmit: (props) => {
            console.log("onSubmit phone", props);
            props.fieldApi.setDone(true);
          },
          onMount: (props) => {
            console.log("onMount phone", props);
            props.fieldApi.setDone(props.value !== undefined);
          },
        }}
        render={(field) => (
          <label className="flex flex-col gap-2">
            <span className="px-2 text-sm font-medium">Phone</span>
            {field.value === undefined ? (
              "loading"
            ) : (
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
                className={cn("rounded-md border-2 border-gray-300 p-2", {
                  "border-red-500": field.meta.issue,
                  "border-green-500": field.meta.isDone,
                })}
              />
            )}
          </label>
        )}
      />
      <SubscribeTo
        dependencies={["name", "email", "phone"]}
        render={(fieldsMap) => (
          <button
            type="submit"
            disabled={
              !Object.values(fieldsMap).every((field) => field.meta.isDone)
            }
            className="rounded-md border-2 border-gray-300 bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
          >
            Submit
          </button>
        )}
      />
      <button
        type="button"
        onClick={() => {
          setCount((c) => c + 1);
        }}
        className="cursor-pointer rounded-md border-2 border-gray-300 bg-blue-500 p-2 text-white hover:bg-blue-600"
      >
        Button was clicked {count} times
      </button>
      <SubscribeTo
        dependencies={["name"]}
        render={(fieldsMap) => (
          <pre
            className={cn({
              "text-red-500": fieldsMap.name.meta.issue,
              "text-green-500": fieldsMap.name.meta.isDone,
            })}
          >
            Name: {JSON.stringify(fieldsMap, null, 2)}
          </pre>
        )}
      />
      <SubscribeTo
        dependencies={["email"]}
        render={(fieldsMap) => (
          <pre
            className={cn({
              "text-red-500": fieldsMap.email.meta.issue,
              "text-green-500": fieldsMap.email.meta.isDone,
            })}
          >
            Email: {JSON.stringify(fieldsMap, null, 2)}
          </pre>
        )}
      />
    </Form>
  );
}

export default App;
