/* eslint-disable sonarjs/cognitive-complexity */

import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  useRef,
} from "react";
import { shallow } from "@al-formo/shallow";
import { deepEqual } from "@al-formo/deep-equal";
import {
  normalizeDebounceMs,
  normalizeNumber,
} from "@al-formo/normalize-number";
import {
  standardValidate,
  standardValidateAsync,
} from "@al-formo/standard-validate";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { useIsomorphicEffect } from "@al-formo/use-isomorphic-effect";

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

type FieldStateValid<TDetails = unknown> = {
  type: "valid";
  details?: TDetails;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateInvalid<TDetails = unknown> = {
  type: "invalid";
  issues: readonly StandardSchemaV1.Issue[];
  details?: TDetails;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateWarning<TDetails = unknown> = {
  type: "warning";
  issues: readonly StandardSchemaV1.Issue[];
  details?: TDetails;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStatePending<TDetails = unknown> = {
  type: "pending";
  details?: TDetails;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateValidating<TDetails = unknown> = {
  type: "validating";
  details?: TDetails;
  readonly [FIELD_STATE_BRAND]: true;
};

type FieldStateIdle<TDetails = unknown> = {
  type: "idle";
  details?: TDetails;
  readonly [FIELD_STATE_BRAND]: true;
};

export type ValidationStatus<TDetails = unknown> =
  | FieldStateValid<TDetails>
  | FieldStateInvalid<TDetails>
  | FieldStateWarning<TDetails>
  | FieldStatePending<TDetails>
  | FieldStateValidating<TDetails>
  | FieldStateIdle<TDetails>;

export type FinalValidationStatus<TDetails = unknown> =
  | FieldStateIdle<TDetails>
  | FieldStateValid<TDetails>
  | FieldStateInvalid<TDetails>
  | FieldStateWarning<TDetails>;

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

export type FieldSnapshot<TFieldValue, TDetails = unknown> = {
  value: TFieldValue;
  meta: FieldMeta;
  validation: ValidationStatus<TDetails>;
  isMounted: boolean;
};

type ScheduleHelper = {
  skip(): ValidationFlowSkip;
  auto(debounceMs?: number): ValidationFlowAuto;
  run(debounceMs?: number): ValidationFlowForce;
};

type ValidationHelper<TDetails = unknown> = {
  valid(p?: { details?: TDetails }): FieldStateValid<TDetails>;
  invalid(p?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: TDetails;
  }): FieldStateInvalid<TDetails>;
  warning(p?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: TDetails;
  }): FieldStateWarning<TDetails>;
  idle(p?: { details?: TDetails }): FieldStateIdle<TDetails>;
};

// =====================================
// Storage Types
// =====================================

type FieldEntry<TFieldValue, TDetails = unknown> = {
  value: TFieldValue;
  meta: FieldMeta;
  validation: ValidationStatus<TDetails>;
  snapshot: FieldSnapshot<TFieldValue, TDetails>;
};

type FieldMap<TValues extends DefaultValues, TDetails = unknown> = Map<
  keyof TValues,
  FieldEntry<TValues[keyof TValues], TDetails>
>;

// =====================================
// Internal Types
// =====================================

type RunningValidation<TFieldValue> = {
  stateSnapshot: TFieldValue;
  timeoutId?: ReturnType<typeof setTimeout>;
  abortController?: AbortController;
  validationId?: number;
};

type InternalFieldOptions<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails,
> = {
  name: TFieldName;
  standardSchema?: StandardSchemaV1<TValues[TFieldName]>;
  debounceMs?: number;
  respond?: (
    context:
      | RespondContext<TValues, TFieldName, TDetails>
      | RespondContextSync<TValues, TFieldName, TDetails>,
    props?: unknown,
  ) => FinalValidationStatus<TDetails> | ValidationSchedule | void;
  respondAsync?: (
    context: RespondAsyncContext<TValues, TFieldName, TDetails>,
    props?: unknown,
  ) => Promise<FinalValidationStatus<TDetails>>;
  watch: {
    self: Set<FieldEvent>;
    from: Map<Exclude<keyof TValues, TFieldName>, Set<FieldEvent>>;
  };
};

type InternalValidationHelper<TDetails = unknown> = {
  pending: (props?: { details?: TDetails }) => FieldStatePending<TDetails>;
  validating: (props?: {
    details?: TDetails;
  }) => FieldStateValidating<TDetails>;
};

// =====================================
// Store and Hook Types
// =====================================

type FormApi<TValues extends DefaultValues, TDetails = unknown> = {
  getSnapshot: <TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ) => FieldSnapshot<TValues[TFieldName], TDetails>;
};

type FormStore<TValues extends DefaultValues, TDetails = unknown> = {
  formApi: FormApi<TValues, TDetails>;
  getFieldEntry: <TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ) => FieldEntry<TValues[TFieldName], TDetails>;
  // Reactivity
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  getDepVersion: (depKey: DepKey) => number;
  select: SelectHelpers<TValues, TDetails>;
  mount: (fieldName: keyof TValues) => void;
  registerOptions: <TFieldName extends keyof TValues, TFieldProps = unknown>(
    fieldName: TFieldName,
    options: FieldOptions<TValues, TFieldName, TDetails, TFieldProps>,
  ) => void;
  unregisterOptions: (fieldName: keyof TValues) => void;
  unmount: (fieldName: keyof TValues) => void;
  setValue: (
    fieldName: keyof TValues,
    value: TValues[keyof TValues],
    options?: {
      markTouched?: boolean;
      incrementChanges?: boolean;
      dispatch?: boolean;
    },
  ) => void;
  setFieldProps: <TFieldProps>(
    fieldName: keyof TValues,
    props: TFieldProps | undefined,
    equality?: (
      a: TFieldProps | undefined,
      b: TFieldProps | undefined,
    ) => boolean,
  ) => void;
  blur: (fieldName: keyof TValues) => void;
  submit: (fields?: readonly (keyof TValues)[]) => void;
  reset: (
    fieldName: keyof TValues,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) => void;
};

