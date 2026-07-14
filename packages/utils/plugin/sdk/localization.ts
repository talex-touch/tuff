import type {
  AppLocale,
  DomainLexiconMatch,
  DomainLexiconSearchOptions,
  LocalizedTextValue,
  PluginDomainLexiconEntryInput,
  PluginLexiconRegisterOptions,
  PluginLexiconRegisterResult,
  PluginLexiconResolveOptions,
  ResolvedDomainLexiconEntry,
} from "../../i18n";
import { createI18nMessage } from "../../i18n";
import type { ITuffTransport } from "../../transport";
import { createPluginTuffTransport } from "../../transport";
import { PluginEvents } from "../../transport/events";
import { ensureRendererChannel } from "./channel";
import { tryGetPluginSdkApi } from "./plugin-info";

export interface PluginI18nSDK {
  getLocale: () => Promise<AppLocale>;
  createMessage: (key: string, params?: Record<string, unknown>) => string;
  resolveText: (
    value: LocalizedTextValue,
    locale?: AppLocale,
  ) => Promise<string>;
}

export interface PluginLexiconSDK {
  resolve: (
    id: string,
    options?: PluginLexiconResolveOptions,
  ) => Promise<ResolvedDomainLexiconEntry | null>;
  search: (
    query: string,
    options?: DomainLexiconSearchOptions,
  ) => Promise<DomainLexiconMatch[]>;
  register: (
    entries: readonly PluginDomainLexiconEntryInput[],
    options?: PluginLexiconRegisterOptions,
  ) => Promise<PluginLexiconRegisterResult>;
}

export interface PluginLocalizationSDK {
  i18n: PluginI18nSDK;
  lexicon: PluginLexiconSDK;
}

export type PluginLocalizationTransport = Pick<ITuffTransport, "send">;

export function createPluginLocalizationSDK(
  transport: PluginLocalizationTransport,
  sdkapi?: number,
): PluginLocalizationSDK {
  const i18n: PluginI18nSDK = {
    getLocale: () =>
      transport.send(PluginEvents.i18n.getLocale, withSdkApi({}, sdkapi)),
    createMessage: (key, params) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        throw new Error("[Plugin Localization SDK] Message key is required");
      }
      return createI18nMessage(normalizedKey, params);
    },
    resolveText: (value, locale) =>
      transport.send(
        PluginEvents.i18n.resolveText,
        withSdkApi(
          {
            value,
            ...(locale ? { locale } : {}),
          },
          sdkapi,
        ),
      ),
  };

  const lexicon: PluginLexiconSDK = {
    resolve: (id, options) =>
      transport.send(
        PluginEvents.lexicon.resolve,
        withSdkApi(
          {
            id,
            ...(options ? { options } : {}),
          },
          sdkapi,
        ),
      ),
    search: (query, options) =>
      transport.send(
        PluginEvents.lexicon.search,
        withSdkApi(
          {
            query,
            ...(options ? { options } : {}),
          },
          sdkapi,
        ),
      ),
    register: (entries, options) =>
      transport.send(
        PluginEvents.lexicon.register,
        withSdkApi(
          {
            entries: [...entries],
            ...(options ? { options } : {}),
          },
          sdkapi,
        ),
      ),
  };

  return { i18n, lexicon };
}

export function usePluginLocalization(): PluginLocalizationSDK {
  const channel = ensureRendererChannel(
    "[Plugin Localization SDK] Channel not available. Make sure this runs in a plugin renderer context.",
  );
  const transport = createPluginTuffTransport(channel);
  return createPluginLocalizationSDK(transport, tryGetPluginSdkApi());
}

export function usePluginI18n(): PluginI18nSDK {
  return usePluginLocalization().i18n;
}

export function usePluginLexicon(): PluginLexiconSDK {
  return usePluginLocalization().lexicon;
}

function withSdkApi<T extends object>(
  payload: T,
  sdkapi: number | undefined,
): T & { _sdkapi?: number } {
  return typeof sdkapi === "number" ? { ...payload, _sdkapi: sdkapi } : payload;
}
