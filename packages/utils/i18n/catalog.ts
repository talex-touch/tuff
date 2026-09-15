import type { AppLocale } from "./locale";
import type { DomainLexiconDomain } from "./lexicon";
import type { LocalizedList, LocalizedText } from "./localized";
import { APP_LOCALES, isAppLocale } from "./locale";
import { DOMAIN_LEXICON_DOMAINS } from "./lexicon";

export const CATALOG_CONTRACT_VERSION = 1 as const;
export const CATALOG_SCHEMA_VERSION = 1 as const;
export const CATALOG_CLIENT_SDKAPI = 260713;
export const CATALOG_MAX_MANIFEST_BYTES = 64 * 1024;
export const CATALOG_MAX_PACK_BYTES = 4 * 1024 * 1024;
export const CATALOG_MAX_ENTRIES = 10_000;
export const CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM = "aes-256-gcm" as const;
export const CATALOG_PAYLOAD_ENVELOPE_VERSION = 1 as const;
export const CATALOG_PAYLOAD_KEY_BYTES = 32;
export const CATALOG_PAYLOAD_NONCE_BYTES = 12;
export const CATALOG_PAYLOAD_AUTH_TAG_BYTES = 16;
export const CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES = 4096;

const CATALOG_MAX_ID_LENGTH = 128;
const CATALOG_MAX_VERSION_LENGTH = 64;
const CATALOG_MAX_LOCALIZED_TEXT_LENGTH = 256;
const CATALOG_MAX_ALIAS_LENGTH = 128;
const CATALOG_MAX_ALIASES_PER_LOCALE = 64;
const CATALOG_MAX_PAYLOAD_KEY_ID_LENGTH = 96;
const CATALOG_MAX_METADATA_DEPTH = 6;
const CATALOG_MAX_METADATA_NODES = 256;
const CATALOG_MAX_METADATA_KEYS = 64;
const CATALOG_MAX_METADATA_KEY_LENGTH = 64;
const CATALOG_MAX_METADATA_STRING_LENGTH = 1024;
const CATALOG_MAX_SIGNATURE_LENGTH = 4096;

const PACK_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
const ENTRY_ID_PATTERN = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const PAYLOAD_KEY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const CATALOG_ERROR_CODES = {
  databaseUnavailable: "CATALOG_DB_UNAVAILABLE",
  trustRootUnavailable: "CATALOG_TRUST_ROOT_UNAVAILABLE",
  authenticationRequired: "CATALOG_AUTH_REQUIRED",
  manifestTooLarge: "CATALOG_MANIFEST_TOO_LARGE",
  manifestInvalid: "CATALOG_MANIFEST_INVALID",
  typeUnsupported: "CATALOG_TYPE_UNSUPPORTED",
  schemaUnsupported: "CATALOG_SCHEMA_UNSUPPORTED",
  sdkIncompatible: "CATALOG_SDK_INCOMPATIBLE",
  packExpired: "CATALOG_PACK_EXPIRED",
  localeUnsupported: "CATALOG_LOCALE_UNSUPPORTED",
  signatureInvalid: "CATALOG_SIGNATURE_INVALID",
  payloadTooLarge: "CATALOG_PAYLOAD_TOO_LARGE",
  payloadEncryptionRequired: "CATALOG_PAYLOAD_ENCRYPTION_REQUIRED",
  payloadEnvelopeInvalid: "CATALOG_PAYLOAD_ENVELOPE_INVALID",
  payloadKeyUnavailable: "CATALOG_PAYLOAD_KEY_UNAVAILABLE",
  payloadDecryptFailed: "CATALOG_PAYLOAD_DECRYPT_FAILED",
  hashMismatch: "CATALOG_HASH_MISMATCH",
  packInvalid: "CATALOG_PACK_INVALID",
  entryLimitExceeded: "CATALOG_ENTRY_LIMIT_EXCEEDED",
  versionConflict: "CATALOG_VERSION_CONFLICT",
  packNotFound: "CATALOG_PACK_NOT_FOUND",
  noPrevious: "CATALOG_NO_PREVIOUS",
  remoteUnavailable: "CATALOG_REMOTE_UNAVAILABLE",
  remoteMissing: "CATALOG_REMOTE_MISSING",
  activePackInvalid: "CATALOG_ACTIVE_PACK_INVALID",
  importFailed: "CATALOG_IMPORT_FAILED",
  activationFailed: "CATALOG_ACTIVATION_FAILED",
  rollbackFailed: "CATALOG_ROLLBACK_FAILED",
} as const;

