import { createContext, use, useRef, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { mutative } from "zustand-mutative";
import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@lib/deep-equal";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  standardValidate,
  standardValidateAsync,
} from "@lib/standard-validate";

const DEFAULT_ASYNC_DEBOUNCE = 0;

class FieldAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldAbortError";
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
  [K in keyof T]?: FieldValidators<T, K>;
};

export type FieldEntries<T extends DefaultValues> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export interface OnDoneChangeProps<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  changedFields: readonly (keyof T)[];
}

export interface ValidatorProps<T extends DefaultValues, K extends keyof T> {
  value: T[K];
  meta: Field<T[K]>["meta"];
  validateUsingStandardSchema: () =>
    | readonly StandardSchemaV1.Issue[]
    | undefined;
}

export interface ValidatorAsyncProps<
  T extends DefaultValues,
  K extends keyof T,
> {
  value: T[K];
  meta: Field<T[K]>["meta"];
  validateUsingStandardSchema: () =>
    | Promise<readonly StandardSchemaV1.Issue[] | undefined>
    | undefined;
  signal: AbortSignal;
}

export type Validator<T extends DefaultValues, K extends keyof T> = (
  props: ValidatorProps<T, K>,
) => AllowedValidationResult | void;

export type ValidatorAsync<T extends DefaultValues, K extends keyof T> = (
  props: ValidatorAsyncProps<T, K>,
) => Promise<AllowedValidationResult>;

export interface FieldValidators<T extends DefaultValues, K extends keyof T> {
  readonly onBlur?: Validator<T, K>;
  readonly onBlurAsync?: ValidatorAsync<T, K>;
  readonly onBlurAsyncDebounce?: number;
  readonly onChange?: Validator<T, K>;
  readonly onChangeAsync?: ValidatorAsync<T, K>;
  readonly onChangeAsyncDebounce?: number;
  readonly onSubmit?: Validator<T, K>;
  readonly onSubmitAsync?: ValidatorAsync<T, K>;
  readonly onSubmitAsyncDebounce?: number;
  readonly onMount?: Validator<T, K>;
  readonly onMountAsync?: ValidatorAsync<T, K>;
  readonly onMountAsyncDebounce?: number;
}

export interface ErrorValidationResult {
  type: "error";
  message: string;
}

export interface DoneValidationResult {
  type: "done";
}

export interface IdleValidationResult {
  type: "idle";
}

export interface ValidatingValidationResult {
  type: "validating";
}

export interface DebouncingValidationResult {
  type: "debouncing";
}

export type ValidationResult =
  | ErrorValidationResult
  | DoneValidationResult
  | IdleValidationResult
  | ValidatingValidationResult
  | DebouncingValidationResult;

export type AllowedValidationResult = Exclude<
  ValidationResult,
  ValidatingValidationResult | DebouncingValidationResult
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

export interface FormApi<T extends DefaultValues> {
  submit: (fields?: readonly (keyof T)[]) => void;
}

export interface FieldApi<T extends DefaultValues, K extends keyof T> {
  name: K;
  value: T[K];
  handleChange: (value: T[K]) => void;
  handleSubmit: () => void;
  handleBlur: () => void;
  meta: Field<T[K]>["meta"];
  formApi: Prettify<FormApi<T>>;
  validationState: ValidationResult;
}

export interface Store<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  validatorsMap: ValidatorsMap<T>;
  defaultValues: T;
  asyncDebounceMap: Record<keyof T, number>;
  asyncTimeoutMap: Record<keyof T, NodeJS.Timeout | null>;
  asyncAbortControllerMap: Record<keyof T, AbortController | null>;
  standardSchemaMap: Record<keyof T, StandardSchemaV1<T[keyof T]> | undefined>;
}

