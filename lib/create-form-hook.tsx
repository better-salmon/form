import { createContext, use, useRef, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { mutative } from "zustand-mutative";
import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@lib/deep-equal";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";

// ============================================================================
// CONSTANTS
// ============================================================================

// ============================================================================
// UTILITY TYPES
// ============================================================================

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type DefaultValues = Record<string, unknown>;

// ============================================================================
// RUNNING VALIDATION TYPES
// ============================================================================

interface RunningValidation<T = unknown> {
  stateSnapshot: T;
  abortController: AbortController;
  timeoutId?: NodeJS.Timeout;
}

type RunningValidationsMap<T extends DefaultValues> = {
  [K in keyof T]?: RunningValidation<T[K]>;
};

// ============================================================================
// FIELD TYPES
// ============================================================================

type Action = "change" | "blur" | "submit" | "mount";

interface InvalidState {
  type: "invalid";
  message: string;
}

interface WarningState {
  type: "warning";
  message: string;
}

interface ValidState {
  type: "valid";
}

interface PendingState {
  type: "pending";
}

interface WaitingState {
  type: "waiting";
}

interface CheckingState {
  type: "checking";
}

type FieldState =
  | InvalidState
  | WarningState
  | ValidState
  | PendingState
  | WaitingState
  | CheckingState;

interface SkipTrigger {
  type: "skip";
}

interface ForceTrigger {
  type: "force";
}

interface AutoTrigger {
  type: "auto";
}

type FieldTrigger = ForceTrigger | AutoTrigger;

export interface Field<T = unknown> {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: FieldState;
  lastValidatedValue?: T;
}

interface FieldValidationProps<T> {
  action: Action;
  value: T;
}

interface FieldValidationPropsWithSignal<T> extends FieldValidationProps<T> {
  signal: AbortSignal;
}

type SyncValidatorResult =
  | Exclude<FieldState, WaitingState | CheckingState>
  | FieldTrigger
  | SkipTrigger;

type AsyncValidatorResult = ValidState | InvalidState | WarningState;

type Validator<T> = (
  props: Prettify<FieldValidationProps<T>>,
) => SyncValidatorResult | void;

type AsyncValidator<T> = (
  props: Prettify<FieldValidationPropsWithSignal<T>>,
) => Promise<AsyncValidatorResult>;

export type FieldsMap<T extends DefaultValues> = {
  [K in keyof T]: Field<T[K]>;
};

export type ValidatorsMap<T extends DefaultValues> = {
  [K in keyof T]?: {
    validator?: Validator<T[K]>;
    asyncValidator?: AsyncValidator<T[K]>;
    debounce?: number;
  };
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
  validationState: Field<T[K]>["validationState"];
}

// ============================================================================
// STORE TYPES
// ============================================================================

export interface Store<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  defaultValues: T;
  validatorsMap: ValidatorsMap<T>;
  runningValidations: RunningValidationsMap<T>;
  debounceDelayMs: number;
}

export interface Actions<T extends DefaultValues> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setDefaultValues: (defaultValues: T) => void;
  setValidatorsMap: <K extends keyof T>(
    field: K,
    validators: {
      synchronousValidator?: Validator<T[K]>;
      asynchronousValidator?: AsyncValidator<T[K]>;
      debounce?: number;
    },
  ) => void;
  validate: (field: keyof T, action: Action) => void;
  cleanupValidation: (field: keyof T) => void;
  scheduleValidation: <K extends keyof T>(
    field: K,
    value: T[K],
    validator: AsyncValidator<T[K]>,
    debounceMs: number,
    action: Action,
  ) => void;
  runValidation: <K extends keyof T>(
    field: K,
    value: T[K],
    validator: AsyncValidator<T[K]>,
    action: Action,
  ) => void;
  startAsyncValidation: <K extends keyof T>(
    field: K,
    value: T[K],
    validator: AsyncValidator<T[K]>,
    action: Action,
  ) => void;
  startDebouncedAsyncValidation: <K extends keyof T>(
    field: K,
    value: T[K],
    validator: AsyncValidator<T[K]>,
    debounceMs: number,
    action: Action,
  ) => void;
}

