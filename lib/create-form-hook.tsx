import { createContext, use, useCallback, useMemo, useState } from "react";
import { signal, useSignal, type Signal } from "@lib/signals/signals";
import { deepEqual } from "@lib/deep-equal";
import { normalizeDebounceMs, normalizeNumber } from "@lib/normalize-number";
import {
  standardValidate,
  standardValidateAsync,
} from "@lib/standard-validate";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";

// =====================================
// Domain Types and Constants
// =====================================

type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line sonarjs/no-useless-intersection -- this is a common pattern for prettifying types
} & {};

export type FieldEvent = "change" | "blur" | "submit" | "mount";
const EVENTS = [
  "change",
  "blur",
  "submit",
  "mount",
] as const satisfies FieldEvent[];
const DEFAULT_WATCHER_MAX_STEPS = 1000;
const DEFAULT_DEBOUNCE_MS = 500;

type DefaultValues = Record<string, unknown>;

// Brand markers
declare const FIELD_STATE_BRAND: unique symbol;
declare const FLOW_CONTROL_BRAND: unique symbol;

// =====================================
// Field State Types
// =====================================

type FieldStateValid<D = unknown> = {
  type: "valid";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateInvalid<D = unknown> = {
  type: "invalid";
  issues: readonly StandardSchemaV1.Issue[];
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateWarning<D = unknown> = {
  type: "warning";
  issues: readonly StandardSchemaV1.Issue[];
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStatePending<D = unknown> = {
  type: "pending";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateValidating<D = unknown> = {
  type: "validating";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateIdle<D = unknown> = {
  type: "idle";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

export type ValidationStatus<D = unknown> =
  | FieldStateValid<D>
  | FieldStateInvalid<D>
  | FieldStateWarning<D>
  | FieldStatePending<D>
  | FieldStateValidating<D>
  | FieldStateIdle<D>;

export type FinalValidationStatus<D = unknown> =
  | FieldStateIdle<D>
  | FieldStateValid<D>
  | FieldStateInvalid<D>
  | FieldStateWarning<D>;

// =====================================
// Validation Flow Types
// =====================================

type ValidationFlowSkip = {
  type: "async";
  strategy: "skip";
  readonly [FLOW_CONTROL_BRAND]: true;
};
type ValidationFlowAuto = {
  type: "async";
  strategy: "auto";
  debounceMs?: number;
  readonly [FLOW_CONTROL_BRAND]: true;
};
type ValidationFlowForce = {
  type: "async";
  strategy: "run";
  debounceMs?: number;
  readonly [FLOW_CONTROL_BRAND]: true;
};

export type ValidationSchedule =
  | ValidationFlowSkip
  | ValidationFlowAuto
  | ValidationFlowForce;

// =====================================
// Field View and Metadata
// =====================================

export type FieldMeta = {
  isTouched: boolean;
  changeCount: number;
  submitCount: number;
};

export type FieldSnapshot<T, D = unknown> = {
  value: T;
  meta: FieldMeta;
  validation: ValidationStatus<D>;
  isMounted: boolean;
};

type ScheduleHelper = {
  skip(): ValidationFlowSkip;
  auto(debounceMs?: number): ValidationFlowAuto;
  run(debounceMs?: number): ValidationFlowForce;
};

type ValidationHelper<D = unknown> = {
  valid(p?: { details?: D }): FieldStateValid<D>;
  invalid(p?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: D;
  }): FieldStateInvalid<D>;
  warning(p?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: D;
  }): FieldStateWarning<D>;
  idle(p?: { details?: D }): FieldStateIdle<D>;
};

// =====================================
// Storage Types
// =====================================

type FieldEntry<V, D = unknown> = {
  value: Signal<V>;
  meta: {
    isTouched: Signal<boolean>;
    changeCount: Signal<number>;
    submitCount: Signal<number>;
  };
  validation: Signal<ValidationStatus<D>>;
};

type FieldMap<T extends DefaultValues, D = unknown> = Map<
  keyof T,
  FieldEntry<T[keyof T], D>
>;

// =====================================
// Internal Types
// =====================================

type RunningValidation<T> = {
  stateSnapshot: T;
  timeoutId?: ReturnType<typeof setTimeout>;
  abortController?: AbortController;
  validationId: number;
};

type InternalFieldOptions<T extends DefaultValues, K extends keyof T, D> = {
  name: K;
  standardSchema?: StandardSchemaV1<T[K]>;
  debounceMs?: number;
  respond?: (
    context: RespondContext<T, K, D> | RespondContextSync<T, K, D>,
  ) => FinalValidationStatus<D> | ValidationSchedule | void;
  respondAsync?: (
    context: RespondAsyncContext<T, K, D>,
  ) => Promise<FinalValidationStatus<D>>;
  watch: {
    self: Set<FieldEvent>;
    from: Map<Exclude<keyof T, K>, Set<FieldEvent>>;
  };
};

type InternalValidationHelper<D = unknown> = {
  pending: (props?: { details?: D }) => FieldStatePending<D>;
  validating: (props?: { details?: D }) => FieldStateValidating<D>;
};

// =====================================
// Store and Hook Types
// =====================================

type FormApi<T extends DefaultValues, D = unknown> = {
  getSnapshot: <K extends keyof T>(fieldName: K) => FieldSnapshot<T[K], D>;
};

type FormStore<T extends DefaultValues, D = unknown> = {
  formApi: FormApi<T, D>;
  getFieldEntry: <K extends keyof T>(fieldName: K) => FieldEntry<T[K], D>;
  mount: (fieldName: keyof T) => void;
  registerOptions: <K extends keyof T>(
    fieldName: K,
    options: FieldOptions<T, K, D>,
  ) => void;
  unregisterOptions: (fieldName: keyof T) => void;
  unmount: (fieldName: keyof T) => void;
  setValue: (
    fieldName: keyof T,
    value: T[keyof T],
    options?: {
      markTouched?: boolean;
      incrementChanges?: boolean;
      dispatch?: boolean;
    },
  ) => void;
  blur: (fieldName: keyof T) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  reset: (
    fieldName: keyof T,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) => void;
};

type UseFieldReturn<T extends DefaultValues, K extends keyof T, D = unknown> = {
  name: K;
  value: T[K];
  meta: FieldMeta;
  validation: ValidationStatus<D>;
  setValue: (value: T[K]) => void;
  blur: () => void;
  formApi: FormApi<T, D>;
};

export type UseFormReturn<T extends DefaultValues, D = unknown> = {
  formApi: FormApi<T, D>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

type UseFormOptions<T extends DefaultValues> = {
  defaultValues: T;
  debounceMs?: number;
  maxDispatchSteps?: number;
};

type CreateFormHookResult<T extends DefaultValues, D = unknown> = {
  useForm: (options: UseFormOptions<T>) => UseFormReturn<T, D>;
  useField: <K extends keyof T>(
    options: FieldOptions<T, K, D>,
  ) => Prettify<UseFieldReturn<T, K, D>>;
  defineField: <K extends keyof T>(
    options: FieldOptions<T, K, D>,
  ) => FieldOptions<T, K, D>;
};

// =====================================
// Graph Utilities
// =====================================

function makeEdgeKey(
  watched: PropertyKey,
  target: PropertyKey,
  action: FieldEvent,
): string {
  return `${String(watched)}->${String(target)}@${action}`;
}

function makeCauseForTarget<T extends DefaultValues, K extends keyof T>(
  target: K,
  causeField: keyof T,
  action: FieldEvent,
):
  | { isSelf: true; field: K; action: FieldEvent }
  | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent } {
  if (causeField === target) {
    return { isSelf: true, field: target, action };
  }
  return {
    isSelf: false,
    field: causeField as Exclude<keyof T, K>,
    action,
  };
}

// =====================================
// Respond Contexts (sync/async)
// =====================================

type FieldFormApi<T extends DefaultValues, D = unknown> = {
  setValue: <F extends keyof T>(
    fieldName: F,
    value: T[F],
    options?: {
      markTouched?: boolean;
      incrementChanges?: boolean;
      dispatch?: boolean;
    },
  ) => void;
  reset: (
    fieldName: keyof T,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) => void;
  touch: (fieldName: keyof T) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  getSnapshot: <F extends keyof T>(fieldName: F) => FieldSnapshot<T[F], D>;
};

type FieldCause<T extends DefaultValues, K extends keyof T> =
  | { isSelf: true; field: K; action: FieldEvent }
  | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent };

export type RespondContext<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: FieldEvent;
  cause: FieldCause<T, K>;
  value: T[K];
  current: Prettify<FieldSnapshot<T[K], D>>;
  form: FieldFormApi<T, D>;
  helpers: {
    validation: ValidationHelper<D>;
    schedule: ScheduleHelper;
    validateWithSchema: () => readonly StandardSchemaV1.Issue[] | undefined;
  };
};

// Sync variant: identical to RespondContext but without async helpers on validation
export type RespondContextSync<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: FieldEvent;
  cause: FieldCause<T, K>;
  value: T[K];
  current: Prettify<FieldSnapshot<T[K], D>>;
  form: FieldFormApi<T, D>;
  helpers: {
    validation: ValidationHelper<D>;
    validateWithSchema: () => readonly StandardSchemaV1.Issue[] | undefined;
  };
};

type RespondAsyncContext<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: FieldEvent;
  cause: FieldCause<T, K>;
  value: T[K];
  current: Prettify<FieldSnapshot<T[K], D>>;
  signal: AbortSignal;
  helpers: {
    validation: ValidationHelper<D>;
    validateWithSchemaAsync: () => Promise<
      readonly StandardSchemaV1.Issue[] | undefined
    >;
  };
  form: FieldFormApi<T, D>;
};