export type CatalogErrorCode =
  (typeof CATALOG_ERROR_CODES)[keyof typeof CATALOG_ERROR_CODES];

export const CATALOG_ROLLBACK_REASONS = [
  "manual",
  "health-check-failed",
  "activation-regression",
  "operator-request",
] as const;

export type CatalogRollbackReason = (typeof CATALOG_ROLLBACK_REASONS)[number];

/**
 * Admission list for declarative cloud-controlled data packs.
 *
 * Shared code owns delivery identity, signature, optional envelope encryption, and lifecycle.
 * Every added type still requires a client-shipped typed normalizer, persistence adapter, and
 * runtime consumer. This list must never become a registry of downloaded scripts or evaluators.
 */
export const CATALOG_PACK_TYPES = ["domain-lexicon", "voice-provider"] as const;

export type CatalogPackType = (typeof CATALOG_PACK_TYPES)[number];
export type CatalogPackSource = "builtin" | "remote";
export type CatalogSignatureStatus = "builtin" | "verified";
export type CatalogPackStatus = "ready" | "active" | "previous";

export interface CatalogPayloadEncryptionV1 {
  algorithm: typeof CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM;
  keyId: string;
}

export interface CatalogEncryptedPayloadEnvelopeV1 {
  version: typeof CATALOG_PAYLOAD_ENVELOPE_VERSION;
  algorithm: typeof CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM;
  keyId: string;
  nonce: string;
  ciphertext: string;
  authTag: string;
}

export interface CatalogPayloadKeyV1 {
  version: typeof CATALOG_PAYLOAD_ENVELOPE_VERSION;
  algorithm: typeof CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM;
  keyId: string;
  key: string;
}

export interface CatalogPayloadEncryptionContext {
  contractVersion: typeof CATALOG_CONTRACT_VERSION;
  type: CatalogPackType;
  packId: string;
  version: string;
  schemaVersion: typeof CATALOG_SCHEMA_VERSION;
  createdAt: string;
  payloadEncryption: CatalogPayloadEncryptionV1;
}

export interface CatalogManifestV1 {
  contractVersion: 1;
  type: CatalogPackType;
  packId: string;
  version: string;
  schemaVersion: 1;
  createdAt: string;
  minSdkapi: number;
  locales: readonly AppLocale[];
  entryCount: number;
  payloadBytes: number;
  payloadSha256: string;
  signatureAlgorithm: "rsa-sha256";
  keyId: "release-v1";
  signature: string;
  payloadEncryption?: CatalogPayloadEncryptionV1;
}

export interface DomainLexiconCatalogEntryV1 {
  id: string;
  domain: DomainLexiconDomain;
  labels: LocalizedText;
  aliases: LocalizedList;
  searchBoost?: Partial<Record<AppLocale, number>>;
  deprecated?: boolean;
  replacedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface DomainLexiconCatalogPackV1 {
  contractVersion: 1;
  type: "domain-lexicon";
  packId: string;
  version: string;
  schemaVersion: 1;
  createdAt: string;
  locales: readonly AppLocale[];
  entries: readonly DomainLexiconCatalogEntryV1[];
}

export interface CatalogPackRef {
  type: CatalogPackType;
  packId: string;
  version: string;
}

export interface CatalogPackDiagnostic extends CatalogPackRef {
  payloadSha256: string;
  source: CatalogPackSource;
  signatureStatus: CatalogSignatureStatus;
}

export interface CatalogStatus {
  databaseAvailable: boolean;
  registrySource: "sqlite" | "builtin-fallback";
  active: CatalogPackDiagnostic | null;
  previous: CatalogPackDiagnostic | null;
  lastCheckedAt: number | null;
  lastUpdatedAt: number | null;
  rollbackReason: CatalogRollbackReason | null;
  lastErrorCode: CatalogErrorCode | null;
}

export class CatalogContractError extends Error {
  readonly code: CatalogErrorCode;

  constructor(code: CatalogErrorCode, message: string) {
    super(message);
    this.name = "CatalogContractError";
    this.code = code;
  }
}

export function normalizeCatalogManifest(value: unknown): CatalogManifestV1 {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.manifestInvalid,
    "Catalog manifest must be an object",
  );
  assertExactKeys(
    record,
    [
      "contractVersion",
      "type",
      "packId",
      "version",
      "schemaVersion",
      "createdAt",
      "minSdkapi",
      "locales",
      "entryCount",
      "payloadBytes",
      "payloadSha256",
      "payloadEncryption",
      "signatureAlgorithm",
      "keyId",
      "signature",
    ],
    CATALOG_ERROR_CODES.manifestInvalid,
    "catalog manifest",
  );