type UseFieldReturn<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
> = {
  name: TFieldName;
  value: TValues[TFieldName];
  meta: FieldMeta;
  validation: ValidationStatus<TDetails>;
  setValue: (value: TValues[TFieldName]) => void;
  blur: () => void;
  formApi: FormApi<TValues, TDetails>;
};

export type UseFormReturn<TValues extends DefaultValues, TDetails = unknown> = {
  formApi: FormApi<TValues, TDetails>;
  Form: (props: React.ComponentProps<"form">) => React.ReactElement;
};

type UseFormOptions<TValues extends DefaultValues> = {
  defaultValues: TValues;
  debounceMs?: number;
  maxDispatchSteps?: number;
};

type CreateFormResult<TValues extends DefaultValues, TDetails = unknown> = {
  useForm: (
    options: UseFormOptions<TValues>,
  ) => UseFormReturn<TValues, TDetails>;
  useFormSelector: <TSelected, TSelectorProps = unknown>(
    selector: (
      s: SelectHelpers<TValues, TDetails>,
      props?: TSelectorProps,
    ) => TSelected,
    options?: {
      selectorEquality?: (a: TSelected, b: TSelected) => boolean;
      propsEquality?: (
        a: TSelectorProps | undefined,
        b: TSelectorProps | undefined,
      ) => boolean;
      props?: TSelectorProps;
    },
  ) => TSelected;
  useField: <TFieldName extends keyof TValues, TFieldDetails = TDetails, TFieldProps = unknown>(
    options: FieldOptions<TValues, TFieldName, TFieldDetails, TFieldProps>,
    propsOptions?: {
      props?: TFieldProps;
      propsEquality?: (
        a: TFieldProps | undefined,
        b: TFieldProps | undefined,
      ) => boolean;
    },
  ) => Prettify<UseFieldReturn<TValues, TFieldName, TFieldDetails>>;
  defineField: <TFieldName extends keyof TValues, TFieldDetails = TDetails, TFieldProps = unknown>(
    options: FieldOptions<TValues, TFieldName, TFieldDetails, TFieldProps>,
  ) => FieldOptions<TValues, TFieldName, TFieldDetails, TFieldProps>;
  defineSelector: <TSelected, TSelectorProps = unknown>(
    selector: (
      s: SelectHelpers<TValues, TDetails>,
      props?: TSelectorProps,
    ) => TSelected,
  ) => (
    s: SelectHelpers<TValues, TDetails>,
    props?: TSelectorProps,
  ) => TSelected;
  defineForm: (formOptions: UseFormOptions<TValues>) => UseFormOptions<TValues>;
};

// =====================================
// Graph Utilities
// =====================================

// Helpers to track visited edges without string concatenation
function hasVisitedEdge(
  visited: Map<PropertyKey, Map<PropertyKey, Set<FieldEvent>>>,
  watched: PropertyKey,
  target: PropertyKey,
  action: FieldEvent,
): boolean {
  const byWatched = visited.get(watched);
  if (!byWatched) {
    return false;
  }
  const byTarget = byWatched.get(target);
  if (!byTarget) {
    return false;
  }
  return byTarget.has(action);
}

function markVisitedEdge(
  visited: Map<PropertyKey, Map<PropertyKey, Set<FieldEvent>>>,
  watched: PropertyKey,
  target: PropertyKey,
  action: FieldEvent,
): void {
  const byWatched =
    visited.get(watched) ?? new Map<PropertyKey, Set<FieldEvent>>();
  const byTarget = byWatched.get(target) ?? new Set<FieldEvent>();
  byTarget.add(action);
  byWatched.set(target, byTarget);
  visited.set(watched, byWatched);
}

// =====================================
// Dependency Keys (per-slice tracking)
// =====================================

type SliceId = "value" | "meta" | "validation" | "mounted" | "snapshot";

type DepKey = { slice: SliceId; field: PropertyKey };

function makeCauseForTarget<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
>(
  target: TFieldName,
  causeField: keyof TValues,
  action: FieldEvent,
):
  | { isSelf: true; field: TFieldName; action: FieldEvent }
  | {
      isSelf: false;
      field: Exclude<keyof TValues, TFieldName>;
      action: FieldEvent;
    } {
  if (causeField === target) {
    return { isSelf: true, field: target, action };
  }
  return {
    isSelf: false,
    field: causeField as Exclude<keyof TValues, TFieldName>,
    action,
  };
}

// =====================================
// Respond Contexts (sync/async)
// =====================================

type FieldFormApi<TValues extends DefaultValues, TDetails = unknown> = {
  setValue: <TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    value: TValues[TFieldName],
    options?: {
      markTouched?: boolean;
      incrementChanges?: boolean;
      dispatch?: boolean;
    },
  ) => void;
  reset: (
    fieldName: keyof TValues,
    options?: { meta?: boolean; validation?: boolean; dispatch?: boolean },
  ) => void;
  touch: (fieldName: keyof TValues) => void;
  submit: (fields?: readonly (keyof TValues)[]) => void;
  getSnapshot: <TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ) => FieldSnapshot<TValues[TFieldName], TDetails>;
};

type FieldCause<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
> =
  | { isSelf: true; field: TFieldName; action: FieldEvent }
  | {
      isSelf: false;
      field: Exclude<keyof TValues, TFieldName>;
      action: FieldEvent;
    };

export type RespondContext<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
> = {
  action: FieldEvent;
  cause: FieldCause<TValues, TFieldName>;
  value: TValues[TFieldName];
  current: Prettify<FieldSnapshot<TValues[TFieldName], TDetails>>;
  form: FieldFormApi<TValues, TDetails>;
  helpers: {
    validation: ValidationHelper<TDetails>;
    schedule: ScheduleHelper;
    validateWithSchema: () => readonly StandardSchemaV1.Issue[] | undefined;
  };
};