// =====================================
// Public Options (sync/async) for useField
// =====================================

type SyncOnlyFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  standardSchema?: StandardSchemaV1<T[K]>;
  watch?: {
    self?: FieldEvent[];
    fields?: [Exclude<keyof T, K>] extends [never]
      ? never
      : Partial<Record<Exclude<keyof T, K>, FieldEvent[] | true>>;
  };
  respond: (
    context: Prettify<RespondContextSync<T, K, D>>,
  ) => FinalValidationStatus<D> | void;
  respondAsync?: never;
  debounceMs?: never;
};

type AsyncOnlyFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  standardSchema?: StandardSchemaV1<T[K]>;
  watch?: {
    self?: FieldEvent[];
    fields?: [Exclude<keyof T, K>] extends [never]
      ? never
      : Partial<Record<Exclude<keyof T, K>, FieldEvent[] | true>>;
  };
  respond?: never;
  respondAsync: (
    context: Prettify<RespondAsyncContext<T, K, D>>,
  ) => Promise<FinalValidationStatus<D>>;
  debounceMs?: number;
};

type SyncAsyncFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  standardSchema?: StandardSchemaV1<T[K]>;
  watch?: {
    self?: FieldEvent[];
    fields?: [Exclude<keyof T, K>] extends [never]
      ? never
      : Partial<Record<Exclude<keyof T, K>, FieldEvent[] | true>>;
  };
  respond: (
    context: Prettify<RespondContext<T, K, D>>,
  ) => FinalValidationStatus<D> | ValidationSchedule | void;
  respondAsync: (
    context: Prettify<RespondAsyncContext<T, K, D>>,
  ) => Promise<FinalValidationStatus<D>>;
  debounceMs?: number;
};

