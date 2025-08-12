import { useSyncExternalStore } from "react";

type Subscriber = () => void;
type Unsubscribe = () => void;

export type Signal<T> = {
  get value(): T;
  set value(v: T);
  subscribe(cb: Subscriber): Unsubscribe;
  getSnapshot(): T;
};

export type ReadonlySignal<T> = {
  get value(): T;
  subscribe(cb: Subscriber): Unsubscribe;
  getSnapshot(): T;
};

let currentSubscriber: Subscriber | null = null;

export function signal<T>(): Signal<T | undefined>;
export function signal<T>(initialValue: T): Signal<T>;
export function signal<T>(initialValue?: T) {
  const subscriptions = new Set<Subscriber>();
  let _value = initialValue as T;

  return {
    get value(): T {
      if (currentSubscriber) {
        subscriptions.add(currentSubscriber);
      }
      return _value;
    },
    set value(updated: T) {
      _value = updated;
      // notify all subscribers
      for (const fn of subscriptions) {
        fn();
      }
    },
    subscribe(cb: Subscriber) {
      subscriptions.add(cb);
      return () => subscriptions.delete(cb);
    },
    getSnapshot(): T {
      if (currentSubscriber) {
        subscriptions.add(currentSubscriber);
      }
      return _value;
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
  // Start without an initial value; we'll set it via the effect below.
  // eslint-disable-next-line unicorn/no-useless-undefined -- it's ok here
  const s = signal<T | undefined>(undefined);
  effect(() => {
    s.value = fn();
  });
  return s as ReadonlySignal<T>;
}

export function peek<S extends ReadonlySignal<unknown> | Signal<unknown>>(
  s: S,
): S["value"] {
  const previousSubscriber = currentSubscriber;
  // Temporarily disable tracking to avoid subscribing the caller
  currentSubscriber = null;
  try {
    return s.getSnapshot();
  } finally {
    currentSubscriber = previousSubscriber;
  }
}

export function useSignal<S extends Signal<unknown>>(s: S): S["value"] {
  return useSyncExternalStore(
    // eslint-disable-next-line @typescript-eslint/unbound-method -- it's ok here
    s.subscribe, // subscribe to changes
    // eslint-disable-next-line @typescript-eslint/unbound-method -- it's ok here
    s.getSnapshot, // get current snapshot (client)
    // eslint-disable-next-line @typescript-eslint/unbound-method -- it's ok here
    s.getSnapshot, // get snapshot for SSR
  );
}
