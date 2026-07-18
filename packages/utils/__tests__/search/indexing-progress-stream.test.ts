import { describe, expect, it } from "vitest";
import {
  getIndexingProgressStreamFlushDelayMs,
  shouldEmitIndexingProgressStreamImmediately,
} from "../../search";

function createPayload(
  overrides: Partial<{
    stage: string;
    current: number;
    total: number;
    progress: number;
  }> = {},
) {
  return {
    stage: "indexing",
    current: 10,
    total: 100,
    progress: 0.1,
    ...overrides,
  };
}

describe("indexing-progress-stream-service", () => {
  it("emits immediately when there is no previous payload", () => {
    const next = createPayload();
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous: null,
        next,
        now: 1_000,
        lastEmitAt: 0,
      }),
    ).toBe(true);
  });

  it("emits immediately when source stage changes", () => {
    const previous = createPayload({ stage: "scanning" });
    const next = createPayload({ stage: "indexing" });
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 900,
      }),
    ).toBe(true);
  });

  it("emits terminal stages immediately", () => {
    const previous = createPayload();
    const next = createPayload({ stage: "completed" });
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 900,
      }),
    ).toBe(true);
  });

  it("supports custom terminal stages for source-specific progress payloads", () => {
    const previous = createPayload({ stage: "syncing" });
    const next = createPayload({ stage: "settled" });
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 990,
        config: {
          minEmitIntervalMs: 160,
          maxSilenceMs: 1000,
          currentStep: 25,
          terminalStages: ["settled"],
        },
      }),
    ).toBe(true);
  });

  it("emits when max silence is reached", () => {
    const previous = createPayload();
    const next = createPayload();
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 3_000,
        lastEmitAt: 1_900,
      }),
    ).toBe(true);
  });

  it("does not emit within min interval without meaningful changes", () => {
    const previous = createPayload({ current: 10, progress: 0.1, total: 100 });
    const next = createPayload({ current: 11, progress: 0.1, total: 100 });
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_000,
        lastEmitAt: 910,
      }),
    ).toBe(false);
  });

  it("emits after min interval when progress changes", () => {
    const previous = createPayload({ progress: 0.1 });
    const next = createPayload({ progress: 0.2 });
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_500,
        lastEmitAt: 1_200,
      }),
    ).toBe(true);
  });

  it("emits when current step threshold is crossed", () => {
    const previous = createPayload({ current: 10 });
    const next = createPayload({ current: 40 });
    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_500,
        lastEmitAt: 1_200,
      }),
    ).toBe(true);
  });

  it("never returns a negative flush delay", () => {
    expect(getIndexingProgressStreamFlushDelayMs(1_000, 900)).toBe(60);
    expect(getIndexingProgressStreamFlushDelayMs(1_000, 700)).toBe(0);
  });

  it("normalizes malformed clocks before evaluating throttle windows", () => {
    const previous = createPayload({ current: 10, progress: 0.1, total: 100 });
    const next = createPayload({ current: 10, progress: 0.1, total: 100 });

    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: Number.NaN,
        lastEmitAt: 900,
      }),
    ).toBe(false);
    expect(getIndexingProgressStreamFlushDelayMs(Number.NaN, 900)).toBe(160);
    expect(getIndexingProgressStreamFlushDelayMs(800, 900)).toBe(160);
  });

  it("normalizes malformed payload counters and progress before comparing changes", () => {
    const previous = createPayload({
      current: Number.NaN,
      total: Number.POSITIVE_INFINITY,
      progress: Number.NEGATIVE_INFINITY,
    });
    const next = createPayload({
      current: -10,
      total: Number.NaN,
      progress: Number.NaN,
    });

    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_500,
        lastEmitAt: 1_200,
      }),
    ).toBe(false);
  });

  it("falls back for malformed throttle config values", () => {
    const previous = createPayload({ current: 10, progress: 0.1, total: 100 });
    const next = createPayload({ current: 34, progress: 0.1, total: 100 });

    expect(
      shouldEmitIndexingProgressStreamImmediately({
        previous,
        next,
        now: 1_500,
        lastEmitAt: 1_200,
        config: {
          minEmitIntervalMs: Number.NaN,
          maxSilenceMs: Number.POSITIVE_INFINITY,
          currentStep: Number.NEGATIVE_INFINITY,
          terminalStages: [],
        },
      }),
    ).toBe(false);
  });
});
