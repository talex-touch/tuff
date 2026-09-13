import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CatalogContractError,
  CATALOG_MAX_ENTRIES,
  CATALOG_MAX_MANIFEST_BYTES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES,
  CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
  CATALOG_PAYLOAD_ENVELOPE_VERSION,
  createCatalogManifestSigningPayload,
  createCatalogPayloadEncryptionAad,
  type CatalogEncryptedPayloadEnvelopeV1,
  type CatalogManifestV1,
  type CatalogPayloadEncryptionContext,
  type CatalogPayloadEncryptionV1,
  type CatalogPayloadKeyV1,
  type DomainLexiconCatalogEntryV1,
  type DomainLexiconCatalogPackV1,
  normalizeCatalogEncryptedPayloadEnvelope,
  normalizeCatalogManifest,
  normalizeCatalogPayloadEncryption,
  normalizeCatalogPayloadKey,
  normalizeDomainLexiconCatalogPack,
  parseCatalogEncryptedPayloadEnvelopeBytes,
  parseCatalogManifestBytes,
  parseCatalogPayloadKeyBytes,
  parseDomainLexiconCatalogPackBytes,
  serializeCatalogEncryptedPayloadEnvelope,
  serializeDomainLexiconCatalogPack,
} from "../../i18n/catalog";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function validEntry(
  overrides: Partial<DomainLexiconCatalogEntryV1> = {},
): DomainLexiconCatalogEntryV1 {
  return {
    id: "unit.length.catalog-meter",
    domain: "unit",
    labels: {
      default: "catalog meter",
      locales: {
        "zh-CN": "目录米",
        "en-US": "catalog meter",
      },
    },
    aliases: {
      default: ["cmeter"],
      locales: {
        "zh-CN": ["目录米", "cmeter"],
        "en-US": ["catalog meter", "cmeter"],
      },
    },
    ...overrides,
  };
}

function validPack(
  overrides: Partial<DomainLexiconCatalogPackV1> = {},
): DomainLexiconCatalogPackV1 {
  return {
    contractVersion: 1,
    type: "domain-lexicon",
    packId: "official.domain-lexicon",
    version: "2026.07.15",
    schemaVersion: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    locales: ["zh-CN", "en-US"],
    entries: [validEntry()],
    ...overrides,
  };
}

