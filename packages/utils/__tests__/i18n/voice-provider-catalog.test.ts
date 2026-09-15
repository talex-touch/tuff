import { describe, expect, it } from "vitest";
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_SCHEMA_VERSION,
  CatalogContractError,
} from "../../i18n/catalog";
import {
  normalizeVoiceProviderPack,
  parseVoiceProviderCatalogPackBytes,
  serializeVoiceProviderCatalogPack,
  VoiceProviderRegistry,
  VOICE_PROVIDER_MAX_STRING_LENGTH,
  type VoiceProviderDescriptorV1,
  type VoiceProviderNormalizeResult,
  type VoiceProviderPackV1,
  type VoiceProviderRejectionReason,
} from "../../i18n/voice-provider-catalog";

const NOW = Date.parse("2026-07-15T00:00:00.000Z");

function provider(
  overrides: Partial<VoiceProviderDescriptorV1> = {},
): VoiceProviderDescriptorV1 {
  return {
    id: "nexus.default",
    displayName: {
      default: "Nexus",
      locales: { "zh-CN": "Nexus 语音", "en-US": "Nexus" },
    },
    protocol: "nexus-pack",
    transport: "http-upload",
    endpoint: {
      baseUrl: "https://nexus.example.test",
      submitPath: "/api/v1/ai/audio/transcribe",
      pollPath: "/api/v1/ai/audio/transcriptions/:requestId",
    },
    auth: { mode: "nexus-session" },
    request: {
      body: "raw-bytes",
      contentTypePolicy: "audio/*",
      headers: { "x-idempotency-key": "true" },
      idempotencyHeader: "x-idempotency-key",
    },
    models: [{ id: "nexus.audio.transcribe", label: "Nexus ASR", languages: ["zh-CN"] }],
    limits: { maxBytes: 20 * 1024 * 1024, maxDurationSec: 600, timeoutMs: 600_000 },
    ...overrides,
  };
}

function pack(overrides: Partial<VoiceProviderPackV1> = {}): VoiceProviderPackV1 {
  return {
    contractVersion: 1,
    type: "voice-provider",
    packId: "official.voice-provider",
    version: "1",
    schemaVersion: 1,
    createdAt: "2026-07-15T00:00:00.000Z",
    minSdkApi: CATALOG_CLIENT_SDKAPI,
    providers: [provider()],
    ...overrides,
  };
}

function expectRejection(
  value: unknown,
  reason: VoiceProviderRejectionReason,
): VoiceProviderNormalizeResult {
  const result = normalizeVoiceProviderPack(value, { now: NOW });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error(`Expected ${reason}`);
  expect(result.reason).toBe(reason);
  expect(result.message.length).toBeGreaterThan(0);
  return result;
}

function expectParseCode(bytes: Uint8Array, code: string): void {
  try {
    parseVoiceProviderCatalogPackBytes(bytes, { now: NOW });
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogContractError);
    expect((error as CatalogContractError).code).toBe(code);
  }
}

