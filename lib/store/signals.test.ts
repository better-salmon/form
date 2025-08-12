import { describe, it, expect, vi } from "vitest";
import { signal, effect, derived } from "@lib/store/signals";

describe(signal, () => {
  it("returns undefined when created without initial value", () => {
    expect.hasAssertions();

    const count = signal<number | undefined>(undefined);

    expect(count.peekValue()).toBeUndefined();
  });

  it("reads and writes the current value", () => {
    expect.hasAssertions();

    const count = signal(1);

    expect(count.getValue()).toBe(1);

    count.setValue(2);

    expect(count.getValue()).toBe(2);
  });

  it("notifies subscribers only when value changes", () => {
    expect.hasAssertions();

    const count = signal(0);
    let runCount = 0;

    effect(() => {
      // Access to subscribe
      count.getValue();
      runCount += 1;
    });

    expect(runCount).toBe(1);

    count.setValue(0); // same value, should NOT notify

    expect(runCount).toBe(1);

    count.setValue(1); // different value

    expect(runCount).toBe(2);
  });

  it("does not subscribe the same effect more than once when read multiple times", () => {
    expect.hasAssertions();

    const count = signal(0);
    let runCount = 0;

    effect(() => {
      // Multiple reads within the same effect should not duplicate the subscription
      count.getValue();
      count.getValue();
      runCount += 1;
    });

    expect(runCount).toBe(1);

    count.setValue(1);

    expect(runCount).toBe(2); // not 3
  });

  it("notifies multiple subscribers", () => {
    expect.hasAssertions();

    const spyA = vi.fn<(val: number) => void>();
    const spyB = vi.fn<(val: number) => void>();

    const count = signal(0);

    effect(() => {
      spyA(count.getValue());
    });
    effect(() => {
      spyB(count.getValue());
    });

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);

    count.setValue(1);

    expect(spyA).toHaveBeenCalledTimes(2);
    expect(spyB).toHaveBeenCalledTimes(2);
  });
});

describe(derived, () => {
  it("computes initial value from dependency", () => {
    expect.hasAssertions();

    const base = signal(2);
    const double = derived(() => base.getValue() * 2);

    expect(double.getValue()).toBe(4);
  });

  it("recomputes when dependency changes", () => {
    expect.hasAssertions();

    const base = signal(1);
    const double = derived(() => base.getValue() * 2);

    expect(double.getValue()).toBe(2);

    base.setValue(3);

    expect(double.getValue()).toBe(6);
  });

  it("notifies subscribers when the derived value changes", () => {
    expect.hasAssertions();

    const base = signal(1);
    const double = derived(() => base.getValue() * 2);

    let latest = 0;
    effect(() => {
      latest = double.getValue();
    });

    expect(latest).toBe(2);

    base.setValue(5);

    expect(latest).toBe(10);
  });

  it("allows chaining of derived signals", () => {
    expect.hasAssertions();

    const a = signal(1);
    const b = derived(() => a.getValue() + 1);
    const c = derived(() => b.getValue() * 3);

    expect(c.getValue()).toBe(6); // (1 + 1) * 3

    a.setValue(3); // b = 4, c = 12

    expect(c.getValue()).toBe(12);
  });
});

describe("peek", () => {
  it("returns the current value without subscribing", () => {
    expect.hasAssertions();

    const count = signal(1);

    expect(count.peekValue()).toBe(1);

    let runCount = 0;
    effect(() => {
      count.peekValue();
      runCount += 1;
    });

    expect(runCount).toBe(1);

    count.setValue(2);

    expect(count.peekValue()).toBe(2);
    expect(runCount).toBe(1);
  });

  it("does not subscribe when peeking a derived signal", () => {
    expect.hasAssertions();

    const base = signal(2);
    const doubled = derived(() => base.getValue() * 2);

    expect(doubled.peekValue()).toBe(4);

    let runCount = 0;
    effect(() => {
      doubled.peekValue();
      runCount += 1;
    });

    expect(runCount).toBe(1);

    base.setValue(3); // triggers derived recompute

    expect(doubled.peekValue()).toBe(6);
    expect(runCount).toBe(1);
  });
});
