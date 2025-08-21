import { createForm } from "form";
import type { Branded } from "@/types/types";

type Password = Branded<string, "password">;

type PasswordForm = {
  password: Password;
  confirmPassword: Password;
};

const { useField, useForm, defineField } = createForm<PasswordForm>();

export default function FormDemo() {
  const { Form } = useForm({
    defaultValues: {
      password: "" as Password,
      confirmPassword: "" as Password,
    },
  });

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Sync Respond Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Simple form with password and confirm password fields
          </p>
        </div>

        <div className="space-y-4">
          <PasswordField />
          <ConfirmPasswordField />
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

const passwordFieldOptions = defineField({
  name: "password",
  respond: (context) => {
    console.log(context);
    if (context.value.length < 4) {
      return context.helpers.validation.invalid({
        issues: [{ message: "Password must be at least 4 characters long" }],
      });
    }
    return context.helpers.validation.valid();
  },
});

const confirmPasswordFieldOptions = defineField({
  name: "confirmPassword",
  watch: { fields: { password: ["change"] } },
  respond: (context) => {
    console.log(context);
    if (context.value.length < 4) {
      return context.helpers.validation.idle();
    }
    if (context.value !== context.form.getSnapshot("password").value) {
      return context.helpers.validation.invalid({
        issues: [{ message: "Passwords do not match" }],
      });
    }
    return context.helpers.validation.valid();
  },
});

function PasswordField() {
  const field = useField(passwordFieldOptions);

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Password</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value as Password);
          }}
          onBlur={field.blur}
          className={
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          }
          placeholder="Enter your password..."
        />
        <div className="text-sm text-red-500">
          {field.validation.type === "invalid" &&
            field.validation.issues.map((issue) => issue.message).join(", ")}
        </div>
      </div>
    </label>
  );
}

function ConfirmPasswordField() {
  const field = useField(confirmPasswordFieldOptions);

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Confirm Password</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value as Password);
          }}
          onBlur={field.blur}
          className={
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none"
          }
          placeholder="Confirm your password..."
        />
        <div className="text-sm text-red-500">
          {field.validation.type === "invalid" &&
            field.validation.issues.map((issue) => issue.message).join(", ")}
        </div>
      </div>
    </label>
  );
}
