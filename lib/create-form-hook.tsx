import { createContext, use, useCallback, useMemo, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { mutative } from "zustand-mutative";
import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@lib/deep-equal";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type DefaultValues = Record<string, unknown>;

export type FieldsMap<T extends DefaultValues> = {
  [K in keyof T]: Field<T[K]>;
};

export type ValidatorsMap<T extends DefaultValues> = {
  [K in keyof T]?: FieldValidators<T, K, Exclude<keyof T, K>>;
};

export type DependenciesMap<T extends DefaultValues> = {
  [K in keyof T]?: readonly (keyof T)[];
};

export type FieldEntries<T extends DefaultValues> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export type DependencyFields<
  T extends DefaultValues,
  D extends keyof T,
> = Prettify<Pick<FieldsMap<T>, D>>;

export interface OnDoneChangeProps<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  changedFields: readonly (keyof T)[];
}

export type Validator<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> = (props: {
  value: T[K];
  fieldApi: {
    meta: Field<T[K]>["meta"];
    formApi: {
      dependencies: DependencyFields<T, D>;
    };
  };
}) => AllowedValidationResult | Promise<AllowedValidationResult>;

export interface FieldValidators<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  readonly onBlur?: Validator<T, K, D>;
  readonly onSubmit?: Validator<T, K, D>;
  readonly onChange?: Validator<T, K, D>;
  readonly onMount?: Validator<T, K, D>;
}

export interface ErrorValidationResult {
  type: "error";
  message: string;
}

export interface DoneValidationResult {
  type: "done";
}

export interface PendingValidationResult {
  type: "pending";
}

export interface ValidatingValidationResult {
  type: "validating";
}

export type ValidationResult =
  | ErrorValidationResult
  | DoneValidationResult
  | PendingValidationResult
  | ValidatingValidationResult;

export type AllowedValidationResult = Exclude<
  ValidationResult,
  ValidatingValidationResult
>;

export interface Field<T = unknown> {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: ValidationResult;
}

export interface FormApi<T extends DefaultValues, D extends keyof T = never> {
  submit: (fields?: readonly (keyof T)[]) => void;
  dependencies: DependencyFields<T, D>;
}

export interface FieldApi<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  name: K;
  value: T[K];
  handleChange: (value: T[K]) => void;
  handleSubmit: () => void;
  handleBlur: () => void;
  setValidationState: (validationState: ValidationResult) => void;
  meta: Field<T[K]>["meta"];
  formApi: Prettify<FormApi<T, D>>;
  validationState: ValidationResult;
}

export interface Store<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  validatorsMap: ValidatorsMap<T>;
  dependenciesMap: DependenciesMap<T>;
  defaultValues: T;
}

export interface Actions<T extends DefaultValues> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setValidationState: (
    field: keyof T,
    validationState: ValidationResult,
  ) => void;
  setValidators: <K extends keyof T, D extends Exclude<keyof T, K> = never>(
    field: K,
    validators?: FieldValidators<T, K, D>,
  ) => void;
  setDependencies: <K extends keyof T>(
    field: K,
    dependencies?: readonly Exclude<keyof T, K>[],
  ) => void;
  setDefaultValues: (defaultValues: T) => void;
}

export interface UseFormOptions<T extends DefaultValues> {
  defaultValues: T;
  onDoneChange?: (props: OnDoneChangeProps<T>) => void;
}

export interface UseFormResult<T extends DefaultValues> {
  Field: <K extends keyof T, D extends Exclude<keyof T, K> = never>(props: {
    name: K;
    validators?: FieldValidators<T, K, D>;
    dependencies?: readonly D[];
    render: (props: Prettify<FieldApi<T, K, D>>) => React.ReactNode;
  }) => React.ReactNode;

  SubscribeTo: <K extends keyof T>(props: {
    dependencies: readonly K[];
    render: (fieldsMap: Prettify<Pick<FieldsMap<T>, K>>) => React.ReactNode;
  }) => React.ReactNode;

  formStore: ReturnType<typeof createFormStoreMutative<T>>;

  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
}