// ============================================================================
// COMPONENT & HOOK OPTION TYPES
// ============================================================================

export interface UseFormOptions<T extends DefaultValues> {
  defaultValues: T;
}

export interface UseFormResult<T extends DefaultValues> {
  Field: <K extends keyof T>(props: FieldProps<T, K>) => React.ReactNode;
  formStore: ReturnType<typeof createFormStoreMutative<T>>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
}

// When asynchronousValidator is provided, synchronousValidator can return triggers
export interface UseFieldOptionsWithAsync<
  T extends DefaultValues,
  K extends keyof T,
> {
  name: K;
  synchronousValidator?: Validator<T[K]>;
  asynchronousValidator: AsyncValidator<T[K]>;
  debounce?: number;
}

// When asynchronousValidator is not provided, synchronousValidator cannot return triggers
export interface UseFieldOptionsWithoutAsync<
  T extends DefaultValues,
  K extends keyof T,
> {
  name: K;
  synchronousValidator?: Validator<T[K]>;
  asynchronousValidator?: never;
  debounce?: number;
}

export type UseFieldOptions<T extends DefaultValues, K extends keyof T> =
  | UseFieldOptionsWithAsync<T, K>
  | UseFieldOptionsWithoutAsync<T, K>;

export type FieldProps<
  T extends DefaultValues,
  K extends keyof T,