// Sync-only variant of RespondContext without the schedule helper (no async flow control)
export type RespondContextSync<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
> = {
  action: FieldEvent;
  cause: FieldCause<TValues, TFieldName>;
  value: TValues[TFieldName];
  current: Prettify<FieldSnapshot<TValues[TFieldName], TDetails>>;
  form: FieldFormApi<TValues, TDetails>;
  helpers: {
    validation: ValidationHelper<TDetails>;
    validateWithSchema: () => readonly StandardSchemaV1.Issue[] | undefined;
  };
};

type RespondAsyncContext<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
> = {
  action: FieldEvent;
  cause: FieldCause<TValues, TFieldName>;
  value: TValues[TFieldName];
  current: Prettify<FieldSnapshot<TValues[TFieldName], TDetails>>;
  signal: AbortSignal;
  helpers: {
    validation: ValidationHelper<TDetails>;
    validateWithSchemaAsync: () => Promise<
      readonly StandardSchemaV1.Issue[] | undefined
    >;
  };
  form: FieldFormApi<TValues, TDetails>;
};

// =====================================
// Public Options (sync/async) for useField
// =====================================

type SyncOnlyFieldOptionsExtension<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
  TFieldProps = unknown,
> = {
  standardSchema?: StandardSchemaV1<TValues[TFieldName]>;
  watch?: {
    self?: FieldEvent[];
    fields?: [Exclude<keyof TValues, TFieldName>] extends [never]
      ? never
      : Partial<
          Record<Exclude<keyof TValues, TFieldName>, FieldEvent[] | true>
        >;
  };
  respond: (
    context: Prettify<RespondContextSync<TValues, TFieldName, TDetails>>,
    props?: TFieldProps,
  ) => FinalValidationStatus<TDetails> | void;
  respondAsync?: never;
  debounceMs?: never;
};

type AsyncOnlyFieldOptionsExtension<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
  TFieldProps = unknown,
> = {
  standardSchema?: StandardSchemaV1<TValues[TFieldName]>;
  watch?: {
    self?: FieldEvent[];
    fields?: [Exclude<keyof TValues, TFieldName>] extends [never]
      ? never
      : Partial<
          Record<Exclude<keyof TValues, TFieldName>, FieldEvent[] | true>
        >;
  };
  respond?: never;
  respondAsync: (
    context: Prettify<RespondAsyncContext<TValues, TFieldName, TDetails>>,
    props?: TFieldProps,
  ) => Promise<FinalValidationStatus<TDetails>>;
  debounceMs?: number;
};

type SyncAsyncFieldOptionsExtension<
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
  TFieldProps = unknown,