export interface CreateFormHookResult<T extends DefaultValues> {
  useForm: (options: UseFormOptions<T>) => UseFormResult<T>;
  useField: <
    K extends keyof T,
    D extends Exclude<keyof T, K> = never,
  >(options: {
    name: K;
    validators?: FieldValidators<T, K, D>;
    dependencies?: readonly D[];
  }) => Prettify<FieldApi<T, K, D>>;
  useSubscribeTo: <K extends keyof T>(props: {
    dependencies: readonly K[];
  }) => Prettify<Pick<FieldsMap<T>, K>>;
}

function createInitialFieldsMap<T extends DefaultValues>(
  defaultValues: T,
): FieldsMap<T> {
  const entries = Object.entries(defaultValues) as FieldEntries<T>;

  return Object.fromEntries(
    entries.map(([field, defaultValue]) => [
      field,
      {
        value: defaultValue,
        meta: {
          isTouched: false,
          numberOfChanges: 0,
          numberOfSubmissions: 0,
        },
        validationState: {
          type: "pending",
        },
      } satisfies Field<T[typeof field]>,
    ]),
  ) as FieldsMap<T>;
}

function createDependencyFields<T extends DefaultValues, K extends keyof T>(
  fieldsMap: FieldsMap<T>,
  dependencies: readonly (keyof T)[],
): DependencyFields<T, Exclude<keyof T, K>> {
  return Object.fromEntries(
    dependencies.map((dep) => [dep, fieldsMap[dep]]),
  ) as DependencyFields<T, Exclude<keyof T, K>>;
}

function getFieldNames<T extends DefaultValues>(
  fieldsMap: FieldsMap<T>,
): (keyof T)[] {
  return Object.keys(fieldsMap) as (keyof T)[];
}

function createFormStoreMutative<T extends DefaultValues>(
  options: UseFormOptions<T>,
) {
  return createStore<Store<T> & Actions<T>>()(
    mutative((set, get) => ({
      defaultValues: options.defaultValues,
      validatorsMap: {} as ValidatorsMap<T>,
      dependenciesMap: {} as DependenciesMap<T>,
      setValidators: <K extends keyof T, D extends Exclude<keyof T, K> = never>(
        field: K,
        validators?: FieldValidators<T, K, D>,
      ) => {
        set((state) => {
          (state.validatorsMap as ValidatorsMap<T>)[field] = validators;
        });
      },
      fieldsMap: createInitialFieldsMap(options.defaultValues),
      setValue: <K extends keyof T>(field: K, value: T[K]) => {
        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          if (deepEqual(fieldsMap[field].value, value)) {
            return;
          }

          fieldsMap[field].value = value;
          fieldsMap[field].meta.isTouched = true;
          fieldsMap[field].meta.numberOfChanges++;
        });

        const snapshot = get();

        // Don't run validation if field is already validating
        if (snapshot.fieldsMap[field].validationState.type === "validating") {
          return;
        }

        const dependencies = snapshot.dependenciesMap[field] || [];
        const dependenciesData = createDependencyFields<T, K>(
          snapshot.fieldsMap,
          dependencies,
        );

        const validationStateOrPromise = snapshot.validatorsMap[
          field
        ]?.onChange?.({
          value: value,
          fieldApi: {
            meta: snapshot.fieldsMap[field].meta,
            formApi: {
              dependencies: dependenciesData,
            },
          },
        });

        if (!validationStateOrPromise) {
          return;
        }

        if (validationStateOrPromise instanceof Promise) {
          snapshot.setValidationState(field, {
            type: "validating",
          });

          validationStateOrPromise
            .then((validationState) => {
              snapshot.setValidationState(field, validationState);
            })
            .catch(() => {
              snapshot.setValidationState(field, {
                type: "error",
                message: "Async validation failed",
              });
            });

          return;
        }

        snapshot.setValidationState(field, validationStateOrPromise);
      },
      submit: (fields?: readonly (keyof T)[]) => {
        const snapshot = get();
        const fieldsToSubmit = fields ?? getFieldNames(snapshot.fieldsMap);

        for (const field of fieldsToSubmit) {
          const validationStateOrPromise = snapshot.validatorsMap[
            field
          ]?.onSubmit?.({
            value: snapshot.fieldsMap[field].value,
            fieldApi: {
              meta: snapshot.fieldsMap[field].meta,
              formApi: {
                dependencies: createDependencyFields(
                  snapshot.fieldsMap,
                  snapshot.dependenciesMap[field] ?? [],
                ),
              },
            },
          });

          if (!validationStateOrPromise) {
            continue;
          }

          if (validationStateOrPromise instanceof Promise) {
            snapshot.setValidationState(field, {
              type: "validating",
            });

            validationStateOrPromise
              .then((validationState) => {
                snapshot.setValidationState(field, validationState);
              })
              .catch(() => {
                snapshot.setValidationState(field, {
                  type: "error",
                  message: "Async validation failed",
                });
              });

            return;
          }

          snapshot.setValidationState(field, validationStateOrPromise);
        }
      },
      setDependencies: <K extends keyof T>(
        field: K,
        dependencies?: readonly Exclude<keyof T, K>[],
      ) => {
        set((state) => {
          (state.dependenciesMap as DependenciesMap<T>)[field] =
            dependencies ?? [];
        });
      },
      setDefaultValues: (defaultValues: T) => {
        set((state) => {
          (state.defaultValues as T) = defaultValues;

          for (const [field] of Object.entries(defaultValues)) {
            (state.fieldsMap as FieldsMap<T>)[field as keyof T].value ??=
              defaultValues[field as keyof T];
          }
        });
      },
      setValidationState: (
        field: keyof T,
        validationState: ValidationResult,
      ) => {
        const snapshot = get();

        const previousValidationStateType =
          snapshot.fieldsMap[field].validationState.type;

        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          fieldsMap[field].validationState = validationState;
        });

        if (
          (previousValidationStateType === "done" &&
            validationState.type !== "done") ||
          (previousValidationStateType !== "done" &&
            validationState.type === "done")
        ) {
          options.onDoneChange?.({
            fieldsMap: snapshot.fieldsMap,
            changedFields: [field],
          });
        }
      },
    })),
  );
}

