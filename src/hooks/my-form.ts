import { createFormHook, type FieldOptionsInput } from "@lib/create-form-hook";

export type FormType = {
  name: {
    firstName: string;
    lastName: string;
  };
  email: string;
  phone: string | undefined;
};

export type FieldOptions = FieldOptionsInput<FormType>;

export const { useForm, useField, useFieldDependencies } =
  createFormHook<FormType>();