type NoValidationFieldOptionsExtension = {
  standardSchema?: never;
  watch?: never;
  respond?: never;
  respondAsync?: never;
  debounceMs?: never;
};

export type FieldOptions<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = Prettify<
  {
    name: K;
  } & (
    | SyncOnlyFieldOptionsExtension<T, K, D>
    | AsyncOnlyFieldOptionsExtension<T, K, D>
    | SyncAsyncFieldOptionsExtension<T, K, D>
    | NoValidationFieldOptionsExtension
  )
>;

// =====================================
// Async Flow Helpers
// =====================================

function shouldSkipAutoValidation<V>(
  running: RunningValidation<V> | undefined,
  currentValue: V,
  lastValue: V | undefined,
  lastChanges: number | undefined,
  currentChanges: number,
): boolean {
  if (running) {
    return deepEqual(running.stateSnapshot, currentValue);
  }
  return (
    lastValue !== undefined &&
    deepEqual(lastValue, currentValue) &&
    lastChanges !== undefined &&
    lastChanges === currentChanges
  );
}

function skip(): ValidationFlowSkip {
  return { type: "async", strategy: "skip" } as ValidationFlowSkip;
}

function auto(debounceMs?: number): ValidationFlowAuto {
  return {
    type: "async",
    strategy: "auto",
    debounceMs,
  } as ValidationFlowAuto;
}

function run(debounceMs?: number): ValidationFlowForce {
  return {
    type: "async",
    strategy: "run",
    debounceMs,
  } as ValidationFlowForce;
}

function normalizeFieldOptions<T extends DefaultValues, K extends keyof T, D>(
  fieldName: K,
  options: FieldOptions<T, K, D>,
): InternalFieldOptions<T, K, D> {
  const triggersSelf = new Set<FieldEvent>(options.watch?.self ?? EVENTS);
  const from = new Map<Exclude<keyof T, K>, Set<FieldEvent>>();
  if (options.watch?.fields) {
    for (const key of Object.keys(options.watch.fields) as Exclude<
      keyof T,
      K
    >[]) {
      const val = options.watch.fields[key];
      const actions = new Set<FieldEvent>(
        typeof val === "boolean" ? EVENTS : (val ?? []),
      );
      from.set(key, actions);
    }
  }
  return {
    name: fieldName,
    standardSchema: options.standardSchema,
    debounceMs: options.debounceMs,
    respond: options.respond as (
      context: RespondContext<T, K, D> | RespondContextSync<T, K, D>,
    ) => FinalValidationStatus<D> | ValidationSchedule | void,
    respondAsync: options.respondAsync as (
      context: RespondAsyncContext<T, K, D>,
    ) => Promise<FinalValidationStatus<D>>,
    watch: { self: triggersSelf, from },
  } satisfies InternalFieldOptions<T, K, D>;
}