  requireLiteral(
    record.contractVersion,
    CATALOG_CONTRACT_VERSION,
    CATALOG_ERROR_CODES.manifestInvalid,
    "Unsupported catalog contract version",
  );
  const type = requireCatalogPackType(record.type);
  requireLiteral(
    record.schemaVersion,
    CATALOG_SCHEMA_VERSION,
    CATALOG_ERROR_CODES.schemaUnsupported,
    "Unsupported catalog schema version",
  );

  const minSdkapi = requireInteger(
    record.minSdkapi,
    CATALOG_ERROR_CODES.manifestInvalid,
    "Catalog minSdkapi must be a non-negative integer",
    0,
  );
  if (minSdkapi > CATALOG_CLIENT_SDKAPI) {
    fail(
      CATALOG_ERROR_CODES.sdkIncompatible,
      "Catalog requires a newer SDK marker",
    );
  }

  const entryCount = requireInteger(
    record.entryCount,
    CATALOG_ERROR_CODES.manifestInvalid,
    "Catalog entryCount must be a non-negative integer",
    0,
  );
  if (entryCount > CATALOG_MAX_ENTRIES) {
    fail(
      CATALOG_ERROR_CODES.entryLimitExceeded,
      "Catalog entry count exceeds the supported limit",
    );
  }

  const payloadBytes = requireInteger(
    record.payloadBytes,
    CATALOG_ERROR_CODES.manifestInvalid,
    "Catalog payloadBytes must be a positive integer",
    1,
  );
  if (payloadBytes > CATALOG_MAX_PACK_BYTES) {
    fail(
      CATALOG_ERROR_CODES.payloadTooLarge,
      "Catalog payload exceeds the supported byte limit",
    );
  }
  const payloadEncryption =
    record.payloadEncryption === undefined
      ? undefined
      : normalizeCatalogPayloadEncryption(record.payloadEncryption);
  if (type !== "voice-provider" && payloadEncryption) {
    fail(
      CATALOG_ERROR_CODES.manifestInvalid,
      "Catalog pack type does not support payload encryption",
    );
  }

  return Object.freeze({
    contractVersion: CATALOG_CONTRACT_VERSION,
    type,
    packId: normalizePackId(record.packId, CATALOG_ERROR_CODES.manifestInvalid),
    version: normalizeVersion(
      record.version,
      CATALOG_ERROR_CODES.manifestInvalid,
    ),
    schemaVersion: CATALOG_SCHEMA_VERSION,
    createdAt: normalizeTimestamp(
      record.createdAt,
      CATALOG_ERROR_CODES.manifestInvalid,
    ),
    minSdkapi,
    locales: normalizeRequiredLocales(record.locales),
    entryCount,
    payloadBytes,
    payloadSha256: normalizeSha256(record.payloadSha256),
    signatureAlgorithm: requireLiteral(
      record.signatureAlgorithm,
      "rsa-sha256",
      CATALOG_ERROR_CODES.signatureInvalid,
      "Unsupported catalog signature algorithm",
    ),
    keyId: requireLiteral(
      record.keyId,
      "release-v1",
      CATALOG_ERROR_CODES.signatureInvalid,
      "Unsupported catalog signing key",
    ),
    signature: normalizeSignature(record.signature),
    ...(payloadEncryption ? { payloadEncryption } : {}),
  });
}

export function parseCatalogManifestBytes(
  bytes: Uint8Array,
): CatalogManifestV1 {
  if (bytes.byteLength > CATALOG_MAX_MANIFEST_BYTES) {
    fail(
      CATALOG_ERROR_CODES.manifestTooLarge,
      "Catalog manifest exceeds the supported byte limit",
    );
  }
  return normalizeCatalogManifest(
    parseJsonBytes(
      bytes,
      "catalog manifest",
      CATALOG_ERROR_CODES.manifestInvalid,
    ),
  );
}

export function normalizeCatalogPayloadEncryption(
  value: unknown,
): CatalogPayloadEncryptionV1 {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.manifestInvalid,
    "Catalog payload encryption must be an object",
  );
  assertExactKeys(
    record,
    ["algorithm", "keyId"],
    CATALOG_ERROR_CODES.manifestInvalid,
    "catalog payload encryption",
  );
  return Object.freeze({
    algorithm: requireLiteral(
      record.algorithm,
      CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      CATALOG_ERROR_CODES.manifestInvalid,
      "Unsupported catalog payload encryption algorithm",
    ),
    keyId: normalizePayloadKeyId(record.keyId, CATALOG_ERROR_CODES.manifestInvalid),
  });
}

