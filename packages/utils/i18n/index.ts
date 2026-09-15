/**
 * I18n Utilities
 *
 * Shared i18n utilities for backend-frontend communication.
 *
 * ## Backend Usage (Main Process)
 * ```typescript
 * import { i18nMsg, DevServerKeys } from '@talex-touch/utils/i18n'
 *
 * // Send i18n message to frontend
 * win.webContents.send('notification', {
 *   message: i18nMsg(DevServerKeys.DISCONNECTED)
 * })
 * ```
 *
 * ## Frontend Usage (Renderer)
 * ```typescript
 * import { resolveI18nMessage, i18nResolver } from '@talex-touch/utils/i18n'
 *
 * // Set locale
 * i18nResolver.setLocale('zh')
 *
 * // Resolve message
 * const text = resolveI18nMessage('$i18n:devServer.disconnected')
 * // => '开发服务器已断开'
 * ```
 */

// Locale data
export { default as enMessages } from "./locales/en.json";

export { default as zhMessages } from "./locales/zh.json";

export {
  APP_LOCALES,
  type AppLocale,
  DEFAULT_APP_LOCALE,
  getFallbackChain,
  isAppLocale,
  isShortLocale,
  normalizeLocale,
  SHORT_LOCALES,
  type ShortLocale,
  toAppLocale,
  toShortLocale,
} from "./locale";
export {
  isLocalizedList,
  isLocalizedText,
  type LocalizedList,
  type LocalizedListValue,
  type LocalizedText,
  type LocalizedTextValue,
  resolveLocalizedList,
  resolveLocalizedText,
} from "./localized";
export {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_CONTRACT_VERSION,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES,
  CATALOG_PAYLOAD_AUTH_TAG_BYTES,
  CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
  CATALOG_PAYLOAD_ENVELOPE_VERSION,
  CATALOG_PAYLOAD_KEY_BYTES,
  CATALOG_PAYLOAD_NONCE_BYTES,
  type CatalogErrorCode,
  CatalogContractError,
  type CatalogManifestV1,
  type CatalogEncryptedPayloadEnvelopeV1,
  type CatalogPayloadEncryptionContext,
  type CatalogPayloadEncryptionV1,
  type CatalogPayloadKeyV1,
  CATALOG_MAX_ENTRIES,
  CATALOG_MAX_MANIFEST_BYTES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_PACK_TYPES,
  type CatalogPackDiagnostic,
  type CatalogPackRef,
  type CatalogPackSource,
  type CatalogPackStatus,
  type CatalogPackType,
  CATALOG_ROLLBACK_REASONS,
  type CatalogRollbackReason,
  CATALOG_SCHEMA_VERSION,
  type CatalogSignatureStatus,
  type CatalogStatus,
  createCatalogManifestSigningPayload,
  createCatalogPayloadEncryptionAad,
  type DomainLexiconCatalogEntryV1,
  type DomainLexiconCatalogPackV1,
  isCatalogPackType,
  normalizeCatalogManifest,
  normalizeCatalogEncryptedPayloadEnvelope,
  normalizeCatalogPayloadEncryption,
  normalizeCatalogPayloadKey,
  normalizeDomainLexiconCatalogPack,
  parseCatalogManifestBytes,
  parseCatalogEncryptedPayloadEnvelopeBytes,
  parseCatalogPayloadKeyBytes,
  parseDomainLexiconCatalogPackBytes,
  serializeDomainLexiconCatalogPack,
  serializeCatalogEncryptedPayloadEnvelope,
} from "./catalog";
export {
  normalizeVoiceProviderPack,
  parseVoiceProviderCatalogPackBytes,
  serializeVoiceProviderCatalogPack,
  unwrapVoiceProviderPack,
  voiceProviderRejectionToErrorCode,
  VoiceProviderRegistry,
  VOICE_PROVIDER_ALLOWED_HEADERS,
  VOICE_PROVIDER_AUTH_MODES,
  VOICE_PROVIDER_CONTENT_TYPE_POLICY,
  VOICE_PROVIDER_FORBIDDEN_HEADERS,
  VOICE_PROVIDER_MAX_BASE_URL_LENGTH,
  VOICE_PROVIDER_MAX_HEADERS,
  VOICE_PROVIDER_MAX_ID_LENGTH,
  VOICE_PROVIDER_MAX_LANGUAGES,
  VOICE_PROVIDER_MAX_LIMIT_BYTES,
  VOICE_PROVIDER_MAX_LIMIT_DURATION_SEC,
  VOICE_PROVIDER_MAX_LIMIT_TIMEOUT_MS,
  VOICE_PROVIDER_MAX_MODELS,
  VOICE_PROVIDER_MAX_PATH_LENGTH,
  VOICE_PROVIDER_MAX_PROVIDERS,
  VOICE_PROVIDER_MAX_STRING_LENGTH,
  VOICE_PROVIDER_PACK_TYPE,
  VOICE_PROVIDER_REJECTION_REASONS,
  VOICE_PROVIDER_REQUEST_BODIES,
  VOICE_PROVIDER_TRANSPORTS,
  type VoiceProviderAuthMode,
  type VoiceProviderAuthV1,
  type VoiceProviderDescriptorV1,
  type VoiceProviderEndpointV1,
  type VoiceProviderLimitsV1,
  type VoiceProviderModelV1,
  type VoiceProviderNormalizeOptions,
  type VoiceProviderNormalizeResult,
  type VoiceProviderPackV1,
  type VoiceProviderRejectionReason,
  type VoiceProviderRequestBody,
  type VoiceProviderRequestV1,
  type VoiceProviderTransport,
} from "./voice-provider-catalog";
export {
  DOMAIN_LEXICON_DOMAINS,
  type DomainLexiconDomain,
  type DomainLexiconSource,
  type DomainLexiconEntry,
  type DomainLexiconMatch,
  DomainLexiconRegistry,
  isDomainLexiconSource,
  type DomainLexiconSearchOptions,
  type ResolvedDomainLexiconEntry,
} from "./lexicon";
export {
  officialDomainLexiconRegistry,
  isUnitLexiconMetadata,
  UNIT_CATEGORIES,
  type UnitCategory,
  UNIT_LEXICON_ENTRIES,
  type UnitLexiconMetadata,
  UNIT_LEXICON_VERSION,
} from "./unit-lexicon";
export {
  MAX_PLUGIN_LEXICON_ENTRIES,
  MAX_PLUGIN_LEXICON_REGISTER_BATCH,
  MAX_PLUGIN_LEXICON_REGISTER_BYTES,
  type PluginDomainLexiconEntryInput,
  type PluginLexiconRegisterOptions,
  type PluginLexiconRegisterResult,
  type PluginLexiconResolveOptions,
  ScopedDomainLexiconRegistry,
} from "./scoped-lexicon";

// Message keys and utilities for backend
export {
  type CoreBoxOmniPanelKey,
  CoreBoxOmniPanelKeys,
  type DevServerKey,
  DevServerKeys,
  type FlowTransferKey,
  FlowTransferKeys,
  I18N_PREFIX,
  i18nMsg,
  i18nMsgWithParams,
  isI18nMessage,
  MessageKeys,
  parseI18nMessage,
  type PluginKey,
  PluginKeys,
  type SystemKey,
  SystemKeys,
  type WidgetKey,
  WidgetKeys,
} from "./message-keys";
// Resolver for frontend
export {
  createI18nMessage,
  I18nResolver,
  i18nResolver,
  type MessageLocale,
  type Messages,
  resolveI18nMessage,
  useI18nResolver,
} from "./resolver";
