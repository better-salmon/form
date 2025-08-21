import { describe, it, expect } from "vitest";
import { shallow } from "@lib/shallow";

describe(shallow, () => {
  it("returns true for the same reference", () => {
    expect.hasAssertions();

    const obj = { a: 1 };

    expect(shallow(obj, obj)).toBe(true);
  });

  it("returns true for shallow-equal plain objects", () => {
    expect.hasAssertions();

    expect(shallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    // different insertion order of keys should not matter
    expect(shallow({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("returns false when a property value differs", () => {
    expect.hasAssertions();

    expect(shallow({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("returns false when one object has extra keys", () => {
    expect.hasAssertions();

    expect(shallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("only compares one level deep (nested objects must be the same reference)", () => {
    expect.hasAssertions();

    expect(shallow({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);

    const inner = { x: 1 };

    expect(shallow({ a: inner }, { a: inner })).toBe(true);
  });

  it("handles arrays shallowly", () => {
    expect.hasAssertions();

    expect(shallow([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(shallow([1, 2], [1, 2, 3])).toBe(false);
    expect(shallow([1, 2], [1, 3])).toBe(false);
    expect(shallow([{ x: 1 }], [{ x: 1 }])).toBe(false);
  });

  it("handles primitive equality correctly", () => {
    expect.hasAssertions();

    expect(shallow(1, 1)).toBe(true);
    expect(shallow(1, 2)).toBe(false);
    expect(shallow("a", "a")).toBe(true);
    expect(shallow("a", "b")).toBe(false);
  });

  it("handles special numbers correctly", () => {
    expect.hasAssertions();

    expect(shallow(Number.NaN, Number.NaN)).toBe(true);
    expect(shallow(-0, 0)).toBe(false); // Object.is distinguishes -0 and 0
  });

  it("handles null and undefined", () => {
    expect.hasAssertions();

    expect(shallow(null, null)).toBe(true);
    expect(shallow(undefined, undefined)).toBe(true);
    expect(shallow(null, undefined)).toBe(false);
    expect(shallow(null, {} as unknown)).toBe(false);
  });

  it("requires own properties on the right-hand side (no prototype fallthrough)", () => {
    expect.hasAssertions();

    const a = { x: 1 };
    const proto = { x: 1 } as const;

    const b = Object.create(proto) as unknown;

    expect(Object.prototype.hasOwnProperty.call(b, "x")).toBe(false);
    expect(shallow(a, b)).toBe(false);
  });
});
