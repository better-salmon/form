import {
  createContext,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { dedupePrimitiveArray } from "@lib/dedupe-primitive-array";
import { normalizeNumber, normalizeDebounceMs } from "@lib/normalize-number";

// ============================================================================
// CONSTANTS
// ============================================================================

// Register the callback for all possible actions
const ACTIONS: Action[] = ["change", "blur", "submit", "mount"];

export const DEFAULT_WATCHER_MAX_STEPS = 1000;

// ============================================================================
// UTILITY TYPES
// ============================================================================

type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line sonarjs/no-useless-intersection -- this is a common pattern for prettifying types
} & {};

type DefaultValues = Record<string, unknown>;

// ==========================================================================
// BRANDED VALIDATION STATES + FACTORIES
// ==========================================================================

// Brands prevent users from constructing states without helper factories
declare const FIELD_STATE_BRAND: unique symbol;
declare const FLOW_CONTROL_BRAND: unique symbol;

export type InvalidState<D = unknown> = {
  readonly [FIELD_STATE_BRAND]: true;
  type: "invalid";
  issues: readonly StandardSchemaV1.Issue[];
  details?: D;
};

export type WarningState<D = unknown> = {
  readonly [FIELD_STATE_BRAND]: true;
  type: "warning";
  issues: readonly StandardSchemaV1.Issue[];
  details?: D;
};

export type ValidState<D = unknown> = {
  readonly [FIELD_STATE_BRAND]: true;
  type: "valid";
  details?: D;
};

export type PendingState<D = unknown> = {
  readonly [FIELD_STATE_BRAND]: true;
  type: "pending";
  details?: D;
};

export type WaitingState<D = unknown> = {
  readonly [FIELD_STATE_BRAND]: true;
  type: "waiting";
  details?: D;
};

export type CheckingState<D = unknown> = {
  readonly [FIELD_STATE_BRAND]: true;
  type: "checking";
  details?: D;
};

export type ValidationFactory<D = unknown> = {
  valid: (props?: { details?: D }) => ValidState<D>;
  invalid: (props?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: D;
  }) => InvalidState<D>;
  warning: (props?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: D;
  }) => WarningState<D>;
  pending: (props?: { details?: D }) => PendingState<D>;
  waiting: (props?: { details?: D }) => WaitingState<D>;
  checking: (props?: { details?: D }) => CheckingState<D>;
  async: {
    skip: () => SkipValidationFlowControl;
    force: (debounceMs?: number) => ForceValidationFlowControl;
    auto: (debounceMs?: number) => AutoValidationFlowControl;
  };
};

// ============================================================================
// WATCHER TYPES
// ============================================================================

type WatchFieldsConfig<
  T extends DefaultValues,
  CurrentField extends keyof T,
  D = unknown,
> = {
  [WatchedField in Exclude<keyof T, CurrentField>]?: (props: {
    action: Action;
    watchedValue: T[WatchedField];
    watchedField: Prettify<Field<T[WatchedField], D>>;
    currentField: Prettify<Field<T[CurrentField], D>>;
    formApi: {
      validate: (field: keyof T) => void;
      setValue: <K extends keyof T>(field: K, value: T[K]) => void;
      getField: <K extends keyof T>(
        field: K,
      ) => Prettify<Field<T[K], D> & { isMounted: boolean }>;
      reset: (field: keyof T) => void;
      touch: (field: keyof T) => void;
    };
  }) => void;
};

// Clean watcher storage that executes with proper state context
type StoredWatcher<T extends DefaultValues, D = unknown> = {
  targetField: keyof T;
  watchedField: keyof T;
  execute: (
    action: Action,
    getState: () => Store<T, D> & Actions<T, D>,
    validateInternal: (field: keyof T, action: Action) => void,
  ) => void;
};

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

// Union of branded validation states

type FieldState<D = unknown> =
  | InvalidState<D>
  | WarningState<D>
  | ValidState<D>
  | PendingState<D>
  | WaitingState<D>
  | CheckingState<D>;

export type SkipValidationFlowControl = {
  readonly [FLOW_CONTROL_BRAND]: true;
  type: "async-validator";
  strategy: "skip";
};

export type ForceValidationFlowControl = {
  readonly [FLOW_CONTROL_BRAND]: true;
  type: "async-validator";
  strategy: "force";
  debounceMs?: number;
};

