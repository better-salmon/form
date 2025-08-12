import { useSyncExternalStore } from "react";
import { unstable_batchedUpdates } from "react-dom";

type Subscriber = () => void;
type Unsubscribe = () => void;

export type Signal<T> = {
  peekValue(): T;
  getValue(): T;
  setValue(v: T): void;
  subscribe(cb: Subscriber): Unsubscribe;
};

export type ReadonlySignal<T> = {
  peekValue(): T;
  getValue(): T;
  subscribe(cb: Subscriber): Unsubscribe;
};

let currentSubscriber: Subscriber | null = null;

export function signal<T>(initialValue: T) {
  const subscriptions = new Set<Subscriber>();
  let _value = initialValue;

  return {
    peekValue(): T {
      return _value;
    },
    getValue(): T {
      if (currentSubscriber) {
        subscriptions.add(currentSubscriber);
      }
      return _value;
    },
    setValue(updated: T) {
      if (Object.is(_value, updated)) {
        return;
      }
      _value = updated;
      // notify all subscribers
      unstable_batchedUpdates(() => {
        for (const fn of subscriptions) {
          fn();
        }
      });
    },
    subscribe(cb: Subscriber) {
      subscriptions.add(cb);
      return () => {
        subscriptions.delete(cb);
      };
    },
  };
}

export function effect(fn: Subscriber): void {
  currentSubscriber = fn;
  try {
    fn();
  } finally {
    currentSubscriber = null;
  }
}

export function derived<T>(fn: () => T): ReadonlySignal<T> {
  // Seed with an initial value to avoid undefined and TS assertions
  const derivedSignal = signal<T>(fn());
  effect(() => {
    derivedSignal.setValue(fn());
  });
  return derivedSignal;
}

export function useSignal<T>(s: ReadonlySignal<T> | Signal<T>): T {
  return useSyncExternalStore(s.subscribe, s.peekValue, s.peekValue);
}