const StoreContext = createContext<unknown>(null);

// =====================================
// Provider Component
// =====================================

function FormProvider<T extends DefaultValues, D = unknown>({
  children,
  formStore,
}: Readonly<{
  children: React.ReactNode;
  formStore: FormStore<T, D>;
}>) {
  return <StoreContext value={formStore}>{children}</StoreContext>;
}

// =====================================
// Helper Functions
// =====================================

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// =====================================
// Store Implementation
// =====================================

function createFormStore<T extends DefaultValues, D = unknown>(
  options: UseFormOptions<T>,
): FormStore<T, D> {
  const { defaultValues } = options;

  const defaultDebounceMs = normalizeDebounceMs(
    options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );

  // -- Validation constructors
  function valid(props?: { details?: D }): FieldStateValid<D> {
    return { type: "valid", details: props?.details } as FieldStateValid<D>;
  }

  function invalid(props?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: D;
  }): FieldStateInvalid<D> {
    return {
      type: "invalid",
      issues: props?.issues ?? [],
      details: props?.details,
    } as FieldStateInvalid<D>;
  }

  function warning(props?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: D;
  }): FieldStateWarning<D> {
    return {
      type: "warning",
      issues: props?.issues ?? [],
      details: props?.details,
    } as FieldStateWarning<D>;
  }

  function idle(props?: { details?: D }): FieldStateIdle<D> {
    return { type: "idle", details: props?.details } as FieldStateIdle<D>;
  }

  function pending(props?: { details?: D }): FieldStatePending<D> {
    return { type: "pending", details: props?.details } as FieldStatePending<D>;
  }

  function validating(props?: { details?: D }): FieldStateValidating<D> {
    return {
      type: "validating",
      details: props?.details,
    } as FieldStateValidating<D>;
  }

  // -- Helper bundles exposed to user callbacks
  const validationHelper: ValidationHelper<D> = {
    idle,
    invalid,
    valid,
    warning,
  };

  const scheduleHelper: ScheduleHelper = { auto, run, skip };

  const internalValidationHelper: InternalValidationHelper<D> = {
    validating,
    pending,
  };

  const form = {
    setValue,
    reset,
    touch,
    submit,
    getSnapshot,
  };

  // -- Form state containers
  const fieldsMap: FieldMap<T, D> = new Map();

  const defaultValuesEntries = Object.entries(defaultValues) as [
    fieldName: keyof T,
    value: T[keyof T],
  ][];

  for (const [fieldName, value] of defaultValuesEntries) {
    fieldsMap.set(fieldName, {
      value: signal<T[keyof T]>(value),
      meta: {
        isTouched: signal(false),
        changeCount: signal(0),
        submitCount: signal(0),
      },
      validation: signal<ValidationStatus<D>>(validationHelper.idle()),
    });
  }

  const mountedFields = new Set<keyof T>();

  const fieldOptions = new Map<keyof T, unknown>();

  function getFieldOptions<K extends keyof T>(
    fieldName: K,
  ): InternalFieldOptions<T, K, D> | undefined {
    return fieldOptions.get(fieldName) as
      | InternalFieldOptions<T, K, D>
      | undefined;
  }

  const reactions = new Map<string, Set<keyof T>>();
  const targetToWatchKeys = new Map<keyof T, Set<string>>();
  const runningValidations = new Map<keyof T, RunningValidation<T[keyof T]>>();
  const lastValidatedValue = new Map<keyof T, T[keyof T]>();
  const lastValidatedChanges = new Map<keyof T, number>();
  const validationIds = new Map<keyof T, number>();

  const maxDispatchSteps = normalizeNumber(options.maxDispatchSteps, {
    fallback: DEFAULT_WATCHER_MAX_STEPS,
    min: 1,
    integer: "floor",
  });

  function getRunningValidation<K extends keyof T>(
    fieldName: K,
  ): RunningValidation<T[K]> | undefined {
    return runningValidations.get(fieldName) as
      | RunningValidation<T[K]>
      | undefined;
  }

  function setRunningValidation<K extends keyof T>(
    fieldName: K,
    value: RunningValidation<T[K]>,
  ): void {
    runningValidations.set(fieldName, value as RunningValidation<T[keyof T]>);
  }

  const watcherTransaction = {
    active: false,
    depth: 0,
    visited: new Set<string>(),
    steps: 0,
    maxSteps: maxDispatchSteps,
    bailOut: false,
  };

  // -- Internal getters/setters
  function getFieldEntry<K extends keyof T>(fieldName: K): FieldEntry<T[K], D> {
    const entry = fieldsMap.get(fieldName);

    invariant(entry, `Unknown field: ${String(fieldName)}`);

    return entry as unknown as FieldEntry<T[K], D>;
  }

  // -- Dispatch transaction wrapper
  function runInDispatchTransaction(fn: () => void) {
    const isRoot = watcherTransaction.depth === 0;
    watcherTransaction.depth += 1;
    if (isRoot) {
      watcherTransaction.active = true;
      watcherTransaction.visited.clear();
      watcherTransaction.steps = 0;
      watcherTransaction.bailOut = false;
    }
    try {
      fn();
    } finally {
      watcherTransaction.depth -= 1;
      if (watcherTransaction.depth === 0) {
        watcherTransaction.active = false;
        watcherTransaction.visited.clear();
        watcherTransaction.steps = 0;
        watcherTransaction.bailOut = false;
      }
    }
  }

  // -- Validation lifecycle
  function cleanupValidation(fieldName: keyof T) {
    const runningValidation = getRunningValidation(fieldName);
    if (!runningValidation) {
      return;
    }
    if (runningValidation.timeoutId) {
      clearTimeout(runningValidation.timeoutId);
    }
    if (runningValidation.abortController) {
      runningValidation.abortController.abort();
    }
    runningValidations.delete(fieldName);
  }

  function clearValidationTimeout(fieldName: keyof T) {
    const runningValidation = getRunningValidation(fieldName);
    if (!runningValidation) {
      return;
    }
    runningValidation.timeoutId = undefined;
  }

  function incrementValidationId(fieldName: keyof T) {
    const next = (validationIds.get(fieldName) ?? 0) + 1;
    validationIds.set(fieldName, next);
    return next;
  }

  function setFieldState(fieldName: keyof T, state: ValidationStatus<D>) {
    getFieldEntry(fieldName).validation.setValue(state, deepEqual);
  }

  function setLastValidatedValue<K extends keyof T>(fieldName: K, value: T[K]) {
    lastValidatedValue.set(fieldName, value);
  }

  function getLastValidatedValue<K extends keyof T>(
    fieldName: K,
  ): T[K] | undefined {
    return lastValidatedValue.get(fieldName) as T[K] | undefined;
  }

  function scheduleValidation<K extends keyof T>(
    fieldName: K,
    value: T[K],
    debounceMs: number,
    action: FieldEvent,
    cause:
      | { isSelf: true; field: K; action: FieldEvent }
      | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent },
  ) {
    cleanupValidation(fieldName);
    if (debounceMs === 0) {
      runValidation(fieldName, value, action, cause);
      return;
    }
    const validationId = incrementValidationId(fieldName);
    setFieldState(fieldName, internalValidationHelper.pending());
    const timeoutId = setTimeout(() => {
      clearValidationTimeout(fieldName);
      runValidation(fieldName, value, action, cause);
    }, debounceMs);
    setRunningValidation(fieldName, {
      stateSnapshot: value,
      timeoutId,
      validationId,
    });
  }

  function runValidation<K extends keyof T>(
    fieldName: K,
    value: T[K],
    action: FieldEvent,
    cause:
      | { isSelf: true; field: K; action: FieldEvent }
      | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent },
  ) {
    cleanupValidation(fieldName);
    const options = getFieldOptions(fieldName);
    if (!options?.respondAsync) {
      return;
    }

    const validationId = incrementValidationId(fieldName);
    const abortController = new AbortController();
    const { signal } = abortController;

    setRunningValidation(fieldName, {
      stateSnapshot: value,
      abortController,
      validationId,
    });
    setFieldState(fieldName, internalValidationHelper.validating());
    setLastValidatedValue(fieldName, value);
    lastValidatedChanges.set(
      fieldName,
      getFieldEntry(fieldName).meta.changeCount.getValue(),
    );

    const currentFieldView = getSnapshot(fieldName);
    const standardSchema = options.standardSchema;

    options
      .respondAsync({
        action,
        cause,
        value,
        current: currentFieldView,
        signal,
        helpers: {
          validation: validationHelper,
          validateWithSchemaAsync: async () =>
            standardSchema
              ? await standardValidateAsync(standardSchema, value)
              : undefined,
        },
        form,
      })
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (validationId !== validationIds.get(fieldName)) {
          return;
        }
        setFieldState(fieldName, result);
        cleanupValidation(fieldName);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (validationId !== validationIds.get(fieldName)) {
          return;
        }
        setFieldState(
          fieldName,
          validationHelper.invalid({
            issues: [
              {
                message:
                  error instanceof Error ? error.message : "Validation failed",
              },
            ],
          }),
        );
        cleanupValidation(fieldName);
      });
  }

  function handleAsyncFlow<K extends keyof T>(
    fieldName: K,
    flow: ValidationSchedule,
    action: FieldEvent,
    cause:
      | { isSelf: true; field: K; action: FieldEvent }
      | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent },
  ) {
    const options = getFieldOptions(fieldName);
    if (!options?.respondAsync) {
      return;
    }
    switch (flow.strategy) {
      case "skip": {
        return;
      }
      case "auto": {
        if (
          shouldSkipAutoValidation(
            getRunningValidation(fieldName),
            getFieldEntry(fieldName).value.getValue(),
            getLastValidatedValue(fieldName),
            lastValidatedChanges.get(fieldName) ?? 0,
            getFieldEntry(fieldName).meta.changeCount.getValue(),
          )
        ) {
          return;
        }
        const value = getFieldEntry(fieldName).value.getValue();
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? options.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(fieldName, value, debounceMs, action, cause);
        return;
      }
      case "run": {
        const value = getFieldEntry(fieldName).value.getValue();
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? options.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(fieldName, value, debounceMs, action, cause);
        return;
      }
    }
  }

  // -- Respond dispatch
  function runRespond<K extends keyof T>(
    target: K,
    causeField: K | Exclude<keyof T, K>,
    action: FieldEvent,
  ) {
    if (!mountedFields.has(target)) {
      return;
    }
    const options = getFieldOptions(target);
    if (!options) {
      return;
    }
    // Early short-circuit when there is nothing to do
    if (!options.respond && !options.respondAsync) {
      return;
    }
    const causeForTarget = makeCauseForTarget<T, K>(target, causeField, action);

    if (!options.respond && options.respondAsync) {
      // No sync respond provided, but async path configured: run async
      handleAsyncFlow(target, scheduleHelper.run(), action, causeForTarget);
      return;
    }

    const value = getFieldEntry(target).value.getValue();
    const currentView = getSnapshot(target);
    const standardSchema = options.standardSchema;

    let result: FinalValidationStatus<D> | ValidationSchedule | void;
    if (options.respondAsync) {
      const context: RespondContext<T, K, D> = {
        action,
        cause: causeForTarget as
          | { isSelf: true; field: K; action: FieldEvent }
          | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent },
        value: value,
        current: currentView,
        form,
        helpers: {
          validation: validationHelper,
          schedule: scheduleHelper,
          validateWithSchema: () =>
            standardSchema
              ? standardValidate(standardSchema, value)
              : undefined,
        },
      };
      result = options.respond?.(context);
    } else {
      const ctxSync: RespondContextSync<T, K, D> = {
        action,
        cause: causeForTarget as
          | { isSelf: true; field: K; action: FieldEvent }
          | { isSelf: false; field: Exclude<keyof T, K>; action: FieldEvent },
        value: value,
        current: currentView,
        form,
        helpers: {
          validation: validationHelper,
          validateWithSchema: () =>
            standardSchema
              ? standardValidate(standardSchema, value)
              : undefined,
        },
      };
      result = options.respond?.(ctxSync);
    }

    let outcome: FinalValidationStatus<D> | ValidationSchedule =
      scheduleHelper.skip();
    if (result !== undefined) {
      outcome = result;
    }

    if (outcome.type === "async") {
      handleAsyncFlow(target, outcome, action, causeForTarget);
    } else {
      setFieldState(target, outcome);
      cleanupValidation(target);
    }
  }

  // -- Reaction graph and dispatch
  function dispatch(watched: keyof T, action: FieldEvent) {
    runInDispatchTransaction(() => {
      const key = `${String(watched)}:${action}`;
      const targets = reactions.get(key);
      if (!targets) {
        return;
      }
      for (const target of targets) {
        if (watcherTransaction.bailOut) {
          break;
        }
        const edge = makeEdgeKey(watched, target, action);
        const isSelfEdge = target === watched;
        if (watcherTransaction.visited.has(edge)) {
          continue;
        }
        // Do not let self-edges (watched === target) consume steps. They are
        // typically no-ops in user handlers and counting them can cause
        // premature bailouts in cyclic graphs.
        if (
          !isSelfEdge &&
          watcherTransaction.steps >= watcherTransaction.maxSteps
        ) {
          watcherTransaction.bailOut = true;

          console.warn(
            "Dispatch chain exceeded max steps; breaking to avoid a loop",
            {
              maxSteps: watcherTransaction.maxSteps,
              steps: watcherTransaction.steps,
              watched: String(watched),
              target: String(target),
              action,
            },
          );
          break;
        }
        watcherTransaction.visited.add(edge);
        if (!isSelfEdge) {
          watcherTransaction.steps += 1;
        }
        runRespond(target, watched, action);
      }
    });
  }

  function clearPreviousReactionsFor(target: keyof T): Set<string> {
    const previousKeys = targetToWatchKeys.get(target);
    if (!previousKeys) {
      return new Set<string>();
    }
    for (const key of previousKeys) {
      const setForKey = reactions.get(key);
      if (!setForKey) {
        continue;
      }
      setForKey.delete(target);
      if (setForKey.size === 0) {
        reactions.delete(key);
      }
    }
    previousKeys.clear();
    return previousKeys;
  }

  function addReactions(
    watched: keyof T,
    actions: Set<FieldEvent>,
    target: keyof T,
    keysForTarget: Set<string>,
  ) {
    for (const action of actions) {
      const key = `${String(watched)}:${action}`;
      const setForKey = reactions.get(key) ?? new Set<keyof T>();
      setForKey.add(target);
      reactions.set(key, setForKey);
      keysForTarget.add(key);
    }
  }

  function registerReactionsFor<K extends keyof T>(
    fieldName: K,
    internal: InternalFieldOptions<T, K, D>,
  ) {
    const keysForTarget = clearPreviousReactionsFor(fieldName);

    // Honor explicit empty trigger arrays by not falling back to ALL actions
    addReactions(fieldName, internal.watch.self, fieldName, keysForTarget);

    for (const [watched, actions] of internal.watch.from.entries()) {
      // Honor explicit empty arrays for cross-field watch as well
      addReactions(watched, actions, fieldName, keysForTarget);
    }

    targetToWatchKeys.set(fieldName, keysForTarget);
  }

  function setValue<K extends keyof T>(
    fieldName: K,
    value: T[K],
    options?: {
      markTouched?: boolean;
      incrementChanges?: boolean;
      dispatch?: boolean;
    },
  ) {
    const markTouched = options?.markTouched ?? true;
    const incrementChanges = options?.incrementChanges ?? true;
    const shouldDispatch = options?.dispatch ?? true;

    const entry = getFieldEntry(fieldName);
    const previousValue = entry.value.getValue();
    const hasChanged = !deepEqual(previousValue, value);
    if (hasChanged) {
      entry.value.setValue(value, deepEqual);
    }

    if (markTouched) {
      entry.meta.isTouched.setValue(true);
    }

    if (incrementChanges && hasChanged) {
      entry.meta.changeCount.setValue(entry.meta.changeCount.getValue() + 1);
    }

    if (shouldDispatch && hasChanged) {
      dispatch(fieldName, "change");
    }
  }
  function reset(
    fieldName: keyof T,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) {
    // Reset value to default without touching meta/counters by default
    setValue(fieldName, defaultValues[fieldName], {
      markTouched: false,
      incrementChanges: false,
      dispatch: options?.dispatch,
    });

    if (options?.meta) {
      const entry = getFieldEntry(fieldName);
      entry.meta.isTouched.setValue(false);
      entry.meta.changeCount.setValue(0);
      entry.meta.submitCount.setValue(0);
    }

    if (options?.validation) {
      setFieldState(fieldName, validationHelper.idle());
      cleanupValidation(fieldName);
    }
  }
  function touch(fieldName: keyof T) {
    getFieldEntry(fieldName).meta.isTouched.setValue(true);
  }
  function submit(fieldNames?: readonly (keyof T)[]) {
    const toSubmit = new Set(
      fieldNames ?? (Object.keys(defaultValues) as (keyof T)[]),
    );
    runInDispatchTransaction(() => {
      for (const fieldName of toSubmit) {
        if (!mountedFields.has(fieldName)) {
          continue;
        }
        const entry = getFieldEntry(fieldName);
        entry.meta.submitCount.setValue(entry.meta.submitCount.getValue() + 1);
        dispatch(fieldName, "submit");
        if (watcherTransaction.bailOut) {
          break;
        }
      }
    });
  }

  // -- Options helpers (extracted to reduce complexity)
  function unregisterFieldOptions(fieldName: keyof T) {
    cleanupValidation(fieldName);
    clearPreviousReactionsFor(fieldName);
    targetToWatchKeys.delete(fieldName);
    fieldOptions.delete(fieldName);
  }

  function settleIfAsyncDisabled<K extends keyof T>(
    fieldName: K,
    internal: InternalFieldOptions<T, K, D>,
  ) {
    if (internal.respondAsync) {
      return;
    }
    const currentState = getFieldEntry(fieldName).validation.getValue();
    if (currentState.type !== "pending" && currentState.type !== "validating") {
      return;
    }
    cleanupValidation(fieldName);
    if (internal.respond) {
      runRespond(fieldName, fieldName, "change");
    } else {
      setFieldState(fieldName, validationHelper.idle());
    }
  }

  // -- Options registration lifecycle
  function setFieldOptions<K extends keyof T>(
    fieldName: K,
    options: FieldOptions<T, K, D> | undefined,
  ) {
    if (!options) {
      unregisterFieldOptions(fieldName);
      return;
    }
    const internal = normalizeFieldOptions(fieldName, options);
    fieldOptions.set(fieldName, internal);
    registerReactionsFor(fieldName, internal);
    settleIfAsyncDisabled(fieldName, internal);
  }

  function mount(fieldName: keyof T) {
    if (!mountedFields.has(fieldName)) {
      mountedFields.add(fieldName);
      dispatch(fieldName, "mount");
    }
  }

  function unmount(fieldName: keyof T) {
    if (mountedFields.has(fieldName)) {
      mountedFields.delete(fieldName);
    }
    cleanupValidation(fieldName);
  }

  function blur(fieldName: keyof T) {
    dispatch(fieldName, "blur");
  }

  function registerOptions<K extends keyof T>(
    fieldName: K,
    options: FieldOptions<T, K, D>,
  ) {
    setFieldOptions(fieldName, options);
  }

  function unregisterOptions(fieldName: keyof T) {
    setFieldOptions(fieldName, undefined);
  }

  function getSnapshot<K extends keyof T>(
    fieldName: K,
  ): FieldSnapshot<T[K], D> {
    const field = getFieldEntry(fieldName);
    return {
      value: field.value.getValue(),
      meta: {
        isTouched: field.meta.isTouched.getValue(),
        changeCount: field.meta.changeCount.getValue(),
        submitCount: field.meta.submitCount.getValue(),
      },
      validation: field.validation.getValue(),
      isMounted: mountedFields.has(fieldName),
    };
  }

  const store: FormStore<T, D> = {
    formApi: {
      getSnapshot,
    },
    blur,
    registerOptions,
    unregisterOptions,
    getFieldEntry,
    mount,
    unmount,
    setValue,
    reset,
    submit,
  };

  return store;
}