export type AutoValidationFlowControl = {
  readonly [FLOW_CONTROL_BRAND]: true;
  type: "async-validator";
  strategy: "auto";
  debounceMs?: number;
};

type ValidationFlowControl =
  | SkipValidationFlowControl
  | ForceValidationFlowControl
  | AutoValidationFlowControl;

export type Field<T = unknown, D = unknown> = {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
  };
  validationState: FieldState<D>;
};

type FieldValidatorProps<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: Action;
  value: T[K];
  meta: Field<T[K]>["meta"];
  validationState: Field<T[K], D>["validationState"];
  validateWithStandardSchema: () =>
    | readonly StandardSchemaV1.Issue[]
    | undefined;
  validation: ValidationFactory<D>;
  formApi: {
    getField: <F extends Exclude<keyof T, K>>(
      field: F,
    ) => {
      value: T[F];
      meta: Field<T[F], D>["meta"];
      isMounted: boolean;
      validationState: Field<T[F], D>["validationState"];
      validateWithStandardSchema: () =>
        | readonly StandardSchemaV1.Issue[]
        | undefined;
    };
  };
};

type FieldAsyncValidatorProps<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: Action;
  value: T[K];
  meta: Field<T[K]>["meta"];
  validationState: Field<T[K], D>["validationState"];
  getAbortSignal: () => AbortSignal;
  validateWithStandardSchemaAsync: () => Promise<
    readonly StandardSchemaV1.Issue[] | undefined
  >;
  validation: ValidationFactory<D>;
  formApi: {
    getField: <F extends Exclude<keyof T, K>>(
      field: F,
    ) => {
      value: T[F];
      meta: Field<T[F], D>["meta"];
      isMounted: boolean;
      validationState: Field<T[F], D>["validationState"];
      validateWithStandardSchemaAsync: () => Promise<
        readonly StandardSchemaV1.Issue[] | undefined
      >;
    };
  };
};

type SyncValidatorResult<D = unknown> =
  | Exclude<FieldState<D>, WaitingState<D> | CheckingState<D>>
  | ValidationFlowControl;

type SyncValidatorResultWithoutFlowControl<D = unknown> = Exclude<
  FieldState<D>,
  WaitingState<D> | CheckingState<D>
>;

type AsyncValidatorResult<D = unknown> =
  | ValidState<D>
  | InvalidState<D>
  | WarningState<D>;

type ValidatorWithFlowControl<
  TForm extends DefaultValues,
  K extends keyof TForm,
  D = unknown,
> = (
  props: Prettify<FieldValidatorProps<TForm, K, D>>,
) => SyncValidatorResult<D> | void;

type ValidatorWithoutFlowControl<
  TForm extends DefaultValues,
  K extends keyof TForm,
  D = unknown,
> = (
  props: Prettify<FieldValidatorProps<TForm, K, D>>,
) => SyncValidatorResultWithoutFlowControl<D> | void;

type AsyncValidator<T extends DefaultValues, K extends keyof T, D = unknown> = (
  props: Prettify<FieldAsyncValidatorProps<T, K, D>>,
) => Promise<AsyncValidatorResult<D>>;

export type FieldsMap<T extends DefaultValues, D = unknown> = {
  [K in keyof T]: Field<T[K], D>;
};

