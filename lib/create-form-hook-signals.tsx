import { createContext, use, useCallback, useState } from "react";
import { signal, useSignal, type Signal } from "@lib/store/signals";
import { deepEqual } from "@lib/deep-equal";
import { normalizeDebounceMs, normalizeNumber } from "@lib/normalize-number";
import {
  standardValidate,
  standardValidateAsync,
} from "@lib/standard-validate";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";

type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line sonarjs/no-useless-intersection -- this is a common pattern for prettifying types
} & {};

export type Action = "change" | "blur" | "submit" | "mount";
const ACTIONS: Action[] = ["change", "blur", "submit", "mount"];
const DEFAULT_WATCHER_MAX_STEPS = 1000;
const DEFAULT_DEBOUNCE_MS = 500;

type DefaultValues = Record<string, unknown>;

type FieldStateValid<D = unknown> = { type: "valid"; details?: D };

type FieldStateInvalid<D = unknown> = {
  type: "invalid";
  issues: readonly { message: string }[];
  details?: D;
};

type FieldStateWarning<D = unknown> = {
  type: "warning";
  issues: readonly { message: string }[];
  details?: D;
};

type FieldStateWaiting<D = unknown> = { type: "waiting"; details?: D };

type FieldStateChecking<D = unknown> = { type: "checking"; details?: D };

type FieldStateIdle<D = unknown> = { type: "idle"; details?: D };

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

type ValidationFlowSkip = { type: "async"; strategy: "skip" };
type ValidationFlowAuto = {
  type: "async";
  strategy: "auto";
  debounceMs?: number;
};
type ValidationFlowForce = {
  type: "async";
  strategy: "force";
  debounceMs?: number;
};

export type ValidationFlow =
  | ValidationFlowSkip
  | ValidationFlowAuto
  | ValidationFlowForce;

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

export type ValidationFactory<D = unknown> = {
  valid: (p?: { details?: D }) => FieldStateValid<D>;
  invalid: (p?: {
    issues?: readonly { message: string }[];
    details?: D;
  }) => FieldStateInvalid<D>;
  warning: (p?: {
    issues?: readonly { message: string }[];
    details?: D;
  }) => FieldStateWarning<D>;
  idle: (p?: { details?: D }) => FieldStateIdle<D>;
  waiting: (p?: { details?: D }) => FieldStateWaiting<D>;
  checking: (p?: { details?: D }) => FieldStateChecking<D>;
  async: {
    skip: () => ValidationFlowSkip;
    auto: (debounceMs?: number) => ValidationFlowAuto;
    force: (debounceMs?: number) => ValidationFlowForce;
  };
};

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

type FinalizeValidationFactory<D = unknown> = {
  valid: (p?: { details?: D }) => FieldStateValid<D>;
  invalid: (p?: {
    issues?: readonly { message: string }[];
    details?: D;
  }) => FieldStateInvalid<D>;
  warning: (p?: {
    issues?: readonly { message: string }[];
    details?: D;
  }) => FieldStateWarning<D>;
};

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
    validation: ValidationFactory<D>;
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
    validation: FinalizeValidationFactory<D>;
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

export type UseFieldSignalOptionsSync<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  name: K;
  standardSchema?: StandardSchemaV1<T[K]>;
  debounceMs?: never;
  respond: (ctx: RespondContext<T, K, D>) => FinalFieldState<D> | void;
  on?: {
    self?: Action[];
    from?: Partial<Record<Exclude<keyof T, K>, Action[] | true>>;
  };
  // Explicitly disallow async flow in the sync variant
  respondAsync?: never;
};

export type UseFieldSignalOptionsAsync<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  name: K;
  standardSchema?: StandardSchemaV1<T[K]>;
  debounceMs?: number;
  respond?: (
    ctx: RespondContext<T, K, D>,
  ) => FinalFieldState<D> | ValidationFlow | void;
  respondAsync: (
    ctx: RespondAsyncContext<T, K, D>,
  ) => Promise<FinalFieldState<D>>;
  on?: {
    self?: Action[];
    from?: Partial<Record<Exclude<keyof T, K>, Action[] | true>>;
  };
};

