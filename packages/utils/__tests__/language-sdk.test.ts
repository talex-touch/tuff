import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkApi } from "../plugin";
import { createLanguageSDK } from "../plugin/sdk/language";
import { PluginEvents } from "../transport/events";
import type { StreamController, StreamOptions } from "../transport/types";

const sdkapi = SdkApi.V260713;

function createTransport() {
  const controller: StreamController = { streamId: "stream-1", cancel: vi.fn(), cancelled: false };
  let options!: StreamOptions<string>;
  const stream = vi.fn(async (_event: unknown, _payload: unknown, opts: StreamOptions<any>) => {
    options = opts;
    return controller;
  });
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(),
    stream,
    controller,
    push: (language: string) => options.onData?.(language),
    fail: (error: Error) => options.onError?.(error),
  };
}

describe("LanguageSDK", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the language through the locale event with the sdkapi marker", async () => {
    const transport = createTransport();
    transport.send.mockResolvedValue("en-US");

    await expect(createLanguageSDK(transport, sdkapi).getLanguage()).resolves.toBe("en-US");

    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send).toHaveBeenCalledWith(PluginEvents.i18n.getLocale, {
      _sdkapi: sdkapi,
    });
  });

  it("omits the sdkapi marker when the plugin did not declare one", async () => {
    const transport = createTransport();
    transport.send.mockResolvedValue("zh-CN");
    createLanguageSDK(transport).onLanguageChange(() => undefined);
    await createLanguageSDK(transport).getLanguage();

    expect(transport.send).toHaveBeenCalledWith(PluginEvents.i18n.getLocale, {});
    expect(transport.stream).toHaveBeenCalledWith(
      PluginEvents.i18n.localeChanged,
      {},
      expect.any(Object),
    );
  });

  it("delivers the current language and every change, skipping repeats", async () => {
    const transport = createTransport();
    const handler = vi.fn();
    createLanguageSDK(transport, sdkapi).onLanguageChange(handler);
    await vi.waitFor(() => expect(transport.stream).toHaveBeenCalledTimes(1));

    expect(transport.stream).toHaveBeenCalledWith(
      PluginEvents.i18n.localeChanged,
      { _sdkapi: sdkapi },
      expect.objectContaining({ onData: expect.any(Function), onError: expect.any(Function) }),
    );
    transport.push("zh-CN");
    transport.push("zh-CN");
    transport.push("en-US");
    transport.push("zh-CN");

    expect(handler.mock.calls).toEqual([["zh-CN"], ["en-US"], ["zh-CN"]]);
  });

  it("stops delivering and cancels the stream when unsubscribed", async () => {
    const transport = createTransport();
    const handler = vi.fn();
    const unsubscribe = createLanguageSDK(transport, sdkapi).onLanguageChange(handler);
    await vi.waitFor(() => expect(transport.stream).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    unsubscribe();
    transport.push("en-US");

    expect(transport.controller.cancel).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("cancels a stream that finished starting after the subscription was already stopped", async () => {
    const transport = createTransport();
    const handler = vi.fn();
    const unsubscribe = createLanguageSDK(transport, sdkapi).onLanguageChange(handler);
    unsubscribe();
    await vi.waitFor(() => expect(transport.controller.cancel).toHaveBeenCalledTimes(1));

    transport.push("en-US");
    expect(handler).not.toHaveBeenCalled();
  });

  it("logs stream and start failures once, and stays quiet after being stopped", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const transport = createTransport();
    const unsubscribe = createLanguageSDK(transport, sdkapi).onLanguageChange(vi.fn());
    await vi.waitFor(() => expect(transport.stream).toHaveBeenCalledTimes(1));

    const denied = Object.assign(new Error("denied"), { code: "PLUGIN_I18N_PERMISSION_DENIED" });
    transport.fail(denied);
    expect(warn).toHaveBeenCalledWith("[Plugin SDK] Language change stream error", denied);

    unsubscribe();
    transport.fail(denied);
    expect(warn).toHaveBeenCalledTimes(1);

    const rejecting = createTransport();
    rejecting.stream.mockRejectedValueOnce(new Error("no channel"));
    createLanguageSDK(rejecting, sdkapi).onLanguageChange(vi.fn());
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        "[Plugin SDK] Failed to subscribe to language changes",
        expect.any(Error),
      ),
    );
  });
});
