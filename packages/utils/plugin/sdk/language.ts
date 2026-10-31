import type { AppLocale } from "../../i18n";
import { createI18nMessage, I18N_PREFIX, isI18nMessage, parseI18nMessage } from "../../i18n";
import type { ITuffTransport } from "../../transport";
import { createPluginTuffTransport } from "../../transport";
import { PluginEvents } from "../../transport/events";
import { ensureRendererChannel } from "./channel";
import { tryGetPluginSdkApi, tryUsePluginInfo } from "./plugin-info";

export const PLUGIN_I18N_KEY_PREFIX = "plugin.";

/**
 * Format a key scoped to a specific plugin to prevent namespace collisions.
 * e.g., 'features.search.title' -> 'plugin.my-plugin.features.search.title'
 */
export function formatPluginI18nKey(pluginName: string, key: string): string {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error("[Language SDK] Key is required");
  }

  const cleanPluginName = pluginName.trim();
  if (!cleanPluginName) {
    return normalizedKey;
  }

  const expectedPrefix = `${PLUGIN_I18N_KEY_PREFIX}${cleanPluginName}.`;
  if (normalizedKey.startsWith(expectedPrefix)) {
    return normalizedKey;
  }

  return `${expectedPrefix}${normalizedKey}`;
}

/**
 * Parse a scoped plugin key back into pluginName and inner key.
 */
export function parsePluginI18nKey(
  fullKey: string,
): { pluginName: string; key: string } | null {
  const trimmed = fullKey.trim();
  if (!trimmed.startsWith(PLUGIN_I18N_KEY_PREFIX)) {
    return null;
  }

  const rest = trimmed.slice(PLUGIN_I18N_KEY_PREFIX.length);
  const dotIndex = rest.indexOf(".");
  if (dotIndex <= 0) {
    return null;
  }

  const pluginName = rest.slice(0, dotIndex);
  const key = rest.slice(dotIndex + 1);
  if (!pluginName || !key) {
    return null;
  }

  return { pluginName, key };
}

/**
 * Create a $i18n: formatted message scoped to a specific plugin.
 */
export function createPluginI18nMessage(
  pluginName: string,
  key: string,
  params?: Record<string, unknown>,
): string {
  const scopedKey = formatPluginI18nKey(pluginName, key);
  return createI18nMessage(scopedKey, params);
}

export interface LanguageSDK {
  readonly pluginName: string;

  /**
   * Shorthand to create a $i18n: message placeholder scoped to this plugin.
   * Transmitted across IPC/modules and resolved automatically in the UI.
   */
  t: (key: string, params?: Record<string, unknown>) => string;

  /**
   * Create a $i18n: formatted message string.
   */
  createMessage: (key: string, params?: Record<string, unknown>) => string;

  /**
   * Get the current main-process active locale.
   */
  getLocale: () => Promise<AppLocale>;

  /**
   * Request host to immediately resolve a localized string.
   */
  resolve: (key: string, params?: Record<string, unknown>) => Promise<string>;
}

export type PluginLanguageTransport = Pick<ITuffTransport, "send">;

export interface CreateLanguageSDKOptions {
  pluginName: string;
  transport?: PluginLanguageTransport;
  sdkapi?: number;
}

export function createLanguageSDK(options: CreateLanguageSDKOptions): LanguageSDK {
  const { pluginName, sdkapi } = options;
  const transport = options.transport;

  const t = (key: string, params?: Record<string, unknown>): string => {
    return createPluginI18nMessage(pluginName, key, params);
  };

  const getLocale = async (): Promise<AppLocale> => {
    if (!transport) {
      throw new Error("[Language SDK] Transport not provided to getLocale");
    }
    const payload = typeof sdkapi === "number" ? { _sdkapi: sdkapi } : {};
    return transport.send(PluginEvents.i18n.getLocale, payload);
  };

  const resolve = async (
    key: string,
    params?: Record<string, unknown>,
  ): Promise<string> => {
    if (!transport) {
      throw new Error("[Language SDK] Transport not provided to resolve");
    }
    const message = isI18nMessage(key) ? key : t(key, params);
    const payload = {
      value: message,
      ...(typeof sdkapi === "number" ? { _sdkapi: sdkapi } : {}),
    };
    return transport.send(PluginEvents.i18n.resolveText, payload);
  };

  return {
    pluginName,
    t,
    createMessage: t,
    getLocale,
    resolve,
  };
}

/**
 * Use LanguageSDK in a plugin renderer context.
 */
export function usePluginLanguage(customPluginName?: string): LanguageSDK {
  const resolvedName =
    customPluginName ||
    tryUsePluginInfo()?.name ||
    "";

  if (!resolvedName) {
    throw new Error(
      "[Language SDK] Cannot determine plugin name. Make sure this is called in a plugin context or pass customPluginName.",
    );
  }

  const channel = ensureRendererChannel(
    "[Language SDK] Channel not available. Make sure this runs in a plugin renderer context.",
  );
  const transport = createPluginTuffTransport(channel);
  const sdkapi = tryGetPluginSdkApi();

  return createLanguageSDK({
    pluginName: resolvedName,
    transport,
    sdkapi,
  });
}
