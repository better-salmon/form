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
    setValidationState: (validationState: ValidationState) => void;
    formApi: {
      dependencies: DependencyFields<T, D>;
    };
  };
}) => void;

export type AsyncValidator<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> = (props: {
  value: T[K];
  fieldApi: {
    meta: Field<T[K]>["meta"];
    setValidationState: (validationState: ValidationState) => void;
    formApi: {
      dependencies: DependencyFields<T, D>;
    };
  };
}) => Promise<void>;

export interface FieldValidators<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  readonly onBlur?: Validator<T, K, D>;
  readonly onSubmit?: Validator<T, K, D>;
  readonly onChange?: Validator<T, K, D>;
  readonly onMount?: Validator<T, K, D>;
  readonly onSubmitAsync?: AsyncValidator<T, K, D>;
}

export type ValidationState =
  | {
      type: "error";
      message: string;
    }
  | {
      type: "done";
    }
  | {
      type: "pending";
    }
  | {
      type: "validating";
    };

export interface Field<T = unknown> {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: ValidationState;
}

export interface FormApi<T extends DefaultValues, D extends keyof T = never> {
  submit: (fields?: readonly (keyof T)[]) => Promise<void>;
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
  handleSubmit: () => Promise<void>;
  handleBlur: () => void;
  setValidationState: (validationState: ValidationState) => void;
  meta: Field<T[K]>["meta"];
  formApi: Prettify<FormApi<T, D>>;
  validationState: ValidationState;
}

export interface Store<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  validatorsMap: ValidatorsMap<T>;
  dependenciesMap: DependenciesMap<T>;
  defaultValues: T;
}

export interface Actions<T extends DefaultValues> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => Promise<void>;
  setValidationState: (
    field: keyof T,
    validationState: ValidationState,
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

        snapshot.validatorsMap[field]?.onChange?.({
          value: value,
          fieldApi: {
            meta: snapshot.fieldsMap[field].meta,
            setValidationState: (validationState: ValidationState) => {
              snapshot.setValidationState(field, validationState);
            },
            formApi: {
              dependencies: dependenciesData,
            },
          },
        });
      },
      submit: async (fields?: readonly (keyof T)[]) => {
        const snapshot = get();
        const fieldsToSubmit = fields ?? getFieldNames(snapshot.fieldsMap);

        const syncSubmissionValidationResults = new Map<
          keyof T,
          ValidationState
        >();

        // Handle synchronous validators first
        for (const fieldName of fieldsToSubmit) {
          const validationStateType =
            snapshot.fieldsMap[fieldName].validationState.type;

          if (validationStateType !== "validating") {
            set((state) => {
              (state.fieldsMap as FieldsMap<T>)[fieldName].meta
                .numberOfSubmissions++;
            });
          }

          // Don't run validation if field is already validating or success
          if (
            validationStateType === "validating" ||
            validationStateType === "done"
          ) {
            continue;
          }

          const dependencies = snapshot.dependenciesMap[fieldName] || [];
          const dependenciesData = createDependencyFields<T, typeof fieldName>(
            snapshot.fieldsMap,
            dependencies,
          );

          snapshot.validatorsMap[fieldName]?.onSubmit?.({
            value: snapshot.fieldsMap[fieldName].value,
            fieldApi: {
              meta: snapshot.fieldsMap[fieldName].meta,
              setValidationState: (validationState: ValidationState) => {
                snapshot.setValidationState(fieldName, validationState);
                syncSubmissionValidationResults.set(fieldName, validationState);
              },
              formApi: {
                dependencies: dependenciesData,
              },
            },
          });
        }

        // Handle asynchronous validators
        const asyncValidations = fieldsToSubmit
          .map((fieldName) => {
            const validator = snapshot.validatorsMap[fieldName]?.onSubmitAsync;

            if (!validator) {
              return null;
            }

            const syncSubmissionValidationResultType =
              syncSubmissionValidationResults.get(fieldName)?.type;

            if (
              syncSubmissionValidationResultType === "error" ||
              syncSubmissionValidationResultType === "done"
            ) {
              return null;
            }

            const fieldValidationStateType =
              snapshot.fieldsMap[fieldName].validationState.type;

            if (
              fieldValidationStateType === "validating" ||
              fieldValidationStateType === "done"
            ) {
              return null;
            }

            return async () => {
              const currentSnapshot = get();
              const dependencies =
                currentSnapshot.dependenciesMap[fieldName] || [];
              const dependenciesData = createDependencyFields<
                T,
                typeof fieldName
              >(currentSnapshot.fieldsMap, dependencies);

              // Set validating state
              currentSnapshot.setValidationState(fieldName, {
                type: "validating",
              });

              try {
                await validator({
                  value: currentSnapshot.fieldsMap[fieldName].value,
                  fieldApi: {
                    meta: currentSnapshot.fieldsMap[fieldName].meta,
                    setValidationState: (validationState: ValidationState) => {
                      currentSnapshot.setValidationState(
                        fieldName,
                        validationState,
                      );
                    },
                    formApi: {
                      dependencies: dependenciesData,
                    },
                  },
                });
              } catch {
                currentSnapshot.setValidationState(fieldName, {
                  type: "error",
                  message: "Async validation failed",
                });
              }
            };
          })
          .filter((validation) => validation !== null);

        // Execute async validations in parallel
        if (asyncValidations.length > 0) {
          await Promise.allSettled(
            asyncValidations.map((validation) => validation()),
          );
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
        validationState: ValidationState,
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

  const handleSubmit = async () => {
    await submit([options.name]);
  };

  const formApi: FormApi<T, D> = {
    submit: async (fields?: readonly (keyof T)[]) => {
      await submit(fields);
    },
    dependencies,
  };

  const setValidationStateToStore = useCallback(
    (validationState: ValidationState) => {
      setValidationState(options.name, validationState);
    },
    [options.name, setValidationState],
  );

  const handleBlur = () => {
    // Don't run validation if field is already validating
    if (field.validationState.type === "validating") {
      return;
    }

    options.validators?.onBlur?.({
      value: field.value,
      fieldApi: {
        meta: field.meta,
        setValidationState: setValidationStateToStore,
        formApi: {
          dependencies,
        },
      },
    });
  };

  useIsomorphicEffect(() => {
    // Don't run validation if field is already validating
    if (field.validationState.type === "validating") {
      return;
    }

    options.validators?.onMount?.({
      value: field.value,
      fieldApi: {
        meta: field.meta,
        setValidationState: setValidationStateToStore,
        formApi: {
          dependencies,
        },
      },
    });
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
