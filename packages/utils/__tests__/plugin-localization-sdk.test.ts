import { describe, expect, it, vi } from "vitest";
import { SdkApi } from "../plugin";
import { createPluginLocalizationSDK } from "../plugin/sdk/localization";
import { PluginEvents } from "../transport/events";

const sdkapi = SdkApi.V260713;

function createTransport() {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(),
  };
}

describe("Plugin Localization SDK", () => {
  it("routes every facade method through its typed event with the declared sdkapi", async () => {
    const transport = createTransport();
    const localizedEntry = {
      entry: {
        id: "unit.length.meter",
        domain: "unit",
        source: "builtin",
        version: "1",
        labels: { default: "meter" },
        aliases: { default: ["m", "meter"] },
      },
      label: "meter",
      aliases: ["m", "meter"],
    };
    const matches = [{ ...localizedEntry, matchedAlias: "meter", score: 1000 }];
    const registration = {
      namespace: "plugin:demo-plugin:",
      ids: ["plugin:demo-plugin:report.status"],
      registered: 1,
      total: 1,
    };
    transport.send
      .mockResolvedValueOnce("zh-CN")
      .mockResolvedValueOnce("已本地化")
      .mockResolvedValueOnce(localizedEntry)
      .mockResolvedValueOnce(matches)
      .mockResolvedValueOnce(registration);
    const sdk = createPluginLocalizationSDK(transport, sdkapi);
    const text = { default: "Default", locales: { "zh-CN": "已本地化" } };
    const entry = {
      id: "report.status",
      domain: "capability" as const,
      version: "1",
      labels: { default: "Status" },
      aliases: { default: ["status"] },
    };

    await expect(sdk.i18n.getLocale()).resolves.toBe("zh-CN");
    await expect(sdk.i18n.resolveText(text, "zh-CN")).resolves.toBe("已本地化");
    await expect(
      sdk.lexicon.resolve("unit.length.meter", {
        locale: "en-US",
        domain: "unit",
      }),
    ).resolves.toEqual(localizedEntry);
    await expect(
      sdk.lexicon.search("meter", { locale: "en-US", limit: 3 }),
    ).resolves.toEqual(matches);
    await expect(
      sdk.lexicon.register([entry], { replace: true }),
    ).resolves.toEqual(registration);

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.i18n.getLocale,
      {
        _sdkapi: sdkapi,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.i18n.resolveText,
      {
        value: text,
        locale: "zh-CN",
        _sdkapi: sdkapi,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.lexicon.resolve,
      {
        id: "unit.length.meter",
        options: { locale: "en-US", domain: "unit" },
        _sdkapi: sdkapi,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      PluginEvents.lexicon.search,
      {
        query: "meter",
        options: { locale: "en-US", limit: 3 },
        _sdkapi: sdkapi,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      5,
      PluginEvents.lexicon.register,
      {
        entries: [entry],
        options: { replace: true },
        _sdkapi: sdkapi,
      },
    );
  });

  it("creates trimmed message values locally and rejects blank keys", () => {
    const transport = createTransport();
    const sdk = createPluginLocalizationSDK(transport, sdkapi);

    expect(sdk.i18n.createMessage(" plugin.status ", { count: 2 })).toBe(
      '$i18n:plugin.status|{"count":2}',
    );
    expect(() => sdk.i18n.createMessage("   ")).toThrow(
      "[Plugin Localization SDK] Message key is required",
    );
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("preserves transport errors instead of converting them to a facade result", async () => {
    const transport = createTransport();
    const failure = Object.assign(new Error("lexicon permission denied"), {
      code: "LEXICON_PERMISSION_DENIED",
    });
    transport.send.mockRejectedValueOnce(failure);
    const sdk = createPluginLocalizationSDK(transport, sdkapi);

    await expect(sdk.lexicon.search("meter")).rejects.toBe(failure);
    expect(transport.send).toHaveBeenCalledWith(PluginEvents.lexicon.search, {
      query: "meter",
      _sdkapi: sdkapi,
    });
  });
});
