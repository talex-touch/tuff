import type { AppLocale, LocalizedTextValue } from "../../i18n";
import { createI18nMessage } from "../../i18n";
import type { ITuffTransport } from "../../transport";
import type { StreamController } from "../../transport/types";
import { createPluginTuffTransport } from "../../transport";
import { PluginEvents } from "../../transport/events";
import { ensureRendererChannel } from "./channel";
import { tryGetPluginSdkApi } from "./plugin-info";

/**
 * The app's display language: read it, follow it, and localize values with it. Needs the
 * `i18n.read` permission and `sdkapi >= 260713`; without them `getLanguage` and `resolveText`
 * reject with `PLUGIN_I18N_PERMISSION_DENIED` and `onLanguageChange` never calls back.
 * `createMessage` reads no host state, so it needs neither.
 */
export interface LanguageSDK {
  /** The app's current display language. */
  getLanguage: () => Promise<AppLocale>;
  /**
   * Calls `handler` with the current language once the subscription is up, then after every
   * change, never twice in a row with the same value. Returns a function that stops it.
   *
   * A refused or failed subscription is logged and then silent; `getLanguage()` is where the
   * refusal reaches the plugin as a rejection.
   */
  onLanguageChange: (handler: (language: AppLocale) => void) => () => void;
  /** Builds a `$i18n:` transport message locally. Throws on a blank key. */
  createMessage: (key: string, params?: Record<string, unknown>) => string;
  /** Resolves a string or `{ default, locales }` value; `locale` defaults to the app language. */
  resolveText: (
    value: LocalizedTextValue,
    locale?: AppLocale,
  ) => Promise<string>;
}

export type LanguageTransport = Pick<ITuffTransport, "send" | "stream">;

export function createLanguageSDK(
  transport: LanguageTransport,
  sdkapi?: number,
): LanguageSDK {
  const request = typeof sdkapi === "number" ? { _sdkapi: sdkapi } : {};

  return {
    getLanguage: () => transport.send(PluginEvents.i18n.getLocale, request),

    onLanguageChange(handler) {
      let controller: StreamController | null = null;
      let stopped = false;
      let last: AppLocale | undefined;

      transport
        .stream(PluginEvents.i18n.localeChanged, request, {
          onData(language) {
            if (stopped || language === last) return;
            last = language;
            handler(language);
          },
          onError(error) {
            if (!stopped)
              console.warn("[Plugin SDK] Language change stream error", error);
          },
        })
        .then((started) => {
          if (stopped) started.cancel();
          else controller = started;
        })
        .catch((error) => {
          if (!stopped)
            console.warn(
              "[Plugin SDK] Failed to subscribe to language changes",
              error,
            );
        });

      return () => {
        stopped = true;
        controller?.cancel();
      };
    },

    createMessage(key, params) {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        throw new Error("[Language SDK] Message key is required");
      }
      return createI18nMessage(normalizedKey, params);
    },

    resolveText: (value, locale) =>
      transport.send(PluginEvents.i18n.resolveText, {
        value,
        ...(locale ? { locale } : {}),
        ...request,
      }),
  };
}

export function useLanguage(): LanguageSDK {
  const channel = ensureRendererChannel(
    "[Language SDK] Channel not available. Make sure this runs in a plugin renderer context.",
  );
  return createLanguageSDK(
    createPluginTuffTransport(channel),
    tryGetPluginSdkApi(),
  );
}