export type ValidatorsMap<T extends DefaultValues, D = unknown> = {
  [K in keyof T]?: {
    validator?:
      | ValidatorWithFlowControl<T, K, D>
      | ValidatorWithoutFlowControl<T, K, D>;
    asyncValidator?: AsyncValidator<T, K, D>;
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

export type FieldDependenciesMap<
  T extends DefaultValues,
  K extends readonly (keyof T)[],
  D = unknown,
> = {
  [P in K[number]]: Prettify<Field<T[P], D> & { isMounted: boolean }>;
};

// ============================================================================
// API TYPES
// ============================================================================

export type FormApi<
  T extends DefaultValues,
  D = unknown,
  K extends keyof T = keyof T,
> = {
  submit: (fields?: readonly (keyof T)[]) => void;
  getField: <F extends Exclude<keyof T, K>>(
    field: F,
  ) => Prettify<Field<T[F], D> & { isMounted: boolean }>;
};

export type FieldApi<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  name: K;
  value: T[K];
  handleChange: (value: T[K]) => void;
  handleSubmit: () => void;
  handleBlur: () => void;
  meta: Field<T[K], D>["meta"];
  formApi: Prettify<FormApi<T, D, K>>;
  validationState: Field<T[K], D>["validationState"];
};

// ============================================================================
// STORE TYPES
// ============================================================================

export type Store<T extends DefaultValues, D = unknown> = {
  fieldsMap: FieldsMap<T, D>;
  defaultValues: T;
  validatorsMap: ValidatorsMap<T, D>;
  runningValidations: RunningValidationsMap<T>;
  debounceDelayMs: number;
  lastValidatedFields: LastValidatedFieldsMap<T>;
  lastValidatedNumberOfChanges: LastValidatedNumberOfChangesMap<T>;
  validationIds: ValidationIdsMap<T>;
  standardSchemasMap: StandardSchemasMap<T>;
  isMountedMap: IsMountedMap<T>;
};

export type Actions<T extends DefaultValues, D = unknown> = {
  setIsMountedMap: (field: keyof T, isMounted: boolean) => void;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  /** Marks a field as touched without changing value or numberOfChanges */
  touch: (field: keyof T) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setDefaultValues: (defaultValues: T) => void;
  /** Sets the global default debounce delay (ms) used for auto/force async validation */
  setDebounceDelayMs: (debounceMs: number) => void;
  setValidatorsMap: <K extends keyof T>(
    field: K,
    validators:
      | {
          validator?:
            | ValidatorWithFlowControl<T, K, D>
            | ValidatorWithoutFlowControl<T, K, D>;
          asyncValidator?: AsyncValidator<T, K, D>;
          debounceMs?: number;
        }
      | undefined,
  ) => void;
  validate: (field: keyof T, action: Action) => void;
  abortValidation: (field: keyof T) => void;
  setStandardSchemasMap: <K extends keyof T>(
    field: K,
    standardSchema: StandardSchemaV1<T[K]> | undefined,
  ) => void;
  getField: <F extends keyof T>(
    field: F,
  ) => Prettify<Field<T[F], D> & { isMounted: boolean }>;
  registerWatchers: <K extends keyof T>(
    targetField: K,
    watchFields: WatchFieldsConfig<T, K, D>,
  ) => void;
  unregisterWatchers: (targetField: keyof T) => void;
  executeWatchers: (watchedField: keyof T, action: Action) => void;
};

// ============================================================================
// COMPONENT & HOOK OPTION TYPES
// ============================================================================

export type UseFormOptions<T extends DefaultValues> = {
  defaultValues: T;
  /** Global default debounce delay (ms) for async validations when not overridden per-field */
  debounceDelayMs?: number;
  /** Max allowed steps in a single watcher dispatch chain to prevent feedback loops (default: 1000) */
  watcherMaxSteps?: number;
};

export type UseFormResult<T extends DefaultValues, D = unknown> = {
  Field: <K extends keyof T>(props: FieldProps<T, K, D>) => React.ReactNode;
  formStore: ReturnType<typeof createFormStoreMutative<T, D>>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

// When asyncValidator is provided, validator can return validation flow controls
export type UseFieldOptionsWithAsync<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  name: K;
  validator?: ValidatorWithFlowControl<T, K, D>;
  asyncValidator: AsyncValidator<T, K, D>;
  debounceMs?: number;
  standardSchema?: StandardSchemaV1<T[K]>;
  watchFields?: WatchFieldsConfig<T, K, D>;
};

// When asyncValidator is not provided, validator cannot return validation flow controls
export type UseFieldOptionsWithoutAsync<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  name: K;
  validator?: ValidatorWithoutFlowControl<T, K, D>;
  asyncValidator?: never;
  debounceMs?: never;
  standardSchema?: StandardSchemaV1<T[K]>;
  watchFields?: WatchFieldsConfig<T, K, D>;
};

export type UseFieldOptions<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = UseFieldOptionsWithAsync<T, K, D> | UseFieldOptionsWithoutAsync<T, K, D>;

export type FieldOptionsInput<T extends DefaultValues, D = unknown> = {
  [K in keyof T]: UseFieldOptions<T, K, D> & { name: K };
}[keyof T];

export type FieldProps<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = UseFieldOptions<T, K, D> & {
  children: (props: Prettify<FieldApi<T, K, D>>) => React.ReactNode;
};

