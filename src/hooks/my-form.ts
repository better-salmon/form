import { createFormHook } from "@lib/create-form-hook";

export const { useForm, useField, useSubscribeTo } = createFormHook<{
  name: {
    firstName: string;
    lastName: string;
  };
  email: string;
  phone: string | undefined;
}>();
