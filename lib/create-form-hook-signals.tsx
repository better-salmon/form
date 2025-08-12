import { createContext, use, useState } from "react";
import { signal, useSignal, type Signal } from "@lib/store/signals";

type DefaultValues = Record<string, unknown>;

type SignalFieldMap<T extends DefaultValues> = {
  [K in keyof T]: {
    value: Signal<T[K]>;
    meta: {
      isTouched: Signal<boolean>;
      numberOfChanges: Signal<number>;
      numberOfSubmissions: Signal<number>;
    };
  };
};

type SignalFormStore<T extends DefaultValues> = {
  fieldsMap: SignalFieldMap<T>;

  updateValue: (name: keyof T, value: T[keyof T]) => void;
};

const SignalStoreContext = createContext<SignalFormStore<DefaultValues> | null>(
  null,
);

function SignalFormProvider<T extends DefaultValues>({
  children,
  formStore,
}: Readonly<{
  children: React.ReactNode;
  formStore: SignalFormStore<T>;
}>) {
  return (
    <SignalStoreContext value={formStore as SignalFormStore<DefaultValues>}>
      {children}
    </SignalStoreContext>
  );
}

type UseFieldSignalOptions<T extends DefaultValues, K extends keyof T> = {
  name: K;
};

type UseFieldSignalResult<T extends DefaultValues, K extends keyof T> = {
  name: K;
  value: T[K];
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  handleChange: (value: T[K]) => void;
};

function useSignalField<T extends DefaultValues, K extends keyof T>(
  options: UseFieldSignalOptions<T, K>,
): UseFieldSignalResult<T, K> {
  const store = use(SignalStoreContext) as SignalFormStore<T> | null;

  if (!store) {
    throw new Error("useFieldSignal must be used within a SignalFormProvider");
  }

  const value = useSignal(store.fieldsMap[options.name].value);
  const isTouched = useSignal(store.fieldsMap[options.name].meta.isTouched);
  const numberOfChanges = useSignal(
    store.fieldsMap[options.name].meta.numberOfChanges,
  );
  const numberOfSubmissions = useSignal(
    store.fieldsMap[options.name].meta.numberOfSubmissions,
  );

  const handleChange = (value: T[K]) => {
    store.updateValue(options.name, value);
  };

  return {
    name: options.name,
    value,
    meta: {
      isTouched,
      numberOfChanges,
      numberOfSubmissions,
    },
    handleChange,
  };
}

function SignalField({
  options,
  children,
}: {
  options: UseFieldSignalOptions<DefaultValues, keyof DefaultValues>;
  children: (
    field: UseFieldSignalResult<DefaultValues, keyof DefaultValues>,
  ) => React.ReactNode;
}) {
  const field = useSignalField(options);

  return children(field);
}

export type UseSignalFormResult<T extends DefaultValues> = {
  SignalField: typeof SignalField;
  formStore: SignalFormStore<T>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

type UseSignalFormOptions<T extends DefaultValues> = {
  defaultValues: T;
};

type CreateSignalFormHookResult<T extends DefaultValues> = {
  useSignalForm: (options: UseSignalFormOptions<T>) => UseSignalFormResult<T>;
  useSignalField: <K extends keyof T>(
    options: UseFieldSignalOptions<T, K>,
  ) => UseFieldSignalResult<T, K>;
};

function createSignalFormStore<T extends DefaultValues>(
  defaultValues: T,
): SignalFormStore<T> {
  const fieldsMap = Object.fromEntries(
    Object.entries(defaultValues).map(([key, value]) => [
      key,
      {
        value: signal(value),
        meta: {
          isTouched: signal(false),
          numberOfChanges: signal(0),
          numberOfSubmissions: signal(0),
        },
      } as SignalFieldMap<T>[keyof T],
    ]),
  ) as SignalFieldMap<T>;

  function updateValue(name: keyof T, value: T[keyof T]) {
    fieldsMap[name].value.setValue(value);
    const previousNumberOfChanges =
      fieldsMap[name].meta.numberOfChanges.peekValue();
    fieldsMap[name].meta.numberOfChanges.setValue(previousNumberOfChanges + 1);
  }

  return {
    fieldsMap,
    updateValue,
  };
}

/**
 * Main hook to create and manage a form
 */
export function useSignalForm<T extends DefaultValues>(
  options: UseSignalFormOptions<T>,
): UseSignalFormResult<T> {
  const [formStore] = useState(() =>
    createSignalFormStore(options.defaultValues),
  );

  return {
    SignalField,
    formStore,
    Form: (props: React.ComponentProps<"form">) => (
      <SignalFormProvider formStore={formStore}>
        <form {...props} />
      </SignalFormProvider>
    ),
  };
}

/**
 * Factory function to create typed form hooks
 */
export function createSignalFormHook<
  T extends DefaultValues,
>(): CreateSignalFormHookResult<T> {
  return {
    useSignalForm,
    useSignalField,
  };
}
