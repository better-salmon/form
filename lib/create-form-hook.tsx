import { createContext, use, useCallback, useMemo, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { mutative } from "zustand-mutative";
import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@lib/deep-equal";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";
import { type StandardSchemaV1 } from "@standard-schema/spec";
import {
  standardValidate,
  standardValidateAsync,
} from "@lib/standard-validate";

// ============================================================================
// CONSTANTS
// ============================================================================

// ============================================================================
// UTILITY TYPES
// ============================================================================

type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line sonarjs/no-useless-intersection -- this is a common pattern for prettifying types
} & {};

type DefaultValues = Record<string, unknown>;

// ============================================================================
// RUNNING VALIDATION TYPES
// ============================================================================

type RunningValidation<T = unknown> = {
  stateSnapshot: T;
  abortController?: AbortController;
  timeoutId?: NodeJS.Timeout;
  validationId: number;
};

type RunningValidationsMap<T extends DefaultValues> = {
  [K in keyof T]?: RunningValidation<T[K]>;
};

// ============================================================================
// FIELD TYPES
// ============================================================================

type Action = "change" | "blur" | "submit" | "mount";

type InvalidState = {
  type: "invalid";
  message: string;
};

type WarningState = {
  type: "warning";
  message: string;
};

type ValidState = {
  type: "valid";
  message?: string;
};

type PendingState = {
  type: "pending";
};

type WaitingState = {
  type: "waiting";
};

type CheckingState = {
  type: "checking";
};

type FieldState =
  | InvalidState
  | WarningState
  | ValidState
  | PendingState
  | WaitingState
  | CheckingState;

type SkipValidationFlowControl = {
  type: "async-validator";
  strategy: "skip";
};

type ForceValidationFlowControl = {
  type: "async-validator";
  strategy: "force";
  debounceMs?: number;
};

type AutoValidationFlowControl = {
  type: "async-validator";
  strategy: "auto";
  debounceMs?: number;
};

type ValidationFlowControl =
  | SkipValidationFlowControl
  | ForceValidationFlowControl
  | AutoValidationFlowControl;

export type Field<T = unknown> = {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: FieldState;
};

type FieldValidatorProps<T extends DefaultValues, K extends keyof T> = {
  action: Action;
  value: T[K];
  meta: Field<T[K]>["meta"];
  validationState: Field<T[K]>["validationState"];
  validateWithStandardSchema: () =>
    | readonly StandardSchemaV1.Issue[]
    | undefined;
  formApi: {
    getField: <F extends Exclude<keyof T, K>>(
      field: F,
    ) => {
      value: T[F];
      meta: Field<T[F]>["meta"];
      isMounted: boolean;
      validationState: Field<T[F]>["validationState"];
      validateWithStandardSchema: () =>
        | readonly StandardSchemaV1.Issue[]
        | undefined;
    };
  };
};

type FieldAsyncValidatorProps<T extends DefaultValues, K extends keyof T> = {
  action: Action;
  value: T[K];
  meta: Field<T[K]>["meta"];
  validationState: Field<T[K]>["validationState"];
  getAbortSignal: () => AbortSignal;
  validateWithStandardSchemaAsync: () => Promise<
    readonly StandardSchemaV1.Issue[] | undefined
  >;
  formApi: {
    getField: <F extends Exclude<keyof T, K>>(
      field: F,
    ) => {
      value: T[F];
      meta: Field<T[F]>["meta"];
      isMounted: boolean;
      validationState: Field<T[F]>["validationState"];
      validateWithStandardSchemaAsync: () => Promise<
        readonly StandardSchemaV1.Issue[] | undefined
      >;
    };
  };
};

type SyncValidatorResult =
  | Exclude<FieldState, WaitingState | CheckingState>
  | ValidationFlowControl;

type SyncValidatorResultWithoutFlowControl = Exclude<
  FieldState,
  WaitingState | CheckingState
>;

type AsyncValidatorResult = ValidState | InvalidState | WarningState;

type ValidatorWithFlowControl<
  TForm extends DefaultValues,
  K extends keyof TForm,
> = (
  props: Prettify<FieldValidatorProps<TForm, K>>,
) => SyncValidatorResult | void;

type ValidatorWithoutFlowControl<
  TForm extends DefaultValues,
  K extends keyof TForm,
> = (
  props: Prettify<FieldValidatorProps<TForm, K>>,
) => SyncValidatorResultWithoutFlowControl | void;

