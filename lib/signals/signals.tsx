import { useSyncExternalStore } from "react";

export type Signal<T> = {
  getValue: () => T;
  setValue: (v: T, equals?: (a: T, b: T) => boolean) => void;
  subscribe: (cb: () => void) => () => void;
};

function defaultEquals(a: unknown, b: unknown) {
  return Object.is(a, b);
}

export function signal<T>(initialValue: T) {
  const subscriptions = new Set<() => void>();
  let _value = initialValue;

  return {
    getValue(): T {
      return _value;
    },
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
    subscribe(cb: () => void) {
      subscriptions.add(cb);
      return function unsubscribe() {
        subscriptions.delete(cb);
      };
    },
  };
}

export function useSignal<T>(s: Signal<T>): T {
  return useSyncExternalStore(s.subscribe, s.getValue, s.getValue);
}
