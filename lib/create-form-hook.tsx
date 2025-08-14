import { createContext, use, useCallback, useState } from "react";
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

export type Action = "change" | "blur" | "submit" | "mount";
const ACTIONS: Action[] = ["change", "blur", "submit", "mount"];
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

type FieldStateWaiting<D = unknown> = {
  type: "waiting";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateChecking<D = unknown> = {
  type: "checking";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateIdle<D = unknown> = {
  type: "idle";
  details?: D;
  readonly [FIELD_STATE_BRAND]: true;
};

export type FieldState<D = unknown> =
  | FieldStateValid<D>
  | FieldStateInvalid<D>
  | FieldStateWarning<D>
  | FieldStateWaiting<D>
  | FieldStateChecking<D>
  | FieldStateIdle<D>;

export type FinalFieldState<D = unknown> =
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
  strategy: "force";
  debounceMs?: number;
  readonly [FLOW_CONTROL_BRAND]: true;
};

export type ValidationFlow =
  | ValidationFlowSkip
  | ValidationFlowAuto
  | ValidationFlowForce;

// =====================================
// Field View and Metadata
// =====================================

export type FieldMeta = {
  isTouched: boolean;
  numberOfChanges: number;
  numberOfSubmissions: number;
};

export type FieldView<T, D = unknown> = {
  value: T;
  meta: FieldMeta;
  validationState: FieldState<D>;
  isMounted: boolean;
};

// A sync-only variant that intentionally hides async flow helpers
type ValidationHelperSync<D = unknown> = {
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

export type ValidationHelperAsync<D = unknown> = Prettify<
  {
    async: {
      skip(): ValidationFlowSkip;
      auto(debounceMs?: number): ValidationFlowAuto;
      force(debounceMs?: number): ValidationFlowForce;
    };
  } & ValidationHelperSync<D>
>;

type AsyncValidationHelper<D = unknown> = {
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
    numberOfChanges: Signal<number>;
    numberOfSubmissions: Signal<number>;
  };
  validationState: Signal<FieldState<D>>;
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
    ctx: RespondContext<T, K, D> | RespondContextSync<T, K, D>,
  ) => FinalFieldState<D> | ValidationFlow | void;
  respondAsync?: (
    ctx: RespondAsyncContext<T, K, D>,
  ) => Promise<FinalFieldState<D>>;
  triggers: {
    self: Set<Action>;
    from: Map<Exclude<keyof T, K>, Set<Action>>;
  };
};

type InternalValidationHelper<D = unknown> = {
  waiting: (p?: { details?: D }) => FieldStateWaiting<D>;
  checking: (p?: { details?: D }) => FieldStateChecking<D>;
};

// =====================================
// Store and Hook Types
// =====================================

type FormApi<T extends DefaultValues, D = unknown> = {
  getField: <K extends keyof T>(name: K) => FieldView<T[K], D>;
};

type FormStore<T extends DefaultValues, D = unknown> = {
  formApi: FormApi<T, D>;
  getField: <K extends keyof T>(name: K) => FieldEntry<T[K], D>;
  mount: (name: keyof T) => void;
  registerOptions: <K extends keyof T>(
    name: K,
    options: UseFieldOptions<T, K, D>,
  ) => void;
  unregisterOptions: (name: keyof T) => void;
  unmount: (name: keyof T) => void;
  setValue: (
    name: keyof T,
    value: T[keyof T],
    options?: {
      markTouched?: boolean;
      incrementChanges?: boolean;
      dispatch?: boolean;
    },
  ) => void;
  dispatchBlur: (name: keyof T) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  revalidate: (name: keyof T, action?: Action) => void;
  reset: (
    name: keyof T,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) => void;
};

type UseFieldResult<T extends DefaultValues, K extends keyof T, D = unknown> = {
  name: K;
  value: T[K];
  meta: FieldMeta;
  validationState: FieldState<D>;
  handleChange: (value: T[K]) => void;
  handleBlur: () => void;
  formApi: FormApi<T, D>;
};

