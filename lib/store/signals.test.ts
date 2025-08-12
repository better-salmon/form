import { describe, it, expect, vi } from "vitest";
import { signal, effect, derived, peek } from "@lib/store/signals";

describe(signal, () => {
  it("returns undefined when created without initial value", () => {
    expect.hasAssertions();

    const count = signal<number>();

    expect(count.value).toBeUndefined();
  });

  it("reads and writes the current value", () => {
    expect.hasAssertions();

    const count = signal(1);

    expect(count.value).toBe(1);

    count.value = 2;

    expect(count.value).toBe(2);
  });

  it("notifies subscribers on every set (even if value is the same)", () => {
    expect.hasAssertions();

    const count = signal(0);
    let runCount = 0;

    effect(() => {
      // Access to subscribe
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      count.value;
      runCount += 1;
    });

    expect(runCount).toBe(1);

    count.value = 0; // same value, should still notify

    expect(runCount).toBe(2);

    count.value = 1; // different value

    expect(runCount).toBe(3);
  });

  it("does not subscribe the same effect more than once when read multiple times", () => {
    expect.hasAssertions();

    const count = signal(0);
    let runCount = 0;

    effect(() => {
      // Multiple reads within the same effect should not duplicate the subscription
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      count.value;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      count.value;
      runCount += 1;
    });

    expect(runCount).toBe(1);

    count.value = 1;

    expect(runCount).toBe(2); // not 3
  });

  it("notifies multiple subscribers", () => {
    expect.hasAssertions();

    const spyA = vi.fn<(val: number) => void>();
    const spyB = vi.fn<(val: number) => void>();

    const count = signal(0);

    effect(() => {
      spyA(count.value);
    });
    effect(() => {
      spyB(count.value);
    });

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);

    count.value = 1;

    expect(spyA).toHaveBeenCalledTimes(2);
    expect(spyB).toHaveBeenCalledTimes(2);
  });
});

describe(derived, () => {
  it("computes initial value from dependency", () => {
    expect.hasAssertions();

    const base = signal(2);
    const double = derived(() => base.value * 2);

    expect(double.value).toBe(4);
  });

  it("recomputes when dependency changes", () => {
    expect.hasAssertions();

    const base = signal(1);
    const double = derived(() => base.value * 2);

    expect(double.value).toBe(2);

    base.value = 3;

    expect(double.value).toBe(6);
  });

  it("notifies subscribers when the derived value changes", () => {
    expect.hasAssertions();

    const base = signal(1);
    const double = derived(() => base.value * 2);

    let latest = 0;
    effect(() => {
      latest = double.value;
    });

    expect(latest).toBe(2);

    base.value = 5;

    expect(latest).toBe(10);
  });

  it("allows chaining of derived signals", () => {
    expect.hasAssertions();

    const a = signal(1);
    const b = derived(() => a.value + 1);
    const c = derived(() => b.value * 3);

    expect(c.value).toBe(6); // (1 + 1) * 3

    a.value = 3; // b = 4, c = 12

    expect(c.value).toBe(12);
  });
});

describe(peek, () => {
  it("returns the current value without subscribing", () => {
    expect.hasAssertions();

    const count = signal(1);

    expect(peek(count)).toBe(1);

    let runCount = 0;
    effect(() => {
      peek(count);
      runCount += 1;
    });

    expect(runCount).toBe(1);

    count.value = 2;

    expect(peek(count)).toBe(2);
    expect(runCount).toBe(1);
  });

  it("does not subscribe when peeking a derived signal", () => {
    expect.hasAssertions();

    const base = signal(2);
    const doubled = derived(() => base.value * 2);

    expect(peek(doubled)).toBe(4);

    let runCount = 0;
    effect(() => {
      peek(doubled);
      runCount += 1;
    });

    expect(runCount).toBe(1);

    base.value = 3; // triggers derived recompute

    expect(peek(doubled)).toBe(6);
    expect(runCount).toBe(1);
  });
});
