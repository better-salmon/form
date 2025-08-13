import { createSignalFormHook } from "@lib/create-form-hook-signals";
import type { Branded } from "@/types/types";

type Name = Branded<string, "name">;
type Email = Branded<string, "email">;

type NameForm = {
  name: Name;
  email: Email;
};

const { useSignalField, useSignalForm } = createSignalFormHook<NameForm>();

export function SignalFormDemo() {
  const { Form } = useSignalForm({
    defaultValues: {
      name: "" as Name,
      email: "" as Email,
    },
  });

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Signal Form Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Simple form with name and email fields
          </p>
        </div>

        <div className="space-y-4">
          <NameField />
          <EmailField />
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
    </Form>
  );
}

function NameField() {
  const field = useSignalField({
    name: "name",
    respond: (props) => {
      console.log(props);
    },
    on: { from: { email: ["change"] } },
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Name</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value as Name);
          }}
          onBlur={field.handleBlur}
          className={
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          }
          placeholder="Enter your name..."
        />
      </div>
    </label>
  );
}

function EmailField() {
  const field = useSignalField({
    name: "email",
    respond: (ctx) => {
      console.log(ctx);
    },
  });

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Email</span>
      <div className="relative">
        <input
          type="email"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value as Email);
          }}
          onBlur={field.handleBlur}
          className={
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          }
          placeholder="Enter your email..."
        />
      </div>
    </label>
  );
}
