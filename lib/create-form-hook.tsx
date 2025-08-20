import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  useRef,
} from "react";
import { shallow } from "@lib/shallow";
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

export type FieldEvent = "change" | "blur" | "submit" | "mount" | "props";
const EVENTS = [
  "change",
  "blur",
  "submit",
  "mount",
  "props",
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
  value: V;
  meta: FieldMeta;
  validation: ValidationStatus<D>;
  snapshot: FieldSnapshot<V, D>;
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
  validationId?: number;
};

type InternalFieldOptions<T extends DefaultValues, K extends keyof T, D> = {
  name: K;
  standardSchema?: StandardSchemaV1<T[K]>;
  debounceMs?: number;
  respond?: (
    context: RespondContext<T, K, D> | RespondContextSync<T, K, D>,
    props?: unknown,
  ) => FinalValidationStatus<D> | ValidationSchedule | void;
  respondAsync?: (
    context: RespondAsyncContext<T, K, D>,
    props?: unknown,
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
  // Reactivity
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  getDepVersion: (depKey: DepKey) => number;
  select: SelectHelpers<T, D>;
  mount: (fieldName: keyof T) => void;
  registerOptions: <K extends keyof T, P = unknown>(
    fieldName: K,
    options: FieldOptions<T, K, D, P>,
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
  setFieldProps: (
    fieldName: keyof T,
    props: unknown,
    equality?: (a: unknown, b: unknown) => boolean,
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

type CreateFormResult<T extends DefaultValues, D = unknown> = {
  useForm: (options: UseFormOptions<T>) => UseFormReturn<T, D>;
  useFormSelector: <S, P = unknown>(
    selector: (s: SelectHelpers<T, D>, props?: P) => S,
    options?: {
      selectorEquality?: (a: S, b: S) => boolean;
      propsEquality?: (a: P | undefined, b: P | undefined) => boolean;
      props?: P;
    },
  ) => S;
  useField: <K extends keyof T, P = unknown>(
    options: FieldOptions<T, K, D, P>,
    propsOptions?: {
      props?: P;
      propsEquality?: (a: P | undefined, b: P | undefined) => boolean;
    },
  ) => Prettify<UseFieldReturn<T, K, D>>;
  defineField: <K extends keyof T, P = unknown>(
    options: FieldOptions<T, K, D, P>,
  ) => FieldOptions<T, K, D, P>;
  defineSelector: <S, P = unknown>(
    selector: (s: SelectHelpers<T, D>, props?: P) => S,
  ) => (s: SelectHelpers<T, D>, props?: P) => S;
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

// =====================================
// Dependency Keys (per-slice tracking)
// =====================================

type SliceId = "value" | "meta" | "validation" | "mounted" | "snapshot";

type DepKey = `${SliceId}:${string}`;

function makeDepKey(slice: SliceId, field: PropertyKey): DepKey {
  return `${slice}:${String(field)}`;
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
  P = unknown,
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
    props?: P,
  ) => FinalValidationStatus<D> | void;
  respondAsync?: never;
  debounceMs?: never;
};

type AsyncOnlyFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
  P = unknown,
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
    props?: P,
  ) => Promise<FinalValidationStatus<D>>;
  debounceMs?: number;
};

type SyncAsyncFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
  P = unknown,
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
    props?: P,
  ) => FinalValidationStatus<D> | ValidationSchedule | void;
  respondAsync: (
    context: Prettify<RespondAsyncContext<T, K, D>>,
    props?: P,
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
  P = unknown,
> = Prettify<
  {
    name: K;
  } & (
    | SyncOnlyFieldOptionsExtension<T, K, D, P>
    | AsyncOnlyFieldOptionsExtension<T, K, D, P>
    | SyncAsyncFieldOptionsExtension<T, K, D, P>
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

function normalizeFieldOptions<
  T extends DefaultValues,
  K extends keyof T,
  D,
  P,
>(
  fieldName: K,
  options: FieldOptions<T, K, D, P>,
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
      props?: unknown,
    ) => FinalValidationStatus<D> | ValidationSchedule | void,
    respondAsync: options.respondAsync as (
      context: RespondAsyncContext<T, K, D>,
      props?: unknown,
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
    const meta: FieldMeta = {
      isTouched: false,
      changeCount: 0,
      submitCount: 0,
    };
    const validation = validationHelper.idle() as ValidationStatus<D>;
    const snapshot: FieldSnapshot<T[typeof fieldName], D> = {
      value,
      meta,
      validation,
      isMounted: false,
    };
    fieldsMap.set(fieldName, {
      value,
      meta,
      validation,
      snapshot,
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
  const fieldPropsMap = new Map<keyof T, unknown>();
  const fieldMountCounts = new Map<keyof T, number>();
  const depVersions = new Map<DepKey, number>();

  const maxDispatchSteps = normalizeNumber(options.maxDispatchSteps, {
    fallback: DEFAULT_WATCHER_MAX_STEPS,
    min: 1,
    integer: "floor",
  });

  // -- Global subscription and batching
  const listeners = new Set<() => void>();
  let version = 0;
  let dirty = false;

  function markDirty() {
    dirty = true;
  }

  function notify() {
    version += 1;
    const copy = [...listeners];
    for (const l of copy) {
      l();
    }
  }

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

    // The map is keyed by K so this cast is safe
    return entry as FieldEntry<T[K], D>;
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
        if (dirty) {
          dirty = false;
          notify();
        }
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
    const entry = getFieldEntry(fieldName);
    if (!deepEqual(entry.validation, state)) {
      entry.validation = state;
      // update snapshot reference
      entry.snapshot = {
        value: entry.value,
        meta: entry.meta,
        validation: entry.validation,
        isMounted: mountedFields.has(fieldName),
      } as FieldSnapshot<T[typeof fieldName], D>;
      // bump dependency versions for validation and snapshot
      depVersions.set(
        makeDepKey("validation", fieldName),
        (depVersions.get(makeDepKey("validation", fieldName)) ?? 0) + 1,
      );
      depVersions.set(
        makeDepKey("snapshot", fieldName),
        (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
      );
      markDirty();
    }
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
    setFieldState(fieldName, internalValidationHelper.pending());
    const timeoutId = setTimeout(() => {
      clearValidationTimeout(fieldName);
      runValidation(fieldName, value, action, cause);
    }, debounceMs);
    setRunningValidation(fieldName, {
      stateSnapshot: value,
      timeoutId,
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

    // Ensure the transition to "validating" notifies subscribers even when
    // invoked from a debounce timeout (i.e. outside any existing transaction).
    runInDispatchTransaction(() => {
      setRunningValidation(fieldName, {
        stateSnapshot: value,
        abortController,
        validationId,
      });
      setFieldState(fieldName, internalValidationHelper.validating());
      setLastValidatedValue(fieldName, value);
      lastValidatedChanges.set(
        fieldName,
        getFieldEntry(fieldName).meta.changeCount,
      );
    });

    const currentFieldView = getSnapshot(fieldName);
    const standardSchema = options.standardSchema;

    const props = fieldPropsMap.get(fieldName);
    options
      .respondAsync(
        {
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
        },
        props,
      )
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (validationId !== validationIds.get(fieldName)) {
          return;
        }
        runInDispatchTransaction(() => {
          setFieldState(fieldName, result);
          cleanupValidation(fieldName);
        });
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (validationId !== validationIds.get(fieldName)) {
          return;
        }
        runInDispatchTransaction(() => {
          setFieldState(
            fieldName,
            validationHelper.invalid({
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
          cleanupValidation(fieldName);
        });
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
            getFieldEntry(fieldName).value,
            getLastValidatedValue(fieldName),
            lastValidatedChanges.get(fieldName) ?? 0,
            getFieldEntry(fieldName).meta.changeCount,
          )
        ) {
          return;
        }
        const value = getFieldEntry(fieldName).value;
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? options.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(fieldName, value, debounceMs, action, cause);
        return;
      }
      case "run": {
        const value = getFieldEntry(fieldName).value;
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

    const value = getFieldEntry(target).value;
    const currentView = getSnapshot(target);
    const standardSchema = options.standardSchema;

    let result: FinalValidationStatus<D> | ValidationSchedule | void;
    const props = fieldPropsMap.get(target);
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
      result = options.respond?.(context, props);
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
      result = options.respond?.(ctxSync, props);
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
    runInDispatchTransaction(() => {
      const markTouched = options?.markTouched ?? true;
      const incrementChanges = options?.incrementChanges ?? true;
      const shouldDispatch = options?.dispatch ?? true;

      const entry = getFieldEntry(fieldName);
      const previousValue = entry.value;
      const hasChanged = !deepEqual(previousValue, value);
      if (hasChanged) {
        entry.value = value;
        // update snapshot
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: mountedFields.has(fieldName),
        } as FieldSnapshot<T[K], D>;
        // bump dependency versions for value and snapshot
        depVersions.set(
          makeDepKey("value", fieldName),
          (depVersions.get(makeDepKey("value", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
      }

      if (markTouched && !entry.meta.isTouched) {
        entry.meta = { ...entry.meta, isTouched: true };
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: mountedFields.has(fieldName),
        } as FieldSnapshot<T[K], D>;
        // bump dependency versions for meta and snapshot
        depVersions.set(
          makeDepKey("meta", fieldName),
          (depVersions.get(makeDepKey("meta", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
      }

      if (incrementChanges && hasChanged) {
        entry.meta = {
          ...entry.meta,
          changeCount: entry.meta.changeCount + 1,
        };
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: mountedFields.has(fieldName),
        } as FieldSnapshot<T[K], D>;
        // bump dependency versions for meta and snapshot
        depVersions.set(
          makeDepKey("meta", fieldName),
          (depVersions.get(makeDepKey("meta", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
      }

      if (shouldDispatch && hasChanged) {
        dispatch(fieldName, "change");
      }
    });
  }
  function reset(
    fieldName: keyof T,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) {
    runInDispatchTransaction(() => {
      // Reset value to default without touching meta/counters by default
      setValue(fieldName, defaultValues[fieldName], {
        markTouched: false,
        incrementChanges: false,
        dispatch: options?.dispatch,
      });

      if (options?.meta) {
        const entry = getFieldEntry(fieldName);
        entry.meta = { isTouched: false, changeCount: 0, submitCount: 0 };
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: mountedFields.has(fieldName),
        } as FieldSnapshot<T[typeof fieldName], D>;
        // bump dependency versions for meta and snapshot
        depVersions.set(
          makeDepKey("meta", fieldName),
          (depVersions.get(makeDepKey("meta", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
      }

      if (options?.validation) {
        setFieldState(fieldName, validationHelper.idle());
        cleanupValidation(fieldName);
      }
    });
  }
  function touch(fieldName: keyof T) {
    runInDispatchTransaction(() => {
      const entry = getFieldEntry(fieldName);
      if (!entry.meta.isTouched) {
        entry.meta = { ...entry.meta, isTouched: true };
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: mountedFields.has(fieldName),
        } as FieldSnapshot<T[typeof fieldName], D>;
        // bump dependency versions for meta and snapshot
        depVersions.set(
          makeDepKey("meta", fieldName),
          (depVersions.get(makeDepKey("meta", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
      }
    });
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
        entry.meta = { ...entry.meta, submitCount: entry.meta.submitCount + 1 };
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: mountedFields.has(fieldName),
        } as FieldSnapshot<T[typeof fieldName], D>;
        // bump dependency versions for meta and snapshot
        depVersions.set(
          makeDepKey("meta", fieldName),
          (depVersions.get(makeDepKey("meta", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
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
    const currentState = getFieldEntry(fieldName).validation;
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
  function setFieldOptions<K extends keyof T, P = unknown>(
    fieldName: K,
    options: FieldOptions<T, K, D, P> | undefined,
  ) {
    // Wrap in a dispatch transaction so any state changes (e.g. settling
    // pending/validating when switching off async) notify subscribers.
    runInDispatchTransaction(() => {
      if (!options) {
        unregisterFieldOptions(fieldName);
        return;
      }
      const internal = normalizeFieldOptions<T, K, D, P>(fieldName, options);
      fieldOptions.set(fieldName, internal);
      registerReactionsFor(fieldName, internal);
      settleIfAsyncDisabled(fieldName, internal);
    });
  }

  function mount(fieldName: keyof T) {
    runInDispatchTransaction(() => {
      const nextCount = (fieldMountCounts.get(fieldName) ?? 0) + 1;
      fieldMountCounts.set(fieldName, nextCount);
      if (!mountedFields.has(fieldName)) {
        mountedFields.add(fieldName);
        const entry = getFieldEntry(fieldName);
        entry.snapshot = {
          value: entry.value,
          meta: entry.meta,
          validation: entry.validation,
          isMounted: true,
        } as FieldSnapshot<T[typeof fieldName], D>;
        // bump dependency versions for mounted and snapshot
        depVersions.set(
          makeDepKey("mounted", fieldName),
          (depVersions.get(makeDepKey("mounted", fieldName)) ?? 0) + 1,
        );
        depVersions.set(
          makeDepKey("snapshot", fieldName),
          (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
        );
        markDirty();
        dispatch(fieldName, "mount");
      } else if (process.env.NODE_ENV !== "production" && nextCount > 1) {
        console.warn(
          `useField: multiple mounts detected for field "${String(
            fieldName,
          )}" within the same store. This can cause unexpected behavior.`,
        );
      }
    });
  }

  function unmount(fieldName: keyof T) {
    runInDispatchTransaction(() => {
      const current = fieldMountCounts.get(fieldName) ?? 0;
      const next = Math.max(0, current - 1);
      if (next === 0) {
        fieldMountCounts.delete(fieldName);
        if (mountedFields.has(fieldName)) {
          mountedFields.delete(fieldName);
          const entry = getFieldEntry(fieldName);
          entry.snapshot = {
            value: entry.value,
            meta: entry.meta,
            validation: entry.validation,
            isMounted: false,
          } as FieldSnapshot<T[typeof fieldName], D>;
          // bump dependency versions for mounted and snapshot
          depVersions.set(
            makeDepKey("mounted", fieldName),
            (depVersions.get(makeDepKey("mounted", fieldName)) ?? 0) + 1,
          );
          depVersions.set(
            makeDepKey("snapshot", fieldName),
            (depVersions.get(makeDepKey("snapshot", fieldName)) ?? 0) + 1,
          );
          markDirty();
        }
      } else {
        fieldMountCounts.set(fieldName, next);
      }
      cleanupValidation(fieldName);
    });
  }

  function blur(fieldName: keyof T) {
    dispatch(fieldName, "blur");
  }

  function registerOptions<K extends keyof T, P = unknown>(
    fieldName: K,
    options: FieldOptions<T, K, D, P>,
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
    // Return cached snapshot to preserve reference stability
    return field.snapshot;
  }

  function setFieldProps(
    fieldName: keyof T,
    props: unknown,
    equality: (a: unknown, b: unknown) => boolean = shallow,
  ) {
    const prev = fieldPropsMap.get(fieldName);
    if (equality(prev, props)) {
      return;
    }
    fieldPropsMap.set(fieldName, props);
    // Dispatch props event to allow respond/respondAsync to consider new props
    dispatch(fieldName, "props");
  }

  // -- Select helpers (first-class)
  const select: SelectHelpers<T, D> = {
    value<K extends keyof T>(name: K): T[K] {
      return getFieldEntry(name).value;
    },
    meta(name: keyof T): FieldMeta {
      return getFieldEntry(name).meta;
    },
    validation(name: keyof T): ValidationStatus<D> {
      return getFieldEntry(name).validation;
    },
    snapshot<K extends keyof T>(name: K): FieldSnapshot<T[K], D> {
      return getSnapshot(name);
    },
    mounted(name: keyof T): boolean {
      return mountedFields.has(name);
    },
  };

  const store: FormStore<T, D> = {
    formApi: {
      getSnapshot,
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion() {
      return version;
    },
    getDepVersion(depKey: DepKey) {
      return depVersions.get(depKey) ?? 0;
    },
    select,
    blur,
    registerOptions,
    unregisterOptions,
    getFieldEntry,
    mount,
    unmount,
    setValue,
    setFieldProps,
    reset,
    submit,
  };

  return store;
}

// =====================================
// Hooks helpers
// =====================================

function defineField<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
  P = undefined,
>(options: FieldOptions<T, K, D, P>): FieldOptions<T, K, D, P> {
  return options;
}

function defineSelector<
  T extends DefaultValues,
  D = unknown,
  S = unknown,
  P = undefined,
>(
  selector: (s: SelectHelpers<T, D>, props?: P) => S,
): (s: SelectHelpers<T, D>, props?: P) => S {
  return selector;
}

// First-class select helpers typing
export type SelectHelpers<T extends DefaultValues, D = unknown> = {
  value: <K extends keyof T>(name: K) => T[K];
  meta: (name: keyof T) => FieldMeta;
  validation: (name: keyof T) => ValidationStatus<D>;
  snapshot: <K extends keyof T>(name: K) => FieldSnapshot<T[K], D>;
  mounted: (name: keyof T) => boolean;
};

// =====================================
// useFormSelector (Context)
// =====================================

export function useFormSelector<
  T extends DefaultValues,
  D = unknown,
  S = unknown,
  P = unknown,
>(
  selector: (s: SelectHelpers<T, D>, props?: P) => S,
  options?: {
    selectorEquality?: (a: S, b: S) => boolean;
    propsEquality?: (a: P | undefined, b: P | undefined) => boolean;
    props?: P;
  },
): S {
  const store = use(StoreContext) as FormStore<T, D> | null;
  invariant(store, "useFormSelector must be used within a FormProvider");

  const {
    selectorEquality = shallow,
    propsEquality = shallow,
    props,
  } = options ?? {};

  const lastSelectedRef = useRef<S | undefined>(undefined);
  const lastPropsRef = useRef<P | undefined>(undefined);
  const usedDepKeysRef = useRef<Set<DepKey>>(new Set());
  const lastDepVersionsRef = useRef<Map<DepKey, number>>(new Map());

  const getSelected = useCallback(() => {
    const prev = lastSelectedRef.current;
    const propsChanged = !propsEquality(lastPropsRef.current, props);
    // Fast path: if props didn't change and none of the previously used
    // dependencies changed, return previous selection to preserve referential
    // stability and avoid re-computation.
    if (!propsChanged && prev !== undefined) {
      let anyChanged = false;
      for (const key of usedDepKeysRef.current) {
        const last = lastDepVersionsRef.current.get(key) ?? 0;
        const curr = store.getDepVersion(key);
        if (last !== curr) {
          anyChanged = true;
          break;
        }
      }
      if (!anyChanged) {
        return prev;
      }
    }

    // Track dependencies during selection
    const nextUsed = new Set<DepKey>();
    const trackingSelect: SelectHelpers<T, D> = {
      value: (name) => {
        nextUsed.add(makeDepKey("value", name as PropertyKey));
        return store.select.value(name);
      },
      meta: (name) => {
        nextUsed.add(makeDepKey("meta", name as PropertyKey));
        return store.select.meta(name);
      },
      validation: (name) => {
        nextUsed.add(makeDepKey("validation", name as PropertyKey));
        return store.select.validation(name);
      },
      snapshot: (name) => {
        nextUsed.add(makeDepKey("snapshot", name as PropertyKey));
        return store.select.snapshot(name);
      },
      mounted: (name) => {
        nextUsed.add(makeDepKey("mounted", name as PropertyKey));
        return store.select.mounted(name);
      },
    };

    const next = selector(trackingSelect, props);

    // Snapshot dependency versions for the next run
    const newVersions = new Map<DepKey, number>();
    for (const k of nextUsed) {
      newVersions.set(k, store.getDepVersion(k));
    }

    // Determine returned reference based on equality
    const prevSelected = lastSelectedRef.current;
    let result = next;
    if (prevSelected !== undefined && selectorEquality(prevSelected, next)) {
      result = prevSelected;
    }

    usedDepKeysRef.current = nextUsed;
    lastDepVersionsRef.current = newVersions;
    lastPropsRef.current = props;
    lastSelectedRef.current = result;

    return result;
  }, [selectorEquality, propsEquality, props, selector, store]);

  const selected = useSyncExternalStore(
    store.subscribe,
    getSelected,
    getSelected,
  );

  return selected;
}

// =====================================
// Hooks
// =====================================

function useField<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
  P = unknown,
>(
  options: FieldOptions<T, K, D, P>,
  propsOptions?: {
    props?: P;
    propsEquality?: (a: P | undefined, b: P | undefined) => boolean;
  },
): Prettify<UseFieldReturn<T, K, D>> {
  const store = use(StoreContext) as FormStore<T, D> | null;

  invariant(store, "useField must be used within a FormProvider");

  const { name, debounceMs, watch, respond, respondAsync, standardSchema } =
    options;

  const { props, propsEquality = shallow } = propsOptions ?? {};

  useIsomorphicEffect(() => {
    store.registerOptions(name, {
      name,
      debounceMs,
      respondAsync,
      watch,
      respond,
      standardSchema,
    } as FieldOptions<T, K, D, P>);

    return () => {
      store.unregisterOptions(name);
    };
  }, [debounceMs, name, watch, respond, respondAsync, standardSchema, store]);

  useIsomorphicEffect(() => {
    store.setFieldProps(
      name,
      props,
      propsEquality as unknown as (a: unknown, b: unknown) => boolean,
    );
  }, [name, props, propsEquality, store]);

  useIsomorphicEffect(() => {
    store.mount(name);

    return () => {
      store.unmount(name);
    };
  }, [name, store]);

  const { value, meta, validation } = useFormSelector<
    T,
    D,
    {
      value: T[K];
      meta: FieldMeta;
      validation: ValidationStatus<D>;
    }
  >((s) => ({
    value: s.value(name),
    meta: s.meta(name),
    validation: s.validation(name),
  }));

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
    meta,
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
>(): CreateFormResult<T, D> {
  return {
    defineField,
    useFormSelector,
    useField,
    useForm,
    defineSelector,
  };
}
