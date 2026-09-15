import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import {
  catalogPayloadKeyLookupId,
  type CatalogPayloadKeyIdentity,
} from './catalogArtifactProjection'
import { readCloudflareBindings } from './cloudflare'

export const VOICE_PROVIDER_CATALOG_KEYS_BINDING = 'VOICE_PROVIDER_CATALOG_KEYS'

const CATALOG_PAYLOAD_KEY_BYTES = 32
const MAX_KEY_MAP_BYTES = 64 * 1024
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export interface CatalogPayloadKeyResponse {
  version: 1
  algorithm: 'aes-256-gcm'
  keyId: string
  key: string
}

export class CatalogPayloadKeyConfigurationError extends Error {
  constructor() {
    super('Catalog payload key configuration is unavailable')
    this.name = 'CatalogPayloadKeyConfigurationError'
  }
}

function normalizeBase64Key(value: unknown): string | null {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64_PATTERN.test(value))
    return null
  const decoded = Buffer.from(value, 'base64')
  try {
    if (decoded.byteLength !== CATALOG_PAYLOAD_KEY_BYTES)
      return null
    if (decoded.toString('base64') !== value)
      return null
    return value
  }
  finally {
    decoded.fill(0)
  }
}

function readKeyMap(event: H3Event): Record<string, unknown> | null {
  const bindings = readCloudflareBindings(event)
  const raw = bindings?.VOICE_PROVIDER_CATALOG_KEYS ?? process.env.VOICE_PROVIDER_CATALOG_KEYS
  if (!raw)
    return null
  if (Buffer.byteLength(raw, 'utf8') > MAX_KEY_MAP_BYTES)
    throw new CatalogPayloadKeyConfigurationError()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    throw new CatalogPayloadKeyConfigurationError()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new CatalogPayloadKeyConfigurationError()
  const prototype = Object.getPrototypeOf(parsed)
  if (prototype !== Object.prototype && prototype !== null)
    throw new CatalogPayloadKeyConfigurationError()
  return parsed as Record<string, unknown>
}

/** Returns one authenticated pack key without logging or persisting its value. */
export function readCatalogPayloadKey(
  event: H3Event,
  identity: CatalogPayloadKeyIdentity,
): CatalogPayloadKeyResponse | null {
  const keyMap = readKeyMap(event)
  if (!keyMap)
    return null
  const key = normalizeBase64Key(keyMap[catalogPayloadKeyLookupId(identity)])
  if (!key)
    return null
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    keyId: identity.keyId,
    key,
  }
}
