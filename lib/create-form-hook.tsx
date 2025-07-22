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

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_ASYNC_DEBOUNCE = 0;

// ============================================================================
// ERROR CLASSES
// ============================================================================

class FieldAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldAbortError";
  }
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type DefaultValues = Record<string, unknown>;

// Action types for validation
type ValidationAction = "onBlur" | "onChange" | "onSubmit" | "onMount";

// Template literal types for async validator names
type AsyncValidatorName<T extends ValidationAction> = `${T}Async`;
type AsyncDebounceName<T extends ValidationAction> = `${T}AsyncDebounce`;

// ============================================================================
// VALIDATION TYPES
// ============================================================================

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

// ============================================================================
// VALIDATOR TYPES
// ============================================================================

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

// ============================================================================
// FIELD TYPES
// ============================================================================

export interface Field<T = unknown> {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: ValidationResult;
}

export type FieldsMap<T extends DefaultValues> = {
  [K in keyof T]: Field<T[K]>;
};

export type ValidatorsMap<T extends DefaultValues> = {
  [K in keyof T]?: FieldValidators<T, K>;
};

export type FieldEntries<T extends DefaultValues> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

// ============================================================================
// API TYPES
// ============================================================================

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

// ============================================================================
// STORE TYPES
// ============================================================================

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
  scheduleAsyncValidation: (field: keyof T, action: ValidationAction) => void;
  executeAsyncValidation: (
    field: keyof T,
    action: ValidationAction,
    expectedValue: T[keyof T],
  ) => void;
  handleAsyncValidationResult: (
    field: keyof T,
    validationState: AllowedValidationResult | null,
    abortController: AbortController,
    error: unknown,
  ) => void;
  runSyncValidation: (
    field: keyof T,
    action: ValidationAction,
  ) => AllowedValidationResult | undefined;
  runValidation: (field: keyof T, action: ValidationAction) => void;
}

// ============================================================================
// COMPONENT & HOOK OPTION TYPES
// ============================================================================

export interface OnDoneChangeProps<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  changedFields: readonly (keyof T)[];
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates initial fields map from default values
 */
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

/**
 * Extracts field names from fields map
 */
function getFieldNames<T extends DefaultValues>(
  fieldsMap: FieldsMap<T>,
): (keyof T)[] {
  return Object.keys(fieldsMap) as (keyof T)[];
}

// ============================================================================
// STORE CREATION
// ============================================================================

/**
 * Creates the main form store with mutative capabilities
 */
