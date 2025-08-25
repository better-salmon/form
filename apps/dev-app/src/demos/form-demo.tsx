import { createForm } from "al-formo";
import type { Branded } from "@/types/types";
import { useState } from "react";

type Name = Branded<string, "name">;
type Email = Branded<string, "email">;

type NameForm = {
  name: Name;
  email: Email;
};

const { useField, useForm, defineField, useFormSelector, defineSelector } =
  createForm<NameForm>();

function toggleLockButton(lockButton: boolean) {
  return !lockButton;
}

export default function FormDemo() {
  const { Form } = useForm({
    defaultValues: {
      name: "" as Name,
      email: "" as Email,
    },
  });

  const [lockButton, setLockButton] = useState(false);
  const [minLength, setMinLength] = useState(3);

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="flex gap-2"></div>
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Form Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Simple form with name and email fields
          </p>
        </div>

        <div className="space-y-4">
          <NameField minLength={minLength} />
          <EmailField minLength={minLength} />
        </div>
        <div className="pt-4">
          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="minLength" className="text-sm font-medium">
              Min length:
            </label>
            <input
              id="minLength"
              className="mr-2 rounded-md border-2 border-gray-300 p-2"
              type="number"
              min={1}
              value={minLength}
              onChange={(e) => {
                setMinLength(e.target.valueAsNumber);
              }}
            />
            <input
              id="lockButton"
              className="mr-2 rounded-md border-2 border-gray-300 p-2"
              type="checkbox"
              checked={lockButton}
              onChange={() => {
                setLockButton(toggleLockButton);
              }}
            />
            <label htmlFor="lockButton" className="text-sm font-medium">
              Lock button
            </label>
          </div>

          <SubmitButton forceDisabled={lockButton} />
        </div>
      </div>
    </Form>
  );
}

const nameFieldOptions = defineField({
  name: "name",
  respond: (context, props: { minLength?: number } = {}) => {
    const { minLength = 3 } = props;

    if (context.value.length > minLength) {
      return context.helpers.validation.valid();
    }

    return context.helpers.validation.idle();
  },
});

const emailFieldOptions = defineField({
  name: "email",
  respond: (context, props: { minLength?: number } = {}) => {
    const { minLength = 3 } = props;

    if (context.value.length > minLength) {
      return context.helpers.validation.valid();
    }

    return context.helpers.validation.idle();
  },
});

function NameField(props: Readonly<{ minLength?: number }>) {
  const field = useField(nameFieldOptions, {
    props,
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

function EmailField(props: Readonly<{ minLength?: number }>) {
  const field = useField(emailFieldOptions, {
    props,
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

const isFormSubmittable = defineSelector(
  (s, props: { forceDisabled?: boolean } = {}) => {
    console.log("from selector props", props);

    if (props.forceDisabled) {
      return false;
    }

    return (
      s.validation("name").type === "valid" &&
      s.validation("email").type === "valid"
    );
  },
);

function SubmitButton(props: Readonly<{ forceDisabled?: boolean }>) {
  const isEnabled = useFormSelector(isFormSubmittable, {
    props,
  });

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