export function normalizeCatalogEncryptedPayloadEnvelope(
  value: unknown,
): CatalogEncryptedPayloadEnvelopeV1 {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    "Catalog encrypted payload envelope must be an object",
  );
  assertExactKeys(
    record,
    ["version", "algorithm", "keyId", "nonce", "ciphertext", "authTag"],
    CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    "catalog encrypted payload envelope",
  );
  return Object.freeze({
    version: requireLiteral(
      record.version,
      CATALOG_PAYLOAD_ENVELOPE_VERSION,
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
      "Unsupported catalog payload envelope version",
    ),
    algorithm: requireLiteral(
      record.algorithm,
      CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
      "Unsupported catalog payload envelope algorithm",
    ),
    keyId: normalizePayloadKeyId(
      record.keyId,
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    ),
    nonce: normalizeBase64Bytes(
      record.nonce,
      CATALOG_PAYLOAD_NONCE_BYTES,
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
      "Catalog payload nonce",
    ),
    ciphertext: normalizeBase64Bytes(
      record.ciphertext,
      null,
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
      "Catalog payload ciphertext",
      CATALOG_MAX_PACK_BYTES,
    ),
    authTag: normalizeBase64Bytes(
      record.authTag,
      CATALOG_PAYLOAD_AUTH_TAG_BYTES,
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
      "Catalog payload authentication tag",
    ),
  });
}

export function parseCatalogEncryptedPayloadEnvelopeBytes(
  bytes: Uint8Array,
): CatalogEncryptedPayloadEnvelopeV1 {
  if (bytes.byteLength > CATALOG_MAX_PACK_BYTES) {
    fail(
      CATALOG_ERROR_CODES.payloadTooLarge,
      "Catalog encrypted payload exceeds the supported byte limit",
    );
  }
  return normalizeCatalogEncryptedPayloadEnvelope(
    parseJsonBytes(
      bytes,
      "catalog encrypted payload envelope",
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    ),
  );
}

export function serializeCatalogEncryptedPayloadEnvelope(
  envelope: CatalogEncryptedPayloadEnvelopeV1,
): Uint8Array {
  return encodeUtf8(stableStringify(normalizeCatalogEncryptedPayloadEnvelope(envelope)));
}

export function normalizeCatalogPayloadKey(value: unknown): CatalogPayloadKeyV1 {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.payloadKeyUnavailable,
    "Catalog payload key response must be an object",
  );
  assertExactKeys(
    record,
    ["version", "algorithm", "keyId", "key"],
    CATALOG_ERROR_CODES.payloadKeyUnavailable,
    "catalog payload key response",
  );
  return Object.freeze({
    version: requireLiteral(
      record.version,
      CATALOG_PAYLOAD_ENVELOPE_VERSION,
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
      "Unsupported catalog payload key version",
    ),
    algorithm: requireLiteral(
      record.algorithm,
      CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
      "Unsupported catalog payload key algorithm",
    ),
    keyId: normalizePayloadKeyId(
      record.keyId,
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
    ),
    key: normalizeBase64Bytes(
      record.key,
      CATALOG_PAYLOAD_KEY_BYTES,
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
      "Catalog payload key",
    ),
  });
}

export function parseCatalogPayloadKeyBytes(bytes: Uint8Array): CatalogPayloadKeyV1 {
  if (bytes.byteLength > CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES) {
    fail(
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
      "Catalog payload key response exceeds the supported byte limit",
    );
  }
  return normalizeCatalogPayloadKey(
    parseJsonBytes(
      bytes,
      "catalog payload key response",
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
    ),
  );
}

export function createCatalogPayloadEncryptionAad(
  input: CatalogPayloadEncryptionContext,
): Uint8Array {
  const payloadEncryption = normalizeCatalogPayloadEncryption(input.payloadEncryption);
  return encodeUtf8(
    JSON.stringify({
      kind: "tuff.catalog.payload-encryption",
      contractVersion: requireLiteral(
        input.contractVersion,
        CATALOG_CONTRACT_VERSION,
        CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
        "Unsupported catalog contract version",
      ),
      type: requireCatalogPackType(input.type),
      packId: normalizePackId(input.packId, CATALOG_ERROR_CODES.payloadEnvelopeInvalid),
      version: normalizeVersion(input.version, CATALOG_ERROR_CODES.payloadEnvelopeInvalid),
      schemaVersion: requireLiteral(
        input.schemaVersion,
        CATALOG_SCHEMA_VERSION,
        CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
        "Unsupported catalog schema version",
      ),
      createdAt: normalizeTimestamp(
        input.createdAt,
        CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
      ),
      payloadEncryption,
    }),
  );
}

