import { describe, it, expect } from "vitest";
import { signal } from "@lib/signals/signals";

describe(signal, () => {
  it("returns undefined when created without initial value", () => {
    expect.hasAssertions();

    const count = signal<number | undefined>(undefined);

    expect(count.getValue()).toBeUndefined();
  });

  it("reads and writes the current value", () => {
    expect.hasAssertions();

    const count = signal(1);

    expect(count.getValue()).toBe(1);

    count.setValue(2);

    expect(count.getValue()).toBe(2);
  });

  it("subscribes to change and unsubscribes", () => {
    expect.assertions(1);

    const count = signal(1);

    const unsubscribe = count.subscribe(() => {
      expect(count.getValue()).toBe(2);
    });

    count.setValue(2);

    unsubscribe();

    count.setValue(3);
  });
});
