import { createContext, use, useMemo, useRef, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { mutative } from "zustand-mutative";
import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@lib/deep-equal";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";

const DEFAULT_ASYNC_DEBOUNCE = 0;

class FieldAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormAbortError";
  }
}

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

export interface ValidatorProps<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  value: T[K];
  meta: Field<T[K]>["meta"];
  formApi: {
    dependencies: DependencyFields<T, D>;
  };
}

export interface ValidatorAsyncProps<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  value: T[K];
  meta: Field<T[K]>["meta"];
  formApi: {
    dependencies: DependencyFields<T, D>;
  };
  signal: AbortSignal;
}

export type Validator<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> = (props: ValidatorProps<T, K, D>) => AllowedValidationResult | void;

export type ValidatorAsync<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> = (props: ValidatorAsyncProps<T, K, D>) => Promise<AllowedValidationResult>;

export interface FieldValidators<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  readonly onBlur?: Validator<T, K, D>;
  readonly onBlurAsync?: ValidatorAsync<T, K, D>;
  readonly onBlurAsyncDebounce?: number;
  readonly onChange?: Validator<T, K, D>;
  readonly onChangeAsync?: ValidatorAsync<T, K, D>;
  readonly onChangeAsyncDebounce?: number;
  readonly onSubmit?: Validator<T, K, D>;
  readonly onSubmitAsync?: ValidatorAsync<T, K, D>;
  readonly onSubmitAsyncDebounce?: number;
  readonly onMount?: Validator<T, K, D>;
  readonly onMountAsync?: ValidatorAsync<T, K, D>;
  readonly onMountAsyncDebounce?: number;
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
  meta: Field<T[K]>["meta"];
  formApi: Prettify<FormApi<T, D>>;
  validationState: ValidationResult;
}

export interface Store<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  validatorsMap: ValidatorsMap<T>;
  dependenciesMap: DependenciesMap<T>;
  defaultValues: T;
  asyncDebounceMap: Record<keyof T, number>;
  asyncTimeoutMap: Record<keyof T, NodeJS.Timeout | null>;
  asyncAbortControllerMap: Record<keyof T, AbortController | null>;
}

export interface Actions<T extends DefaultValues> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setValidationState: (
    field: keyof T,
    validationState?: ValidationResult,
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
  setAsyncDebounce: (field: keyof T, debounce: number) => void;
  clearAsyncTimeout: (field: keyof T) => void;
  setAsyncAbortController: (
    field: keyof T,
    controller: AbortController | null,
  ) => void;
  runValidation: (
    field: keyof T,
    action: "onBlur" | "onChange" | "onSubmit" | "onMount",
  ) => void;
}

export interface UseFormOptions<T extends DefaultValues> {
  defaultValues: T;
  onDoneChange?: (props: OnDoneChangeProps<T>) => void;
}

export interface UseFieldPropsWithRender<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> extends UseFieldOptions<T, K, D> {
  render: (props: Prettify<FieldApi<T, K, D>>) => React.ReactNode;
}

export interface UseFormResult<T extends DefaultValues> {
  Field: <K extends keyof T, D extends Exclude<keyof T, K> = never>(
    props: UseFieldPropsWithRender<T, K, D>,
  ) => React.ReactNode;

  SubscribeTo: <K extends keyof T>(props: {
    dependencies: readonly K[];
    render: (fieldsMap: Prettify<Pick<FieldsMap<T>, K>>) => React.ReactNode;
  }) => React.ReactNode;

  formStore: ReturnType<typeof createFormStoreMutative<T>>;

  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
}

export interface UseFieldOptions<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  name: K;
  validators?: FieldValidators<T, K, D>;
  dependencies?: readonly D[];
  asyncDebounce?: number;
}

export interface CreateFormHookResult<T extends DefaultValues> {
  useForm: (options: UseFormOptions<T>) => UseFormResult<T>;
  useField: <K extends keyof T, D extends Exclude<keyof T, K> = never>(
    options: UseFieldOptions<T, K, D>,
  ) => Prettify<FieldApi<T, K, D>>;
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
      asyncDebounceMap: {} as Record<keyof T, number>,
      asyncTimeoutMap: {} as Record<keyof T, NodeJS.Timeout | null>,
      asyncAbortControllerMap: {} as Record<keyof T, AbortController | null>,
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