export function normalizeDomainLexiconCatalogPack(
  value: unknown,
): DomainLexiconCatalogPackV1 {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.packInvalid,
    "Catalog pack must be an object",
  );
  assertExactKeys(
    record,
    [
      "contractVersion",
      "type",
      "packId",
      "version",
      "schemaVersion",
      "createdAt",
      "locales",
      "entries",
    ],
    CATALOG_ERROR_CODES.packInvalid,
    "catalog pack",
  );
  requireLiteral(
    record.contractVersion,
    CATALOG_CONTRACT_VERSION,
    CATALOG_ERROR_CODES.packInvalid,
    "Unsupported catalog contract version",
  );
  requireLiteral(
    record.type,
    "domain-lexicon",
    CATALOG_ERROR_CODES.typeUnsupported,
    "Unsupported catalog pack type",
  );
  requireLiteral(
    record.schemaVersion,
    CATALOG_SCHEMA_VERSION,
    CATALOG_ERROR_CODES.schemaUnsupported,
    "Unsupported catalog schema version",
  );
  if (!Array.isArray(record.entries)) {
    fail(CATALOG_ERROR_CODES.packInvalid, "Catalog entries must be an array");
  }
  if (record.entries.length > CATALOG_MAX_ENTRIES) {
    fail(
      CATALOG_ERROR_CODES.entryLimitExceeded,
      "Catalog entry count exceeds the supported limit",
    );
  }

  const entries: DomainLexiconCatalogEntryV1[] = [];
  const ids = new Set<string>();
  for (const value of record.entries) {
    const entry = normalizeCatalogEntry(value);
    if (ids.has(entry.id)) {
      fail(
        CATALOG_ERROR_CODES.packInvalid,
        "Catalog contains a duplicate entry id",
      );
    }
    ids.add(entry.id);
    entries.push(entry);
  }

  return Object.freeze({
    contractVersion: CATALOG_CONTRACT_VERSION,
    type: "domain-lexicon",
    packId: normalizePackId(record.packId, CATALOG_ERROR_CODES.packInvalid),
    version: normalizeVersion(record.version, CATALOG_ERROR_CODES.packInvalid),
    schemaVersion: CATALOG_SCHEMA_VERSION,
    createdAt: normalizeTimestamp(
      record.createdAt,
      CATALOG_ERROR_CODES.packInvalid,
    ),
    locales: normalizeRequiredLocales(record.locales),
    entries: Object.freeze(entries),
  });
}

export function parseDomainLexiconCatalogPackBytes(
  bytes: Uint8Array,
): DomainLexiconCatalogPackV1 {
  if (bytes.byteLength > CATALOG_MAX_PACK_BYTES) {
    fail(
      CATALOG_ERROR_CODES.payloadTooLarge,
      "Catalog payload exceeds the supported byte limit",
    );
  }
  return normalizeDomainLexiconCatalogPack(
    parseJsonBytes(bytes, "catalog pack", CATALOG_ERROR_CODES.packInvalid),
  );
}

export function createCatalogManifestSigningPayload(
  manifest: CatalogManifestV1,
): Uint8Array {
  const normalized = normalizeCatalogManifest(manifest);
  return encodeUtf8(
    JSON.stringify({
      kind: "tuff.catalog.manifest",
      contractVersion: normalized.contractVersion,
      type: normalized.type,
      packId: normalized.packId,
      version: normalized.version,
      schemaVersion: normalized.schemaVersion,
      createdAt: normalized.createdAt,
      minSdkapi: normalized.minSdkapi,
      locales: normalized.locales,
      entryCount: normalized.entryCount,
      payloadBytes: normalized.payloadBytes,
      payloadSha256: normalized.payloadSha256,
      ...(normalized.payloadEncryption
        ? { payloadEncryption: normalized.payloadEncryption }
        : {}),
      signatureAlgorithm: normalized.signatureAlgorithm,
      keyId: normalized.keyId,
    }),
  );
}

export function serializeDomainLexiconCatalogPack(
  pack: DomainLexiconCatalogPackV1,
): Uint8Array {
  return encodeUtf8(stableStringify(normalizeDomainLexiconCatalogPack(pack)));
}