const FormContext = createContext<StoreApi<
  Store<DefaultValues> & Actions<DefaultValues>
> | null>(null);

function FormProvider({
  children,
  formStore,
}: {
  children: React.ReactNode;
  formStore: StoreApi<Store<DefaultValues> & Actions<DefaultValues>>;
}) {
  return <FormContext value={formStore}>{children}</FormContext>;
}

function Field<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
>(props: {
  name: K;
  validators?: FieldValidators<T, K, D>;
  dependencies?: readonly D[];
  render: (props: FieldApi<T, K, D>) => React.ReactNode;
}) {
  const field = useField<T, K, D>({
    name: props.name,
    validators: props.validators,
    dependencies: props.dependencies,
  });

  return props.render(field);
}

function SubscribeTo<T extends DefaultValues, K extends keyof T>(props: {
  dependencies: readonly K[];
  render: (fieldsMap: Prettify<Pick<FieldsMap<T>, K>>) => React.ReactNode;
}) {
  const fields = useSubscribeTo<T, K>({
    dependencies: props.dependencies,
  });

  return props.render(fields);
}

function useSubscribeTo<T extends DefaultValues, K extends keyof T>(props: {
  dependencies: readonly K[];
}) {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const selector = useShallow(
    (state: Store<T>): Pick<FieldsMap<T>, K> =>
      Object.fromEntries(
        props.dependencies.map((name) => [name, state.fieldsMap[name]]),
      ) as Pick<FieldsMap<T>, K>,
  );

  return useStore(formStore, selector);
}

