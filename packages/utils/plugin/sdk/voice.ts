/**
 * @fileoverview Plugin-facing Voice SDK facade.
 * @module @talex-touch/utils/plugin/sdk/voice
 *
 * Mirrors `./intelligence` — exposes {@link createPluginVoiceFacade} (used by the
 * main-process Prelude sandbox injection to build `plugin.voice`) and a standalone
 * `voice` proxy for direct-import runtimes. No host-only method filtering: every
 * voice method is plugin-callable.
 */
import type { VoiceSdk } from "../../transport/sdk/domains/voice";
import type { PluginChannelClient } from "./channel-client";
import { createPluginTuffTransport } from "../../transport";
import { createVoiceSdk } from "../../transport/sdk/domains/voice";
import { ensureRendererChannel } from "./channel";
import { tryGetPluginSdkApi } from "./plugin-info";

type PluginChannelWithMain = PluginChannelClient & {
  sendToMain?: (eventName: string, payload?: unknown) => Promise<unknown>;
  onMain?: (
    eventName: string,
    handler: (event: unknown) => unknown,
  ) => () => void;
};

export type VoiceSDK = VoiceSdk;

function withSdkApiPayload(payload: unknown): unknown {
  const sdkapi = tryGetPluginSdkApi();
  if (typeof sdkapi !== "number" || !payload || typeof payload !== "object") {
    return payload;
  }

  return {
    ...(payload as Record<string, unknown>),
    _sdkapi: sdkapi,
  };
}

function createSdkApiChannel(
  channel: PluginChannelClient,
): PluginChannelWithMain {
  const channelWithMain = channel as PluginChannelWithMain;
  const sdkApiChannel: PluginChannelWithMain = {
    regChannel: (eventName, callback) =>
      channel.regChannel(eventName, callback),
    unRegChannel: (eventName, callback) =>
      channel.unRegChannel(eventName, callback),
    send: (eventName, payload) =>
      channel.send(eventName, withSdkApiPayload(payload)),
  };
  if (typeof channelWithMain.sendToMain === "function") {
    const sendToMain = channelWithMain.sendToMain.bind(channelWithMain);
    sdkApiChannel.sendToMain = (eventName, payload) =>
      sendToMain(eventName, withSdkApiPayload(payload));
  }

  if (typeof channelWithMain.onMain === "function") {
    const onMain = channelWithMain.onMain.bind(channelWithMain);
    sdkApiChannel.onMain = (eventName, handler) => onMain(eventName, handler);
  }

  return sdkApiChannel;
}

function createPluginVoiceClient(): VoiceSdk {
  const channel = createSdkApiChannel(ensureRendererChannel());
  const transport = createPluginTuffTransport(channel);
  return createVoiceSdk(transport);
}

let cachedClient: VoiceSdk | null = null;

function getClient(): VoiceSdk {
  if (!cachedClient) {
    cachedClient = createPluginVoiceClient();
  }
  return cachedClient;
}

export function createPluginVoiceFacade(
  resolveClient: () => VoiceSdk,
): VoiceSDK {
  return new Proxy({} as VoiceSDK, {
    get(_target, property, receiver) {
      return Reflect.get(resolveClient(), property, receiver);
    },
    has(_target, property) {
      return property in resolveClient();
    },
    ownKeys() {
      return Reflect.ownKeys(resolveClient());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        resolveClient(),
        property,
      );
      if (!descriptor) {
        return undefined;
      }
      return {
        ...descriptor,
        configurable: true,
      };
    },
  });
}

export const voice: VoiceSDK = createPluginVoiceFacade(getClient);