function normalizeCatalogEntry(value: unknown): DomainLexiconCatalogEntryV1 {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.packInvalid,
    "Catalog entry must be an object",
  );
  assertExactKeys(
    record,
    [
      "id",
      "domain",
      "labels",
      "aliases",
      "searchBoost",
      "deprecated",
      "replacedBy",
      "metadata",
    ],
    CATALOG_ERROR_CODES.packInvalid,
    "catalog entry",
  );

  const domain = record.domain;
  if (
    typeof domain !== "string" ||
    !(DOMAIN_LEXICON_DOMAINS as readonly string[]).includes(domain)
  ) {
    fail(CATALOG_ERROR_CODES.packInvalid, "Catalog entry domain is invalid");
  }

  const normalized: DomainLexiconCatalogEntryV1 = {
    id: normalizeEntryId(record.id),
    domain: domain as DomainLexiconDomain,
    labels: normalizeLocalizedText(record.labels),
    aliases: normalizeLocalizedList(record.aliases),
  };

  if (record.searchBoost !== undefined) {
    normalized.searchBoost = normalizeSearchBoost(record.searchBoost);
  }
  if (record.deprecated !== undefined) {
    if (typeof record.deprecated !== "boolean") {
      fail(
        CATALOG_ERROR_CODES.packInvalid,
        "Catalog entry deprecated must be boolean",
      );
    }
    normalized.deprecated = record.deprecated;
  }
  if (record.replacedBy !== undefined) {
    normalized.replacedBy = normalizeEntryId(record.replacedBy);
  }
  if (record.metadata !== undefined) {
    const budget = { nodes: 0 };
    const metadata = normalizeMetadataValue(record.metadata, 0, budget);
    if (!isPlainRecord(metadata)) {
      fail(
        CATALOG_ERROR_CODES.packInvalid,
        "Catalog entry metadata must be an object",
      );
    }
    normalized.metadata = metadata;
  }

  return Object.freeze(normalized);
}

function normalizeLocalizedText(value: unknown): LocalizedText {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.packInvalid,
    "Catalog entry labels must be an object",
  );
  assertExactKeys(
    record,
    ["default", "locales"],
    CATALOG_ERROR_CODES.packInvalid,
    "catalog labels",
  );
  const locales = normalizeLocaleRecord(record.locales, (localized) =>
    normalizeBoundedText(
      localized,
      CATALOG_MAX_LOCALIZED_TEXT_LENGTH,
      "Catalog localized label is invalid",
    ),
  );
  return Object.freeze({
    default: normalizeBoundedText(
      record.default,
      CATALOG_MAX_LOCALIZED_TEXT_LENGTH,
      "Catalog default label is invalid",
    ),
    locales: Object.freeze(locales),
  });
}

function normalizeLocalizedList(value: unknown): LocalizedList {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.packInvalid,
    "Catalog entry aliases must be an object",
  );
  assertExactKeys(
    record,
    ["default", "locales"],
    CATALOG_ERROR_CODES.packInvalid,
    "catalog aliases",
  );
  const locales = normalizeLocaleRecord(record.locales, normalizeAliasList);
  return Object.freeze({
    default: Object.freeze(normalizeAliasList(record.default)) as string[],
    locales: Object.freeze(
      Object.fromEntries(
        Object.entries(locales).map(([locale, aliases]) => [
          locale,
          Object.freeze(aliases),
        ]),
      ),
    ),
  });
}

function normalizeAliasList(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > CATALOG_MAX_ALIASES_PER_LOCALE
  ) {
    fail(CATALOG_ERROR_CODES.packInvalid, "Catalog alias list is invalid");
  }
  const aliases = value.map((alias) =>
    normalizeBoundedText(
      alias,
      CATALOG_MAX_ALIAS_LENGTH,
      "Catalog alias is invalid",
    ),
  );
  if (new Set(aliases).size !== aliases.length) {
    fail(
      CATALOG_ERROR_CODES.packInvalid,
      "Catalog alias list contains duplicates",
    );
  }
  return aliases;
}

function normalizeLocaleRecord<T>(
  value: unknown,
  normalizeValue: (value: unknown) => T,
): Record<AppLocale, T> {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.localeUnsupported,
    "Catalog localized value requires locales",
  );
  assertExactKeys(
    record,
    [...APP_LOCALES],
    CATALOG_ERROR_CODES.localeUnsupported,
    "catalog locale map",
  );
  return Object.fromEntries(
    APP_LOCALES.map((locale) => [locale, normalizeValue(record[locale])]),
  ) as Record<AppLocale, T>;
}