export interface Actions<T extends DefaultValues> {
  setStandardSchema: <K extends keyof T>(
    field: K,
    schema?: StandardSchemaV1<T[K]>,
  ) => void;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setValidationState: (
    field: keyof T,
    validationState?: ValidationResult,
  ) => void;
  setValidators: <K extends keyof T>(
    field: K,
    validators?: FieldValidators<T, K>,
  ) => void;
  setDefaultValues: (defaultValues: T) => void;
  setAsyncDebounce: (field: keyof T, debounce: number) => void;
  clearAsyncTimeout: (field: keyof T) => void;
  setAsyncAbortController: (
    field: keyof T,
    controller: AbortController | null,
  ) => void;
  abortAsyncValidation: (field: keyof T, reason?: string) => void;
  scheduleAsyncValidation: (
    field: keyof T,
    action: "onBlur" | "onChange" | "onSubmit" | "onMount",
  ) => void;
  runSyncValidation: (
    field: keyof T,
    action: "onBlur" | "onChange" | "onSubmit" | "onMount",
  ) => AllowedValidationResult | undefined;
  runValidation: (
    field: keyof T,
    action: "onBlur" | "onChange" | "onSubmit" | "onMount",
  ) => void;
}

export interface UseFormOptions<T extends DefaultValues> {
  defaultValues: T;
  onDoneChange?: (props: OnDoneChangeProps<T>) => void;
}

export interface UseFormResult<T extends DefaultValues> {
  Field: <K extends keyof T>(props: FieldProps<T, K>) => React.ReactNode;
  formStore: ReturnType<typeof createFormStoreMutative<T>>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
}

export interface UseFieldOptions<T extends DefaultValues, K extends keyof T> {
  name: K;
  validators?: FieldValidators<T, K>;
  asyncDebounce?: number;
  standardSchema?: StandardSchemaV1<T[K]>;
}

export interface FieldProps<T extends DefaultValues, K extends keyof T>
  extends UseFieldOptions<T, K> {
  render: (props: Prettify<FieldApi<T, K>>) => React.ReactNode;
}

