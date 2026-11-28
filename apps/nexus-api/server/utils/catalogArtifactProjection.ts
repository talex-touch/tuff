/**
 * Static projection of the signed catalog artifacts the read-only Nexus routes serve.
 *
 * The layout is deliberately static: one mutable manifest pointer per catalog type plus
 * content-addressed payload objects, stored under keys derived only from the route
 * identity. Nothing here consults a D1 business table, and pack bytes never enter one —
 * the route is a projection over object storage, not a query over mutable state.
 *
 * The identity rules mirror the client contract in
 * `packages/utils/i18n/catalog.ts` (`PACK_ID_PATTERN` / `VERSION_PATTERN` / `SHA256_PATTERN`).
 * They are duplicated rather than imported because that contract ships inside the CoreApp
 * bundle and this server must reject the same shapes before touching storage; if the client
 * rules change, this file changes with them.
 *
 * Revocation signal (implement.md P2.3): the public payload route is content-addressed and its
 * AES key lives separately in the authenticated secret map. Withdrawing a published pack means
 * deleting the payload object and the matching `<type>/<packId>/<version>/<keyId>` key entry;
 * clients that have not imported it then fail closed on 404/key-unavailable. A client that already
 * activated the pack is out of these routes' reach — it refuses a lower version, so a newer signed
 * manifest must carry the client-side withdrawal. That half remains with P3; the routes must not
 * be stretched into parsing or mutating a pack to express it.
 */

export const CATALOG_ARTIFACT_TYPES = ['voice-provider'] as const

export type CatalogArtifactType = (typeof CATALOG_ARTIFACT_TYPES)[number]

/** Same shape as the client's `PACK_ID_PATTERN`. */
const PACK_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
/** Same shape as the client's `VERSION_PATTERN`. */
const VERSION_PATTERN = /^[0-9A-Z][\w.-]*$/i
/** Same shape as the client's `SHA256_PATTERN`. */
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const PAYLOAD_FILENAME_PATTERN = /^([a-f0-9]{64})\.json$/
const PAYLOAD_KEY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/

export interface CatalogArtifactIdentity {
  type: CatalogArtifactType
  packId: string
  version: string
  sha256: string
}

export interface CatalogPayloadKeyIdentity {
  type: CatalogArtifactType
  packId: string
  version: string
  keyId: string
}

export function isCatalogArtifactType(value: unknown): value is CatalogArtifactType {
  return typeof value === 'string' && (CATALOG_ARTIFACT_TYPES as readonly string[]).includes(value)
}

export function parseCatalogArtifactPayloadFilename(filename: unknown): string | null {
  if (typeof filename !== 'string' || filename.length > 80)
    return null

  const match = PAYLOAD_FILENAME_PATTERN.exec(filename)
  return match?.[1] ?? null
}

/**
 * Validate a full route identity. Anything that is not a known type carrying a well-formed
 * pack id, version, and digest resolves to `null` — the caller answers 404, never 400, so a
 * probe cannot tell "wrong shape" from "never published".
 */
export function readCatalogArtifactIdentity(input: {
  type?: unknown
  packId?: unknown
  version?: unknown
  sha256?: unknown
}): CatalogArtifactIdentity | null {
  if (!isCatalogArtifactType(input.type))
    return null
  if (typeof input.packId !== 'string' || input.packId.length > 128)
    return null
  if (!PACK_ID_PATTERN.test(input.packId))
    return null
  if (typeof input.version !== 'string' || input.version.length > 64)
    return null
  if (!VERSION_PATTERN.test(input.version))
    return null
  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256))
    return null

  return {
    type: input.type,
    packId: input.packId,
    version: input.version,
    sha256: input.sha256,
  }
}

export function readCatalogPayloadKeyIdentity(input: {
  type?: unknown
  packId?: unknown
  version?: unknown
  keyId?: unknown
}): CatalogPayloadKeyIdentity | null {
  if (!isCatalogArtifactType(input.type))
    return null
  if (typeof input.packId !== 'string' || input.packId.length > 128)
    return null
  if (!PACK_ID_PATTERN.test(input.packId))
    return null
  if (typeof input.version !== 'string' || input.version.length > 64)
    return null
  if (!VERSION_PATTERN.test(input.version))
    return null
  if (typeof input.keyId !== 'string' || input.keyId.length > 96)
    return null
  if (!PAYLOAD_KEY_ID_PATTERN.test(input.keyId))
    return null

  return {
    type: input.type,
    packId: input.packId,
    version: input.version,
    keyId: input.keyId,
  }
}

/** Secret-map lookup identity; never an object-storage key. */
export function catalogPayloadKeyLookupId(identity: CatalogPayloadKeyIdentity): string {
  return `${identity.type}/${identity.packId}/${identity.version}/${identity.keyId}`
}

/** `<type>/latest.json` — the one mutable pointer the read-only routes expose. */
export function catalogArtifactManifestObjectKey(type: CatalogArtifactType): string {
  return `catalogs/${type}/latest.json`
}

/** `<type>/<packId>/<version>/<sha256>.json` — immutable and content-addressed. */
export function catalogArtifactPayloadObjectKey(identity: CatalogArtifactIdentity): string {
  return `catalogs/${identity.type}/${identity.packId}/${identity.version}/${identity.sha256}.json`
}