export type UseFieldSignalOptions<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = UseFieldSignalOptionsSync<T, K, D> | UseFieldSignalOptionsAsync<T, K, D>;

type FieldEntry<V, D = unknown> = {
  value: Signal<V>;
  meta: {
    isTouched: Signal<boolean>;
    numberOfChanges: Signal<number>;
    numberOfSubmissions: Signal<number>;
  };
  validationState: Signal<FieldState<D>>;
};

type SignalFieldMap<T extends DefaultValues, D = unknown> = Map<
  keyof T,
  FieldEntry<T[keyof T], D>
>;

function getFieldViewFromMaps<T extends DefaultValues, D, F extends keyof T>(
  fieldsMap: SignalFieldMap<T, D>,
  mountedFields: Set<keyof T>,
  fieldName: F,
): FieldView<T[F], D> {
  const field = fieldsMap.get(fieldName);

  if (!field) {
    throw new Error(`Unknown field: ${String(fieldName)}`);
  }

  const typed = field as FieldEntry<T[F], D>;

  return {
    value: typed.value.peekValue(),
    meta: {
      isTouched: typed.meta.isTouched.peekValue(),
      numberOfChanges: typed.meta.numberOfChanges.peekValue(),
      numberOfSubmissions: typed.meta.numberOfSubmissions.peekValue(),
    },
    validationState: typed.validationState.peekValue(),
    isMounted: mountedFields.has(fieldName),
  } satisfies FieldView<T[F], D>;
}

type RunningValidation<T> = {
  stateSnapshot: T;
  timeoutId?: ReturnType<typeof setTimeout>;
  abortController?: AbortController;
  validationId: number;
};

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

type FieldOptionsConfig<T extends DefaultValues, K extends keyof T, D> = {
  standardSchema?: StandardSchemaV1<T[K]>;
  debounceMs?: number;
  respond?: UseFieldSignalOptions<T, K, D>["respond"];
  respondAsync?: UseFieldSignalOptionsAsync<T, K, D>["respondAsync"];
  on?: UseFieldSignalOptions<T, K, D>["on"];
};

type InternalFieldOptions<T extends DefaultValues, K extends keyof T, D> = {
  name: K;
  standardSchema?: StandardSchemaV1<T[K]>;
  debounceMs?: number;
  respond?: (
    ctx: RespondContext<T, K, D>,
  ) => FinalFieldState<D> | ValidationFlow | void;
  respondAsync?: (
    ctx: RespondAsyncContext<T, K, D>,
  ) => Promise<FinalFieldState<D>>;
  triggers: {
    self: Set<Action>;
    from: Map<Exclude<keyof T, K>, Set<Action>>;
  };
};

function toInternalOptions<T extends DefaultValues, K extends keyof T, D>(
  name: K,
  opts: FieldOptionsConfig<T, K, D>,
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
    respond: opts.respond,
    respondAsync: opts.respondAsync,
    triggers: { self: triggersSelf, from },
  } satisfies InternalFieldOptions<T, K, D>;
}