export type CreateFormHookResult<T extends DefaultValues, D = unknown> = {
  useForm: (options: UseFormOptions<T>) => UseFormResult<T, D>;
  useField: <K extends keyof T>(
    options: UseFieldOptions<T, K, D>,
  ) => Prettify<FieldApi<T, K, D>>;
  useFieldDependencies: <K extends (keyof T)[]>(
    dependencies?: K,
  ) => FieldDependenciesMap<T, K, D>;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates initial fields map from default values
 */
function createInitialFieldsMap<T extends DefaultValues, D = unknown>(
  defaultValues: T,
): FieldsMap<T, D> {
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
        } as PendingState<D>,
      } satisfies Field<T[typeof field], D>,
    ]),
  ) as FieldsMap<T, D>;
}

/**
 * Extracts field names from fields map
 */
function getFieldNames<T extends DefaultValues, D = unknown>(
  fieldsMap: FieldsMap<T, D>,
) {
  return Object.keys(fieldsMap) as (keyof T)[];
}

// ============================================================================
// STORE CREATION
// ============================================================================

/**
 * Creates the main form store with mutative capabilities
 */
function createFormStoreMutative<T extends DefaultValues, D = unknown>(
  options: UseFormOptions<T>,
) {
  const store = createStore<Store<T, D> & Actions<T, D>>()(
    mutative((set, get) => {
      const validation = {
        valid: (props?: { details?: D }): ValidState<D> =>
          ({
            type: "valid",
            details: props?.details,
          }) as ValidState<D>,
        invalid: (props?: {
          issues?: readonly StandardSchemaV1.Issue[];
          details?: D;
        }): InvalidState<D> =>
          ({
            type: "invalid",
            issues: props?.issues ?? [],
            details: props?.details,
          }) as InvalidState<D>,
        warning: (props?: {
          issues?: readonly StandardSchemaV1.Issue[];
          details?: D;
        }): WarningState<D> =>
          ({
            type: "warning",
            issues: props?.issues ?? [],
            details: props?.details,
          }) as WarningState<D>,
        pending: (props?: { details?: D }): PendingState<D> =>
          ({
            type: "pending",
            details: props?.details,
          }) as PendingState<D>,
        waiting: (props?: { details?: D }): WaitingState<D> =>
          ({
            type: "waiting",
            details: props?.details,
          }) as WaitingState<D>,
        checking: (props?: { details?: D }): CheckingState<D> =>
          ({
            type: "checking",
            details: props?.details,
          }) as CheckingState<D>,
        async: {
          skip: (): SkipValidationFlowControl =>
            ({
              type: "async-validator",
              strategy: "skip",
            }) as SkipValidationFlowControl,
          force: (debounceMs?: number): ForceValidationFlowControl =>
            ({
              type: "async-validator",
              strategy: "force",
              debounceMs,
            }) as ForceValidationFlowControl,
          auto: (debounceMs?: number): AutoValidationFlowControl =>
            ({
              type: "async-validator",
              strategy: "auto",
              debounceMs,
            }) as AutoValidationFlowControl,
        },
      } as const satisfies ValidationFactory<D>;

      // ========================================================================
      // STORE-LOCAL WATCHER REGISTRY
      // ========================================================================

      /** Store-local registry to store watchers for this form instance */
      const watchersMap = new Map<string, StoredWatcher<T, D>[]>();

      // Guard to prevent watcher feedback loops within a single dispatch chain
      type WatcherTransactionState = {
        active: boolean;
        visitedEdges: Set<string>;
        steps: number;
        maxSteps: number;
        bailOut: boolean;
      };

      const configuredMaxSteps = normalizeNumber(options.watcherMaxSteps, {
        fallback: DEFAULT_WATCHER_MAX_STEPS,
        min: 1,
        integer: "floor",
      });

      const watcherTransaction: WatcherTransactionState = {
        active: false,
        visitedEdges: new Set<string>(),
        steps: 0,
        maxSteps: configuredMaxSteps,
        bailOut: false,
      };

      function runInWatcherTransaction<TResult>(fn: () => TResult): TResult {
        if (!watcherTransaction.active) {
          watcherTransaction.active = true;
          watcherTransaction.visitedEdges.clear();
          watcherTransaction.steps = 0;
          watcherTransaction.bailOut = false;
          try {
            return fn();
          } finally {
            watcherTransaction.active = false;
            watcherTransaction.visitedEdges.clear();
            watcherTransaction.steps = 0;
            watcherTransaction.bailOut = false;
          }
        }
        return fn();
      }

      function makeEdgeKey(
        watchedField: keyof T,
        targetField: keyof T,
        action: Action,
      ): string {
        // Keys are strings (DefaultValues uses Record<string, unknown>)
        return JSON.stringify([
          String(watchedField),
          String(targetField),
          action,
        ]);
      }

      // ========================================================================
      // TYPED HELPER FUNCTIONS FOR CLEAN MUTATIONS
      // ========================================================================

      /** Mutates fields map with type safety */
      function mutateFields(mutator: (fields: FieldsMap<T, D>) => void) {
        set((state) => {
          mutator(state.fieldsMap as FieldsMap<T, D>);
        });
      }

      /** Mutates validators map with type safety */
      function mutateValidators(
        mutator: (validators: ValidatorsMap<T, D>) => void,
      ) {
        set((state) => {
          mutator(state.validatorsMap as ValidatorsMap<T, D>);
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
      function setFieldState(field: keyof T, state: FieldState<D>) {
        const currentState = get().fieldsMap[field].validationState;

        // Only update if the validation state actually changed
        if (!deepEqual(currentState, state)) {
          mutateFields((fields) => {
            fields[field].validationState = state;
          });
        }
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

      /**
       * Determines whether auto validation can be skipped for a field based on
       * current state. Returns true when:
       * - A validation is already running for the same value, or
       * - The value and numberOfChanges match the last completed validation
       */
      function shouldSkipAutoValidation(
        field: keyof T,
        currentField: Field<T[keyof T]>,
      ): boolean {
        const state = get();
        const runningValidation = state.runningValidations[field];

        // If validation is already running and the value hasn't changed, skip
        if (runningValidation) {
          return deepEqual(runningValidation.stateSnapshot, currentField.value);
        }

        // Otherwise, skip if nothing changed since the last completed validation
        const lastValidatedValue = state.lastValidatedFields[field];
        const lastValidatedChanges = state.lastValidatedNumberOfChanges[field];

        return (
          lastValidatedValue !== undefined &&
          deepEqual(lastValidatedValue, currentField.value) &&
          lastValidatedChanges !== undefined &&
          lastValidatedChanges === currentField.meta.numberOfChanges
        );
      }

      /** Handles sync validation result that's not flow control */
      function handleSyncValidationResult(
        field: keyof T,
        result: SyncValidatorResultWithoutFlowControl<D>,
      ) {
        setFieldState(field, result);
        cleanupValidation(field);
      }

      /** Handles auto validation strategy */
      function handleAutoValidation(
        field: keyof T,
        currentField: Field<T[keyof T]>,
        validators: ValidatorsMap<T, D>[keyof T],
        flowControl: AutoValidationFlowControl,
        action: Action,
      ) {
        const state = get();
        const runningValidation = state.runningValidations[field];

        // Unified skip condition for auto validation
        if (shouldSkipAutoValidation(field, currentField)) {
          return;
        }

        // If there is a running validation but value changed, restart it
        if (runningValidation) {
          cleanupValidation(field);
        }

        // Start scheduled async validation if async validator exists
        if (validators?.asyncValidator) {
          const debounceMs = normalizeDebounceMs(
            flowControl.debounceMs ??
              validators.debounceMs ??
              state.debounceDelayMs,
          );

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
        validators: ValidatorsMap<T, D>[keyof T],
        flowControl: ForceValidationFlowControl,
        action: Action,
      ) {
        // Cancel existing validation and restart from the beginning
        cleanupValidation(field);

        if (validators?.asyncValidator) {
          const debounceMs = normalizeDebounceMs(
            flowControl.debounceMs ??
              validators.debounceMs ??
              get().debounceDelayMs,
          );

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
        validators: ValidatorsMap<T, D>[keyof T],
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
        validator: AsyncValidator<T, K, D>,
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
        setFieldState(field, validation.waiting());

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
        validator: AsyncValidator<T, K, D>,
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
          const fields = state.fieldsMap as FieldsMap<T, D>;
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
          fields[field].validationState = validation.checking();
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
          validation,
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
            setFieldState(
              field,
              validation.invalid({
                issues: [
                  {
                    message:
                      error instanceof Error
                        ? error.message
                        : "Validation failed",
                  },
                ],
              }),
            );

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

      /** Main validation orchestrator used internally by actions */
      function validateInternal(field: keyof T, action: Action) {
        const state = get();
        // Skip unmounted fields
        if (!state.isMountedMap[field]) {
          return;
        }

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
          validation,
          formApi: {
            getField: <F extends Exclude<keyof T, typeof field>>(
              targetField: F,
            ) => getFieldForFormApi(targetField),
          },
        });

        const resultOrValidationFlowControl =
          validatorResult ?? validation.async.skip();

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
        fieldsMap: createInitialFieldsMap<T, D>(options.defaultValues),
        validatorsMap: {},
        runningValidations: {},
        debounceDelayMs: options.debounceDelayMs ?? 500,
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
          const currentDefaults = get().defaultValues;

          // Only update if default values actually changed
          if (!deepEqual(currentDefaults, defaultValues)) {
            set((state) => {
              // Use Object.assign for proper draft mutation
              Object.assign(state.defaultValues, defaultValues);
              const fields = state.fieldsMap as FieldsMap<T>;

              for (const [field] of Object.entries(defaultValues)) {
                fields[field as keyof T].value ??=
                  defaultValues[field as keyof T];
              }
            });
          }
        },

        /** Sets validators for a specific field */
        setValidatorsMap: (field, validators) => {
          const currentValidators = get().validatorsMap[field];

          // Only update if validators actually changed
          if (!deepEqual(currentValidators, validators)) {
            mutateValidators((validatorsMap) => {
              validatorsMap[field] = validators;
            });
          }
        },

        // ======================================================================
        // FIELD VALUE ACTIONS
        // ======================================================================

        setIsMountedMap: (field, isMounted) => {
          const currentIsMounted = get().isMountedMap[field];

          // Only update if mounted state actually changed
          if (currentIsMounted !== isMounted) {
            mutateIsMountedMap((isMountedMap) => {
              isMountedMap[field] = isMounted;
            });
          }
        },

        /** Marks a field as touched without affecting value or numberOfChanges */
        touch: (field) => {
          set((state) => {
            const fields = state.fieldsMap as FieldsMap<T, D>;
            if (!fields[field].meta.isTouched) {
              fields[field].meta.isTouched = true;
            }
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
          validateInternal(field, "change");

          // Execute watchers for this field change
          get().executeWatchers(field, "change");
        },

        /** Sets global default debounce for async validation */
        setDebounceDelayMs: (debounceMs) => {
          const current = get().debounceDelayMs;
          const next = normalizeDebounceMs(debounceMs);
          if (current !== next) {
            set((state) => {
              state.debounceDelayMs = next;
            });
          }
        },

        /** Submits specified fields (or all fields if none specified) */
        submit: (fields) => {
          runInWatcherTransaction(() => {
            const state = get();
            const fieldsToSubmit = new Set(
              fields ?? getFieldNames(state.fieldsMap),
            );

            // Update submission metadata and trigger validation for each field
            for (const field of fieldsToSubmit) {
              // Skip unmounted fields
              if (!state.isMountedMap[field]) {
                continue;
              }
              mutateFields((fields) => {
                fields[field].meta.numberOfSubmissions++;
              });

              validateInternal(field, "submit");

              // Execute watchers for this submit action
              get().executeWatchers(field, "submit");
              if (watcherTransaction.bailOut) {
                break;
              }
            }
          });
        },

        // ======================================================================
        // VALIDATION TRIGGER ACTIONS
        // ======================================================================

        /** Public validate action: delegates to the internal orchestrator and runs watchers */
        validate: (field, action) => {
          const state = get();
          // Skip unmounted fields
          if (!state.isMountedMap[field]) {
            return;
          }
          validateInternal(field, action);

          // Execute watchers for this validation action
          get().executeWatchers(field, action);
        },

        abortValidation: (field) => {
          cleanupValidation(field);
          const currentState = get().fieldsMap[field].validationState;

          // Only update if not already pending
          if (currentState.type !== "pending") {
            mutateFields((fields) => {
              fields[field].validationState = validation.pending();
            });
          }
        },

        setStandardSchemasMap: (field, standardSchema) => {
          const currentSchema = get().standardSchemasMap[field];

          // Only update if schema actually changed
          if (currentSchema !== standardSchema) {
            mutateStandardSchemas((standardSchemas) => {
              standardSchemas[field] = standardSchema;
            });
          }
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

        // ======================================================================
        // STORE-LOCAL WATCHER HELPER FUNCTIONS
        // ======================================================================

        /** Registers watchers for a field */
        registerWatchers: <K extends keyof T>(
          targetField: K,
          watchFields: WatchFieldsConfig<T, K, D>,
        ) => {
          // Remove existing watchers for this target field first
          for (const [key, registrations] of watchersMap.entries()) {
            const filtered = registrations.filter(
              (reg) => reg.targetField !== targetField,
            );
            if (filtered.length === 0) {
              watchersMap.delete(key);
            } else {
              watchersMap.set(key, filtered);
            }
          }

          // Register new watchers for all actions
          for (const watchedField of Object.keys(watchFields) as Exclude<
            keyof T,
            K
          >[]) {
            const callback = watchFields[watchedField];
            if (!callback) {
              continue;
            }
            for (const action of ACTIONS) {
              const watchKey = `${watchedField as string}:${action}`;
              const existing = watchersMap.get(watchKey) ?? [];

              existing.push({
                targetField,
                watchedField,
                execute: (action, getState, validateInternal) => {
                  const state = getState();
                  const watchedFieldData = state.fieldsMap[watchedField];
                  const currentFieldData = state.fieldsMap[targetField];

                  const formApi = {
                    validate: (field: keyof T) => {
                      validateInternal(field, action);
                    },
                    setValue: <K extends keyof T>(field: K, value: T[K]) => {
                      state.setValue(field, value);
                    },
                    getField: <K extends keyof T>(field: K) =>
                      state.getField(field),
                    reset: (field: keyof T) => {
                      const defaultValue = state.defaultValues[field];
                      state.setValue(field, defaultValue);
                    },
                    touch: (field: keyof T) => {
                      state.touch(field);
                    },
                  };

                  // Call the callback with properly typed arguments
                  callback({
                    action,
                    watchedValue: watchedFieldData.value,
                    watchedField: watchedFieldData,
                    currentField: currentFieldData,
                    formApi,
                  });
                },
              });

              watchersMap.set(watchKey, existing);
            }
          }
        },

        /** Unregisters all watchers for a field */
        unregisterWatchers: (targetField: keyof T) => {
          for (const [key, registrations] of watchersMap.entries()) {
            const filtered = registrations.filter(
              (reg) => reg.targetField !== targetField,
            );
            if (filtered.length === 0) {
              watchersMap.delete(key);
            } else {
              watchersMap.set(key, filtered);
            }
          }
        },

        /** Executes watchers for a watched field and action with loop protection */
        executeWatchers: (watchedField: keyof T, action: Action) => {
          runInWatcherTransaction(() => {
            const watchKey = `${String(watchedField)}:${action}`;
            const watchers = watchersMap.get(watchKey) ?? [];

            for (const watcher of watchers) {
              // Early bailout if limit already reached in this transaction
              if (watcherTransaction.bailOut) {
                break;
              }
              // Edge key prevents running the same watched->target pair repeatedly
              const edgeKey = makeEdgeKey(
                watchedField,
                watcher.targetField,
                action,
              );

              if (watcherTransaction.visitedEdges.has(edgeKey)) {
                continue;
              }

              if (watcherTransaction.steps >= watcherTransaction.maxSteps) {
                // Hard stop to avoid unbounded loops
                watcherTransaction.bailOut = true;
                console.warn(
                  "Watcher chain exceeded max steps; breaking to avoid a feedback loop",
                  {
                    maxSteps: watcherTransaction.maxSteps,
                    steps: watcherTransaction.steps,
                    watchKey,
                    edgeKey,
                    action,
                    watchedField: String(watchedField),
                    targetField: String(watcher.targetField),
                  },
                );
                break;
              }

              watcherTransaction.visitedEdges.add(edgeKey);
              watcherTransaction.steps += 1;
              watcher.execute(action, get, validateInternal);
            }
          });
        },
      };
    }),
  );

  return store;
}

// ============================================================================
// CONTEXT
// ============================================================================

type GenericStoreApi = StoreApi<Store<DefaultValues> & Actions<DefaultValues>>;
const FormContext = createContext<GenericStoreApi | null>(null);

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
  formStore: GenericStoreApi;
}>) {
  return <FormContext value={formStore}>{children}</FormContext>;
}

/**
 * Field component that renders a field using the provided children prop
 */
function Field<T extends DefaultValues, K extends keyof T, D = unknown>(
  props: FieldProps<T, K, D>,
): React.ReactNode {
  const fieldApi = useField<T, K, D>(props);

  return props.children(fieldApi);
}

// ============================================================================
// HOOKS
// ============================================================================

function useFieldDependencies<
  T extends DefaultValues,
  K extends (keyof T)[],
  D = unknown,
>(dependencies?: K): FieldDependenciesMap<T, K, D> {
  const formStore = use(FormContext) as StoreApi<
    Store<T, D> & Actions<T, D>
  > | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const deduplicatedDependencies = useMemo(
    () => dedupePrimitiveArray(dependencies ?? []),
    [dependencies],
  );

  const { fieldsMap, isMountedMap } = useStore(
    formStore,
    useShallow((state: Store<T, D>) => ({
      fieldsMap: state.fieldsMap,
      isMountedMap: state.isMountedMap,
    })),
  );

  return useMemo(
    () =>
      Object.fromEntries(
        deduplicatedDependencies.map((dependency) => [
          dependency,
          {
            ...fieldsMap[dependency],
            isMounted: isMountedMap[dependency],
          },
        ]),
      ) as FieldDependenciesMap<T, K, D>,
    [deduplicatedDependencies, fieldsMap, isMountedMap],
  );
}

/**
 * Hook to access and manage a specific form field
 */
function useField<T extends DefaultValues, K extends keyof T, D = unknown>(
  options: UseFieldOptions<T, K, D>,
): FieldApi<T, K, D> {
  const formStore = use(FormContext) as StoreApi<
    Store<T, D> & Actions<T, D>
  > | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const field = useStore(
    formStore,
    useShallow((state: Store<T, D>) => state.fieldsMap[options.name]),
  );

  const {
    setValue,
    submit,
    setValidatorsMap,
    validate,
    setStandardSchemasMap,
    setIsMountedMap,
    abortValidation,
    getField,
    registerWatchers,
    unregisterWatchers,
  } = useStore(
    formStore,
    useShallow((state: Store<T, D> & Actions<T, D>) => ({
      setValue: state.setValue,
      submit: state.submit,
      setValidatorsMap: state.setValidatorsMap,
      validate: state.validate,
      setStandardSchemasMap: state.setStandardSchemasMap,
      setIsMountedMap: state.setIsMountedMap,
      abortValidation: state.abortValidation,
      getField: state.getField,
      registerWatchers: state.registerWatchers,
      unregisterWatchers: state.unregisterWatchers,
    })),
  );

  // Track if watchers were registered for the current field name to avoid redundant unregister calls
  const watchersRegisteredForNameRef = useRef<keyof T | null>(null);

  useIsomorphicEffect(() => {
    setValidatorsMap(options.name, {
      validator: options.validator,
      asyncValidator: options.asyncValidator,
      debounceMs: options.debounceMs,
    });
    setStandardSchemasMap(options.name, options.standardSchema);

    // Register watchers if provided
    if (options.watchFields) {
      registerWatchers(options.name, options.watchFields);
      watchersRegisteredForNameRef.current = options.name;
    } else {
      if (watchersRegisteredForNameRef.current === options.name) {
        unregisterWatchers(options.name);
        watchersRegisteredForNameRef.current = null;
      }
    }
  }, [
    options.asyncValidator,
    options.debounceMs,
    options.name,
    options.standardSchema,
    options.validator,
    options.watchFields,
    registerWatchers,
    setStandardSchemasMap,
    setValidatorsMap,
    unregisterWatchers,
  ]);

  useIsomorphicEffect(() => {
    setIsMountedMap(options.name, true);
    validate(options.name, "mount");

    const fieldName = options.name;

    return () => {
      setIsMountedMap(fieldName, false);
      abortValidation(fieldName);
      // Clear validators and schema for unmounted field to avoid stale work
      setValidatorsMap(fieldName, undefined);
      setStandardSchemasMap(fieldName, undefined);
      unregisterWatchers(fieldName);
      watchersRegisteredForNameRef.current = null;
    };
  }, [
    options.name,
    abortValidation,
    setStandardSchemasMap,
    setValidatorsMap,
    setIsMountedMap,
    unregisterWatchers,
    validate,
  ]);

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
export function useForm<T extends DefaultValues, D = unknown>(
  options: UseFormOptions<T>,
): UseFormResult<T, D> {
  const [formStore] = useState(() => createFormStoreMutative<T, D>(options));

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
  D = unknown,
>(): CreateFormHookResult<T, D> {
  return {
    useForm,
    useField,
    useFieldDependencies,
  };
}