describe("Voice provider pack contract", () => {
  it("normalizes a valid declarative pack without executing anything", () => {
    const result = normalizeVoiceProviderPack(pack(), { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.type).toBe("voice-provider");
    expect(result.pack.version).toBe("1");
    expect(result.pack.providers).toHaveLength(1);
    expect(result.pack.providers[0]).toMatchObject({
      id: "nexus.default",
      protocol: "nexus-pack",
      transport: "http-upload",
    });
    expect(Object.isFrozen(result.pack)).toBe(true);
    expect(Object.isFrozen(result.pack.providers)).toBe(true);
  });

  it("serializes canonical bytes and parses them back identically", () => {
    const bytes = serializeVoiceProviderCatalogPack(pack());
    const replayed = parseVoiceProviderCatalogPackBytes(bytes, { now: NOW });

    expect(replayed).toEqual(pack());
    expect(bytes.byteLength).toBeLessThan(CATALOG_MAX_PACK_BYTES);
  });

  it("rejects a payload that exceeds the byte bound before parsing", () => {
    expectParseCode(
      new Uint8Array(CATALOG_MAX_PACK_BYTES + 1),
      CATALOG_ERROR_CODES.payloadTooLarge,
    );
  });

  it("exposes a read-only registry facade that carries the pack identity and resolves by id", () => {
    const result = normalizeVoiceProviderPack(
      pack({ expiry: "2026-07-16T00:00:00.000Z" }),
      { now: NOW },
    );
    if (!result.ok) throw new Error("expected a valid pack");
    const registry = new VoiceProviderRegistry(result.pack);

    expect(registry.size).toBe(1);
    expect(registry.has("nexus.default")).toBe(true);
    expect(registry.get("nexus.default")?.endpoint.baseUrl).toBe("https://nexus.example.test");
    expect(registry.get("missing.provider")).toBeUndefined();
    // Runtime resolution fails closed on these pack-level fields before it ever reads a
    // descriptor, so the facade has to keep them alongside the providers.
    expect(registry.packId).toBe("official.voice-provider");
    expect(registry.version).toBe("1");
    expect(registry.schemaVersion).toBe(CATALOG_SCHEMA_VERSION);
    expect(registry.createdAt).toBe("2026-07-15T00:00:00.000Z");
    expect(registry.minSdkApi).toBe(CATALOG_CLIENT_SDKAPI);
    expect(registry.expiry).toBe("2026-07-16T00:00:00.000Z");
  });

  it("rejects any key outside the schema", () => {
    expectRejection({ ...pack(), artifactUrl: "https://untrusted.example/pack.json" }, "unknown-key");
    expectRejection(
      { ...pack(), providers: [{ ...provider(), runScript: "process.exit(1)" }] },
      "unknown-key",
    );
  });

  it("rejects structurally invalid fields without executing them", () => {
    expectRejection({ ...pack(), schemaVersion: 2 }, "invalid-schema");
    expectRejection({ ...pack(), type: "domain-lexicon" }, "invalid-schema");
    expectRejection({ ...pack(), version: "1.0.0" }, "invalid-schema");
    expectRejection({ ...pack(), minSdkApi: -1 }, "invalid-schema");
    expectRejection({ ...pack(), providers: [] }, "invalid-schema");
    expectRejection(
      { ...pack(), providers: [{ ...provider(), transport: "udp" }] },
      "invalid-schema",
    );
  });

  it("rejects a baseUrl that is not bare https", () => {
    const withUrl = (baseUrl: string) => ({
      ...pack(),
      providers: [provider({ endpoint: { ...provider().endpoint, baseUrl } })],
    });

    expectRejection(withUrl("http://nexus.example.test"), "bad-endpoint");
    expectRejection(withUrl("https://user:pass@nexus.example.test"), "bad-endpoint");
    expectRejection(withUrl("https://nexus.example.test?token=1"), "bad-endpoint");
    expectRejection(withUrl("https://nexus.example.test#frag"), "bad-endpoint");
  });

  it("rejects a protocol that is not in the closed ASR enum", () => {
    expectRejection(
      { ...pack(), providers: [{ ...provider(), protocol: "custom-http-script" }] },
      "bad-protocol",
    );
  });

  it("rejects a nexus-pack route whose transport is not the supported upload shape", () => {
    expectRejection(
      { ...pack(), providers: [provider({ transport: "http-realtime" })] },
      "bad-protocol",
    );
  });

  it("rejects headers outside the allowlist and credential headers", () => {
    const withHeaders = (headers: Record<string, string>) => ({
      ...pack(),
      providers: [provider({ request: { ...provider().request, headers } })],
    });

    expectRejection(withHeaders({ authorization: "Bearer secret" }), "bad-header");
    expectRejection(withHeaders({ Cookie: "session=1" }), "bad-header");
    expectRejection(withHeaders({ "x-unknown-header": "1" }), "bad-header");
  });

  it("rejects duplicate provider ids", () => {
    expectRejection({ ...pack(), providers: [provider(), provider()] }, "duplicate-provider");
  });

  it("rejects a pack that requires a newer client sdkapi", () => {
    expectRejection({ ...pack(), minSdkApi: CATALOG_CLIENT_SDKAPI + 1 }, "sdkapi-too-new");
  });

  it("rejects an expired pack", () => {
    expectRejection(
      { ...pack(), expiry: "2026-07-14T23:59:59.000Z" },
      "expired",
    );
    const future = normalizeVoiceProviderPack(
      { ...pack(), expiry: "2026-07-16T00:00:00.000Z" },
      { now: NOW },
    );
    expect(future.ok).toBe(true);
  });

  it("rejects oversized strings, arrays and provider counts", () => {
    expectRejection(
      {
        ...pack(),
        providers: [
          provider({
            displayName: { default: "x".repeat(VOICE_PROVIDER_MAX_STRING_LENGTH + 1) },
          }),
        ],
      },
      "too-large",
    );
    expectRejection(
      {
        ...pack(),
        providers: [
          provider({ models: Array.from({ length: 33 }, (_, i) => ({ id: `model.${i}` })) }),
        ],
      },
      "too-large",
    );
    expectRejection(
      {
        ...pack(),
        providers: Array.from({ length: 33 }, (_, i) =>
          provider({ id: `nexus.provider-${i}` }),
        ),
      },
      "too-large",
    );
  });
});