> = UseFieldOptions<T, K> & {
  render: (props: Prettify<FieldApi<T, K>>) => React.ReactNode;
};

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
        validationState: { type: "pending" },
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
      defaultValues: options.defaultValues,
      fieldsMap: createInitialFieldsMap(options.defaultValues),
      validatorsMap: {},
      runningValidations: {},
      debounceDelayMs: 500,

      // ========================================================================
      // CONFIGURATION ACTIONS
      // ========================================================================
      setDefaultValues: (defaultValues) => {
        set((state) => {
          (state.defaultValues as T) = defaultValues;

          for (const [field] of Object.entries(defaultValues)) {
            (state.fieldsMap as FieldsMap<T>)[field as keyof T].value ??=
              defaultValues[field as keyof T];
          }
        });
      },

      setValidatorsMap: (field, validators) => {
        set((state) => {
          (state.validatorsMap as ValidatorsMap<T>)[field] = validators;
        });
      },

      // ========================================================================
      // VALUE ACTIONS
      // ========================================================================
      setValue: (field, value) => {
        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          if (deepEqual(fieldsMap[field].value, value)) {
            return;
          }

          fieldsMap[field].value = value;
          fieldsMap[field].meta.isTouched = true;
          fieldsMap[field].meta.numberOfChanges++;
        });

        // Trigger validation after value change
        get().validate(field, "change");
      },

      submit: (fields) => {
        const snapshot = get();
        const fieldsToSubmit = new Set(
          fields ?? getFieldNames(snapshot.fieldsMap),
        );

        for (const field of fieldsToSubmit) {
          set((state) => {
            const fieldsMap = state.fieldsMap as FieldsMap<T>;
            fieldsMap[field].meta.numberOfSubmissions++;
          });

          get().validate(field, "submit");
        }
      },

      // ========================================================================
      // VALIDATION ACTIONS
      // ========================================================================

      /**
       * Cleans up all validation resources for a field (timeouts and abort controllers)
       */
      cleanupValidation: (field) => {
        const snapshot = get();
        const runningValidation = snapshot.runningValidations[field];

        if (!runningValidation) {
          return;
        }

        // Clear timeout if exists
        if (runningValidation.timeoutId) {
          clearTimeout(runningValidation.timeoutId);
        }

        // Abort the async operation
        runningValidation.abortController.abort();

        // Remove from running validations
        set((state) => {
          const runningValidationsMap =
            state.runningValidations as RunningValidationsMap<T>;
          runningValidationsMap[field] = undefined;
        });
      },

      /**
       * Schedules validation for a field (starts debouncing phase)
       */
      scheduleValidation: (field, value, validator, debounceMs, action) => {
        // Cancel any existing validation first
        get().cleanupValidation(field);

        // Create new abort controller
        const abortController = new AbortController();

        // Set field state to waiting
        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          fieldsMap[field].validationState = { type: "waiting" };
        });

        // Set up debounce timeout
        const timeoutId = setTimeout(() => {
          // Clear timeout from running validation
          set((state) => {
            const runningValidationsMap =
              state.runningValidations as RunningValidationsMap<T>;
            const existing = runningValidationsMap[field];
            if (existing) {
              existing.timeoutId = undefined;
            }
          });

          // Start actual validation
          get().runValidation(field, value, validator, action);
        }, debounceMs);

        // Store the running validation with timeout
        set((state) => {
          const runningValidationsMap =
            state.runningValidations as RunningValidationsMap<T>;
          runningValidationsMap[field] = {
            stateSnapshot: value,
            abortController,
            timeoutId,
          } satisfies RunningValidation<T[typeof field]>;
        });
      },

      /**
       * Runs validation for a field (actual async validation phase)
       */
      runValidation: (field, value, validator, action) => {
        // Abort any existing validation for this field
        get().cleanupValidation(field);

        // Create new abort controller
        const abortController = new AbortController();

        // Store the running validation
        set((state) => {
          const runningValidationsMap =
            state.runningValidations as RunningValidationsMap<T>;
          const fieldsMap = state.fieldsMap as FieldsMap<T>;

          runningValidationsMap[field] = {
            stateSnapshot: value,
            abortController,
            timeoutId: undefined,
          } satisfies RunningValidation<T[typeof field]>;

          // Set field state to checking and store the value being validated
          fieldsMap[field].validationState = { type: "checking" };
          fieldsMap[field].lastValidatedValue = value;
        });

        // Run async validation in a separate async context
        validator({
          action: action,
          value,
          signal: abortController.signal,
        })
          .then((result) => {
            // Check if validation was aborted
            if (abortController.signal.aborted) {
              return;
            }

            // Update field state with result
            set((state) => {
              const fieldsMap = state.fieldsMap as FieldsMap<T>;
              fieldsMap[field].validationState = result;
            });

            // Clean up validation resources
            get().cleanupValidation(field);
          })
          .catch((error: unknown) => {
            // Check if validation was aborted
            if (abortController.signal.aborted) {
              return;
            }

            // Handle validation error
            set((state) => {
              const fieldsMap = state.fieldsMap as FieldsMap<T>;
              fieldsMap[field].validationState = {
                type: "invalid",
                message:
                  error instanceof Error ? error.message : "Validation failed",
              };
            });

            // Clean up validation resources
            get().cleanupValidation(field);
          });
      },

      startAsyncValidation: (field, value, validator, action) => {
        get().runValidation(field, value, validator, action);
      },

      startDebouncedAsyncValidation: (
        field,
        value,
        validator,
        debounceMs,
        action,
      ) => {
        get().scheduleValidation(field, value, validator, debounceMs, action);
      },

      validate: (field, action) => {
        const snapshot = get();
        const {
          fieldsMap,
          validatorsMap,
          runningValidations,
          debounceDelayMs,
        } = snapshot;

        const currentField = fieldsMap[field];
        const validators = validatorsMap[field];

        if (!validators) {
          return;
        }

        const synchronousValidatorResult = validators.validator?.({
          action,
          value: currentField.value,
        });

        const resultOrTrigger = synchronousValidatorResult ?? {
          type: "skip",
        };

        switch (resultOrTrigger.type) {
          case "skip": {
            const runningValidation = runningValidations[field];

            if (runningValidation) {
              // Validation is already running, do nothing
              return;
            }

            // No running validation, keep current state and never run async validation
            break;
          }
          case "auto": {
            const runningValidation = runningValidations[field];

            if (runningValidation) {
              // Check if value has changed since validation started
              if (
                deepEqual(runningValidation.stateSnapshot, currentField.value)
              ) {
                // Value hasn't changed, continue running existing validation
                return;
              } else {
                // Value changed, restart validation from the beginning
                get().cleanupValidation(field);
              }
            } else {
              // No running validation - check if value changed from last validated value

              if (
                (currentField.lastValidatedValue !== undefined &&
                  deepEqual(
                    currentField.lastValidatedValue,
                    currentField.value,
                  )) ||
                currentField.validationState.type === "valid" ||
                currentField.validationState.type === "invalid"
              ) {
                // Value hasn't changed from last validation, skip
                return;
              }
            }

            // Start scheduled async validation if async validator exists
            if (validators.asyncValidator) {
              const fieldDebounce = validators.debounce ?? debounceDelayMs;
              get().scheduleValidation(
                field,
                currentField.value,
                validators.asyncValidator,
                fieldDebounce,
                action,
              );
            }
            break;
          }
          case "force": {
            // Cancel existing validation and restart from the beginning
            get().cleanupValidation(field);

            if (validators.asyncValidator) {
              const fieldDebounce = validators.debounce ?? debounceDelayMs;
              get().scheduleValidation(
                field,
                currentField.value,
                validators.asyncValidator,
                fieldDebounce,
                action,
              );
            }
            break;
          }
          case "valid": {
            set((state) => {
              const fieldsMap = state.fieldsMap as FieldsMap<T>;
              fieldsMap[field].validationState = { type: "valid" };
            });
            get().cleanupValidation(field);
            break;
          }
          case "invalid": {
            set((state) => {
              const fieldsMap = state.fieldsMap as FieldsMap<T>;
              fieldsMap[field].validationState = {
                type: "invalid",
                message: resultOrTrigger.message,
              };
            });
            get().cleanupValidation(field);
            break;
          }
          case "warning": {
            set((state) => {
              const fieldsMap = state.fieldsMap as FieldsMap<T>;
              fieldsMap[field].validationState = {
                type: "warning",
                message: resultOrTrigger.message,
              };
            });
            get().cleanupValidation(field);
            break;
          }
          case "pending": {
            set((state) => {
              const fieldsMap = state.fieldsMap as FieldsMap<T>;
              fieldsMap[field].validationState = { type: "pending" };
            });
            get().cleanupValidation(field);
            break;
          }
        }
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
  const fieldApi = useField<T, K>(props);

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
  const setValidatorsMap = useStore(
    formStore,
    (state) => state.setValidatorsMap,
  );
  const validate = useStore(formStore, (state) => state.validate);

  useIsomorphicEffect(() => {
    setValidatorsMap(options.name, {
      synchronousValidator: options.synchronousValidator,
      asynchronousValidator: options.asynchronousValidator,
      debounce: options.debounce,
    });
  }, [
    options.asynchronousValidator,
    options.debounce,
    options.name,
    options.synchronousValidator,
    setValidatorsMap,
  ]);

  useIsomorphicEffect(() => {
    if (isMountedRef.current) {
      return;
    }
    isMountedRef.current = true;
    validate(options.name, "mount");
  }, [options.name, validate]);

  // Create field handlers
  const handleChange = (value: T[K]) => {
    setValue(options.name, value);
  };

  const handleSubmit = () => {
    submit([options.name]);
  };

  const handleBlur = () => {
    validate(options.name, "blur");
  };

  // Create form API
  const formApi: Prettify<FormApi<T>> = {
    submit: (fields?: readonly (keyof T)[]) => {
      submit(fields);
    },
  };

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
