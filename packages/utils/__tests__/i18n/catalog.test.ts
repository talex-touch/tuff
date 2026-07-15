import { describe, expect, it } from "vitest";
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CatalogContractError,
  CATALOG_MAX_ENTRIES,
  CATALOG_MAX_MANIFEST_BYTES,
  CATALOG_MAX_PACK_BYTES,
  createCatalogManifestSigningPayload,
  type CatalogManifestV1,
  type DomainLexiconCatalogEntryV1,
  type DomainLexiconCatalogPackV1,
  normalizeCatalogManifest,
  normalizeDomainLexiconCatalogPack,
  parseCatalogManifestBytes,
  parseDomainLexiconCatalogPackBytes,
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
