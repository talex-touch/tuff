import type { TuffAggregatorCallback, TuffUpdate } from "../../common/search";
import { describe, expect, it } from "vitest";

type CallbackSupportsPromise =
  Promise<void> extends ReturnType<TuffAggregatorCallback> ? true : false;

const callbackSupportsPromise: CallbackSupportsPromise = true;

const update: TuffUpdate = {
  newResults: [],
  totalCount: 0,
  isDone: true,
};

describe("search gather callback contract", () => {
  it("accepts synchronous and asynchronous consumers", async () => {
    const calls: string[] = [];
    const synchronousCallback: TuffAggregatorCallback = () => {
      calls.push("sync");
    };
    const asynchronousCallback: TuffAggregatorCallback = async () => {
      await Promise.resolve();
      calls.push("async");
    };

    await synchronousCallback(update);
    await asynchronousCallback(update);

    expect(callbackSupportsPromise).toBe(true);
    expect(calls).toEqual(["sync", "async"]);
  });
});