function normalizeSearchBoost(
  value: unknown,
): Partial<Record<AppLocale, number>> {
  const record = requireRecord(
    value,
    CATALOG_ERROR_CODES.packInvalid,
    "Catalog searchBoost must be an object",
  );
  for (const key of Object.keys(record)) {
    if (!isAppLocale(key)) {
      fail(
        CATALOG_ERROR_CODES.localeUnsupported,
        "Catalog searchBoost contains an unsupported locale",
      );
    }
  }
  const normalized: Partial<Record<AppLocale, number>> = {};
  for (const locale of APP_LOCALES) {
    const boost = record[locale];
    if (boost === undefined) continue;
    if (
      typeof boost !== "number" ||
      !Number.isFinite(boost) ||
      boost < -100 ||
      boost > 100
    ) {
      fail(CATALOG_ERROR_CODES.packInvalid, "Catalog searchBoost is invalid");
    }
    normalized[locale] = boost;
  }
  return Object.freeze(normalized);
}

function normalizeMetadataValue(
  value: unknown,
  depth: number,
  budget: { nodes: number },
): unknown {
  budget.nodes += 1;
  if (
    depth > CATALOG_MAX_METADATA_DEPTH ||
    budget.nodes > CATALOG_MAX_METADATA_NODES
  ) {
    fail(
      CATALOG_ERROR_CODES.packInvalid,
      "Catalog metadata exceeds structural bounds",
    );
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value === "string") {
    if (value.length > CATALOG_MAX_METADATA_STRING_LENGTH) {
      fail(
        CATALOG_ERROR_CODES.packInvalid,
        "Catalog metadata string exceeds the supported limit",
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > CATALOG_MAX_METADATA_KEYS) {
      fail(
        CATALOG_ERROR_CODES.packInvalid,
        "Catalog metadata array exceeds the supported limit",
      );
    }
    return value.map((item) => normalizeMetadataValue(item, depth + 1, budget));
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length > CATALOG_MAX_METADATA_KEYS) {
      fail(
        CATALOG_ERROR_CODES.packInvalid,
        "Catalog metadata object exceeds the supported limit",
      );
    }
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      if (
        !key ||
        key.length > CATALOG_MAX_METADATA_KEY_LENGTH ||
        key === "__proto__" ||
        key === "constructor" ||
        key === "prototype"
      ) {
        fail(
          CATALOG_ERROR_CODES.packInvalid,
          "Catalog metadata key is invalid",
        );
      }
      normalized[key] = normalizeMetadataValue(value[key], depth + 1, budget);
    }
    return normalized;
  }
  fail(CATALOG_ERROR_CODES.packInvalid, "Catalog metadata must be plain JSON");
}

function normalizeRequiredLocales(value: unknown): readonly AppLocale[] {
  if (!Array.isArray(value) || value.length !== APP_LOCALES.length) {
    fail(
      CATALOG_ERROR_CODES.localeUnsupported,
      "Catalog locales must cover every supported locale",
    );
  }
  const locales = new Set<AppLocale>();
  for (const locale of value) {
    if (!isAppLocale(locale)) {
      fail(
        CATALOG_ERROR_CODES.localeUnsupported,
        "Catalog contains an unsupported locale",
      );
    }
    locales.add(locale);
  }
  if (locales.size !== APP_LOCALES.length) {
    fail(
      CATALOG_ERROR_CODES.localeUnsupported,
      "Catalog locales must be unique and complete",
    );
  }
  return Object.freeze([...APP_LOCALES]);
}

function normalizePackId(value: unknown, code: CatalogErrorCode): string {
  const id = normalizeBoundedText(
    value,
    64,
    "Catalog pack id is invalid",
    false,
    code,
  );
  if (!PACK_ID_PATTERN.test(id)) {
    fail(code, "Catalog pack id is malformed");
  }
  return id;
}

function normalizeVersion(value: unknown, code: CatalogErrorCode): string {
  const version = normalizeBoundedText(
    value,
    CATALOG_MAX_VERSION_LENGTH,
    "Catalog version is invalid",
    false,
    code,
  );
  if (!VERSION_PATTERN.test(version)) {
    fail(code, "Catalog version is malformed");
  }
  return version;
}