type AsyncValidator<T extends DefaultValues, K extends keyof T> = (
  props: Prettify<FieldAsyncValidatorProps<T, K>>,
) => Promise<AsyncValidatorResult>;

export type FieldsMap<T extends DefaultValues> = {
  [K in keyof T]: Field<T[K]>;
};

export type ValidatorsMap<T extends DefaultValues> = {
  [K in keyof T]?: {
    validator?:
      | ValidatorWithFlowControl<T, K>
      | ValidatorWithoutFlowControl<T, K>;
    asyncValidator?: AsyncValidator<T, K>;
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

export type StandardSchemasMap<T extends DefaultValues> = {
  [K in keyof T]?: StandardSchemaV1<T[K]>;
};

export type IsMountedMap<T extends DefaultValues> = {
  [K in keyof T]: boolean;
};

// ============================================================================
// API TYPES
// ============================================================================

export type FormApi<T extends DefaultValues, K extends keyof T = keyof T> = {
  submit: (fields?: readonly (keyof T)[]) => void;
  getField: <F extends Exclude<keyof T, K>>(
    field: F,
  ) => Prettify<Field<T[F]> & { isMounted: boolean }>;
};

export type FieldApi<T extends DefaultValues, K extends keyof T> = {
  name: K;
  value: T[K];
  handleChange: (value: T[K]) => void;
  handleSubmit: () => void;
  handleBlur: () => void;
  meta: Field<T[K]>["meta"];
  formApi: Prettify<FormApi<T, K>>;
  validationState: Field<T[K]>["validationState"];
};

// ============================================================================
// STORE TYPES
// ============================================================================

export type Store<T extends DefaultValues> = {
  fieldsMap: FieldsMap<T>;
  defaultValues: T;
  validatorsMap: ValidatorsMap<T>;
  runningValidations: RunningValidationsMap<T>;
  debounceDelayMs: number;
  lastValidatedFields: LastValidatedFieldsMap<T>;
  lastValidatedNumberOfChanges: LastValidatedNumberOfChangesMap<T>;
  validationIds: ValidationIdsMap<T>;
  standardSchemasMap: StandardSchemasMap<T>;
  isMountedMap: IsMountedMap<T>;
};

export type Actions<T extends DefaultValues> = {
  setIsMountedMap: (field: keyof T, isMounted: boolean) => void;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setDefaultValues: (defaultValues: T) => void;
  setValidatorsMap: <K extends keyof T>(
    field: K,
    validators: {
      validator?:
        | ValidatorWithFlowControl<T, K>
        | ValidatorWithoutFlowControl<T, K>;
      asyncValidator?: AsyncValidator<T, K>;
      debounceMs?: number;
    },
  ) => void;
  validate: (field: keyof T, action: Action) => void;
  abortValidation: (field: keyof T) => void;
  setStandardSchemasMap: <K extends keyof T>(
    field: K,
    standardSchema?: StandardSchemaV1<T[K]>,
  ) => void;
  getField: <F extends keyof T>(
    field: F,
  ) => Prettify<Field<T[F]> & { isMounted: boolean }>;
};

// ============================================================================
// COMPONENT & HOOK OPTION TYPES
// ============================================================================

export type UseFormOptions<T extends DefaultValues> = {
  defaultValues: T;
};

export type UseFormResult<T extends DefaultValues> = {
  Field: <K extends keyof T>(props: FieldProps<T, K>) => React.ReactNode;
  formStore: ReturnType<typeof createFormStoreMutative<T>>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

// When asyncValidator is provided, validator can return validation flow controls
export type UseFieldOptionsWithAsync<
  T extends DefaultValues,
  K extends keyof T,
> = {
  name: K;
  validator?: ValidatorWithFlowControl<T, K>;
  asyncValidator: AsyncValidator<T, K>;
  debounceMs?: number;
  standardSchema?: StandardSchemaV1<T[K]>;
  dependencies?: readonly Exclude<keyof T, K>[];
};

// When asyncValidator is not provided, validator cannot return validation flow controls
export type UseFieldOptionsWithoutAsync<
  T extends DefaultValues,
  K extends keyof T,
> = {
  name: K;
  validator?: ValidatorWithoutFlowControl<T, K>;
  asyncValidator?: never;
  debounceMs?: never;
  standardSchema?: StandardSchemaV1<T[K]>;
  dependencies?: readonly Exclude<keyof T, K>[];
};

export type UseFieldOptions<T extends DefaultValues, K extends keyof T> =
  | UseFieldOptionsWithAsync<T, K>
  | UseFieldOptionsWithoutAsync<T, K>;

export type FieldOptionsInput<T extends DefaultValues> = {
  [K in keyof T]: UseFieldOptions<T, K> & { name: K };
}[keyof T];

export type FieldProps<
  T extends DefaultValues,
  K extends keyof T,
> = UseFieldOptions<T, K> & {
  children: (props: Prettify<FieldApi<T, K>>) => React.ReactNode;
};

export type CreateFormHookResult<T extends DefaultValues> = {
  useForm: (options: UseFormOptions<T>) => UseFormResult<T>;
  useField: <K extends keyof T>(
    options: UseFieldOptions<T, K>,
  ) => Prettify<FieldApi<T, K>>;
  useFieldDependencies: <K extends readonly (keyof T)[]>(
    dependencies?: K,
  ) => Prettify<Pick<FieldsMap<T>, K[number]>>;
};

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
      function mutateFields(mutator: (fields: FieldsMap<T>) => void) {
        set((state) => {
          mutator(state.fieldsMap as FieldsMap<T>);
        });
      }

      /** Mutates validators map with type safety */
      function mutateValidators(
        mutator: (validators: ValidatorsMap<T>) => void,
      ) {
        set((state) => {
          mutator(state.validatorsMap as ValidatorsMap<T>);
        });
      }

      /** Mutates running validations with type safety */
      function mutateRunningValidations(
        mutator: (validations: RunningValidationsMap<T>) => void,
      ) {
        set((state) => {
          mutator(state.runningValidations as RunningValidationsMap<T>);
        });
      }

      /** Mutates validation IDs with type safety */
      function mutateValidationIds(
        mutator: (ids: ValidationIdsMap<T>) => void,
      ) {
        set((state) => {
          mutator(state.validationIds as ValidationIdsMap<T>);
        });
      }

      /** Sets field validation state */
      function setFieldState(field: keyof T, state: FieldState) {
        mutateFields((fields) => {
          fields[field].validationState = state;
        });
      }

      // ========================================================================
      // HELPER FUNCTIONS
      // ========================================================================

      /** Cleans up all validation resources for a field */
      function cleanupValidation(field: keyof T) {
        const runningValidation = get().runningValidations[field];

        if (!runningValidation) {
          return;
        }

        // Clear timeout if exists
        if (runningValidation.timeoutId) {
          clearTimeout(runningValidation.timeoutId);
        }

        // Abort the async operation only if controller was created
        if (runningValidation.abortController) {
          runningValidation.abortController.abort();
        }

        // Remove from running validations
        mutateRunningValidations((validations) => {
          validations[field] = undefined;
        });
      }

      /** Clears timeout from running validation */
      function clearValidationTimeout(field: keyof T) {
        mutateRunningValidations((validations) => {
          const existing = validations[field];
          if (existing) {
            existing.timeoutId = undefined;
          }
        });
      }

      /** Updates running validation with abort controller */
      function updateAbortController(
        field: keyof T,
        abortController: AbortController,
      ) {
        mutateRunningValidations((validations) => {
          const existing = validations[field];
          if (existing) {
            existing.abortController = abortController;
          }
        });
      }

      /** Handles sync validation result that's not flow control */
      function handleSyncValidationResult(
        field: keyof T,
        result: SyncValidatorResultWithoutFlowControl,
      ) {
        switch (result.type) {
          case "valid": {
            setFieldState(field, { type: "valid", message: result.message });
            cleanupValidation(field);
            break;
          }

          case "invalid": {
            setFieldState(field, {
              type: "invalid",
              message: result.message,
            });
            cleanupValidation(field);
            break;
          }

          case "warning": {
            setFieldState(field, {
              type: "warning",
              message: result.message,
            });
            cleanupValidation(field);
            break;
          }

          case "pending": {
            setFieldState(field, { type: "pending" });
            cleanupValidation(field);
            break;
          }
        }
      }

      /** Handles auto validation strategy */
      function handleAutoValidation(
        field: keyof T,
        currentField: Field<T[keyof T]>,
        validators: ValidatorsMap<T>[keyof T],
        flowControl: AutoValidationFlowControl,
        action: Action,
      ) {
        const state = get();
        const runningValidation = state.runningValidations[field];

        if (runningValidation) {
          // Check if value has changed since validation started
          if (deepEqual(runningValidation.stateSnapshot, currentField.value)) {
            // Value hasn't changed, continue running existing validation
            return;
          } else {
            // Value changed, restart validation from the beginning
            cleanupValidation(field);
          }
        } else {
          // No running validation - check if value and numberOfChanges changed from last validation
          const lastValidatedValue = state.lastValidatedFields[field];
          const lastValidatedChanges =
            state.lastValidatedNumberOfChanges[field];

          const shouldSkipValidation =
            (lastValidatedValue !== undefined &&
              deepEqual(lastValidatedValue, currentField.value) &&
              lastValidatedChanges !== undefined &&
              lastValidatedChanges === currentField.meta.numberOfChanges) ||
            currentField.validationState.type === "valid" ||
            currentField.validationState.type === "invalid";

          if (shouldSkipValidation) {
            // Value and numberOfChanges haven't changed from last validation, skip
            return;
          }
        }

        // Start scheduled async validation if async validator exists
        if (validators?.asyncValidator) {
          const debounceMs =
            flowControl.debounceMs ??
            validators.debounceMs ??
            state.debounceDelayMs;

          scheduleValidation(
            field,
            currentField.value,
            validators.asyncValidator,
            debounceMs,
            action,
          );
        }
      }

      /** Handles force validation strategy */
      function handleForceValidation(
        field: keyof T,
        currentField: Field<T[keyof T]>,
        validators: ValidatorsMap<T>[keyof T],
        flowControl: ForceValidationFlowControl,
        action: Action,
      ) {
        // Cancel existing validation and restart from the beginning
        cleanupValidation(field);

        if (validators?.asyncValidator) {
          const debounceMs =
            flowControl.debounceMs ??
            validators.debounceMs ??
            get().debounceDelayMs;
          scheduleValidation(
            field,
            currentField.value,
            validators.asyncValidator,
            debounceMs,
            action,
          );
        }
      }

      /** Handles async validator flow control */
      function handleAsyncValidatorFlow(
        field: keyof T,
        currentField: Field<T[keyof T]>,
        validators: ValidatorsMap<T>[keyof T],
        flowControl: ValidationFlowControl,
        action: Action,
      ) {
        const state = get();

        switch (flowControl.strategy) {
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
            handleAutoValidation(
              field,
              currentField,
              validators,
              flowControl,
              action,
            );
            break;
          }

          case "force": {
            handleForceValidation(
              field,
              currentField,
              validators,
              flowControl,
              action,
            );
            break;
          }
        }
      }

      /** Increments validation ID for a field and returns the new ID */
      function incrementValidationId(field: keyof T) {
        const currentId = get().validationIds[field];
        const newId = currentId + 1;

        mutateValidationIds((ids) => {
          ids[field] = newId;
        });

        return newId;
      }

      /** Schedules debounced validation for a field */
      function scheduleValidation<K extends keyof T>(
        field: K,
        value: T[K],
        validator: AsyncValidator<T, K>,
        debounceMs: number,
        action: Action,
      ) {
        // Cancel any existing validation first
        cleanupValidation(field);

        // If debounce is 0, execute immediately without setTimeout
        if (debounceMs === 0) {
          runValidation(field, value, validator, action);
          return;
        }

        // Increment validation ID for this field
        const validationId = incrementValidationId(field);

        // Set field state to waiting
        setFieldState(field, { type: "waiting" });

        // Set up debounce timeout with extracted callback
        const timeoutId = setTimeout(() => {
          // Clear timeout from running validation
          clearValidationTimeout(field);

          // Start actual validation
          runValidation(field, value, validator, action);
        }, debounceMs);

        // Store the running validation with timeout (no abortController initially)
        mutateRunningValidations((validations) => {
          validations[field] = {
            stateSnapshot: value,
            timeoutId,
            validationId,
          } satisfies RunningValidation<T[typeof field]>;
        });
      }

      /** Runs async validation for a field */
      function runValidation<K extends keyof T>(
        field: K,
        value: T[K],
        validator: AsyncValidator<T, K>,
        action: Action,
      ) {
        // Abort any existing validation for this field
        cleanupValidation(field);

        const currentField = get().fieldsMap[field];

        // Increment validation ID for this field
        const validationId = incrementValidationId(field);

        // Create lazy abort signal factory
        let abortController: AbortController | undefined;

        const getAbortSignal = (): AbortSignal => {
          if (!abortController) {
            abortController = new AbortController();
            // Update the running validation to store the controller
            updateAbortController(field, abortController);
          }
          return abortController.signal;
        };

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
            timeoutId: undefined,
            validationId,
          } satisfies RunningValidation<T[typeof field]>;

          // Set field state to checking and store the value being validated
          fields[field].validationState = { type: "checking" };
          lastValidated[field] = value;
          lastValidatedNumberOfChanges[field] =
            fields[field].meta.numberOfChanges;
        });

        const standardSchema = get().standardSchemasMap[field];

        // Run async validation
        validator({
          action: action,
          value,
          meta: currentField.meta,
          validationState: currentField.validationState,
          getAbortSignal,
          validateWithStandardSchemaAsync: async () =>
            standardSchema
              ? await standardValidateAsync(standardSchema, value)
              : undefined,
          formApi: {
            getField: getFieldForFormApiAsync,
          },
        })
          .then((result) => {
            // Check if validation was aborted or is stale
            if (abortController?.signal.aborted) {
              return;
            }

            const currentValidationId = get().validationIds[field];
            if (validationId !== currentValidationId) {
              return;
            }

            // Update field state with result
            setFieldState(field, result);
            cleanupValidation(field);
          })
          .catch((error: unknown) => {
            // Check if validation was aborted or is stale
            if (abortController?.signal.aborted) {
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

            cleanupValidation(field);
          });
      }

      // Helper function to get field data for form API
      function getFieldForFormApi<F extends keyof T>(targetField: F) {
        const state = get();
        const targetFieldData = state.fieldsMap[targetField];
        const standardSchema = state.standardSchemasMap[targetField];
        return {
          value: targetFieldData.value,
          meta: targetFieldData.meta,
          isMounted: state.isMountedMap[targetField],
          validationState: targetFieldData.validationState,
          validateWithStandardSchema: () =>
            standardSchema
              ? standardValidate(standardSchema, targetFieldData.value)
              : undefined,
        };
      }

      function getFieldForFormApiAsync<F extends keyof T>(targetField: F) {
        const state = get();
        const targetFieldData = state.fieldsMap[targetField];
        const standardSchema = state.standardSchemasMap[targetField];
        return {
          value: targetFieldData.value,
          meta: targetFieldData.meta,
          isMounted: state.isMountedMap[targetField],
          validationState: targetFieldData.validationState,
          validateWithStandardSchemaAsync: async () =>
            standardSchema
              ? await standardValidateAsync(
                  standardSchema,
                  targetFieldData.value,
                )
              : undefined,
        };
      }

      /** Main validation orchestrator - handles sync validation and triggers async validation */
      function validate(field: keyof T, action: Action) {
        const state = get();

        const currentField = state.fieldsMap[field];
        const validators = state.validatorsMap[field];

        if (!validators) {
          return;
        }

        const standardSchema = state.standardSchemasMap[field];

        // Run sync validator if it exists
        const validatorResult = validators.validator?.({
          action,
          value: currentField.value,
          meta: currentField.meta,
          validationState: currentField.validationState,
          validateWithStandardSchema: () =>
            standardSchema
              ? standardValidate(standardSchema, currentField.value)
              : undefined,
          formApi: {
            getField: <F extends Exclude<keyof T, typeof field>>(
              targetField: F,
            ) => getFieldForFormApi(targetField),
          },
        });

        const resultOrValidationFlowControl = validatorResult ?? {
          type: "async-validator",
          strategy: "skip",
        };

        if (resultOrValidationFlowControl.type === "async-validator") {
          handleAsyncValidatorFlow(
            field,
            currentField,
            validators,
            resultOrValidationFlowControl,
            action,
          );
        } else {
          handleSyncValidationResult(field, resultOrValidationFlowControl);
        }
      }

      function mutateStandardSchemas(
        mutator: (standardSchemas: StandardSchemasMap<T>) => void,
      ) {
        set((state) => {
          const standardSchemas =
            state.standardSchemasMap as StandardSchemasMap<T>;
          mutator(standardSchemas);
        });
      }

      function mutateIsMountedMap(
        mutator: (isMountedMap: IsMountedMap<T>) => void,
      ) {
        set((state) => {
          const isMountedMap = state.isMountedMap as IsMountedMap<T>;
          mutator(isMountedMap);
        });
      }

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
        standardSchemasMap: {},
        isMountedMap: Object.fromEntries(
          Object.keys(options.defaultValues).map((field) => [field, false]),
        ) as IsMountedMap<T>,

        // ======================================================================
        // CONFIGURATION ACTIONS
        // ======================================================================

        /** Updates default values and initializes unset field values */
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

        setIsMountedMap: (field, isMounted) => {
          mutateIsMountedMap((isMountedMap) => {
            isMountedMap[field] = isMounted;
          });
        },

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
          validate(field, "change");
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

            validate(field, "submit");
          }
        },

        // ======================================================================
        // VALIDATION TRIGGER ACTIONS
        // ======================================================================

        /** Main validation orchestrator - handles sync validation and triggers async validation */
        validate,

        abortValidation: (field) => {
          cleanupValidation(field);
          mutateFields((fields) => {
            fields[field].validationState = { type: "pending" };
          });
        },

        setStandardSchemasMap: (field, standardSchema) => {
          mutateStandardSchemas((standardSchemas) => {
            standardSchemas[field] = standardSchema;
          });
        },

        // ======================================================================
        // GETTER ACTIONS
        // ======================================================================

        /** Gets field data with mounted status */
        getField: (field) => {
          const state = get();
          const targetField = state.fieldsMap[field];
          return {
            ...targetField,
            isMounted: state.isMountedMap[field],
          };
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
}: Readonly<{
  children: React.ReactNode;
  formStore: StoreApi<Store<DefaultValues> & Actions<DefaultValues>>;
}>) {
  return <FormContext value={formStore}>{children}</FormContext>;
}