> = {
  standardSchema?: StandardSchemaV1<TValues[TFieldName]>;
  watch?: {
    self?: FieldEvent[];
    fields?: [Exclude<keyof TValues, TFieldName>] extends [never]
      ? never
      : Partial<
          Record<Exclude<keyof TValues, TFieldName>, FieldEvent[] | true>
        >;
  };
  respond: (
    context: Prettify<RespondContext<TValues, TFieldName, TDetails>>,
    props?: TFieldProps,
  ) => FinalValidationStatus<TDetails> | ValidationSchedule | void;
  respondAsync: (
    context: Prettify<RespondAsyncContext<TValues, TFieldName, TDetails>>,
    props?: TFieldProps,
  ) => Promise<FinalValidationStatus<TDetails>>;
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
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
  TFieldProps = unknown,
> = Prettify<
  {
    name: TFieldName;
  } & (
    | SyncOnlyFieldOptionsExtension<TValues, TFieldName, TDetails, TFieldProps>
    | AsyncOnlyFieldOptionsExtension<TValues, TFieldName, TDetails, TFieldProps>
    | SyncAsyncFieldOptionsExtension<TValues, TFieldName, TDetails, TFieldProps>
    | NoValidationFieldOptionsExtension
  )
>;

// =====================================
// Async Flow Helpers
// =====================================

function shouldSkipAutoValidation<TFieldValue>(
  running: RunningValidation<TFieldValue> | undefined,
  currentValue: TFieldValue,
  lastValue: TFieldValue | undefined,
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
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails,
  TFieldProps,
>(
  fieldName: TFieldName,
  options: FieldOptions<TValues, TFieldName, TDetails, TFieldProps>,
): InternalFieldOptions<TValues, TFieldName, TDetails> {
  const triggersSelf = new Set<FieldEvent>(options.watch?.self ?? EVENTS);
  const from = new Map<Exclude<keyof TValues, TFieldName>, Set<FieldEvent>>();
  if (options.watch?.fields) {
    for (const key of Object.keys(options.watch.fields) as Exclude<
      keyof TValues,
      TFieldName
    >[]) {
      const val = options.watch.fields[key];
      const actions = new Set<FieldEvent>(val === true ? EVENTS : (val ?? []));
      from.set(key, actions);
    }
  }
  return {
    name: fieldName,
    standardSchema: options.standardSchema,
    debounceMs: options.debounceMs,
    respond: options.respond as (
      context:
        | RespondContext<TValues, TFieldName, TDetails>
        | RespondContextSync<TValues, TFieldName, TDetails>,
      props?: unknown,
    ) => FinalValidationStatus<TDetails> | ValidationSchedule | void,
    respondAsync: options.respondAsync as (
      context: RespondAsyncContext<TValues, TFieldName, TDetails>,
      props?: unknown,
    ) => Promise<FinalValidationStatus<TDetails>>,
    watch: { self: triggersSelf, from },
  } satisfies InternalFieldOptions<TValues, TFieldName, TDetails>;
}

const StoreContext = createContext<unknown>(null);

// =====================================
// Provider Component
// =====================================

function FormProvider<TValues extends DefaultValues, TDetails = unknown>({
  children,
  formStore,
}: Readonly<{
  children: React.ReactNode;
  formStore: FormStore<TValues, TDetails>;
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

function createFormStore<TValues extends DefaultValues, TDetails = unknown>(
  options: UseFormOptions<TValues>,
): FormStore<TValues, TDetails> {
  const { defaultValues } = options;

  const defaultDebounceMs = normalizeDebounceMs(
    options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );

  // -- Validation constructors
  function valid(props?: { details?: TDetails }): FieldStateValid<TDetails> {
    return {
      type: "valid",
      details: props?.details,
    } as FieldStateValid<TDetails>;
  }

  function invalid(props?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: TDetails;
  }): FieldStateInvalid<TDetails> {
    return {
      type: "invalid",
      issues: props?.issues ?? [],
      details: props?.details,
    } as FieldStateInvalid<TDetails>;
  }

  function warning(props?: {
    issues?: readonly StandardSchemaV1.Issue[];
    details?: TDetails;
  }): FieldStateWarning<TDetails> {
    return {
      type: "warning",
      issues: props?.issues ?? [],
      details: props?.details,
    } as FieldStateWarning<TDetails>;
  }

  function idle(props?: { details?: TDetails }): FieldStateIdle<TDetails> {
    return {
      type: "idle",
      details: props?.details,
    } as FieldStateIdle<TDetails>;
  }

  function pending(props?: {
    details?: TDetails;
  }): FieldStatePending<TDetails> {
    return {
      type: "pending",
      details: props?.details,
    } as FieldStatePending<TDetails>;
  }

  function validating(props?: {
    details?: TDetails;
  }): FieldStateValidating<TDetails> {
    return {
      type: "validating",
      details: props?.details,
    } as FieldStateValidating<TDetails>;
  }

  // -- Helper bundles exposed to user callbacks
  const validationHelper: ValidationHelper<TDetails> = {
    idle,
    invalid,
    valid,
    warning,
  };

  const scheduleHelper: ScheduleHelper = { auto, run, skip };

  const internalValidationHelper: InternalValidationHelper<TDetails> = {
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
  const fieldsMap: FieldMap<TValues, TDetails> = new Map();

  const defaultValuesEntries = Object.entries(defaultValues) as [
    fieldName: keyof TValues,
    value: TValues[keyof TValues],
  ][];

  for (const [fieldName, value] of defaultValuesEntries) {
    const meta: FieldMeta = {
      isTouched: false,
      changeCount: 0,
      submitCount: 0,
    };
    const validation = validationHelper.idle() as ValidationStatus<TDetails>;
    const snapshot: FieldSnapshot<TValues[typeof fieldName], TDetails> = {
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

  const mountedFields = new Set<keyof TValues>();

  const fieldOptions = new Map<keyof TValues, unknown>();

  function getFieldOptions<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ): InternalFieldOptions<TValues, TFieldName, TDetails> | undefined {
    return fieldOptions.get(fieldName) as
      | InternalFieldOptions<TValues, TFieldName, TDetails>
      | undefined;
  }

  const reactions = new Map<
    keyof TValues,
    Map<FieldEvent, Set<keyof TValues>>
  >();
  const targetReactionKeys = new Map<
    keyof TValues,
    Map<keyof TValues, Set<FieldEvent>>
  >();
  const runningValidations = new Map<
    keyof TValues,
    RunningValidation<TValues[keyof TValues]>
  >();
  const lastValidatedValue = new Map<keyof TValues, TValues[keyof TValues]>();
  const lastValidatedChanges = new Map<keyof TValues, number>();
  const validationIds = new Map<keyof TValues, number>();
  const fieldPropsMap = new Map<keyof TValues, unknown>();
  const fieldMountCounts = new Map<keyof TValues, number>();
  const depVersionsBySlice = new Map<SliceId, Map<keyof TValues, number>>();

  function bumpDepVersion(slice: SliceId, fieldName: keyof TValues) {
    const bySlice =
      depVersionsBySlice.get(slice) ?? new Map<keyof TValues, number>();
    const next = (bySlice.get(fieldName) ?? 0) + 1;
    bySlice.set(fieldName, next);
    depVersionsBySlice.set(slice, bySlice);
  }

  function readDepVersion(depKey: DepKey): number {
    const bySlice = depVersionsBySlice.get(depKey.slice);
    if (!bySlice) {
      return 0;
    }
    return bySlice.get(depKey.field as keyof TValues) ?? 0;
  }

  function clearDepVersionsForField(fieldName: keyof TValues) {
    depVersionsBySlice.get("value")?.delete(fieldName);
    depVersionsBySlice.get("meta")?.delete(fieldName);
    depVersionsBySlice.get("validation")?.delete(fieldName);
    depVersionsBySlice.get("mounted")?.delete(fieldName);
    depVersionsBySlice.get("snapshot")?.delete(fieldName);
  }

  // -- Snapshot and dependency helpers (deduplicated)
  function buildSnapshotFor<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    entry: FieldEntry<TValues[TFieldName], TDetails>,
  ): FieldSnapshot<TValues[TFieldName], TDetails> {
    return {
      value: entry.value,
      meta: entry.meta,
      validation: entry.validation,
      isMounted: mountedFields.has(fieldName),
    } as FieldSnapshot<TValues[TFieldName], TDetails>;
  }

  function updateSnapshotAndDeps(
    fieldName: keyof TValues,
    changedSlices: Iterable<SliceId>,
  ): void {
    const entry = getFieldEntry(fieldName);
    entry.snapshot = buildSnapshotFor(fieldName, entry);
    const seen = new Set<SliceId>();
    for (const slice of changedSlices) {
      if (slice !== "snapshot" && !seen.has(slice)) {
        bumpDepVersion(slice, fieldName);
        seen.add(slice);
      }
    }
    bumpDepVersion("snapshot", fieldName);
    markDirty();
  }

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

  function getRunningValidation<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ): RunningValidation<TValues[TFieldName]> | undefined {
    return runningValidations.get(fieldName) as
      | RunningValidation<TValues[TFieldName]>
      | undefined;
  }

  function setRunningValidation<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    value: RunningValidation<TValues[TFieldName]>,
  ): void {
    runningValidations.set(
      fieldName,
      value as RunningValidation<TValues[keyof TValues]>,
    );
  }

  const watcherTransaction = {
    active: false,
    depth: 0,
    visited: new Map<PropertyKey, Map<PropertyKey, Set<FieldEvent>>>(),
    steps: 0,
    maxSteps: maxDispatchSteps,
    bailOut: false,
  };

  // -- Internal getters/setters
  function getFieldEntry<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ): FieldEntry<TValues[TFieldName], TDetails> {
    const entry = fieldsMap.get(fieldName);

    invariant(entry, `Unknown field: ${String(fieldName)}`);

    // The map is keyed by K so this cast is safe
    return entry as FieldEntry<TValues[TFieldName], TDetails>;
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
  function cleanupValidation(fieldName: keyof TValues) {
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

  function clearValidationTimeout(fieldName: keyof TValues) {
    const runningValidation = getRunningValidation(fieldName);
    if (!runningValidation) {
      return;
    }
    runningValidation.timeoutId = undefined;
  }

  function incrementValidationId(fieldName: keyof TValues) {
    const next = (validationIds.get(fieldName) ?? 0) + 1;
    validationIds.set(fieldName, next);
    return next;
  }

  function setFieldState(
    fieldName: keyof TValues,
    state: ValidationStatus<TDetails>,
  ) {
    const entry = getFieldEntry(fieldName);
    if (!deepEqual(entry.validation, state)) {
      entry.validation = state;
      updateSnapshotAndDeps(fieldName, ["validation"]);
    }
  }

  function setLastValidatedValue<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    value: TValues[TFieldName],
  ) {
    lastValidatedValue.set(fieldName, value);
  }

  function getLastValidatedValue<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ): TValues[TFieldName] | undefined {
    return lastValidatedValue.get(fieldName) as TValues[TFieldName] | undefined;
  }

  function scheduleValidation<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    value: TValues[TFieldName],
    debounceMs: number,
    action: FieldEvent,
    cause:
      | { isSelf: true; field: TFieldName; action: FieldEvent }
      | {
          isSelf: false;
          field: Exclude<keyof TValues, TFieldName>;
          action: FieldEvent;
        },
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

  function runValidation<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    value: TValues[TFieldName],
    action: FieldEvent,
    cause:
      | { isSelf: true; field: TFieldName; action: FieldEvent }
      | {
          isSelf: false;
          field: Exclude<keyof TValues, TFieldName>;
          action: FieldEvent;
        },
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

  function handleAsyncFlow<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    flow: ValidationSchedule,
    action: FieldEvent,
    cause:
      | { isSelf: true; field: TFieldName; action: FieldEvent }
      | {
          isSelf: false;
          field: Exclude<keyof TValues, TFieldName>;
          action: FieldEvent;
        },
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
  function runRespond<TFieldName extends keyof TValues>(
    target: TFieldName,
    causeField: TFieldName | Exclude<keyof TValues, TFieldName>,
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
    const causeForTarget = makeCauseForTarget<TValues, TFieldName>(
      target,
      causeField,
      action,
    );

    if (!options.respond && options.respondAsync) {
      // No sync respond provided, but async path configured: run async
      handleAsyncFlow(target, scheduleHelper.run(), action, causeForTarget);
      return;
    }

    const value = getFieldEntry(target).value;
    const currentView = getSnapshot(target);
    const standardSchema = options.standardSchema;

    let result: FinalValidationStatus<TDetails> | ValidationSchedule | void;
    const props = fieldPropsMap.get(target);
    if (options.respondAsync) {
      const context: RespondContext<TValues, TFieldName, TDetails> = {
        action,
        cause: causeForTarget as
          | { isSelf: true; field: TFieldName; action: FieldEvent }
          | {
              isSelf: false;
              field: Exclude<keyof TValues, TFieldName>;
              action: FieldEvent;
            },
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
      const ctxSync: RespondContextSync<TValues, TFieldName, TDetails> = {
        action,
        cause: causeForTarget as
          | { isSelf: true; field: TFieldName; action: FieldEvent }
          | {
              isSelf: false;
              field: Exclude<keyof TValues, TFieldName>;
              action: FieldEvent;
            },
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

    let outcome: FinalValidationStatus<TDetails> | ValidationSchedule =
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
  function dispatch(watched: keyof TValues, action: FieldEvent) {
    runInDispatchTransaction(() => {
      const targets = reactions.get(watched)?.get(action);
      if (!targets) {
        return;
      }
      for (const target of targets) {
        if (watcherTransaction.bailOut) {
          break;
        }
        const isSelfEdge = target === watched;
        if (
          hasVisitedEdge(watcherTransaction.visited, watched, target, action)
        ) {
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

          if (process.env["NODE_ENV"] !== "production") {
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
          }
          break;
        }
        markVisitedEdge(watcherTransaction.visited, watched, target, action);
        if (!isSelfEdge) {
          watcherTransaction.steps += 1;
        }
        runRespond(target, watched, action);
      }
    });
  }

  function clearPreviousReactionsFor(
    target: keyof TValues,
  ): Map<keyof TValues, Set<FieldEvent>> {
    const previous = targetReactionKeys.get(target);
    if (!previous) {
      return new Map<keyof TValues, Set<FieldEvent>>();
    }
    for (const [watched, actions] of previous.entries()) {
      const actionMap = reactions.get(watched);
      if (!actionMap) {
        continue;
      }
      for (const action of actions) {
        const setForAction = actionMap.get(action);
        if (!setForAction) {
          continue;
        }
        setForAction.delete(target);
        if (setForAction.size === 0) {
          actionMap.delete(action);
        }
      }
      if (actionMap.size === 0) {
        reactions.delete(watched);
      }
    }
    previous.clear();
    return previous;
  }

  function addReactions(
    watched: keyof TValues,
    actions: Set<FieldEvent>,
    target: keyof TValues,
    keysForTarget: Map<keyof TValues, Set<FieldEvent>>,
  ) {
    const actionMap =
      reactions.get(watched) ?? new Map<FieldEvent, Set<keyof TValues>>();
    for (const action of actions) {
      const setForAction = actionMap.get(action) ?? new Set<keyof TValues>();
      setForAction.add(target);
      actionMap.set(action, setForAction);
      const perWatched = keysForTarget.get(watched) ?? new Set<FieldEvent>();
      perWatched.add(action);
      keysForTarget.set(watched, perWatched);
    }
    reactions.set(watched, actionMap);
  }

  function registerReactionsFor<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    internal: InternalFieldOptions<TValues, TFieldName, TDetails>,
  ) {
    const keysForTarget = clearPreviousReactionsFor(fieldName);

    // Honor explicit empty trigger arrays by not falling back to ALL actions
    addReactions(fieldName, internal.watch.self, fieldName, keysForTarget);

    for (const [watched, actions] of internal.watch.from.entries()) {
      // Honor explicit empty arrays for cross-field watch as well
      addReactions(watched, actions, fieldName, keysForTarget);
    }

    targetReactionKeys.set(fieldName, keysForTarget);
  }

  function setValue<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    value: TValues[TFieldName],
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
      const changedSlices = new Set<SliceId>();
      if (hasChanged) {
        entry.value = value;
        changedSlices.add("value");
      }

      if (markTouched && !entry.meta.isTouched) {
        entry.meta = { ...entry.meta, isTouched: true };
        changedSlices.add("meta");
      }

      if (incrementChanges && hasChanged) {
        entry.meta = {
          ...entry.meta,
          changeCount: entry.meta.changeCount + 1,
        };
        changedSlices.add("meta");
      }

      if (changedSlices.size > 0) {
        updateSnapshotAndDeps(fieldName, changedSlices);
      }

      if (shouldDispatch && hasChanged) {
        dispatch(fieldName, "change");
      }
    });
  }
  function reset(
    fieldName: keyof TValues,
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
        updateSnapshotAndDeps(fieldName, ["meta"]);
      }

      if (options?.validation) {
        setFieldState(fieldName, validationHelper.idle());
        cleanupValidation(fieldName);
      }
    });
  }
  function touch(fieldName: keyof TValues) {
    runInDispatchTransaction(() => {
      const entry = getFieldEntry(fieldName);
      if (!entry.meta.isTouched) {
        entry.meta = { ...entry.meta, isTouched: true };
        updateSnapshotAndDeps(fieldName, ["meta"]);
      }
    });
  }
  function submit(fieldNames?: readonly (keyof TValues)[]) {
    const toSubmit = new Set(
      fieldNames ?? (Object.keys(defaultValues) as (keyof TValues)[]),
    );
    runInDispatchTransaction(() => {
      for (const fieldName of toSubmit) {
        if (!mountedFields.has(fieldName)) {
          continue;
        }
        const entry = getFieldEntry(fieldName);
        entry.meta = { ...entry.meta, submitCount: entry.meta.submitCount + 1 };
        updateSnapshotAndDeps(fieldName, ["meta"]);
        dispatch(fieldName, "submit");
        if (watcherTransaction.bailOut) {
          break;
        }
      }
    });
  }

  // -- Options helpers (extracted to reduce complexity)
  function unregisterFieldOptions(fieldName: keyof TValues) {
    cleanupValidation(fieldName);
    clearPreviousReactionsFor(fieldName);
    targetReactionKeys.delete(fieldName);
    fieldOptions.delete(fieldName);
    // Cleanup auxiliary maps for dynamic fields
    fieldPropsMap.delete(fieldName);
    lastValidatedValue.delete(fieldName);
    lastValidatedChanges.delete(fieldName);
    validationIds.delete(fieldName);
    clearDepVersionsForField(fieldName);
  }

  function settleIfAsyncDisabled<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
    internal: InternalFieldOptions<TValues, TFieldName, TDetails>,
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
  function setFieldOptions<
    TFieldName extends keyof TValues,
    TFieldProps = unknown,
  >(
    fieldName: TFieldName,
    options:
      | FieldOptions<TValues, TFieldName, TDetails, TFieldProps>
      | undefined,
  ) {
    // Wrap in a dispatch transaction so any state changes (e.g. settling
    // pending/validating when switching off async) notify subscribers.
    runInDispatchTransaction(() => {
      if (!options) {
        unregisterFieldOptions(fieldName);
        return;
      }
      const internal = normalizeFieldOptions<
        TValues,
        TFieldName,
        TDetails,
        TFieldProps
      >(fieldName, options);
      fieldOptions.set(fieldName, internal);
      registerReactionsFor(fieldName, internal);
      settleIfAsyncDisabled(fieldName, internal);
    });
  }

  function mount(fieldName: keyof TValues) {
    runInDispatchTransaction(() => {
      const nextCount = (fieldMountCounts.get(fieldName) ?? 0) + 1;
      fieldMountCounts.set(fieldName, nextCount);
      if (!mountedFields.has(fieldName)) {
        mountedFields.add(fieldName);
        updateSnapshotAndDeps(fieldName, ["mounted"]);
        dispatch(fieldName, "mount");
      } else if (process.env["NODE_ENV"] !== "production" && nextCount > 1) {
        console.warn(
          `useField: multiple mounts detected for field "${String(
            fieldName,
          )}" within the same store. This can cause unexpected behavior.`,
        );
      }
    });
  }

  function unmount(fieldName: keyof TValues) {
    runInDispatchTransaction(() => {
      const current = fieldMountCounts.get(fieldName) ?? 0;
      const next = Math.max(0, current - 1);
      if (next === 0) {
        fieldMountCounts.delete(fieldName);
        if (mountedFields.has(fieldName)) {
          mountedFields.delete(fieldName);
          updateSnapshotAndDeps(fieldName, ["mounted"]);
        }
      } else {
        fieldMountCounts.set(fieldName, next);
      }
      cleanupValidation(fieldName);
    });
  }

  function blur(fieldName: keyof TValues) {
    dispatch(fieldName, "blur");
  }

  function registerOptions<
    TFieldName extends keyof TValues,
    TFieldProps = unknown,
  >(
    fieldName: TFieldName,
    options: FieldOptions<TValues, TFieldName, TDetails, TFieldProps>,
  ) {
    setFieldOptions(fieldName, options);
  }

  function unregisterOptions(fieldName: keyof TValues) {
    setFieldOptions(fieldName, undefined);
  }

  function getSnapshot<TFieldName extends keyof TValues>(
    fieldName: TFieldName,
  ): FieldSnapshot<TValues[TFieldName], TDetails> {
    const field = getFieldEntry(fieldName);
    // Return cached snapshot to preserve reference stability
    return field.snapshot;
  }

  function setFieldProps<TFieldProps>(
    fieldName: keyof TValues,
    props: TFieldProps | undefined,
    equality: (
      a: TFieldProps | undefined,
      b: TFieldProps | undefined,
    ) => boolean = shallow,
  ) {
    const prev = fieldPropsMap.get(fieldName) as TFieldProps | undefined;
    if (equality(prev, props)) {
      return;
    }
    // Check if there are any listeners for the "props" event to avoid unnecessary dispatch
    const hasPropsListeners =
      (reactions.get(fieldName)?.get("props")?.size ?? 0) > 0;

    if (!hasPropsListeners) {
      fieldPropsMap.set(fieldName, props);
      return;
    }

    // Wrap set+dispatch in a dispatch transaction for consistency with other mutators
    runInDispatchTransaction(() => {
      fieldPropsMap.set(fieldName, props);
      // Dispatch props event to allow respond/respondAsync to consider new props
      dispatch(fieldName, "props");
    });
  }

  // -- Select helpers (first-class)
  const select: SelectHelpers<TValues, TDetails> = {
    value<TFieldName extends keyof TValues>(
      name: TFieldName,
    ): TValues[TFieldName] {
      return getFieldEntry(name).value;
    },
    meta(name: keyof TValues): FieldMeta {
      return getFieldEntry(name).meta;
    },
    validation(name: keyof TValues): ValidationStatus<TDetails> {
      return getFieldEntry(name).validation;
    },
    snapshot<TFieldName extends keyof TValues>(
      name: TFieldName,
    ): FieldSnapshot<TValues[TFieldName], TDetails> {
      return getSnapshot(name);
    },
    mounted(name: keyof TValues): boolean {
      return mountedFields.has(name);
    },
  };

  const store: FormStore<TValues, TDetails> = {
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
      return readDepVersion(depKey);
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
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
  TFieldProps = undefined,
>(
  options: FieldOptions<TValues, TFieldName, TDetails, TFieldProps>,
): FieldOptions<TValues, TFieldName, TDetails, TFieldProps> {
  return options;
}

function defineForm<TValues extends DefaultValues>(
  formOptions: UseFormOptions<TValues>,
): UseFormOptions<TValues> {
  return formOptions;
}

function defineSelector<
  TValues extends DefaultValues,
  TDetails = unknown,
  TSelected = unknown,
  TSelectorProps = undefined,
>(
  selector: (
    s: SelectHelpers<TValues, TDetails>,
    props?: TSelectorProps,
  ) => TSelected,
): (s: SelectHelpers<TValues, TDetails>, props?: TSelectorProps) => TSelected {
  return selector;
}

// First-class select helpers typing
export type SelectHelpers<TValues extends DefaultValues, TDetails = unknown> = {
  value: <TFieldName extends keyof TValues>(
    name: TFieldName,
  ) => TValues[TFieldName];
  meta: (name: keyof TValues) => FieldMeta;
  validation: (name: keyof TValues) => ValidationStatus<TDetails>;
  snapshot: <TFieldName extends keyof TValues>(
    name: TFieldName,
  ) => FieldSnapshot<TValues[TFieldName], TDetails>;
  mounted: (name: keyof TValues) => boolean;
};

// =====================================
// useFormSelector (Context)
// =====================================

export function useFormSelector<
  TValues extends DefaultValues,
  TDetails = unknown,
  TSelected = unknown,
  TSelectorProps = unknown,
>(
  selector: (
    s: SelectHelpers<TValues, TDetails>,
    props?: TSelectorProps,
  ) => TSelected,
  options?: {
    selectorEquality?: (a: TSelected, b: TSelected) => boolean;
    propsEquality?: (
      a: TSelectorProps | undefined,
      b: TSelectorProps | undefined,
    ) => boolean;
    props?: TSelectorProps;
  },
): TSelected {
  const store = use(StoreContext) as FormStore<TValues, TDetails> | null;
  invariant(store, "useFormSelector must be used within a FormProvider");

  const {
    selectorEquality = shallow,
    propsEquality = shallow,
    props,
  } = options ?? {};

  const lastSelectedRef = useRef<TSelected | undefined>(undefined);
  const lastPropsRef = useRef<TSelectorProps | undefined>(undefined);
  const usedDepsBySliceRef = useRef<Map<SliceId, Set<keyof TValues>>>(
    new Map(),
  );
  const lastDepVersionsRef = useRef<Map<SliceId, Map<keyof TValues, number>>>(
    new Map(),
  );

  const getSelected = useCallback(() => {
    const prev = lastSelectedRef.current;
    const propsChanged = !propsEquality(lastPropsRef.current, props);
    // Fast path: if props didn't change and none of the previously used
    // dependencies changed, return previous selection to preserve referential
    // stability and avoid re-computation.
    if (!propsChanged && prev !== undefined) {
      let anyChanged = false;
      for (const [slice, fields] of usedDepsBySliceRef.current) {
        const lastByField: Map<keyof TValues, number> =
          lastDepVersionsRef.current.get(slice) ??
          new Map<keyof TValues, number>();
        for (const field of fields) {
          const last = lastByField.get(field) ?? 0;
          const curr = store.getDepVersion({ slice, field });
          if (last !== curr) {
            anyChanged = true;
            break;
          }
        }
        if (anyChanged) {
          break;
        }
      }
      if (!anyChanged) {
        return prev;
      }
    }

    // Track dependencies during selection
    const nextUsed = new Map<SliceId, Set<keyof TValues>>();
    const trackingSelect: SelectHelpers<TValues, TDetails> = {
      value: <TFieldName extends keyof TValues>(
        name: TFieldName,
      ): TValues[TFieldName] => {
        const set = nextUsed.get("value") ?? new Set<keyof TValues>();
        set.add(name);
        nextUsed.set("value", set);
        return store.select.value(name);
      },
      meta: (name) => {
        const set = nextUsed.get("meta") ?? new Set<keyof TValues>();
        set.add(name);
        nextUsed.set("meta", set);
        return store.select.meta(name);
      },
      validation: (name) => {
        const set = nextUsed.get("validation") ?? new Set<keyof TValues>();
        set.add(name);
        nextUsed.set("validation", set);
        return store.select.validation(name);
      },
      snapshot: <TFieldName extends keyof TValues>(
        name: TFieldName,
      ): FieldSnapshot<TValues[TFieldName], TDetails> => {
        const set = nextUsed.get("snapshot") ?? new Set<keyof TValues>();
        set.add(name);
        nextUsed.set("snapshot", set);
        return store.select.snapshot(name);
      },
      mounted: (name) => {
        const set = nextUsed.get("mounted") ?? new Set<keyof TValues>();
        set.add(name);
        nextUsed.set("mounted", set);
        return store.select.mounted(name);
      },
    };

    const next = selector(trackingSelect, props);

    // Snapshot dependency versions for the next run
    const newVersions = new Map<SliceId, Map<keyof TValues, number>>();
    for (const [slice, fields] of nextUsed) {
      const versionsByField = new Map<keyof TValues, number>();
      for (const field of fields) {
        versionsByField.set(field, store.getDepVersion({ slice, field }));
      }
      newVersions.set(slice, versionsByField);
    }

    // Determine returned reference based on equality
    const prevSelected = lastSelectedRef.current;
    let result = next;
    if (prevSelected !== undefined && selectorEquality(prevSelected, next)) {
      result = prevSelected;
    }

    usedDepsBySliceRef.current = nextUsed;
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
  TValues extends DefaultValues,
  TFieldName extends keyof TValues,
  TDetails = unknown,
  TFieldProps = unknown,
>(
  options: FieldOptions<TValues, TFieldName, TDetails, TFieldProps>,
  propsOptions?: {
    props?: TFieldProps;
    propsEquality?: (
      a: TFieldProps | undefined,
      b: TFieldProps | undefined,
    ) => boolean;
  },
): Prettify<UseFieldReturn<TValues, TFieldName, TDetails>> {
  const store = use(StoreContext) as FormStore<TValues, TDetails> | null;

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
    } as FieldOptions<TValues, TFieldName, TDetails, TFieldProps>);

    return () => {
      store.unregisterOptions(name);
    };
  }, [debounceMs, name, watch, respond, respondAsync, standardSchema, store]);

  useIsomorphicEffect(() => {
    store.setFieldProps(name, props, propsEquality);
  }, [name, props, propsEquality, store]);

  useIsomorphicEffect(() => {
    store.mount(name);

    return () => {
      store.unmount(name);
    };
  }, [name, store]);

  const { value, meta, validation } = useFormSelector(
    useCallback(
      (select: SelectHelpers<TValues, TDetails>) => {
        return {
          value: select.value(name),
          meta: select.meta(name),
          validation: select.validation(name),
        };
      },
      [name],
    ),
  );

  const setValue = useCallback(
    (value: TValues[TFieldName]) => {
      store.setValue(name, value);
    },
    [name, store],
  );

  const blur = useCallback(() => {
    store.blur(name);
  }, [name, store]);

  const formApi = useMemo(() => store.formApi, [store]);

  return { blur, formApi, meta, name, setValue, validation, value };
}

export function useForm<TValues extends DefaultValues, TDetails = unknown>(
  options: UseFormOptions<TValues>,
): UseFormReturn<TValues, TDetails> {
  const [formStore] = useState(() =>
    createFormStore<TValues, TDetails>(options),
  );

  const Form = useCallback(
    (props: React.ComponentProps<"form">) => (
      <FormProvider formStore={formStore}>
        <form {...props} />
      </FormProvider>
    ),
    [formStore],
  );

  const formApi = useMemo(() => formStore.formApi, [formStore]);

  return { Form, formApi };
}

export function createForm<
  TValues extends DefaultValues,
  TDetails = unknown,
>(): CreateFormResult<TValues, TDetails> {
  return {
    defineField,
    defineForm,
    defineSelector,
    useField,
    useForm,
    useFormSelector,
  };
}