export type UseFormResult<T extends DefaultValues, D = unknown> = {
  formApi: FormApi<T, D>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

type UseFormOptions<T extends DefaultValues> = {
  defaultValues: T;
  debounceMs?: number;
  watcherMaxSteps?: number;
};

type CreateFormHookResult<T extends DefaultValues, D = unknown> = {
  useForm: (options: UseFormOptions<T>) => UseFormResult<T, D>;
  useField: <K extends keyof T>(
    options: UseFieldOptions<T, K, D>,
  ) => Prettify<UseFieldResult<T, K, D>>;
  defineFieldOptions: <K extends keyof T>(
    options: UseFieldOptions<T, K, D>,
  ) => UseFieldOptions<T, K, D>;
};

// =====================================
// Graph Utilities
// =====================================

function makeEdgeKey(
  watched: PropertyKey,
  target: PropertyKey,
  action: Action,
): string {
  return `${String(watched)}->${String(target)}@${action}`;
}

function makeCauseForTarget<T extends DefaultValues, K extends keyof T>(
  target: K,
  causeField: keyof T,
  action: Action,
):
  | { isSelf: true; field: K; action: Action }
  | { isSelf: false; field: Exclude<keyof T, K>; action: Action } {
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

export type RespondContext<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: Action;
  cause:
    | { isSelf: true; field: K; action: Action }
    | { isSelf: false; field: Exclude<keyof T, K>; action: Action };
  value: T[K];
  current: Prettify<FieldView<T[K], D>>;
  form: {
    setValue: <F extends keyof T>(
      name: F,
      value: T[F],
      options?: {
        markTouched?: boolean;
        incrementChanges?: boolean;
        dispatch?: boolean;
      },
    ) => void;
    reset: (
      name: keyof T,
      options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
    ) => void;
    touch: (name: keyof T) => void;
    submit: (fields?: readonly (keyof T)[]) => void;
    revalidate: (name: keyof T, action?: Action) => void;
    getField: <F extends keyof T>(name: F) => FieldView<T[F], D>;
  };
  helpers: {
    validation: ValidationHelperAsync<D>;
    validateWithStandardSchema: () =>
      | readonly StandardSchemaV1.Issue[]
      | undefined;
  };
};

// Sync variant: identical to RespondContext but without async helpers on validation
export type RespondContextSync<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: Action;
  cause:
    | { isSelf: true; field: K; action: Action }
    | { isSelf: false; field: Exclude<keyof T, K>; action: Action };
  value: T[K];
  current: Prettify<FieldView<T[K], D>>;
  form: {
    setValue: <F extends keyof T>(
      name: F,
      value: T[F],
      options?: {
        markTouched?: boolean;
        incrementChanges?: boolean;
        dispatch?: boolean;
      },
    ) => void;
    reset: (
      name: keyof T,
      options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
    ) => void;
    touch: (name: keyof T) => void;
    submit: (fields?: readonly (keyof T)[]) => void;
    revalidate: (name: keyof T, action?: Action) => void;
    getField: <F extends keyof T>(name: F) => FieldView<T[F], D>;
  };
  helpers: {
    validation: ValidationHelperSync<D>;
    validateWithStandardSchema: () =>
      | readonly StandardSchemaV1.Issue[]
      | undefined;
  };
};

type RespondAsyncContext<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  action: Action;
  cause:
    | { isSelf: true; field: K; action: Action }
    | { isSelf: false; field: Exclude<keyof T, K>; action: Action };
  value: T[K];
  current: Prettify<FieldView<T[K], D>>;
  meta: FieldMeta;
  validationState: FieldState<D>;
  signal: AbortSignal;
  helpers: {
    validation: AsyncValidationHelper<D>;
    validateWithStandardSchemaAsync: () => Promise<
      readonly StandardSchemaV1.Issue[] | undefined
    >;
  };
  form: {
    setValue: <F extends keyof T>(
      name: F,
      value: T[F],
      options?: {
        markTouched?: boolean;
        incrementChanges?: boolean;
        dispatch?: boolean;
      },
    ) => void;
    reset: (
      name: keyof T,
      options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
    ) => void;
    touch: (name: keyof T) => void;
    submit: (fields?: readonly (keyof T)[]) => void;
    revalidate: (name: keyof T, action?: Action) => void;
    getField: <F extends keyof T>(name: F) => FieldView<T[F], D>;
  };
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
  on?: {
    self?: Action[];
    from?: Partial<Record<Exclude<keyof T, K>, Action[] | true>>;
  };
  respond: (
    ctx: Prettify<RespondContextSync<T, K, D>>,
  ) => FinalFieldState<D> | void;
  respondAsync?: never;
  debounceMs?: never;
};

type AsyncOnlyFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  standardSchema?: StandardSchemaV1<T[K]>;
  on?: {
    self?: Action[];
    from?: Partial<Record<Exclude<keyof T, K>, Action[] | true>>;
  };
  respond?: never;
  respondAsync: (
    ctx: Prettify<RespondAsyncContext<T, K, D>>,
  ) => Promise<FinalFieldState<D>>;
  debounceMs?: number;
};

type SyncAsyncFieldOptionsExtension<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  standardSchema?: StandardSchemaV1<T[K]>;
  on?: {
    self?: Action[];
    from?: Partial<Record<Exclude<keyof T, K>, Action[] | true>>;
  };
  respond: (
    ctx: Prettify<RespondContext<T, K, D>>,
  ) => FinalFieldState<D> | ValidationFlow | void;
  respondAsync: (
    ctx: Prettify<RespondAsyncContext<T, K, D>>,
  ) => Promise<FinalFieldState<D>>;
  debounceMs?: number;
};

type NoValidationFieldOptionsExtension = {
  standardSchema?: never;
  on?: never;
  respond?: never;
  respondAsync?: never;
  debounceMs?: never;
};

export type UseFieldOptions<
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
// Field View helpers
// =====================================

function buildFieldView<T extends DefaultValues, D, F extends keyof T>(
  fieldsMap: FieldMap<T, D>,
  mountedFields: Set<keyof T>,
  fieldName: F,
): FieldView<T[F], D> {
  const field = fieldsMap.get(fieldName);

  invariant(field, `Unknown field: ${String(fieldName)}`);

  const typed = field as unknown as FieldEntry<T[F], D>;

  return {
    value: typed.value.getValue(),
    meta: {
      isTouched: typed.meta.isTouched.getValue(),
      numberOfChanges: typed.meta.numberOfChanges.getValue(),
      numberOfSubmissions: typed.meta.numberOfSubmissions.getValue(),
    },
    validationState: typed.validationState.getValue(),
    isMounted: mountedFields.has(fieldName),
  } satisfies FieldView<T[F], D>;
}

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

function force(debounceMs?: number): ValidationFlowForce {
  return {
    type: "async",
    strategy: "force",
    debounceMs,
  } as ValidationFlowForce;
}