function validManifest(
  overrides: Partial<CatalogManifestV1> = {},
): CatalogManifestV1 {
  return {
    contractVersion: 1,
    type: "domain-lexicon",
    packId: "official.domain-lexicon",
    version: "2026.07.15",
    schemaVersion: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: ["zh-CN", "en-US"],
    entryCount: 1,
    payloadBytes: 512,
    payloadSha256: "a".repeat(64),
    signatureAlgorithm: "rsa-sha256",
    keyId: "release-v1",
    signature: "AQ==",
    ...overrides,
  };
}

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogContractError);
    expect((error as CatalogContractError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

const PAYLOAD_KEY_ID = "payload-2026-07";
/** Base64 of 32 zero bytes — the canonical AES-256-GCM key length. */
const PAYLOAD_KEY_BASE64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
/** Base64 of a 12-byte nonce and a 16-byte authentication tag. */
const ENVELOPE_NONCE_BASE64 = "AAAAAAAAAAAAAAAA";
const ENVELOPE_AUTH_TAG_BASE64 = "AAAAAAAAAAAAAAAAAAAAAA==";

function validPayloadEncryption(
  overrides: Partial<CatalogPayloadEncryptionV1> = {},
): CatalogPayloadEncryptionV1 {
  return {
    algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
    keyId: PAYLOAD_KEY_ID,
    ...overrides,
  };
}

function validEnvelope(
  overrides: Partial<CatalogEncryptedPayloadEnvelopeV1> = {},
): CatalogEncryptedPayloadEnvelopeV1 {
  return {
    version: CATALOG_PAYLOAD_ENVELOPE_VERSION,
    algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
    keyId: PAYLOAD_KEY_ID,
    nonce: ENVELOPE_NONCE_BASE64,
    ciphertext: "QUJD",
    authTag: ENVELOPE_AUTH_TAG_BASE64,
    ...overrides,
  };
}

function validPayloadKey(
  overrides: Partial<CatalogPayloadKeyV1> = {},
): CatalogPayloadKeyV1 {
  return {
    version: CATALOG_PAYLOAD_ENVELOPE_VERSION,
    algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
    keyId: PAYLOAD_KEY_ID,
    key: PAYLOAD_KEY_BASE64,
    ...overrides,
  };
}

const AAD_CONTEXT: CatalogPayloadEncryptionContext = {
  contractVersion: 1,
  type: "voice-provider",
  packId: "official.voice-provider",
  version: "1",
  schemaVersion: 1,
  createdAt: "2026-07-15T00:00:00.000Z",
  payloadEncryption: validPayloadEncryption(),
};

describe("Catalog manifest contract", () => {
  it("normalizes locale order and produces domain-separated deterministic signing bytes", () => {
    const manifest = normalizeCatalogManifest(
      validManifest({ locales: ["en-US", "zh-CN"] }),
    );

    expect(manifest.locales).toEqual(["zh-CN", "en-US"]);
    const first = decoder.decode(createCatalogManifestSigningPayload(manifest));
    const second = decoder.decode(
      createCatalogManifestSigningPayload({
        ...manifest,
        signature: "Ag==",
      }),
    );

    expect(first).toBe(second);
    expect(first).toContain('"kind":"tuff.catalog.manifest"');
    expect(first).not.toContain('signature"');
    expect(first).not.toContain("AQ==");
  });

  it.each([
    ["unknown field", { extra: true }, CATALOG_ERROR_CODES.manifestInvalid],
    [
      "pack type",
      { type: "model-registry" },
      CATALOG_ERROR_CODES.typeUnsupported,
    ],
    ["schema", { schemaVersion: 2 }, CATALOG_ERROR_CODES.schemaUnsupported],
    [
      "SDK marker",
      { minSdkapi: CATALOG_CLIENT_SDKAPI + 1 },
      CATALOG_ERROR_CODES.sdkIncompatible,
    ],
    [
      "locale coverage",
      { locales: ["en-US"] },
      CATALOG_ERROR_CODES.localeUnsupported,
    ],
    ["hash", { payloadSha256: "ABC" }, CATALOG_ERROR_CODES.manifestInvalid],
    [
      "signature",
      { signature: "not-base64" },
      CATALOG_ERROR_CODES.signatureInvalid,
    ],
    [
      "entry bound",
      { entryCount: CATALOG_MAX_ENTRIES + 1 },
      CATALOG_ERROR_CODES.entryLimitExceeded,
    ],
    [
      "payload bound",
      { payloadBytes: CATALOG_MAX_PACK_BYTES + 1 },
      CATALOG_ERROR_CODES.payloadTooLarge,
    ],
  ])("rejects invalid %s", (_name, patch, code) => {
    expectCode(
      () => normalizeCatalogManifest({ ...validManifest(), ...patch }),
      code,
    );
  });

  it("rejects oversized and malformed manifest bytes before normalization", () => {
    expectCode(
      () =>
        parseCatalogManifestBytes(
          new Uint8Array(CATALOG_MAX_MANIFEST_BYTES + 1),
        ),
      CATALOG_ERROR_CODES.manifestTooLarge,
    );
    expectCode(
      () => parseCatalogManifestBytes(encoder.encode("{")),
      CATALOG_ERROR_CODES.manifestInvalid,
    );
  });
});

describe("Domain Lexicon catalog pack contract", () => {
  it("normalizes entries and serializes metadata deterministically", () => {
    const first = validPack({
      entries: [validEntry({ metadata: { z: 1, a: { y: true, b: "value" } } })],
    });
    const second = validPack({
      entries: [validEntry({ metadata: { a: { b: "value", y: true }, z: 1 } })],
    });

    expect(decoder.decode(serializeDomainLexiconCatalogPack(first))).toBe(
      decoder.decode(serializeDomainLexiconCatalogPack(second)),
    );
    expect(
      normalizeDomainLexiconCatalogPack(first).entries[0]?.labels.locales,
    ).toEqual({
      "zh-CN": "目录米",
      "en-US": "catalog meter",
    });
  });

  it("rejects unknown fields, duplicate ids, incomplete locale maps, and duplicate aliases", () => {
    expectCode(
      () =>
        normalizeDomainLexiconCatalogPack({
          ...validPack(),
          extra: true,
        }),
      CATALOG_ERROR_CODES.packInvalid,
    );
    expectCode(
      () =>
        normalizeDomainLexiconCatalogPack(
          validPack({ entries: [validEntry(), validEntry()] }),
        ),
      CATALOG_ERROR_CODES.packInvalid,
    );
    expectCode(
      () =>
        normalizeDomainLexiconCatalogPack(
          validPack({
            entries: [
              validEntry({
                labels: {
                  default: "meter",
                  locales: { "en-US": "meter" },
                },
              }),
            ],
          }),
        ),
      CATALOG_ERROR_CODES.localeUnsupported,
    );
    expectCode(
      () =>
        normalizeDomainLexiconCatalogPack(
          validPack({
            entries: [
              validEntry({
                aliases: {
                  default: ["same", "same"],
                  locales: {
                    "zh-CN": ["相同"],
                    "en-US": ["same"],
                  },
                },
              }),
            ],
          }),
        ),
      CATALOG_ERROR_CODES.packInvalid,
    );
  });

  it("rejects unsafe or excessively deep metadata without mutating the source", () => {
    const unsafe = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 8; index += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    expectCode(
      () =>
        normalizeDomainLexiconCatalogPack(
          validPack({ entries: [validEntry({ metadata: unsafe })] }),
        ),
      CATALOG_ERROR_CODES.packInvalid,
    );
    expectCode(
      () =>
        normalizeDomainLexiconCatalogPack(
          validPack({ entries: [validEntry({ metadata: deep })] }),
        ),
      CATALOG_ERROR_CODES.packInvalid,
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects oversized and malformed pack bytes", () => {
    expectCode(
      () =>
        parseDomainLexiconCatalogPackBytes(
          new Uint8Array(CATALOG_MAX_PACK_BYTES + 1),
        ),
      CATALOG_ERROR_CODES.payloadTooLarge,
    );
    expectCode(
      () => parseDomainLexiconCatalogPackBytes(encoder.encode("{")),
      CATALOG_ERROR_CODES.packInvalid,
    );
  });
});

describe("Catalog payload encryption metadata contract", () => {
  it("normalizes a canonical encryption descriptor to exactly its two fields", () => {
    expect(normalizeCatalogPayloadEncryption(validPayloadEncryption())).toEqual({
      algorithm: "aes-256-gcm",
      keyId: PAYLOAD_KEY_ID,
    });
  });

  it.each<[string, unknown]>([
    ["unknown field", { ...validPayloadEncryption(), extra: true }],
    ["non-object", "aes-256-gcm"],
    ["missing key id", { algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM }],
    ["missing algorithm", { keyId: PAYLOAD_KEY_ID }],
    ["wrong algorithm", { ...validPayloadEncryption(), algorithm: "aes-128-gcm" }],
    ["uppercase key id", { ...validPayloadEncryption(), keyId: "Payload-2026" }],
    ["leading digit key id", { ...validPayloadEncryption(), keyId: "2026-payload" }],
    ["leading separator key id", { ...validPayloadEncryption(), keyId: "-payload" }],
    ["trailing separator key id", { ...validPayloadEncryption(), keyId: "payload-" }],
    ["double separator key id", { ...validPayloadEncryption(), keyId: "payload..x" }],
    ["path separator key id", { ...validPayloadEncryption(), keyId: "payload/2026" }],
    ["oversize key id", { ...validPayloadEncryption(), keyId: "a".repeat(97) }],
  ])("rejects invalid encryption metadata: %s", (_name, value) => {
    expectCode(
      () => normalizeCatalogPayloadEncryption(value),
      CATALOG_ERROR_CODES.manifestInvalid,
    );
  });

  it("threads payloadEncryption through manifest normalization and rejects malformed blocks", () => {
    expect(
      normalizeCatalogManifest(
        validManifest({
          type: "voice-provider",
          payloadEncryption: validPayloadEncryption(),
        }),
      ).payloadEncryption,
    ).toEqual(validPayloadEncryption());
    expectCode(
      () =>
        normalizeCatalogManifest(
          validManifest({
            type: "voice-provider",
            payloadEncryption: {
              algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
            } as CatalogPayloadEncryptionV1,
          }),
        ),
      CATALOG_ERROR_CODES.manifestInvalid,
    );
  });

  it("rejects payload encryption on packs that do not support it", () => {
    expectCode(
      () =>
        normalizeCatalogManifest(
          validManifest({
            type: "domain-lexicon",
            payloadEncryption: validPayloadEncryption(),
          }),
        ),
      CATALOG_ERROR_CODES.manifestInvalid,
    );
  });

  it("binds encryption metadata into the signing payload and keeps the legacy bytes byte-identical", () => {
    const legacyBytes = decoder.decode(
      createCatalogManifestSigningPayload(normalizeCatalogManifest(validManifest())),
    );
    expect(legacyBytes).toBe(
      `{"kind":"tuff.catalog.manifest","contractVersion":1,"type":"domain-lexicon","packId":"official.domain-lexicon","version":"2026.07.15","schemaVersion":1,"createdAt":"2026-07-15T00:00:00.000Z","minSdkapi":${CATALOG_CLIENT_SDKAPI},"locales":["zh-CN","en-US"],"entryCount":1,"payloadBytes":512,"payloadSha256":"${"a".repeat(64)}","signatureAlgorithm":"rsa-sha256","keyId":"release-v1"}`,
    );

    const encryptedBytes = decoder.decode(
      createCatalogManifestSigningPayload(
        normalizeCatalogManifest(
          validManifest({
            type: "voice-provider",
            payloadEncryption: validPayloadEncryption(),
          }),
        ),
      ),
    );
    expect(encryptedBytes).toContain(
      `"payloadSha256":"${"a".repeat(64)}","payloadEncryption":{"algorithm":"aes-256-gcm","keyId":"${PAYLOAD_KEY_ID}"},"signatureAlgorithm":"rsa-sha256"`,
    );

    const rekeyedBytes = decoder.decode(
      createCatalogManifestSigningPayload(
        normalizeCatalogManifest(
          validManifest({
            type: "voice-provider",
            payloadEncryption: validPayloadEncryption({ keyId: "payload-2026-08" }),
          }),
        ),
      ),
    );
    expect(rekeyedBytes).not.toBe(encryptedBytes);
  });
});

describe("Catalog encrypted payload envelope contract", () => {
  it("normalizes a canonical envelope and serializes key order deterministically", () => {
    expect(normalizeCatalogEncryptedPayloadEnvelope(validEnvelope())).toEqual(
      validEnvelope(),
    );
    const reordered = {
      authTag: ENVELOPE_AUTH_TAG_BASE64,
      ciphertext: "QUJD",
      keyId: PAYLOAD_KEY_ID,
      nonce: ENVELOPE_NONCE_BASE64,
      algorithm: CATALOG_PAYLOAD_ENCRYPTION_ALGORITHM,
      version: CATALOG_PAYLOAD_ENVELOPE_VERSION,
    } as CatalogEncryptedPayloadEnvelopeV1;
    expect(
      decoder.decode(serializeCatalogEncryptedPayloadEnvelope(reordered)),
    ).toBe(
      decoder.decode(serializeCatalogEncryptedPayloadEnvelope(validEnvelope())),
    );
  });

  it.each<[string, unknown]>([
    ["unknown field", { ...validEnvelope(), extra: true }],
    ["non-object", []],
    ["missing version", { ...validEnvelope(), version: undefined }],
    ["missing algorithm", { ...validEnvelope(), algorithm: undefined }],
    ["missing key id", { ...validEnvelope(), keyId: undefined }],
    ["missing nonce", { ...validEnvelope(), nonce: undefined }],
    ["missing ciphertext", { ...validEnvelope(), ciphertext: undefined }],
    ["missing auth tag", { ...validEnvelope(), authTag: undefined }],
    ["wrong version", { ...validEnvelope(), version: 2 }],
    ["wrong algorithm", { ...validEnvelope(), algorithm: "aes-128-gcm" }],
    ["malformed key id", { ...validEnvelope(), keyId: "Payload/2026" }],
    ["short nonce", { ...validEnvelope(), nonce: "AQID" }],
    ["long nonce", { ...validEnvelope(), nonce: "AAAAAAAAAAAAAAAAAAAAAA==" }],
    ["unpadded nonce", { ...validEnvelope(), nonce: "AAAAAAAAAAAAAAA" }],
    ["short auth tag", { ...validEnvelope(), authTag: "AQID" }],
    ["empty ciphertext", { ...validEnvelope(), ciphertext: "" }],
    ["unpadded ciphertext", { ...validEnvelope(), ciphertext: "AAA" }],
    ["non-base64 ciphertext", { ...validEnvelope(), ciphertext: "!!!!" }],
    [
      "oversize ciphertext",
      { ...validEnvelope(), ciphertext: "A".repeat(CATALOG_MAX_PACK_BYTES + 4) },
    ],
  ])("rejects invalid envelope field: %s", (_name, value) => {
    expectCode(
      () => normalizeCatalogEncryptedPayloadEnvelope(value),
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    );
  });

  it("rejects oversized and malformed envelope bytes before normalization", () => {
    expectCode(
      () =>
        parseCatalogEncryptedPayloadEnvelopeBytes(
          new Uint8Array(CATALOG_MAX_PACK_BYTES + 1),
        ),
      CATALOG_ERROR_CODES.payloadTooLarge,
    );
    expectCode(
      () => parseCatalogEncryptedPayloadEnvelopeBytes(encoder.encode("{")),
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    );
  });

  it("rejects a non-canonical base64 alias for the padded authentication tag", () => {
    const alias = `${"A".repeat(21)}B==`;
    expect(Buffer.from(alias, "base64")).toEqual(
      Buffer.from(ENVELOPE_AUTH_TAG_BASE64, "base64"),
    );
    expectCode(
      () => normalizeCatalogEncryptedPayloadEnvelope(validEnvelope({ authTag: alias })),
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    );
  });

  it("binds AAD bytes to pack identity and encryption metadata", () => {
    const base = decoder.decode(createCatalogPayloadEncryptionAad(AAD_CONTEXT));
    expect(base).toContain('"kind":"tuff.catalog.payload-encryption"');
    expect(base).toContain(
      `"payloadEncryption":{"algorithm":"aes-256-gcm","keyId":"${PAYLOAD_KEY_ID}"}`,
    );
    const mutations: Array<[string, Record<string, unknown>]> = [
      ["pack id", { packId: "official.voice-provider.alt" }],
      ["version", { version: "2" }],
      ["pack type", { type: "domain-lexicon" }],
      ["created at", { createdAt: "2026-07-16T00:00:00.000Z" }],
      [
        "key id",
        { payloadEncryption: validPayloadEncryption({ keyId: "payload-2026-08" }) },
      ],
    ];
    for (const [label, patch] of mutations) {
      const mutated = decoder.decode(
        createCatalogPayloadEncryptionAad({
          ...AAD_CONTEXT,
          ...patch,
        } as CatalogPayloadEncryptionContext),
      );
      expect(mutated, `${label} must alter the AAD`).not.toBe(base);
    }
  });

  it.each<[string, Record<string, unknown>, string]>([
    [
      "contract version",
      { contractVersion: 2 },
      CATALOG_ERROR_CODES.payloadEnvelopeInvalid,
    ],
    ["pack type", { type: "model-registry" }, CATALOG_ERROR_CODES.typeUnsupported],
    ["pack id", { packId: "Bad" }, CATALOG_ERROR_CODES.payloadEnvelopeInvalid],
    ["version", { version: "bad version" }, CATALOG_ERROR_CODES.payloadEnvelopeInvalid],
    ["schema version", { schemaVersion: 2 }, CATALOG_ERROR_CODES.payloadEnvelopeInvalid],
    ["timestamp", { createdAt: "2026-07-15" }, CATALOG_ERROR_CODES.payloadEnvelopeInvalid],
    [
      "key id",
      { payloadEncryption: { algorithm: "aes-256-gcm", keyId: "Bad" } },
      CATALOG_ERROR_CODES.manifestInvalid,
    ],
    [
      "algorithm",
      { payloadEncryption: { algorithm: "aes-128-gcm", keyId: PAYLOAD_KEY_ID } },
      CATALOG_ERROR_CODES.manifestInvalid,
    ],
  ])("rejects invalid AAD context: %s", (_name, patch, code) => {
    expectCode(
      () =>
        createCatalogPayloadEncryptionAad({
          ...AAD_CONTEXT,
          ...patch,
        } as CatalogPayloadEncryptionContext),
      code,
    );
  });
});

describe("Catalog payload key response contract", () => {
  it("normalizes a canonical 32-byte key response", () => {
    expect(normalizeCatalogPayloadKey(validPayloadKey())).toEqual(validPayloadKey());
  });

  it.each<[string, unknown]>([
    ["unknown field", { ...validPayloadKey(), extra: true }],
    ["non-object", 32],
    ["missing version", { ...validPayloadKey(), version: undefined }],
    ["missing algorithm", { ...validPayloadKey(), algorithm: undefined }],
    ["missing key id", { ...validPayloadKey(), keyId: undefined }],
    ["missing key", { ...validPayloadKey(), key: undefined }],
    ["wrong version", { ...validPayloadKey(), version: 2 }],
    ["wrong algorithm", { ...validPayloadKey(), algorithm: "aes-128-gcm" }],
    ["malformed key id", { ...validPayloadKey(), keyId: "Payload/2026" }],
    ["oversize key id", { ...validPayloadKey(), keyId: "a".repeat(97) }],
    ["short key", { ...validPayloadKey(), key: "AAAAAAAAAAAAAAAAAAAAAA==" }],
    [
      "long key",
      { ...validPayloadKey(), key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    ],
    [
      "unpadded key",
      { ...validPayloadKey(), key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
    ],
    ["malformed key", { ...validPayloadKey(), key: "not-base64!" }],
    ["empty key", { ...validPayloadKey(), key: "" }],
  ])("rejects invalid key response field: %s", (_name, value) => {
    expectCode(
      () => normalizeCatalogPayloadKey(value),
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
    );
  });

  it("rejects oversized and malformed key response bytes", () => {
    expectCode(
      () =>
        parseCatalogPayloadKeyBytes(
          new Uint8Array(CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES + 1),
        ),
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
    );
    expectCode(
      () => parseCatalogPayloadKeyBytes(encoder.encode("{")),
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
    );
  });

  it("rejects a non-canonical base64 alias that decodes to the same 32 bytes", () => {
    const alias = `${"A".repeat(42)}B=`;
    expect(Buffer.from(alias, "base64")).toEqual(
      Buffer.from(PAYLOAD_KEY_BASE64, "base64"),
    );
    expectCode(
      () => normalizeCatalogPayloadKey(validPayloadKey({ key: alias })),
      CATALOG_ERROR_CODES.payloadKeyUnavailable,
    );
  });
});