function normalizePayloadKeyId(value: unknown, code: CatalogErrorCode): string {
  const keyId = normalizeBoundedText(
    value,
    CATALOG_MAX_PAYLOAD_KEY_ID_LENGTH,
    "Catalog payload key id is invalid",
    false,
    code,
  );
  if (!PAYLOAD_KEY_ID_PATTERN.test(keyId)) {
    fail(code, "Catalog payload key id is malformed");
  }
  return keyId;
}

function isCanonicalBase64(value: string): boolean {
  if (value.endsWith("==")) {
    const sextet = BASE64_ALPHABET.indexOf(value[value.length - 3] ?? "");
    return sextet >= 0 && (sextet & 0x0f) === 0;
  }
  if (value.endsWith("=")) {
    const sextet = BASE64_ALPHABET.indexOf(value[value.length - 2] ?? "");
    return sextet >= 0 && (sextet & 0x03) === 0;
  }
  return true;
}

function normalizeBase64Bytes(
  value: unknown,
  expectedBytes: number | null,
  code: CatalogErrorCode,
  label: string,
  maxEncodedLength = 8192,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxEncodedLength ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value) ||
    !isCanonicalBase64(value)
  ) {
    fail(code, `${label} encoding is invalid`);
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const decodedBytes = (value.length / 4) * 3 - padding;
  if (expectedBytes !== null && decodedBytes !== expectedBytes) {
    fail(code, `${label} length is invalid`);
  }
  return value;
}

function normalizeEntryId(value: unknown): string {
  const id = normalizeBoundedText(
    value,
    CATALOG_MAX_ID_LENGTH,
    "Catalog entry id is invalid",
  );
  if (
    !ENTRY_ID_PATTERN.test(id) ||
    id.startsWith("plugin.") ||
    id.startsWith("catalog.")
  ) {
    fail(CATALOG_ERROR_CODES.packInvalid, "Catalog entry id is malformed");
  }
  return id;
}

function normalizeTimestamp(value: unknown, code: CatalogErrorCode): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) {
    fail(code, "Catalog timestamp is malformed");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(code, "Catalog timestamp is invalid");
  }
  return value;
}

function normalizeSha256(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(CATALOG_ERROR_CODES.manifestInvalid, "Catalog SHA-256 is invalid");
  }
  return value;
}

function normalizeSignature(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > CATALOG_MAX_SIGNATURE_LENGTH ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    fail(
      CATALOG_ERROR_CODES.signatureInvalid,
      "Catalog signature encoding is invalid",
    );
  }
  return value;
}

function normalizeBoundedText(
  value: unknown,
  maxLength: number,
  message: string,
  trim = true,
  code: CatalogErrorCode = CATALOG_ERROR_CODES.packInvalid,
): string {
  if (typeof value !== "string") fail(code, message);
  const text = trim ? value.trim() : value;
  if (!text || text.length > maxLength || hasControlCharacter(text)) {
    fail(code, message);
  }
  return text;
}
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function requireRecord(
  value: unknown,
  code: CatalogErrorCode,
  message: string,
): Record<string, unknown> {
  if (!isPlainRecord(value)) fail(code, message);
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  code: CatalogErrorCode,
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      fail(code, `${label} contains an unknown field`);
    }
  }
  for (const key of allowed) {
    if (!(key in record) && !isOptionalContractKey(key)) {
      fail(code, `${label} is missing a required field`);
    }
  }
}

function isOptionalContractKey(key: string): boolean {
  return (
    key === "payloadEncryption" ||
    key === "searchBoost" ||
    key === "deprecated" ||
    key === "replacedBy" ||
    key === "metadata"
  );
}

export function isCatalogPackType(value: unknown): value is CatalogPackType {
  return (
    typeof value === "string" &&
    (CATALOG_PACK_TYPES as readonly string[]).includes(value)
  );
}

function requireCatalogPackType(value: unknown): CatalogPackType {
  if (!isCatalogPackType(value)) {
    fail(CATALOG_ERROR_CODES.typeUnsupported, "Unsupported catalog pack type");
  }
  return value;
}

function requireLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  code: CatalogErrorCode,
  message: string,
): T {
  if (value !== expected) fail(code, message);
  return expected;
}

function requireInteger(
  value: unknown,
  code: CatalogErrorCode,
  message: string,
  minimum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(code, message);
  }
  return value as number;
}

function parseJsonBytes(
  bytes: Uint8Array,
  label: string,
  code: CatalogErrorCode,
): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(code, `${label} is not valid UTF-8 JSON`);
  }
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJsonValue(value[key])]),
    );
  }
  return value;
}

function fail(code: CatalogErrorCode, message: string): never {
  throw new CatalogContractError(code, message);
}
