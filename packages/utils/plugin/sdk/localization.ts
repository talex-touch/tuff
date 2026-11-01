import type {
  DomainLexiconMatch,
  DomainLexiconSearchOptions,
  PluginDomainLexiconEntryInput,
  PluginLexiconRegisterOptions,
  PluginLexiconRegisterResult,
  PluginLexiconResolveOptions,
  ResolvedDomainLexiconEntry,
} from "../../i18n";
import { createPluginTuffTransport } from "../../transport";
import { PluginEvents } from "../../transport/events";
import { ensureRendererChannel } from "./channel";
import type { LanguageSDK, LanguageTransport } from "./language";
import { createLanguageSDK } from "./language";
import { tryGetPluginSdkApi } from "./plugin-info";

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
  language: LanguageSDK;
  lexicon: PluginLexiconSDK;
}

export type PluginLocalizationTransport = LanguageTransport;

export function createPluginLocalizationSDK(
  transport: PluginLocalizationTransport,
  sdkapi?: number,
): PluginLocalizationSDK {
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

  return { language: createLanguageSDK(transport, sdkapi), lexicon };
}

export function usePluginLocalization(): PluginLocalizationSDK {
  const channel = ensureRendererChannel(
    "[Plugin Localization SDK] Channel not available. Make sure this runs in a plugin renderer context.",
  );
  const transport = createPluginTuffTransport(channel);
  return createPluginLocalizationSDK(transport, tryGetPluginSdkApi());
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
