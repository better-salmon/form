import { useState } from "react";
import {
  QueryClient,
  useQuery,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useForm } from "@/hooks/my-form";
import { Name } from "@/components/name";
import { Email } from "@/components/email";
import { Phone } from "@/components/phone";
import { NextButton } from "@/components/next-button";

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
  const { Form } = useForm({
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
      <h3 className="text-2xl font-bold">Split into multiple files</h3>
      <Name />
      <Email />
      <Phone />
      <NextButton />
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