        get().runValidation(field, "onChange");
      },
      submit: (fields?: readonly (keyof T)[]) => {
        const snapshot = get();
        const fieldsToSubmit = fields ?? getFieldNames(snapshot.fieldsMap);

        for (const field of fieldsToSubmit) {
          get().runValidation(field, "onSubmit");
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
      setAsyncDebounce: (field: keyof T, debounce: number) => {
        set((state) => {
          (state.asyncDebounceMap as Record<keyof T, number>)[field] = debounce;
        });
      },
      clearAsyncTimeout: (field: keyof T) => {
        set((state) => {
          (state.asyncTimeoutMap as Record<keyof T, NodeJS.Timeout | null>)[
            field
          ] = null;
        });
      },
      setAsyncAbortController: (
        field: keyof T,
        controller: AbortController | null,
      ) => {
        set((state) => {
          (
            state.asyncAbortControllerMap as Record<
              keyof T,
              AbortController | null
            >
          )[field] = controller;
        });
      },
      setValidationState: (
        field: keyof T,
        validationState?: ValidationResult,
      ) => {
        if (!validationState) {
          return;
        }

        const previousValidationStateType =
          get().fieldsMap[field].validationState.type;

        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          fieldsMap[field].validationState = validationState;
        });

        if (
          (previousValidationStateType === "done") !==
          (validationState.type === "done")
        ) {
          options.onDoneChange?.({
            fieldsMap: get().fieldsMap,
            changedFields: [field],
          });
        }
      },
      runValidation: (
        field: keyof T,
        action: "onBlur" | "onChange" | "onSubmit" | "onMount",
      ) => {
        const snapshot = get();

        const value = snapshot.fieldsMap[field].value;

        const dependencies = snapshot.dependenciesMap[field] || [];
        const dependenciesData = createDependencyFields<T, keyof T>(
          snapshot.fieldsMap,
          dependencies,
        );

        const validator = snapshot.validatorsMap[field]?.[action];

        const validationState = validator?.({
          value,
          meta: snapshot.fieldsMap[field].meta,
          formApi: {
            dependencies: dependenciesData,
          },
        });

        if (validationState) {
          snapshot.setValidationState(field, validationState);
        }

        const asyncValidatorName = `${action}Async` as const;
        const asyncDebounceName = `${action}AsyncDebounce` as const;

        const asyncValidator =
          snapshot.validatorsMap[field]?.[asyncValidatorName];

        const asyncDebounceMs =
          snapshot.validatorsMap[field]?.[asyncDebounceName] ??
          snapshot.asyncDebounceMap[field];

        if (!asyncValidator) {
          return;
        }

        // Clear existing timeout for this field
        const existingTimeout = snapshot.asyncTimeoutMap[field];
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }

        // Abort existing async validation for this field
        const existingAbortController = snapshot.asyncAbortControllerMap[field];
        if (existingAbortController) {
          existingAbortController.abort(
            new FieldAbortError("Aborted by new validation"),
          );
        }

        // Set up debounced async validation
        const timeoutId = setTimeout(() => {
          const currentSnapshot = get();

          const currentValue = currentSnapshot.fieldsMap[field].value;

          const currentAsyncValidator =
            currentSnapshot.validatorsMap[field]?.[asyncValidatorName];

          // Double-check the validator still exists and value hasn't changed
          if (
            !currentAsyncValidator ||
            currentSnapshot.fieldsMap[field].value !== value
          ) {
            return;
          }

          // Create new abort controller for this validation
          const abortController = new AbortController();
          currentSnapshot.setAsyncAbortController(field, abortController);

          const asyncValidationState = currentAsyncValidator({
            value: currentValue,
            meta: currentSnapshot.fieldsMap[field].meta,
            formApi: {
              dependencies: dependenciesData,
            },
            signal: abortController.signal,
          });

          currentSnapshot.setValidationState(field, {
            type: "validating",
          });

          asyncValidationState
            .then((validationState) => {
              // Only update if this validation wasn't aborted
              const latestSnapshot = get();
              if (
                latestSnapshot.asyncTimeoutMap[field] === timeoutId &&
                latestSnapshot.asyncAbortControllerMap[field] ===
                  abortController
              ) {
                latestSnapshot.setValidationState(field, validationState);
                latestSnapshot.clearAsyncTimeout(field);
                latestSnapshot.setAsyncAbortController(field, null);
              }
            })
            .catch((error: unknown) => {
              // Only update if this validation wasn't aborted
              const latestSnapshot = get();
              if (
                latestSnapshot.asyncTimeoutMap[field] === timeoutId &&
                latestSnapshot.asyncAbortControllerMap[field] ===
                  abortController
              ) {
                // Don't show error if validation was aborted
                const isAbortError = error instanceof FieldAbortError;
                if (!isAbortError) {
                  latestSnapshot.setValidationState(field, {
                    type: "error",
                    message: "Async validation failed",
                  });
                }
                latestSnapshot.clearAsyncTimeout(field);
                latestSnapshot.setAsyncAbortController(field, null);
              }
            });
        }, asyncDebounceMs);

        // Store the timeout ID
        set((state) => {
          (state.asyncTimeoutMap as Record<keyof T, NodeJS.Timeout | null>)[
            field
          ] = timeoutId;
        });
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
>(options: UseFieldOptions<T, K, D>): FieldApi<T, K, D> {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const dependenciesArray = useMemo(
    () => options.dependencies ?? ([] as readonly D[]),
    [options.dependencies],
  );

  const isMountedRef = useRef(false);

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
  const runValidation = useStore(formStore, (state) => state.runValidation);

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

  const handleBlur = () => {
    runValidation(options.name, "onBlur");
  };

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

  useIsomorphicEffect(() => {
    const currentDebounce = formStore.getState().asyncDebounceMap[options.name];
    const newDebounce = options.asyncDebounce ?? DEFAULT_ASYNC_DEBOUNCE;
    if (currentDebounce !== newDebounce) {
      formStore.getState().setAsyncDebounce(options.name, newDebounce);
    }
  }, [formStore, options.asyncDebounce, options.name]);

  useIsomorphicEffect(() => {
    // Don't run validation if field is already validating
    if (isMountedRef.current || field.value === undefined) {
      return;
    }

    isMountedRef.current = true;

    runValidation(options.name, "onMount");
  }, [field.validationState.type, field.value, options.name, runValidation]);

  // Cleanup timeout and abort controller on unmount
  useIsomorphicEffect(() => {
    return () => {
      const state = formStore.getState();
      const timeout = state.asyncTimeoutMap[options.name];
      if (timeout) {
        clearTimeout(timeout);
        state.clearAsyncTimeout(options.name);
      }

      const abortController = state.asyncAbortControllerMap[options.name];
      if (abortController) {
        abortController.abort();
        state.setAsyncAbortController(options.name, null);
      }
    };
  }, [formStore, options.name]);

  return {
    name: options.name,
    value: field.value,
    meta: field.meta,
    validationState: field.validationState,
    handleChange,
    handleSubmit,
    handleBlur,
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
