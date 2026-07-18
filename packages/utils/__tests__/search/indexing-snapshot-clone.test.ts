import { afterEach, describe, expect, it, vi } from "vitest";
import { cloneIndexingSnapshotValue } from "../../search";

describe("cloneIndexingSnapshotValue", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deep clones plain nested snapshots without structuredClone", () => {
    vi.stubGlobal("structuredClone", undefined);
    const input = {
      status: "ready",
      nested: {
        counters: [1, 2],
      },
    };

    const clone = cloneIndexingSnapshotValue(input);
    input.nested.counters.push(3);
    clone.nested.counters.push(4);

    expect(input.nested.counters).toEqual([1, 2, 3]);
    expect(clone.nested.counters).toEqual([1, 2, 4]);
  });

  it("preserves Date, Map, Set, and circular snapshot references in fallback mode", () => {
    vi.stubGlobal("structuredClone", undefined);
    const input: {
      checkedAt: Date;
      metrics: Map<string, { pending: number }>;
      tags: Set<string>;
      self?: unknown;
    } = {
      checkedAt: new Date("2026-06-20T00:00:00.000Z"),
      metrics: new Map([["scan", { pending: 1 }]]),
      tags: new Set(["file"]),
    };
    input.self = input;

    const clone = cloneIndexingSnapshotValue(input);
    input.checkedAt.setTime(0);
    input.metrics.get("scan")!.pending = 99;
    input.tags.add("mutated");

    expect(clone.checkedAt.toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(clone.metrics.get("scan")).toEqual({ pending: 1 });
    expect([...clone.tags]).toEqual(["file"]);
    expect(clone.self).toBe(clone);
  });

  it("clones URL, RegExp, ArrayBuffer, typed arrays, and DataView in fallback mode", () => {
    vi.stubGlobal("structuredClone", undefined);
    const buffer = new ArrayBuffer(4);
    const viewBuffer = new ArrayBuffer(4);
    const view = new DataView(viewBuffer);
    view.setUint16(0, 42);
    const input = {
      endpoint: new URL("https://example.test/releases/latest?channel=BETA"),
      matcher: /release-\d+/gi,
      buffer,
      bytes: new Uint8Array([1, 2, 3]),
      view,
    };
    input.matcher.lastIndex = 3;

    const clone = cloneIndexingSnapshotValue(input);
    new Uint8Array(input.buffer)[0] = 9;
    input.bytes[0] = 9;
    input.view.setUint16(0, 99);
    input.endpoint.searchParams.set("channel", "RELEASE");
    input.matcher.lastIndex = 0;

    expect(new Uint8Array(clone.buffer)).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect([...clone.bytes]).toEqual([1, 2, 3]);
    expect(clone.view.getUint16(0)).toBe(42);
    expect(clone.endpoint.href).toBe(
      "https://example.test/releases/latest?channel=BETA",
    );
    expect(clone.matcher.source).toBe("release-\\d+");
    expect(clone.matcher.flags).toBe("gi");
    expect(clone.matcher.lastIndex).toBe(3);
  });

  it("recursively clones structural aggregate-like and ordinary Error diagnostics in fallback mode", () => {
    vi.stubGlobal("structuredClone", undefined);
    const cause = new Error("sqlite busy");
    const input = {
      error: Object.assign(new Error("snapshot failed", { cause }), {
        code: "SQLITE_BUSY",
        context: {
          retryable: true,
        },
      }),
      ownAggregate: Object.assign(new Error("multiple failures"), {
        errors: [
          Object.assign(new TypeError("file unavailable"), {
            context: {
              path: "/tmp/a",
            },
          }),
        ],
      }),
    };
    const inheritedErrors = [
      Object.assign(new RangeError("scan exhausted"), {
        context: {
          path: "/tmp/b",
        },
      }),
    ];
    const inheritedAggregate = new Error("inherited failures") as Error & {
      errors: typeof inheritedErrors;
    };
    Object.setPrototypeOf(
      inheritedAggregate,
      Object.assign(Object.create(Error.prototype), {
        errors: inheritedErrors,
      }),
    );

    const clone = cloneIndexingSnapshotValue({ ...input, inheritedAggregate });
    input.error.context.retryable = false;
    input.ownAggregate.errors[0].context.path = "/tmp/changed-a";
    inheritedErrors[0].context.path = "/tmp/changed-b";

    expect(clone.error).toBeInstanceOf(Error);
    expect(clone.error.message).toBe("snapshot failed");
    expect(clone.error.name).toBe("Error");
    expect(clone.error.cause).toBeInstanceOf(Error);
    expect((clone.error.cause as Error).message).toBe("sqlite busy");
    expect(clone.error.code).toBe("SQLITE_BUSY");
    expect(clone.error.context.retryable).toBe(true);
    expect(clone.ownAggregate.message).toBe("multiple failures");
    expect(clone.ownAggregate.name).toBe("Error");
    expect(clone.ownAggregate.errors).not.toBe(input.ownAggregate.errors);
    expect(clone.ownAggregate.errors[0]).toBeInstanceOf(TypeError);
    expect(clone.ownAggregate.errors[0].message).toBe("file unavailable");
    expect(clone.ownAggregate.errors[0].name).toBe("TypeError");
    expect(clone.ownAggregate.errors[0].context.path).toBe("/tmp/a");
    expect(clone.inheritedAggregate.message).toBe("inherited failures");
    expect(clone.inheritedAggregate.name).toBe("Error");
    expect(clone.inheritedAggregate.errors).not.toBe(inheritedErrors);
    expect(clone.inheritedAggregate.errors[0]).toBeInstanceOf(RangeError);
    expect(clone.inheritedAggregate.errors[0].message).toBe("scan exhausted");
    expect(clone.inheritedAggregate.errors[0].name).toBe("RangeError");
    expect(clone.inheritedAggregate.errors[0].context.path).toBe("/tmp/b");
  });

  it("uses fallback cloning when structuredClone rejects adapter payloads", () => {
    vi.stubGlobal(
      "structuredClone",
      vi.fn(() => {
        throw new Error("Cannot clone");
      }),
    );
    const input = {
      worker: {
        metrics: {
          pending: 1,
        },
      },
    };

    const clone = cloneIndexingSnapshotValue(input);
    input.worker.metrics.pending = 2;

    expect(clone.worker.metrics.pending).toBe(1);
  });
});