function createFormStoreMutative<T extends DefaultValues>(
  options: UseFormOptions<T>,
) {
  return createStore<Store<T> & Actions<T>>()(
    mutative((set, get) => ({
      // ========================================================================
      // STORE STATE
      // ========================================================================
      standardSchemaMap: {} as Record<
        keyof T,
        StandardSchemaV1<T[keyof T]> | undefined
      >,
      defaultValues: options.defaultValues,
      validatorsMap: {} as ValidatorsMap<T>,
      asyncDebounceMap: {} as Record<keyof T, number>,
      asyncTimeoutMap: {} as Record<keyof T, NodeJS.Timeout | null>,
      asyncAbortControllerMap: {} as Record<keyof T, AbortController | null>,
      fieldsMap: createInitialFieldsMap(options.defaultValues),

      // ========================================================================
      // CONFIGURATION ACTIONS
      // ========================================================================
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

      // ========================================================================
      // VALUE ACTIONS
      // ========================================================================
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

        // Notify about done state changes
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

      // ========================================================================
      // ASYNC VALIDATION MANAGEMENT
      // ========================================================================
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

      scheduleAsyncValidation: (field: keyof T, action: ValidationAction) => {
        const snapshot = get();
        const currentValue = snapshot.fieldsMap[field].value;

        const asyncValidatorName: AsyncValidatorName<typeof action> =
          `${action}Async`;
        const asyncDebounceName: AsyncDebounceName<typeof action> =
          `${action}AsyncDebounce`;

        const asyncValidator =
          snapshot.validatorsMap[field]?.[asyncValidatorName];

        if (!asyncValidator) {
          return;
        }

        const debounceMs =
          snapshot.validatorsMap[field]?.[asyncDebounceName] ??
          snapshot.asyncDebounceMap[field];

        // Abort existing async validation before starting new one
        snapshot.abortAsyncValidation(field, "Superseded by new validation");

        // Set debouncing state immediately
        snapshot.setValidationState(field, {
          type: "debouncing",
        });

        // Create and store the new timeout
        const timeoutId = setTimeout(() => {
          snapshot.executeAsyncValidation(field, action, currentValue);
        }, debounceMs);

        set((state) => {
          (state.asyncTimeoutMap as Record<keyof T, NodeJS.Timeout | null>)[
            field
          ] = timeoutId;
        });
      },

      executeAsyncValidation: (
        field: keyof T,
        action: ValidationAction,
        expectedValue: T[keyof T],
      ) => {
        const currentSnapshot = get();
        const asyncValidatorName: AsyncValidatorName<typeof action> =
          `${action}Async`;

        const currentValue = currentSnapshot.fieldsMap[field].value;
        const asyncValidator =
          currentSnapshot.validatorsMap[field]?.[asyncValidatorName];
        const standardSchema = currentSnapshot.standardSchemaMap[field];

        // Validate preconditions
        if (!asyncValidator) {
          return;
        }

        // Check if value changed since scheduling (stale validation)
        if (!deepEqual(currentValue, expectedValue)) {
          return;
        }

        // Create abort controller for this specific validation
        const abortController = new AbortController();
        currentSnapshot.setAsyncAbortController(field, abortController);

        // Set validating state
        currentSnapshot.setValidationState(field, {
          type: "validating",
        });

        // Execute async validation
        const validationPromise = asyncValidator({
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

        // Handle validation result
        validationPromise
          .then((validationState) => {
            currentSnapshot.handleAsyncValidationResult(
              field,
              validationState,
              abortController,
              null,
            );
          })
          .catch((error: unknown) => {
            currentSnapshot.handleAsyncValidationResult(
              field,
              null,
              abortController,
              error,
            );
          });
      },

      handleAsyncValidationResult: (
        field: keyof T,
        validationState: AllowedValidationResult | null,
        abortController: AbortController,
        error: unknown,
      ) => {
        const latestSnapshot = get();

        // Check if this validation is still current
        const isCurrentValidation =
          latestSnapshot.asyncAbortControllerMap[field] === abortController;

        if (!isCurrentValidation) {
          return; // This validation was superseded
        }

        // Clean up async validation state
        latestSnapshot.setAsyncAbortController(field, null);
        latestSnapshot.clearAsyncTimeout(field);

        if (error) {
          // Handle validation error
          const isAbortError = error instanceof FieldAbortError;
          if (!isAbortError) {
            const errorMessage =
              error instanceof Error
                ? `Async validation failed: ${error.message}`
                : "Async validation failed";

            latestSnapshot.setValidationState(field, {
              type: "error",
              message: errorMessage,
            });
          }
        } else if (validationState) {
          // Handle successful validation
          latestSnapshot.setValidationState(field, validationState);
        }
      },

      // ========================================================================
      // VALIDATION EXECUTION
      // ========================================================================
      runSyncValidation: (field: keyof T, action: ValidationAction) => {
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

      runValidation: (field: keyof T, action: ValidationAction) => {
        const snapshot = get();

        // Run sync validation first
        const validationState = snapshot.runSyncValidation(field, action);

        // If sync validation failed or succeeded, abort async validation
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

        // Schedule async validation if sync validation didn't conclude
        snapshot.scheduleAsyncValidation(field, action);
      },
    })),
  );
}

// ============================================================================
// CONTEXT
// ============================================================================

const FormContext = createContext<StoreApi<
  Store<DefaultValues> & Actions<DefaultValues>
> | null>(null);

// ============================================================================
// COMPONENTS
// ============================================================================

/**
 * Form provider component that provides the form store to child components
 */
function FormProvider({
  children,
  formStore,
}: {
  children: React.ReactNode;
  formStore: StoreApi<Store<DefaultValues> & Actions<DefaultValues>>;
}) {
  return <FormContext value={formStore}>{children}</FormContext>;
}

/**
 * Field component that renders a field using the provided render prop
 */
function Field<T extends DefaultValues, K extends keyof T>(
  props: FieldProps<T, K>,
) {
  const fieldApi = useField<T, K>({
    name: props.name,
    validators: props.validators,
    asyncDebounce: props.asyncDebounce,
  });

  return props.render(fieldApi);
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to access and manage a specific form field
 */
function useField<T extends DefaultValues, K extends keyof T>(
  options: UseFieldOptions<T, K>,
): FieldApi<T, K> {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const isMountedRef = useRef(false);

  // Subscribe to field state
  const field = useStore(
    formStore,
    useShallow((state: Store<T>) => state.fieldsMap[options.name]),
  );

  // Subscribe to actions
  const setValue = useStore(formStore, (state) => state.setValue);
  const submit = useStore(formStore, (state) => state.submit);
  const runValidation = useStore(formStore, (state) => state.runValidation);
  const abortAsyncValidation = useStore(
    formStore,
    (state) => state.abortAsyncValidation,
  );

  // Create field handlers
  const handleChange = (value: T[K]) => {
    setValue(options.name, value);
  };

  const handleSubmit = () => {
    submit([options.name]);
  };

  const handleBlur = () => {
    runValidation(options.name, "onBlur");
  };

  // Create form API
  const formApi: FormApi<T> = {
    submit: (fields?: readonly (keyof T)[]) => {
      submit(fields);
    },
  };

  // Sync async debounce setting
  useIsomorphicEffect(() => {
    const currentDebounce = formStore.getState().asyncDebounceMap[options.name];
    const newDebounce = options.asyncDebounce ?? DEFAULT_ASYNC_DEBOUNCE;
    if (currentDebounce !== newDebounce) {
      formStore.getState().setAsyncDebounce(options.name, newDebounce);
    }
  }, [formStore, options.asyncDebounce, options.name]);

  // Sync validators
  useIsomorphicEffect(() => {
    const currentValidators = formStore.getState().validatorsMap[options.name];
    const newValidators = options.validators;
    if (currentValidators !== newValidators) {
      formStore.getState().setValidators(options.name, newValidators);
    }
  }, [formStore, options.name, options.validators]);

  // Sync standard schema
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

  // Run mount validation
  useIsomorphicEffect(() => {
    // Don't run validation if field is already validating or not ready
    if (isMountedRef.current || field.value === undefined) {
      return;
    }

    isMountedRef.current = true;
    runValidation(options.name, "onMount");
  }, [field.validationState.type, field.value, options.name, runValidation]);

  // Cleanup on unmount
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

/**
 * Main hook to create and manage a form
 */
export function useForm<T extends DefaultValues>(
  options: UseFormOptions<T>,
): UseFormResult<T> {
  const [formStore] = useState(() => createFormStoreMutative(options));

  // Sync default values when they change
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

/**
 * Factory function to create typed form hooks
 */
export function createFormHook<
  T extends DefaultValues,
>(): CreateFormHookResult<T> {
  return {
    useForm,
    useField,
  };
}
