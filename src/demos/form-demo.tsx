import { createForm } from "@lib/create-form-hook";
import type { Branded } from "@/types/types";
import { shallow } from "@lib/shallow";

type Name = Branded<string, "name">;
type Email = Branded<string, "email">;

type NameForm = {
  name: Name;
  email: Email;
};

const { useField, useForm, defineField, useFormSelector, defineSelector } =
  createForm<NameForm>();

export default function FormDemo() {
  const { Form } = useForm({
    defaultValues: {
      name: "" as Name,
      email: "" as Email,
    },
  });

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Form Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Simple form with name and email fields
          </p>
        </div>

        <div className="space-y-4">
          <NameField />
          <EmailField />
        </div>

        <div className="pt-4">
          <SubmitButton />
        </div>
      </div>
    </Form>
  );
}

const nameFieldOptions = defineField({
  name: "name",
  respond: (context) => {
    if (context.value.length > 3) {
      return context.helpers.validation.valid();
    }

    return context.helpers.validation.idle();
  },
});

const emailFieldOptions = defineField({
  name: "email",
  respond: (context) => {
    if (context.value.length > 3) {
      return context.helpers.validation.valid();
    }

    return context.helpers.validation.idle();
  },
});

function NameField() {
  const field = useField(nameFieldOptions);

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Name</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value as Name);
          }}
          onBlur={field.blur}
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
  const field = useField(emailFieldOptions);

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Email</span>
      <div className="relative">
        <input
          type="email"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value as Email);
          }}
          onBlur={field.blur}
          className={
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          }
          placeholder="Enter your email..."
        />
      </div>
    </label>
  );
}

const isFormValid = defineSelector((s) => {
  return (
    s.validation("name").type === "valid" &&
    s.validation("email").type === "valid"
  );
});

function SubmitButton() {
  const isEnabled = useFormSelector(isFormValid, shallow);

  return (
    <button
      type="submit"
      className="w-full rounded-md border-2 border-blue-300 bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 focus:outline-none disabled:opacity-50"
      disabled={!isEnabled}
    >
      Create Account
    </button>
  );
}