function useField<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
>(options: {
  name: K;
  validators?: FieldValidators<T, K, D>;
  dependencies?: readonly D[];
}): FieldApi<T, K, D> {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const dependenciesArray = useMemo(
    () => options.dependencies ?? ([] as readonly D[]),
    [options.dependencies],
  );

  const dependencies = useStore(
    formStore,
    useShallow(
      (state: Store<T>): DependencyFields<T, D> =>
        Object.fromEntries(
          dependenciesArray.map((name) => [name, state.fieldsMap[name]]),
        ) as DependencyFields<T, D>,
    ),
  );
  const field = useStore(
    formStore,
    useShallow((state: Store<T>) => state.fieldsMap[options.name]),
  );
  const setValue = useStore(formStore, (state) => state.setValue);
  const submit = useStore(formStore, (state) => state.submit);
  const setValidationState = useStore(
    formStore,
    (state) => state.setValidationState,
  );

  useIsomorphicEffect(() => {
    if (
      !deepEqual(
        dependenciesArray,
        formStore.getState().dependenciesMap[options.name],
      )
    ) {
      formStore.getState().setDependencies(options.name, dependenciesArray);
    }

    if (
      !deepEqual(
        options.validators,
        formStore.getState().validatorsMap[options.name],
      )
    ) {
      formStore.getState().setValidators(options.name, options.validators);
    }
  }, [dependenciesArray, formStore, options.name, options.validators]);

  const handleChange = (value: T[K]) => {
    setValue(options.name, value);
  };

  const handleSubmit = () => {
    submit([options.name]);
  };

  const formApi: FormApi<T, D> = {
    submit: (fields?: readonly (keyof T)[]) => {
      submit(fields);
    },
    dependencies,
  };

  const setValidationStateToStore = useCallback(
    (validationState: ValidationResult) => {
      setValidationState(options.name, validationState);
    },
    [options.name, setValidationState],
  );

  const handleBlur = () => {
    // Don't run validation if field is already validating
    if (field.validationState.type === "validating") {
      return;
    }

    const validationStateOrPromise = options.validators?.onBlur?.({
      value: field.value,
      fieldApi: {
        meta: field.meta,
        formApi: {
          dependencies,
        },
      },
    });

    if (!validationStateOrPromise) {
      return;
    }

    if (validationStateOrPromise instanceof Promise) {
      setValidationStateToStore({
        type: "validating",
      });

      validationStateOrPromise.then(setValidationStateToStore).catch(() => {
        setValidationStateToStore({
          type: "error",
          message: "Async validation failed",
        });
      });

      return;
    }

    setValidationStateToStore(validationStateOrPromise);
  };

  useIsomorphicEffect(() => {
    // Don't run validation if field is already validating
    if (
      field.validationState.type === "validating" ||
      field.value === undefined
    ) {
      return;
    }

    const validationStateOrPromise = options.validators?.onMount?.({
      value: field.value,
      fieldApi: {
        meta: field.meta,
        formApi: {
          dependencies,
        },
      },
    });

    if (!validationStateOrPromise) {
      return;
    }

    if (validationStateOrPromise instanceof Promise) {
      setValidationStateToStore({
        type: "validating",
      });

      validationStateOrPromise.then(setValidationStateToStore).catch(() => {
        setValidationStateToStore({
          type: "error",
          message: "Async validation failed",
        });
      });

      return;
    }

    setValidationStateToStore(validationStateOrPromise);
  }, [
    dependencies,
    field.meta,
    field.validationState.type,
    field.value,
    options.validators,
    setValidationStateToStore,
  ]);

  return {
    name: options.name,
    value: field.value,
    meta: field.meta,
    validationState: field.validationState,
    handleChange,
    handleSubmit,
    handleBlur,
    setValidationState: setValidationStateToStore,
    formApi,
  };
}

export function useForm<T extends DefaultValues>(
  options: UseFormOptions<T>,
): UseFormResult<T> {
  const [formStore] = useState(() => createFormStoreMutative(options));

  useIsomorphicEffect(() => {
    if (!deepEqual(options.defaultValues, formStore.getState().defaultValues)) {
      formStore.getState().setDefaultValues(options.defaultValues);
    }
  }, [options.defaultValues, formStore]);

  return {
    Field,
    SubscribeTo,
    formStore,
    Form: (props: React.ComponentProps<"form">) => (
      <FormProvider
        formStore={
          formStore as StoreApi<Store<DefaultValues> & Actions<DefaultValues>>
        }
      >
        <form {...props} />
      </FormProvider>
    ),
  };
}

export function createFormHook<
  T extends DefaultValues,
>(): CreateFormHookResult<T> {
  return {
    useForm,
    useField,
    useSubscribeTo,
  };
}