type SignalFormStore<T extends DefaultValues, D = unknown> = {
  getField: <K extends keyof T>(name: K) => FieldEntry<T[K], D>;
  mount: (name: keyof T) => void;
  registerOptions: <K extends keyof T>(
    name: K,
    options: FieldOptionsConfig<T, K, D>,
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

function makeValidationFactory<D = unknown>(): ValidationFactory<D> {
  return {
    valid: (props) => ({ type: "valid", details: props?.details }),
    invalid: (props) => ({
      type: "invalid",
      issues: props?.issues ?? [],
      details: props?.details,
    }),
    warning: (props) => ({
      type: "warning",
      issues: props?.issues ?? [],
      details: props?.details,
    }),
    idle: (props) => ({ type: "idle", details: props?.details }),
    waiting: (props) => ({ type: "waiting", details: props?.details }),
    checking: (props) => ({ type: "checking", details: props?.details }),
    async: {
      skip: () => ({ type: "async", strategy: "skip" }),
      auto: (debounceMs?: number) => ({
        type: "async",
        strategy: "auto",
        debounceMs,
      }),
      force: (debounceMs?: number) => ({
        type: "async",
        strategy: "force",
        debounceMs,
      }),
    },
  };
}

function makeFinalizeValidationFactory<
  D = unknown,
>(): FinalizeValidationFactory<D> {
  return {
    valid: (props) => ({ type: "valid", details: props?.details }),
    invalid: (props) => ({
      type: "invalid",
      issues: props?.issues ?? [],
      details: props?.details,
    }),
    warning: (props) => ({
      type: "warning",
      issues: props?.issues ?? [],
      details: props?.details,
    }),
  };
}

const SignalStoreContext = createContext<unknown>(null);

function SignalFormProvider<T extends DefaultValues, D = unknown>({
  children,
  formStore,
}: Readonly<{
  children: React.ReactNode;
  formStore: SignalFormStore<T, D>;
}>) {
  return <SignalStoreContext value={formStore}>{children}</SignalStoreContext>;
}

type UseFieldSignalResult<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
> = {
  name: K;
  value: T[K];
  meta: FieldMeta;
  validationState: FieldState<D>;
  handleChange: (value: T[K]) => void;
  handleBlur: () => void;
};

export type UseSignalFormResult<T extends DefaultValues, D = unknown> = {
  formStore: SignalFormStore<T, D>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

type UseSignalFormOptions<T extends DefaultValues> = {
  defaultValues: T;
  debounceMs?: number;
  watcherMaxSteps?: number;
};

type CreateSignalFormHookResult<T extends DefaultValues, D = unknown> = {
  useSignalForm: (
    options: UseSignalFormOptions<T>,
  ) => UseSignalFormResult<T, D>;
  useSignalField: <K extends keyof T>(
    options: UseFieldSignalOptions<T, K, D>,
  ) => Prettify<UseFieldSignalResult<T, K, D>>;
};

function createSignalFormStore<T extends DefaultValues, D = unknown>(
  options: UseSignalFormOptions<T>,
): SignalFormStore<T, D> {
  const { defaultValues } = options;

  const defaultDebounceMs = normalizeDebounceMs(
    options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );

  const fieldsMap: SignalFieldMap<T, D> = new Map();

  const defaultValuesEntries = Object.entries(defaultValues) as [
    key: keyof T,
    value: T[keyof T],
  ][];

  for (const [key, value] of defaultValuesEntries) {
    fieldsMap.set(key, {
      value: signal(value),
      meta: {
        isTouched: signal(false),
        numberOfChanges: signal(0),
        numberOfSubmissions: signal(0),
      },
      validationState: signal<FieldState<D>>({ type: "idle" }),
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

  const validation = makeValidationFactory<D>();

  const finalizeValidation = makeFinalizeValidationFactory<D>();

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

  function requireEntry<K extends keyof T>(name: K): FieldEntry<T[K], D> {
    const entry = fieldsMap.get(name);
    if (!entry) {
      throw new Error(`Unknown field: ${String(name)}`);
    }
    return entry as FieldEntry<T[K], D>;
  }

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
    requireEntry(field).validationState.setValue(state, deepEqual);
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
    setFieldState(field, { type: "waiting" });
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
    setFieldState(field, { type: "checking" });
    setLastValidatedValue(field, value);
    lastValidatedChanges.set(
      field,
      requireEntry(field).meta.numberOfChanges.peekValue(),
    );

    const currentFieldView = getFieldViewFromMaps(
      fieldsMap,
      mountedFields,
      field,
    );
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
          validation: finalizeValidation,
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
            getFieldViewFromMaps(fieldsMap, mountedFields, fieldName),
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
        setFieldState(field, {
          type: "invalid",
          issues: [
            {
              message:
                error instanceof Error ? error.message : "Validation failed",
            },
          ],
        });
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
            requireEntry(field).value.peekValue(),
            getLastValidatedValue(field),
            lastValidatedChanges.get(field) ?? 0,
            requireEntry(field).meta.numberOfChanges.peekValue(),
          )
        ) {
          return;
        }
        const value = requireEntry(field).value.peekValue();
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? opts.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(field, value, debounceMs, action, cause);
        return;
      }
      case "force": {
        const value = requireEntry(field).value.peekValue();
        const debounceMs = normalizeDebounceMs(
          flow.debounceMs ?? opts.debounceMs ?? defaultDebounceMs,
        );
        scheduleValidation(field, value, debounceMs, action, cause);
        return;
      }
    }
  }

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
      handleAsyncFlow(target, validation.async.force(), action, causeForTarget);
      return;
    }

    const value = requireEntry(target).value.peekValue();
    const currentView = getFieldViewFromMaps(fieldsMap, mountedFields, target);
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
          getFieldViewFromMaps(fieldsMap, mountedFields, fieldName),
      },
      helpers: {
        validation,
        validateWithStandardSchema: () =>
          std ? standardValidate(std, value) : undefined,
      },
    });

    const outcome = result ?? validation.async.skip();

    if (outcome.type === "async") {
      handleAsyncFlow(target, outcome, action, causeForTarget);
    } else {
      setFieldState(target, outcome);
      cleanupValidation(target);
    }
  }

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

      const entry = requireEntry(name);
      const previousValue = entry.value.peekValue();
      const hasChanged = !deepEqual(previousValue, value);
      if (hasChanged) {
        entry.value.setValue(value, deepEqual);
      }

      if (markTouched) {
        entry.meta.isTouched.setValue(true);
      }

      if (incrementChanges && hasChanged) {
        entry.meta.numberOfChanges.setValue(
          entry.meta.numberOfChanges.peekValue() + 1,
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
        const entry = requireEntry(name);
        entry.meta.isTouched.setValue(false);
        entry.meta.numberOfChanges.setValue(0);
        entry.meta.numberOfSubmissions.setValue(0);
      }

      if (options?.validation) {
        setFieldState(name, { type: "idle" });
        cleanupValidation(name);
      }
    },
    touch: (name: keyof T) => {
      requireEntry(name).meta.isTouched.setValue(true);
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
          const entry = requireEntry(f);
          entry.meta.numberOfSubmissions.setValue(
            entry.meta.numberOfSubmissions.peekValue() + 1,
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

  function setFieldOptions<K extends keyof T>(
    name: K,
    opts: FieldOptionsConfig<T, K, D> | undefined,
  ) {
    if (!opts) {
      const prevKeys = targetToWatchKeys.get(name);
      if (prevKeys) {
        for (const k of prevKeys) {
          const set = reactions.get(k);
          if (set) {
            set.delete(name);
            if (set.size === 0) {
              reactions.delete(k);
            }
          }
        }
        targetToWatchKeys.delete(name);
      }
      fieldOptions.delete(name);
      return;
    }
    const internal = toInternalOptions(name, opts);
    fieldOptions.set(name, internal);
    registerReactionsFor(name, internal);
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
    options: FieldOptionsConfig<T, K, D>,
  ) {
    setFieldOptions(name, options);
  }

  function unregisterOptions(name: keyof T) {
    setFieldOptions(name, undefined);
  }

  const store: SignalFormStore<T, D> = {
    dispatchBlur,
    registerOptions,
    unregisterOptions,
    getField: requireEntry,
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

function useSignalField<
  T extends DefaultValues,
  K extends keyof T,
  D = unknown,
>(
  options: UseFieldSignalOptions<T, K, D>,
): Prettify<UseFieldSignalResult<T, K, D>> {
  const store = use(SignalStoreContext) as SignalFormStore<T, D> | null;

  if (!store) {
    throw new Error("useFieldSignal must be used within a SignalFormProvider");
  }

  const { name, debounceMs, on, respond, respondAsync, standardSchema } =
    options;

  useIsomorphicEffect(() => {
    store.registerOptions(name, {
      respond,
      debounceMs,
      on,
      respondAsync,
      standardSchema,
    });

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
  };
}

export function useSignalForm<T extends DefaultValues, D = unknown>(
  options: UseSignalFormOptions<T>,
): UseSignalFormResult<T, D> {
  const [formStore] = useState(() => createSignalFormStore<T, D>(options));

  return {
    formStore,
    Form: (props: React.ComponentProps<"form">) => (
      <SignalFormProvider formStore={formStore}>
        <form {...props} />
      </SignalFormProvider>
    ),
  };
}

export function createSignalFormHook<
  T extends DefaultValues,
  D = unknown,
>(): CreateSignalFormHookResult<T, D> {
  return {
    useSignalForm,
    useSignalField,
  };
}