export interface CreateFormHookResult<T extends DefaultValues> {
  useForm: (options: UseFormOptions<T>) => UseFormResult<T>;
  useField: <K extends keyof T>(
    options: UseFieldOptions<T, K>,
  ) => Prettify<FieldApi<T, K>>;
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
          type: "idle",
        },
      } satisfies Field<T[typeof field]>,
    ]),
  ) as FieldsMap<T>;
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
      standardSchemaMap: {} as Record<
        keyof T,
        StandardSchemaV1<T[keyof T]> | undefined
      >,
      defaultValues: options.defaultValues,
      validatorsMap: {} as ValidatorsMap<T>,
      asyncDebounceMap: {} as Record<keyof T, number>,
      asyncTimeoutMap: {} as Record<keyof T, NodeJS.Timeout | null>,
      asyncAbortControllerMap: {} as Record<keyof T, AbortController | null>,
      setStandardSchema: <K extends keyof T>(
        field: K,
        schema?: StandardSchemaV1<T[K]>,
      ) => {
        set((state) => {
          (
            state.standardSchemaMap as Record<
              keyof T,
              StandardSchemaV1<T[keyof T]> | undefined
            >
          )[field] = schema;
        });
      },
      setValidators: <K extends keyof T>(
        field: K,
        validators?: FieldValidators<T, K>,
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
      abortAsyncValidation: (field: keyof T, reason?: string) => {
        const snapshot = get();

        // Abort existing async validation for this field
        const existingAbortController = snapshot.asyncAbortControllerMap[field];
        if (existingAbortController) {
          existingAbortController.abort(
            new FieldAbortError(reason ?? "Async validation aborted"),
          );
          snapshot.setAsyncAbortController(field, null);
        }

        // Clear existing timeout for this field
        const existingTimeout = snapshot.asyncTimeoutMap[field];
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          snapshot.clearAsyncTimeout(field);
        }
      },
      scheduleAsyncValidation: (
        field: keyof T,
        action: "onBlur" | "onChange" | "onSubmit" | "onMount",
      ) => {
        const snapshot = get();

        const value = snapshot.fieldsMap[field].value;

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

        // Abort existing async validation before starting new one
        snapshot.abortAsyncValidation(field, "Aborted by new validation");

        // Set debouncing state immediately
        snapshot.setValidationState(field, {
          type: "debouncing",
        });

        // Set up debounced async validation
        const timeoutId = setTimeout(() => {
          const currentSnapshot = get();
          const standardSchema = currentSnapshot.standardSchemaMap[field];

          const currentValue = currentSnapshot.fieldsMap[field].value;

          const currentAsyncValidator =
            currentSnapshot.validatorsMap[field]?.[asyncValidatorName];

          // Double-check the validator still exists and value hasn't changed
          if (!currentAsyncValidator || !deepEqual(currentValue, value)) {
            return;
          }

          // Create new abort controller for this validation
          const abortController = new AbortController();
          currentSnapshot.setAsyncAbortController(field, abortController);

          const asyncValidationState = currentAsyncValidator({
            value: currentValue,
            meta: currentSnapshot.fieldsMap[field].meta,
            validateUsingStandardSchema: () => {
              if (!standardSchema) {
                return;
              }

              return standardValidateAsync(standardSchema, currentValue);
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
      runSyncValidation: (
        field: keyof T,
        action: "onBlur" | "onChange" | "onSubmit" | "onMount",
      ) => {
        const snapshot = get();
        const validator = snapshot.validatorsMap[field]?.[action];
        const standardSchema = snapshot.standardSchemaMap[field];

        const value = snapshot.fieldsMap[field].value;

        const validationResult = validator?.({
          value,
          meta: snapshot.fieldsMap[field].meta,
          validateUsingStandardSchema: () => {
            if (!standardSchema) {
              return;
            }

            return standardValidate(standardSchema, value);
          },
        });

        const validationState = validationResult ?? undefined;

        if (validationState) {
          snapshot.setValidationState(field, validationState);
        }

        return validationState;
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

        // Run sync validation
        const validationState = snapshot.runSyncValidation(field, action);

        if (
          validationState?.type === "error" ||
          validationState?.type === "done"
        ) {
          snapshot.abortAsyncValidation(
            field,
            "Aborted by sync validation failure",
          );
          return;
        }

        // Schedule async validation if needed
        snapshot.scheduleAsyncValidation(field, action);
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

function Field<T extends DefaultValues, K extends keyof T>(
  props: FieldProps<T, K>,
) {
  const field = useField<T, K>({
    name: props.name,
    validators: props.validators,
    asyncDebounce: props.asyncDebounce,
  });

  return props.render(field);
}

function useField<T extends DefaultValues, K extends keyof T>(
  options: UseFieldOptions<T, K>,
): FieldApi<T, K> {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const isMountedRef = useRef(false);

  const field = useStore(
    formStore,
    useShallow((state: Store<T>) => state.fieldsMap[options.name]),
  );
  const setValue = useStore(formStore, (state) => state.setValue);
  const submit = useStore(formStore, (state) => state.submit);
  const runValidation = useStore(formStore, (state) => state.runValidation);
  const abortAsyncValidation = useStore(
    formStore,
    (state) => state.abortAsyncValidation,
  );

  const handleChange = (value: T[K]) => {
    setValue(options.name, value);
  };

  const handleSubmit = () => {
    submit([options.name]);
  };

  const formApi: FormApi<T> = {
    submit: (fields?: readonly (keyof T)[]) => {
      submit(fields);
    },
  };

  const handleBlur = () => {
    runValidation(options.name, "onBlur");
  };

  useIsomorphicEffect(() => {
    const currentDebounce = formStore.getState().asyncDebounceMap[options.name];
    const newDebounce = options.asyncDebounce ?? DEFAULT_ASYNC_DEBOUNCE;
    if (currentDebounce !== newDebounce) {
      formStore.getState().setAsyncDebounce(options.name, newDebounce);
    }
  }, [formStore, options.asyncDebounce, options.name]);

  useIsomorphicEffect(() => {
    const currentStandardSchema =
      formStore.getState().standardSchemaMap[options.name];
    const newStandardSchema = options.standardSchema;
    if (
      currentStandardSchema !== newStandardSchema &&
      newStandardSchema !== undefined
    ) {
      formStore.getState().setStandardSchema(options.name, newStandardSchema);
    }
  }, [formStore, options.name, options.standardSchema]);

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
      abortAsyncValidation(options.name, "Field unmounted");
    };
  }, [abortAsyncValidation, options.name]);

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
  };
}
