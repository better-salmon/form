import { useSyncExternalStore } from "react";

/**
 * @module signals
 *
 * Tiny, dependency-free reactive primitives ("signals") with a minimal API.
 *
 * Core ideas:
 * - A `Signal<T>` holds a value and notifies subscribers synchronously when it changes.
 * - `getValue()` tracks dependencies when called inside an `effect`/`derived` computation.
 * - `peekValue()` reads without tracking dependencies.
 * - `derived()` creates a read-only signal computed from other signals.
 * - `useSignal()` bridges a signal to React with `useSyncExternalStore`.
 *
 * Design trade-offs (intentional):
 * - Synchronous propagation, no scheduler or batching.
 * - Default equality is `Object.is` to avoid redundant notifications; customizable per update.
 * - `effect()` is fire-and-forget and cannot be disposed; prefer `useSignal()` in React or manual `subscribe()` for lifecycle control.
 * - Dependency tracking for `effect()`/`derived()` is additive; if your dependencies change over time, old ones remain subscribed.
 */

/**
 * Callback invoked when a signal's value has changed.
 *
 * The callback is invoked synchronously and should be fast. Avoid long-running
 * work or re-entrant updates that could lead to feedback loops.
 */
type Subscriber = () => void;
/**
 * Function that removes a previously registered subscription.
 */
type Unsubscribe = () => void;

/**
 * Mutable, subscribable container for a value of type `T`.
 *
 * Methods:
 * - `peekValue()`: Read without tracking dependencies.
 * - `getValue()`: Read and track if inside an active `effect()`/`derived()`.
 * - `setValue(v, equals?)`: Update and synchronously notify subscribers when
 *   considered different (default comparator is `Object.is`).
 * - `subscribe(cb)`: Register a callback; returns an `Unsubscribe` function.
 *
 * Notes:
 * - Prefer immutable updates for objects/arrays; or pass a custom comparator.
 * - Notifications are synchronous and in insertion order.
 */
export type Signal<T> = {
  /**
   * Read the current value without tracking dependencies.
   *
   * Use this when you need a snapshot that should not trigger re-execution of
   * `effect()`/`derived()` computations.
   *
   * @returns The current value stored by the signal.
   */
  peekValue(): T;
  /**
   * Read the current value and (when called inside an active `effect()` or
   * `derived()` computation) subscribe that computation to future updates.
   *
   * This is the read primitive that participates in dependency tracking.
   *
   * @returns The current value stored by the signal.
   */
  getValue(): T;
  /**
   * Update the stored value and synchronously notify subscribers if it changed
   * according to the comparator (default `Object.is`).
   *
   * Prefer immutable updates for objects/arrays. If you mutate in place and
   * still want to notify, provide a comparator that returns `false`.
   *
   * @param v - The next value to store.
   * @param equals - Optional comparator to decide whether to notify subscribers.
   */
  setValue(v: T, equals?: (a: T, b: T) => boolean): void;
  /**
   * Subscribe to changes of this signal.
   *
   * The callback runs synchronously in the same tick as `setValue`. Ensure the
   * callback is fast and side-effect safe to avoid feedback loops.
   *
   * @param cb - Function invoked when the value changes.
   * @returns A function that removes the subscription when called.
   */
  subscribe(cb: Subscriber): Unsubscribe;
};

/**
 * Read-only view of a signal-like value. Exposes reads and subscription but no mutation.
 */
export type ReadonlySignal<T> = {
  /**
   * Read the current value without tracking dependencies.
   * @returns The current derived value.
   */
  peekValue(): T;
  /**
   * Read the current value and, if inside an active computation, track it as a dependency.
   * @returns The current derived value.
   */
  getValue(): T;
  /**
   * Subscribe to changes of this read-only signal.
   * @param cb - Function invoked when the derived value changes.
   * @returns Unsubscribe function.
   */
  subscribe(cb: Subscriber): Unsubscribe;
};

let currentSubscriber: Subscriber | null = null;

function defaultEquals(a: unknown, b: unknown) {
  return Object.is(a, b);
}

export function signal<T>(initialValue: T) {
  const subscriptions = new Set<Subscriber>();
  let _value = initialValue;

  return {
    /**
     * Read the current value without tracking dependencies.
     */
    peekValue(): T {
      return _value;
    },
    /**
     * Read the current value and, if inside an active `effect()`/`derived()` computation,
     * register that computation as a subscriber to future updates.
     */
    getValue(): T {
      if (currentSubscriber) {
        subscriptions.add(currentSubscriber);
      }
      return _value;
    },
    /**
     * Update the value and synchronously notify subscribers if it changed according to
     * the provided comparator (default `Object.is`).
     *
     * @param updated - The next value.
     * @param equals - Optional comparator used to detect changes.
     */
    setValue(updated: T, equals: (a: T, b: T) => boolean = defaultEquals) {
      if (equals(_value, updated)) {
        return;
      }
      _value = updated;
      // notify all subscribers
      for (const fn of subscriptions) {
        fn();
      }
    },
    /**
     * Subscribe to updates of this signal. The callback runs synchronously.
     *
     * @param cb - Callback invoked when value changes.
     * @returns Unsubscribe function.
     */
    subscribe(cb: Subscriber) {
      subscriptions.add(cb);
      return function unsubscribe() {
        subscriptions.delete(cb);
      };
    },
  };
}

/**
 * Run a side-effecting computation that re-executes whenever any signal read
 * via `getValue()` during the computation changes.
 *
 * The function runs immediately once. Dependency tracking is additive and
 * subscriptions are not cleaned up automatically. Prefer `subscribe()` or
 * `useSignal()` when you need explicit lifecycle control.
 *
 * Warning: Because execution is synchronous, updating signals inside the effect
 * can cause feedback loops unless properly guarded.
 */
export function effect(fn: Subscriber): void {
  currentSubscriber = fn;
  try {
    fn();
  } finally {
    currentSubscriber = null;
  }
}

/**
 * Create a read-only signal computed from other signals.
 *
 * The computation `fn` runs immediately to seed the value, then runs again
 * whenever any signal it reads via `getValue()` changes. Updates are published
 * only if the derived value differs according to the comparator (default `Object.is`).
 *
 * Note: Dependency tracking is additive; previous dependencies remain subscribed
 * even if later runs stop reading them.
 */
export function derived<T>(
  fn: () => T,
  equals: (a: T, b: T) => boolean = defaultEquals,
): ReadonlySignal<T> {
  // Seed with an initial value to avoid undefined and TS assertions
  const derivedSignal = signal<T>(fn());
  effect(() => {
    derivedSignal.setValue(fn(), equals);
  });
  return derivedSignal;
}

/**
 * React hook that subscribes a component to a signal, re-rendering on change.
 *
 * Uses `useSyncExternalStore` for reliable concurrent rendering and SSR compatibility.
 * On the server it reads via `peekValue()`. On the client it subscribes.
 */
export function useSignal<T>(s: ReadonlySignal<T> | Signal<T>): T {
  return useSyncExternalStore(s.subscribe, s.peekValue, s.peekValue);
}