// =====================================
// Hooks helpers
// =====================================

function defineField<T extends DefaultValues, K extends keyof T, D = unknown>(
  options: FieldOptions<T, K, D>,
): FieldOptions<T, K, D> {
  return options;
}

// =====================================
// Hooks
// =====================================

function useField<T extends DefaultValues, K extends keyof T, D = unknown>(
  options: FieldOptions<T, K, D>,
): Prettify<UseFieldReturn<T, K, D>> {
  const store = use(StoreContext) as FormStore<T, D> | null;

  invariant(store, "useField must be used within a FormProvider");

  const { name, debounceMs, watch, respond, respondAsync, standardSchema } =
    options;

  useIsomorphicEffect(() => {
    store.registerOptions(name, {
      name,
      debounceMs,
      respondAsync,
      watch,
      respond,
      standardSchema,
    } as FieldOptions<T, K, D>);

    return () => {
      store.unregisterOptions(name);
    };
  }, [debounceMs, name, watch, respond, respondAsync, standardSchema, store]);

  useIsomorphicEffect(() => {
    store.mount(name);

    return () => {
      store.unmount(name);
    };
  }, [name, store]);

  const field = store.getFieldEntry(name);

  const value = useSignal(field.value);
  const isTouched = useSignal(field.meta.isTouched);
  const changeCount = useSignal(field.meta.changeCount);
  const submitCount = useSignal(field.meta.submitCount);
  const validation = useSignal(field.validation);

  const setValue = useCallback(
    (value: T[K]) => {
      store.setValue(name, value);
    },
    [name, store],
  );

  const blur = useCallback(() => {
    store.blur(name);
  }, [name, store]);

  const formApi = useMemo(() => store.formApi, [store]);

  return {
    name,
    value,
    meta: {
      isTouched,
      changeCount,
      submitCount,
    },
    validation,
    setValue,
    blur,
    formApi,
  };
}

export function useForm<T extends DefaultValues, D = unknown>(
  options: UseFormOptions<T>,
): UseFormReturn<T, D> {
  const [formStore] = useState(() => createFormStore<T, D>(options));

  const Form = useCallback(
    (props: React.ComponentProps<"form">) => (
      <FormProvider formStore={formStore}>
        <form {...props} />
      </FormProvider>
    ),
    [formStore],
  );

  const formApi = useMemo(() => formStore.formApi, [formStore]);

  return {
    formApi,
    Form,
  };
}

export function createForm<
  T extends DefaultValues,
  D = unknown,
>(): CreateFormHookResult<T, D> {
  return {
    defineField,
    useField,
    useForm,
  };
}