/**
 * Field component that renders a field using the provided children prop
 */
function Field<T extends DefaultValues, K extends keyof T>(
  props: FieldProps<T, K>,
): React.ReactNode {
  const fieldApi = useField<T, K>(props);

  return props.children(fieldApi);
}

// ============================================================================
// HOOKS
// ============================================================================

function useFieldDependencies<
  T extends DefaultValues,
  K extends readonly (keyof T)[],
>(dependencies?: K): Pick<FieldsMap<T>, K[number]> {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const deps = dependencies ?? ([] as (keyof T)[]);

  return useStore(
    formStore,
    useShallow(
      (state: Store<T>) =>
        Object.fromEntries(
          deps.map((dependency) => [dependency, state.fieldsMap[dependency]]),
        ) as Pick<FieldsMap<T>, K[number]>,
    ),
  );
}

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

  // Subscribe to field state
  const field = useStore(
    formStore,
    useShallow((state: Store<T>) => state.fieldsMap[options.name]),
  );

  useStore(
    formStore,
    useShallow((state: Store<T>) =>
      options.dependencies?.map((dependency) => state.fieldsMap[dependency]),
    ),
  );

  // Subscribe to actions
  const setValue = useStore(formStore, (state) => state.setValue);
  const submit = useStore(formStore, (state) => state.submit);
  const setValidatorsMap = useStore(
    formStore,
    (state) => state.setValidatorsMap,
  );
  const validate = useStore(formStore, (state) => state.validate);
  const setStandardSchemasMap = useStore(
    formStore,
    (state) => state.setStandardSchemasMap,
  );
  const setIsMountedMap = useStore(formStore, (state) => state.setIsMountedMap);
  const abortValidation = useStore(formStore, (state) => state.abortValidation);
  const getField = useStore(formStore, (state) => state.getField);

  useIsomorphicEffect(() => {
    setValidatorsMap(options.name, {
      validator: options.validator,
      asyncValidator: options.asyncValidator,
      debounceMs: options.debounceMs,
    });
    setStandardSchemasMap(options.name, options.standardSchema);
  }, [
    options.debounceMs,
    options.name,
    options.standardSchema,
    options.validator,
    options.asyncValidator,
    setStandardSchemasMap,
    setValidatorsMap,
  ]);

  useIsomorphicEffect(() => {
    setIsMountedMap(options.name, true);
    validate(options.name, "mount");
    const fieldName = options.name;

    return () => {
      setIsMountedMap(fieldName, false);
      abortValidation(fieldName);
    };
  }, [abortValidation, options.name, setIsMountedMap, validate]);

  // Create field handlers
  const handleChange = useCallback(
    (value: T[K]) => {
      setValue(options.name, value);
    },
    [options.name, setValue],
  );

  const handleSubmit = useCallback(() => {
    submit([options.name]);
  }, [options.name, submit]);

  const handleBlur = useCallback(() => {
    validate(options.name, "blur");
  }, [options.name, validate]);

  // Create form API
  const formApi = useMemo(
    () => ({
      submit,
      getField,
    }),
    [submit, getField],
  );

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
    useFieldDependencies,
  };
}
