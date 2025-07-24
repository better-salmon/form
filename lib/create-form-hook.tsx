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
  validationId: number;
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

interface SkipValidationFlowControl {
  type: "async-validator";
  strategy: "skip";
}

interface ForceValidationFlowControl {
  type: "async-validator";
  strategy: "force";
  debounceMs?: number;
}

interface AutoValidationFlowControl {
  type: "async-validator";
  strategy: "auto";
  debounceMs?: number;
}

type ValidationFlowControl =
  | SkipValidationFlowControl
  | ForceValidationFlowControl
  | AutoValidationFlowControl;

export interface Field<T = unknown> {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: FieldState;
}

interface FieldValidatorProps<T> {
  action: Action;
  value: T;
  meta: Field<T>["meta"];
}

interface FieldValidationPropsWithSignal<T> extends FieldValidatorProps<T> {
  signal: AbortSignal;
}

type SyncValidatorResult =
  | Exclude<FieldState, WaitingState | CheckingState>
  | ValidationFlowControl;

type SyncValidatorResultWithoutFlowControl = Exclude<
  FieldState,
  WaitingState | CheckingState
>;

type AsyncValidatorResult = ValidState | InvalidState | WarningState;

type ValidatorWithFlowControl<T> = (
  props: Prettify<FieldValidatorProps<T>>,
) => SyncValidatorResult | void;

type ValidatorWithoutFlowControl<T> = (
  props: Prettify<FieldValidatorProps<T>>,
) => SyncValidatorResultWithoutFlowControl | void;

type AsyncValidator<T> = (
  props: Prettify<FieldValidationPropsWithSignal<T>>,
) => Promise<AsyncValidatorResult>;

export type FieldsMap<T extends DefaultValues> = {
  [K in keyof T]: Field<T[K]>;
};

export type ValidatorsMap<T extends DefaultValues> = {
  [K in keyof T]?: {
    validator?:
      | ValidatorWithFlowControl<T[K]>
      | ValidatorWithoutFlowControl<T[K]>;
    asyncValidator?: AsyncValidator<T[K]>;
    debounceMs?: number;
  };
};

export type LastValidatedFieldsMap<T extends DefaultValues> = {
  [K in keyof T]?: T[K];
};

export type LastValidatedNumberOfChangesMap<T extends DefaultValues> = {
  [K in keyof T]?: number;
};

export type FieldEntries<T extends DefaultValues> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export type ValidationIdsMap<T extends DefaultValues> = {
  [K in keyof T]: number;
};

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
  lastValidatedFields: LastValidatedFieldsMap<T>;
  lastValidatedNumberOfChanges: LastValidatedNumberOfChangesMap<T>;
  validationIds: ValidationIdsMap<T>;
}

export interface Actions<T extends DefaultValues> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setDefaultValues: (defaultValues: T) => void;
  setValidatorsMap: <K extends keyof T>(
    field: K,
    validators: {
      validator?:
        | ValidatorWithFlowControl<T[K]>
        | ValidatorWithoutFlowControl<T[K]>;
      asyncValidator?: AsyncValidator<T[K]>;
      debounceMs?: number;
    },
  ) => void;
  validate: (field: keyof T, action: Action) => void;
  cleanupValidation: (field: keyof T) => void;
  incrementValidationId: (field: keyof T) => number;
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

// When asyncValidator is provided, validator can return validation flow controls
export interface UseFieldOptionsWithAsync<
  T extends DefaultValues,
  K extends keyof T,
> {
  name: K;
  validator?: ValidatorWithFlowControl<T[K]>;
  asyncValidator: AsyncValidator<T[K]>;
  debounceMs?: number;
}

// When asyncValidator is not provided, validator cannot return validation flow controls
export interface UseFieldOptionsWithoutAsync<
  T extends DefaultValues,
  K extends keyof T,