function normalizeFieldOptions<T extends DefaultValues, K extends keyof T, D>(
  name: K,
  opts: UseFieldOptions<T, K, D>,
): InternalFieldOptions<T, K, D> {
  const triggersSelf = new Set<Action>(opts.on?.self ?? ACTIONS);
  const from = new Map<Exclude<keyof T, K>, Set<Action>>();
  if (opts.on?.from) {
    for (const key of Object.keys(opts.on.from) as Exclude<keyof T, K>[]) {
      const val = opts.on.from[key];
      const actions = new Set<Action>(
        typeof val === "boolean" ? ACTIONS : (val ?? []),
      );
      from.set(key, actions);
    }
  }
  return {
    name: name,
    standardSchema: opts.standardSchema,
    debounceMs: opts.debounceMs,
    respond: opts.respond as (
      ctx: RespondContext<T, K, D> | RespondContextSync<T, K, D>,
    ) => FinalFieldState<D> | ValidationFlow | void,
    respondAsync: opts.respondAsync as (
      ctx: RespondAsyncContext<T, K, D>,
    ) => Promise<FinalFieldState<D>>,
    triggers: { self: triggersSelf, from },
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

  function waiting(props?: { details?: D }): FieldStateWaiting<D> {
    return { type: "waiting", details: props?.details } as FieldStateWaiting<D>;
  }

  function checking(props?: { details?: D }): FieldStateChecking<D> {
    return {
      type: "checking",
      details: props?.details,
    } as FieldStateChecking<D>;
  }

  // -- Helper bundles exposed to user callbacks
  const validationHelperAsync = {
    idle,
    invalid,
    valid,
    warning,
    async: { auto, force, skip },
  } satisfies ValidationHelperAsync<D>;

  const validationHelperSync = {
    idle,
    invalid,
    valid,
    warning,
  } satisfies ValidationHelperSync<D>;

  const internalValidationHelper = {
    checking,
    waiting,
  } satisfies InternalValidationHelper<D>;

  const asyncValidationHelper = {
    idle,
    invalid,
    valid,
    warning,
  } satisfies AsyncValidationHelper<D>;

  // -- Form state containers
  const fieldsMap: FieldMap<T, D> = new Map();

  const defaultValuesEntries = Object.entries(defaultValues) as [
    key: keyof T,
    value: T[keyof T],
  ][];

  for (const [key, value] of defaultValuesEntries) {
    fieldsMap.set(key, {
      value: signal<T[keyof T]>(value),
      meta: {
        isTouched: signal(false),
        numberOfChanges: signal(0),
        numberOfSubmissions: signal(0),
      },
      validationState: signal<FieldState<D>>(validationHelperSync.idle()),
    });
  }

  const mountedFields = new Set<keyof T>();

  const fieldOptions = new Map<keyof T, unknown>();

  function getFieldOptions<K extends keyof T>(
    name: K,
  ): InternalFieldOptions<T, K, D> | undefined {
    return fieldOptions.get(name) as InternalFieldOptions<T, K, D> | undefined;
  }

  const reactions = new Map<string, Set<keyof T>>();
  const targetToWatchKeys = new Map<keyof T, Set<string>>();
  const runningValidations = new Map<keyof T, RunningValidation<T[keyof T]>>();
  const lastValidatedValue = new Map<keyof T, T[keyof T]>();
  const lastValidatedChanges = new Map<keyof T, number>();
  const validationIds = new Map<keyof T, number>();

  const watcherMaxSteps = normalizeNumber(options.watcherMaxSteps, {
    fallback: DEFAULT_WATCHER_MAX_STEPS,
    min: 1,
    integer: "floor",
  });

  function getRunningValidation<K extends keyof T>(
    field: K,
  ): RunningValidation<T[K]> | undefined {
    return runningValidations.get(field) as RunningValidation<T[K]> | undefined;
  }

  function setRunningValidation<K extends keyof T>(
    field: K,
    value: RunningValidation<T[K]>,
  ): void {
    runningValidations.set(field, value as RunningValidation<T[keyof T]>);
  }

  const watcherTransaction = {
    active: false,
    depth: 0,
    visited: new Set<string>(),
    steps: 0,
    maxSteps: watcherMaxSteps,
    bailOut: false,
  };

  // -- Internal getters/setters
  function getEntryOrThrow<K extends keyof T>(name: K): FieldEntry<T[K], D> {
    const entry = fieldsMap.get(name);

    invariant(entry, `Unknown field: ${String(name)}`);

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
  function cleanupValidation(field: keyof T) {
    const rv = getRunningValidation(field);
    if (!rv) {
      return;
    }
    if (rv.timeoutId) {
      clearTimeout(rv.timeoutId);
    }
    if (rv.abortController) {
      rv.abortController.abort();
    }
    runningValidations.delete(field);
  }

  function clearValidationTimeout(field: keyof T) {
    const rv = getRunningValidation(field);
    if (!rv) {
      return;
    }
    rv.timeoutId = undefined;
  }

  function incrementValidationId(field: keyof T) {
    const next = (validationIds.get(field) ?? 0) + 1;
    validationIds.set(field, next);
    return next;
  }

  function setFieldState(field: keyof T, state: FieldState<D>) {
    getEntryOrThrow(field).validationState.setValue(state, deepEqual);
  }

  function setLastValidatedValue<K extends keyof T>(field: K, value: T[K]) {
    lastValidatedValue.set(field, value);
  }

  function getLastValidatedValue<K extends keyof T>(
    field: K,
  ): T[K] | undefined {
    return lastValidatedValue.get(field) as T[K] | undefined;
  }

  function scheduleValidation<K extends keyof T>(
    field: K,
    value: T[K],
    debounceMs: number,
    action: Action,
    cause:
      | { isSelf: true; field: K; action: Action }
      | { isSelf: false; field: Exclude<keyof T, K>; action: Action },
  ) {
    cleanupValidation(field);
    if (debounceMs === 0) {
      runValidation(field, value, action, cause);
      return;
    }
    const validationId = incrementValidationId(field);
    setFieldState(field, internalValidationHelper.waiting());
    const timeoutId = setTimeout(() => {
      clearValidationTimeout(field);
      runValidation(field, value, action, cause);
    }, debounceMs);
    setRunningValidation(field, {
      stateSnapshot: value,
      timeoutId,
      validationId,
    });
  }

  function runValidation<K extends keyof T>(
    field: K,
    value: T[K],
    action: Action,
    cause:
      | { isSelf: true; field: K; action: Action }
      | { isSelf: false; field: Exclude<keyof T, K>; action: Action },
  ) {
    cleanupValidation(field);
    const opts = getFieldOptions(field);
    if (!opts?.respondAsync) {
      return;
    }

    const validationId = incrementValidationId(field);
    const abortController = new AbortController();
    const { signal } = abortController;

    setRunningValidation(field, {
      stateSnapshot: value,
      abortController,
      validationId,
    });
    setFieldState(field, internalValidationHelper.checking());
    setLastValidatedValue(field, value);
    lastValidatedChanges.set(
      field,
      getEntryOrThrow(field).meta.numberOfChanges.getValue(),
    );

    const currentFieldView = buildFieldView(fieldsMap, mountedFields, field);
    const std = opts.standardSchema;

    opts
      .respondAsync({
        action,
        cause,
        value,
        current: currentFieldView,
        meta: currentFieldView.meta,
        validationState: currentFieldView.validationState,
        signal,
        helpers: {
          validation: asyncValidationHelper,
          validateWithStandardSchemaAsync: async () =>
            std ? await standardValidateAsync(std, value) : undefined,
        },
        form: {
          setValue: api.setValue,
          reset: api.reset,
          touch: api.touch,
          submit: api.submit,
          revalidate: api.revalidate,
          getField: (fieldName) =>
            buildFieldView(fieldsMap, mountedFields, fieldName),
        },
      })
      .then((result) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (validationId !== validationIds.get(field)) {
          return;
        }
        setFieldState(field, result);
        cleanupValidation(field);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (validationId !== validationIds.get(field)) {
          return;
        }
        setFieldState(
          field,
          validationHelperSync.invalid({
            issues: [
              {
                message:
                  error instanceof Error ? error.message : "Validation failed",
              },
            ],
          }),
        );
        cleanupValidation(field);
      });
  }

  function handleAsyncFlow<K extends keyof T>(
    field: K,
    flow: ValidationFlow,
    action: Action,
    cause:
      | { isSelf: true; field: K; action: Action }
      | { isSelf: false; field: Exclude<keyof T, K>; action: Action },
  ) {
    const opts = getFieldOptions(field);
    if (!opts?.respondAsync) {
      return;
    }
    switch (flow.strategy) {
      case "skip": {
        return;
      }
      case "auto": {
        if (
          shouldSkipAutoValidation(
            getRunningValidation(field),
            getEntryOrThrow(field).value.getValue(),
            getLastValidatedValue(field),
            lastValidatedChanges.get(field) ?? 0,
            getEntryOrThrow(field).meta.numberOfChanges.getValue(),
          )
        ) {
          return;
        }
        const value = getEntryOrThrow(field).value.getValue();
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? opts.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(field, value, debounceMs, action, cause);
        return;
      }
      case "force": {
        const value = getEntryOrThrow(field).value.getValue();
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? opts.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(field, value, debounceMs, action, cause);
        return;
      }
    }
  }

  // -- Respond dispatch
  function runRespond<K extends keyof T>(
    target: K,
    causeField: K | Exclude<keyof T, K>,
    action: Action,
  ) {
    if (!mountedFields.has(target)) {
      return;
    }
    const opts = getFieldOptions(target);
    if (!opts) {
      return;
    }
    // Early short-circuit when there is nothing to do
    if (!opts.respond && !opts.respondAsync) {
      return;
    }
    const causeForTarget = makeCauseForTarget<T, K>(target, causeField, action);

    if (!opts.respond && opts.respondAsync) {
      // No sync respond provided, but async path configured: force async
      handleAsyncFlow(
        target,
        validationHelperAsync.async.force(),
        action,
        causeForTarget,
      );
      return;
    }

    const value = getEntryOrThrow(target).value.getValue();
    const currentView = buildFieldView(fieldsMap, mountedFields, target);
    const std = opts.standardSchema;

    const result = opts.respond?.({
      action,
      cause: causeForTarget,
      value: value,
      current: currentView,
      form: {
        setValue: api.setValue,
        reset: api.reset,
        touch: api.touch,
        submit: api.submit,
        revalidate: api.revalidate,
        getField: (fieldName) =>
          buildFieldView(fieldsMap, mountedFields, fieldName),
      },
      helpers: {
        validation: opts.respondAsync
          ? validationHelperAsync
          : validationHelperSync,
        validateWithStandardSchema: () =>
          std ? standardValidate(std, value) : undefined,
      },
    });

    const outcome = result ?? validationHelperAsync.async.skip();

    if (outcome.type === "async") {
      handleAsyncFlow(target, outcome, action, causeForTarget);
    } else {
      setFieldState(target, outcome);
      cleanupValidation(target);
    }
  }

  // -- Reaction graph and dispatch
  function dispatch(watched: keyof T, action: Action) {
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
    actions: Set<Action>,
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
    name: K,
    internal: InternalFieldOptions<T, K, D>,
  ) {
    const keysForTarget = clearPreviousReactionsFor(name);

    // Honor explicit empty trigger arrays by not falling back to ALL actions
    addReactions(name, internal.triggers.self, name, keysForTarget);

    for (const [watched, actions] of internal.triggers.from.entries()) {
      // Honor explicit empty arrays for cross-field triggers as well
      addReactions(watched, actions, name, keysForTarget);
    }

    targetToWatchKeys.set(name, keysForTarget);
  }

  // -- Public API (mutations)
  const api = {
    setValue: <K extends keyof T>(
      name: K,
      value: T[K],
      options?: {
        markTouched?: boolean;
        incrementChanges?: boolean;
        dispatch?: boolean;
      },
    ) => {
      const markTouched = options?.markTouched ?? true;
      const incrementChanges = options?.incrementChanges ?? true;
      const shouldDispatch = options?.dispatch ?? true;

      const entry = getEntryOrThrow(name);
      const previousValue = entry.value.getValue();
      const hasChanged = !deepEqual(previousValue, value);
      if (hasChanged) {
        entry.value.setValue(value, deepEqual);
      }

      if (markTouched) {
        entry.meta.isTouched.setValue(true);
      }

      if (incrementChanges && hasChanged) {
        entry.meta.numberOfChanges.setValue(
          entry.meta.numberOfChanges.getValue() + 1,
        );
      }

      if (shouldDispatch && hasChanged) {
        dispatch(name, "change");
      }
    },
    reset: (
      name: keyof T,
      options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
    ) => {
      // Reset value to default without touching meta/counters by default
      api.setValue(name, defaultValues[name], {
        markTouched: false,
        incrementChanges: false,
        dispatch: options?.dispatch,
      });

      if (options?.meta) {
        const entry = getEntryOrThrow(name);
        entry.meta.isTouched.setValue(false);
        entry.meta.numberOfChanges.setValue(0);
        entry.meta.numberOfSubmissions.setValue(0);
      }

      if (options?.validation) {
        setFieldState(name, validationHelperSync.idle());
        cleanupValidation(name);
      }
    },
    touch: (name: keyof T) => {
      getEntryOrThrow(name).meta.isTouched.setValue(true);
    },
    submit: (fields?: readonly (keyof T)[]) => {
      const toSubmit = new Set(
        fields ?? (Object.keys(defaultValues) as (keyof T)[]),
      );
      runInDispatchTransaction(() => {
        for (const f of toSubmit) {
          if (!mountedFields.has(f)) {
            continue;
          }
          const entry = getEntryOrThrow(f);
          entry.meta.numberOfSubmissions.setValue(
            entry.meta.numberOfSubmissions.getValue() + 1,
          );
          dispatch(f, "submit");
          if (watcherTransaction.bailOut) {
            break;
          }
        }
      });
    },
    revalidate: (name: keyof T, action?: Action) => {
      dispatch(name, action ?? "change");
    },
  } as const;

  // -- Options helpers (extracted to reduce complexity)
  function unregisterFieldOptions(name: keyof T) {
    cleanupValidation(name);
    clearPreviousReactionsFor(name);
    targetToWatchKeys.delete(name);
    fieldOptions.delete(name);
  }

  function settleIfAsyncDisabled<K extends keyof T>(
    name: K,
    internal: InternalFieldOptions<T, K, D>,
  ) {
    if (internal.respondAsync) {
      return;
    }
    const currentState = getEntryOrThrow(name).validationState.getValue();
    if (currentState.type !== "waiting" && currentState.type !== "checking") {
      return;
    }
    cleanupValidation(name);
    if (internal.respond) {
      runRespond(name, name, "change");
    } else {
      setFieldState(name, validationHelperSync.idle());
    }
  }

  // -- Options registration lifecycle
  function setFieldOptions<K extends keyof T>(
    name: K,
    opts: UseFieldOptions<T, K, D> | undefined,
  ) {
    if (!opts) {
      unregisterFieldOptions(name);
      return;
    }
    const internal = normalizeFieldOptions(name, opts);
    fieldOptions.set(name, internal);
    registerReactionsFor(name, internal);
    settleIfAsyncDisabled(name, internal);
  }

  function mount(name: keyof T) {
    if (!mountedFields.has(name)) {
      mountedFields.add(name);
      dispatch(name, "mount");
    }
  }

  function unmount(name: keyof T) {
    if (mountedFields.has(name)) {
      mountedFields.delete(name);
    }
    cleanupValidation(name);
  }

  function dispatchBlur(name: keyof T) {
    dispatch(name, "blur");
  }

  function registerOptions<K extends keyof T>(
    name: K,
    options: UseFieldOptions<T, K, D>,
  ) {
    setFieldOptions(name, options);
  }

  function unregisterOptions(name: keyof T) {
    setFieldOptions(name, undefined);
  }

  function getFieldView<K extends keyof T>(name: K): FieldView<T[K], D> {
    const field = getEntryOrThrow(name);
    return {
      value: field.value.getValue(),
      meta: {
        isTouched: field.meta.isTouched.getValue(),
        numberOfChanges: field.meta.numberOfChanges.getValue(),
        numberOfSubmissions: field.meta.numberOfSubmissions.getValue(),
      },
      validationState: field.validationState.getValue(),
      isMounted: mountedFields.has(name),
    };
  }

  const store: FormStore<T, D> = {
    formApi: {
      getField: getFieldView,
    },
    dispatchBlur,
    registerOptions,
    unregisterOptions,
    getField: getEntryOrThrow,
    mount,
    unmount,
    setValue: api.setValue,
    reset: api.reset,
    submit: api.submit,
    revalidate: (name, action = "change") => {
      dispatch(name, action);
    },
  };

  return store;
}

// =====================================
// Hooks helpers
// =====================================

function defineFieldOptions<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
>(options: UseFieldOptions<T, K, D>): UseFieldOptions<T, K, D> {
  return options;
}

// =====================================
// Hooks
// =====================================

function useField<T extends DefaultValues, K extends keyof T, D = unknown>(
  options: UseFieldOptions<T, K, D>,
): Prettify<UseFieldResult<T, K, D>> {
  const store = use(StoreContext) as FormStore<T, D> | null;

  if (!store) {
    throw new Error("useField must be used within a FormProvider");
  }

  const { name, debounceMs, on, respond, respondAsync, standardSchema } =
    options;

  useIsomorphicEffect(() => {
    store.registerOptions(name, {
      name,
      debounceMs,
      respondAsync,
      on,
      respond,
      standardSchema,
    } as UseFieldOptions<T, K, D>);

    return () => {
      store.unregisterOptions(name);
    };
  }, [debounceMs, name, on, respond, respondAsync, standardSchema, store]);

  useIsomorphicEffect(() => {
    store.mount(name);

    return () => {
      store.unmount(name);
    };
  }, [name, store]);

  const field = store.getField(name);

  const value = useSignal(field.value);
  const isTouched = useSignal(field.meta.isTouched);
  const numberOfChanges = useSignal(field.meta.numberOfChanges);
  const numberOfSubmissions = useSignal(field.meta.numberOfSubmissions);
  const validationState = useSignal(field.validationState);

  const handleChange = useCallback(
    (value: T[K]) => {
      store.setValue(name, value);
    },
    [name, store],
  );

  const handleBlur = useCallback(() => {
    store.dispatchBlur(name);
  }, [name, store]);

  return {
    name,
    value,
    meta: {
      isTouched,
      numberOfChanges,
      numberOfSubmissions,
    },
    validationState,
    handleChange,
    handleBlur,
    formApi: store.formApi,
  };
}

export function useForm<T extends DefaultValues, D = unknown>(
  options: UseFormOptions<T>,
): UseFormResult<T, D> {
  const [formStore] = useState(() => createFormStore<T, D>(options));

  const Form = useCallback(
    (props: React.ComponentProps<"form">) => (
      <FormProvider formStore={formStore}>
        <form {...props} />
      </FormProvider>
    ),
    [formStore],
  );

  return {
    formApi: formStore.formApi,
    Form,
  };
}

export function createFormHook<
  T extends DefaultValues,
  D = unknown,
>(): CreateFormHookResult<T, D> {
  return {
    defineFieldOptions,
    useField,
    useForm,
  };
}