> {
  name: K;
  validator?: ValidatorWithoutFlowControl<T[K]>;
  asyncValidator?: never;
  debounceMs?: never;
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
    mutative((set, get) => {
      // ========================================================================
      // TYPED HELPER FUNCTIONS FOR CLEAN MUTATIONS
      // ========================================================================

      /** Mutates fields map with type safety */
      const mutateFields = (mutator: (fields: FieldsMap<T>) => void) => {
        set((state) => {
          mutator(state.fieldsMap as FieldsMap<T>);
        });
      };

      /** Mutates validators map with type safety */
      const mutateValidators = (
        mutator: (validators: ValidatorsMap<T>) => void,
      ) => {
        set((state) => {
          mutator(state.validatorsMap as ValidatorsMap<T>);
        });
      };

      /** Mutates running validations with type safety */
      const mutateRunningValidations = (
        mutator: (validations: RunningValidationsMap<T>) => void,
      ) => {
        set((state) => {
          mutator(state.runningValidations as RunningValidationsMap<T>);
        });
      };

      /** Mutates validation IDs with type safety */
      const mutateValidationIds = (
        mutator: (ids: ValidationIdsMap<T>) => void,
      ) => {
        set((state) => {
          mutator(state.validationIds as ValidationIdsMap<T>);
        });
      };

      /** Sets field validation state */
      const setFieldState = (field: keyof T, state: FieldState) => {
        mutateFields((fields) => {
          fields[field].validationState = state;
        });
      };

      return {
        // ======================================================================
        // INITIAL STATE
        // ======================================================================
        defaultValues: options.defaultValues,
        fieldsMap: createInitialFieldsMap(options.defaultValues),
        validatorsMap: {},
        runningValidations: {},
        debounceDelayMs: 500,
        lastValidatedFields: {},
        lastValidatedNumberOfChanges: {},
        validationIds: Object.fromEntries(
          Object.keys(options.defaultValues).map((field) => [field, 0]),
        ) as ValidationIdsMap<T>,

        // ======================================================================
        // CONFIGURATION ACTIONS
        // ======================================================================

        /** Updates default values and syncs existing field values */
        setDefaultValues: (defaultValues) => {
          set((state) => {
            // Use Object.assign for proper draft mutation
            Object.assign(state.defaultValues, defaultValues);
            const fields = state.fieldsMap as FieldsMap<T>;

            for (const [field] of Object.entries(defaultValues)) {
              fields[field as keyof T].value ??=
                defaultValues[field as keyof T];
            }
          });
        },

        /** Sets validators for a specific field */
        setValidatorsMap: (field, validators) => {
          mutateValidators((validatorsMap) => {
            validatorsMap[field] = validators;
          });
        },

        // ======================================================================
        // FIELD VALUE ACTIONS
        // ======================================================================

        /** Updates field value and triggers validation */
        setValue: (field, value) => {
          const state = get();
          const currentFieldValue = state.fieldsMap[field].value;

          // Skip if value hasn't changed
          if (deepEqual(currentFieldValue, value)) {
            return;
          }

          // Update field value and metadata
          mutateFields((fields) => {
            fields[field].value = value;
            fields[field].meta.isTouched = true;
            fields[field].meta.numberOfChanges++;
          });

          // Trigger validation after value change (reuse actions from state)
          state.validate(field, "change");
        },

        /** Submits specified fields (or all fields if none specified) */
        submit: (fields) => {
          const state = get();
          const fieldsToSubmit = new Set(
            fields ?? getFieldNames(state.fieldsMap),
          );

          // Update submission metadata and trigger validation for each field
          for (const field of fieldsToSubmit) {
            mutateFields((fields) => {
              fields[field].meta.numberOfSubmissions++;
            });

            state.validate(field, "submit");
          }
        },

        // ======================================================================
        // VALIDATION LIFECYCLE ACTIONS
        // ======================================================================

        /** Cleans up all validation resources for a field */
        cleanupValidation: (field) => {
          const runningValidation = get().runningValidations[field];

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
          mutateRunningValidations((validations) => {
            validations[field] = undefined;
          });
        },

        /** Increments validation ID for a field and returns the new ID */
        incrementValidationId: (field) => {
          const currentId = get().validationIds[field];
          const newId = currentId + 1;

          mutateValidationIds((ids) => {
            ids[field] = newId;
          });

          return newId;
        },

        /** Schedules debounced validation for a field */
        scheduleValidation: (field, value, validator, debounceMs, action) => {
          const state = get();

          // Cancel any existing validation first
          state.cleanupValidation(field);

          // Increment validation ID for this field
          const validationId = state.incrementValidationId(field);

          // Create new abort controller
          const abortController = new AbortController();

          // Set field state to waiting
          setFieldState(field, { type: "waiting" });

          // Set up debounce timeout
          const timeoutId = setTimeout(() => {
            // Clear timeout from running validation
            mutateRunningValidations((validations) => {
              const existing = validations[field];
              if (existing) {
                existing.timeoutId = undefined;
              }
            });

            // Start actual validation
            get().runValidation(field, value, validator, action);
          }, debounceMs);

          // Store the running validation with timeout
          mutateRunningValidations((validations) => {
            validations[field] = {
              stateSnapshot: value,
              abortController,
              timeoutId,
              validationId,
            } satisfies RunningValidation<T[typeof field]>;
          });
        },

        /** Runs async validation for a field */
        runValidation: (field, value, validator, action) => {
          const state = get();

          // Abort any existing validation for this field
          state.cleanupValidation(field);

          const currentField = state.fieldsMap[field];

          // Increment validation ID for this field
          const validationId = state.incrementValidationId(field);

          // Create new abort controller
          const abortController = new AbortController();

          // Store the running validation and update field state
          set((state) => {
            const validations =
              state.runningValidations as RunningValidationsMap<T>;
            const fields = state.fieldsMap as FieldsMap<T>;
            const lastValidated =
              state.lastValidatedFields as LastValidatedFieldsMap<T>;
            const lastValidatedNumberOfChanges =
              state.lastValidatedNumberOfChanges as LastValidatedNumberOfChangesMap<T>;

            validations[field] = {
              stateSnapshot: value,
              abortController,
              timeoutId: undefined,
              validationId,
            } satisfies RunningValidation<T[typeof field]>;

            // Set field state to checking and store the value being validated
            fields[field].validationState = { type: "checking" };
            lastValidated[field] = value;
            lastValidatedNumberOfChanges[field] =
              fields[field].meta.numberOfChanges;
          });

          // Run async validation
          validator({
            action: action,
            value,
            meta: currentField.meta,
            signal: abortController.signal,
          })
            .then((result) => {
              // Check if validation was aborted or is stale
              if (abortController.signal.aborted) {
                return;
              }

              const currentValidationId = get().validationIds[field];
              if (validationId !== currentValidationId) {
                return;
              }

              // Update field state with result
              setFieldState(field, result);
              get().cleanupValidation(field);
            })
            .catch((error: unknown) => {
              // Check if validation was aborted or is stale
              if (abortController.signal.aborted) {
                return;
              }

              const currentValidationId = get().validationIds[field];
              if (validationId !== currentValidationId) {
                return;
              }

              // Handle validation error
              setFieldState(field, {
                type: "invalid",
                message:
                  error instanceof Error ? error.message : "Validation failed",
              });

              get().cleanupValidation(field);
            });
        },

        // ======================================================================
        // VALIDATION TRIGGER ACTIONS
        // ======================================================================

        /** Main validation orchestrator - handles sync validation and triggers async validation */
        validate: (field, action) => {
          const state = get();

          const currentField = state.fieldsMap[field];
          const validators = state.validatorsMap[field];

          if (!validators) {
            return;
          }

          // Run sync validator if it exists
          const validatorResult = validators.validator?.({
            action,
            value: currentField.value,
            meta: currentField.meta,
          });

          const resultOrValidationFlowControl = validatorResult ?? {
            type: "async-validator",
            strategy: "skip",
          };

          if (resultOrValidationFlowControl.type === "async-validator") {
            switch (resultOrValidationFlowControl.strategy) {
              case "skip": {
                const runningValidation = state.runningValidations[field];
                if (runningValidation) {
                  // Validation is already running, do nothing
                  return;
                }
                // No running validation, keep current state and never run async validation
                break;
              }

              case "auto": {
                const runningValidation = state.runningValidations[field];

                if (runningValidation) {
                  // Check if value has changed since validation started
                  if (
                    deepEqual(
                      runningValidation.stateSnapshot,
                      currentField.value,
                    )
                  ) {
                    // Value hasn't changed, continue running existing validation
                    return;
                  } else {
                    // Value changed, restart validation from the beginning
                    state.cleanupValidation(field);
                  }
                } else {
                  // No running validation - check if value and numberOfChanges changed from last validation
                  const lastValidatedValue = state.lastValidatedFields[field];
                  const lastValidatedChanges =
                    state.lastValidatedNumberOfChanges[field];

                  if (
                    (lastValidatedValue !== undefined &&
                      deepEqual(lastValidatedValue, currentField.value) &&
                      lastValidatedChanges !== undefined &&
                      lastValidatedChanges ===
                        currentField.meta.numberOfChanges) ||
                    currentField.validationState.type === "valid" ||
                    currentField.validationState.type === "invalid"
                  ) {
                    // Value and numberOfChanges haven't changed from last validation, skip
                    return;
                  }
                }

                // Start scheduled async validation if async validator exists
                if (validators.asyncValidator) {
                  const debounceMs =
                    resultOrValidationFlowControl.debounceMs ??
                    validators.debounceMs ??
                    state.debounceDelayMs;

                  state.scheduleValidation(
                    field,
                    currentField.value,
                    validators.asyncValidator,
                    debounceMs,
                    action,
                  );
                }
                break;
              }

              case "force": {
                // Cancel existing validation and restart from the beginning
                state.cleanupValidation(field);

                if (validators.asyncValidator) {
                  const debounceMs =
                    resultOrValidationFlowControl.debounceMs ??
                    validators.debounceMs ??
                    state.debounceDelayMs;
                  state.scheduleValidation(
                    field,
                    currentField.value,
                    validators.asyncValidator,
                    debounceMs,
                    action,
                  );
                }
                break;
              }
            }
          }

          if (resultOrValidationFlowControl.type !== "async-validator") {
            switch (resultOrValidationFlowControl.type) {
              case "valid": {
                setFieldState(field, { type: "valid" });
                state.cleanupValidation(field);
                break;
              }

              case "invalid": {
                setFieldState(field, {
                  type: "invalid",
                  message: resultOrValidationFlowControl.message,
                });
                state.cleanupValidation(field);
                break;
              }

              case "warning": {
                setFieldState(field, {
                  type: "warning",
                  message: resultOrValidationFlowControl.message,
                });
                state.cleanupValidation(field);
                break;
              }

              case "pending": {
                setFieldState(field, { type: "pending" });
                state.cleanupValidation(field);
                break;
              }
            }
          }
        },
      };
    }),
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
      validator: options.validator,
      asyncValidator: options.asyncValidator,
      debounceMs: options.debounceMs,
    });
  }, [
    options.asyncValidator,
    options.debounceMs,
    options.name,
    options.validator,
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
