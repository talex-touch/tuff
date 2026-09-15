import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_MANIFEST_BYTES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES,
  CATALOG_SCHEMA_VERSION,
  CatalogContractError,
  isCatalogPackType,
  normalizeCatalogManifest,
  parseCatalogPayloadKeyBytes,
  type CatalogPayloadKeyV1,
  type CatalogManifestV1,
  type CatalogPackType
} from '@talex-touch/utils/i18n'
import type { NexusResponsePayload } from '@talex-touch/utils/transport/events/auth'
import { Buffer } from 'node:buffer'
import { NetworkHttpStatusError, type NetworkRequestOptions } from '@talex-touch/utils/network'
import type { Readable } from 'node:stream'
import { getNetworkService } from '../network'
import { getRuntimeNexusBaseUrl } from '../nexus/runtime-base'

export interface CatalogStreamResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  url: string
  stream: Readable
}

export interface CatalogStreamClient {
  requestStream(options: NetworkRequestOptions): Promise<CatalogStreamResponse>
}

export interface CatalogPayloadKeyMaterial {
  keyId: string
  keyBytes: Uint8Array
}

export interface VoiceProviderCatalogRemote {
  fetchVoiceProviderPayloadKey(manifest: CatalogManifestV1): Promise<CatalogPayloadKeyMaterial>
}

export type CatalogAuthenticatedRequester = (path: string) => Promise<NexusResponsePayload | null>

export interface NexusCatalogRemoteDependencies {
  network?: CatalogStreamClient
  resolveBaseUrl?: () => string
  requestWithAuth?: CatalogAuthenticatedRequester
}

export interface CatalogRemote {
  fetchLatestManifest(type: CatalogPackType): Promise<Uint8Array | null>
  fetchPack(manifest: CatalogManifestV1): Promise<Uint8Array>
}

export class NexusCatalogRemote implements CatalogRemote, VoiceProviderCatalogRemote {
  private readonly network: CatalogStreamClient
  private readonly resolveBaseUrl: () => string
  private readonly requestWithAuth: CatalogAuthenticatedRequester | null

  constructor(dependencies: NexusCatalogRemoteDependencies = {}) {
    this.network = dependencies.network ?? getNetworkService()
    this.resolveBaseUrl = dependencies.resolveBaseUrl ?? getRuntimeNexusBaseUrl
    this.requestWithAuth = dependencies.requestWithAuth ?? null
  }

  async fetchLatestManifest(type: CatalogPackType): Promise<Uint8Array | null> {
    if (!isCatalogPackType(type)) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.typeUnsupported,
        'Unsupported catalog pack type'
      )
    }

    try {
      const response = await this.network.requestStream({
        method: 'GET',
        url: this.buildLatestManifestUrl(type),
        headers: { Accept: 'application/json' },
        responseType: 'stream'
      })
      if (response.status === 404) {
        response.stream.destroy()
        return null
      }
      assertSuccessfulStatus(response)
      return await readBoundedStream(
        response,
        CATALOG_MAX_MANIFEST_BYTES,
        CATALOG_ERROR_CODES.manifestTooLarge
      )
    } catch (error) {
      if (isHttpStatus(error, 404)) return null
      rethrowRemoteFailure(error, CATALOG_ERROR_CODES.remoteUnavailable)
    }
  }

  async fetchPack(manifest: CatalogManifestV1): Promise<Uint8Array> {
    const normalized = normalizeCatalogManifest(manifest)

    try {
      const response = await this.network.requestStream({
        method: 'GET',
        url: this.buildPackUrl(normalized),
        headers: { Accept: 'application/json' },
        responseType: 'stream'
      })
      if (response.status === 404) {
        response.stream.destroy()
        throw remoteError(CATALOG_ERROR_CODES.remoteMissing, 'Catalog artifact is unavailable')
      }
      assertSuccessfulStatus(response)
      return await readBoundedStream(
        response,
        CATALOG_MAX_PACK_BYTES,
        CATALOG_ERROR_CODES.payloadTooLarge
      )
    } catch (error) {
      if (isHttpStatus(error, 404)) {
        throw remoteError(CATALOG_ERROR_CODES.remoteMissing, 'Catalog artifact is unavailable')
      }
      rethrowRemoteFailure(error, CATALOG_ERROR_CODES.remoteUnavailable)
    }
  }

  async fetchVoiceProviderPayloadKey(
    manifest: CatalogManifestV1
  ): Promise<CatalogPayloadKeyMaterial> {
    const normalized = normalizeCatalogManifest(manifest)
    if (normalized.type !== 'voice-provider') {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.typeUnsupported,
        'Catalog payload key is only available for voice-provider packs'
      )
    }
    if (!normalized.payloadEncryption) {
      throw new CatalogContractError(
        CATALOG_ERROR_CODES.payloadEncryptionRequired,
        'Voice provider catalog payload must be encrypted'
      )
    }
    if (!this.requestWithAuth) {
      throw payloadKeyError()
    }

    let response: NexusResponsePayload | null
    try {
      response = await this.requestWithAuth(this.buildPayloadKeyPath(normalized))
    } catch {
      throw payloadKeyError()
    }
    if (!response || response.status < 200 || response.status >= 300) {
      throw payloadKeyError()
    }

    let payloadKey: CatalogPayloadKeyV1
    try {
      const bodyBytes = new TextEncoder().encode(response.body)
      if (bodyBytes.byteLength > CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES) {
        throw payloadKeyError()
      }
      payloadKey = parseCatalogPayloadKeyBytes(bodyBytes)
    } catch (error) {
      if (error instanceof CatalogContractError) throw error
      throw payloadKeyError()
    }
    if (
      payloadKey.algorithm !== normalized.payloadEncryption.algorithm ||
      payloadKey.keyId !== normalized.payloadEncryption.keyId
    ) {
      throw payloadKeyError()
    }

    return {
      keyId: payloadKey.keyId,
      keyBytes: Buffer.from(payloadKey.key, 'base64')
    }
  }

  private buildPayloadKeyPath(manifest: CatalogManifestV1): string {
    const encryption = manifest.payloadEncryption
    if (!encryption) throw payloadKeyError()
    return [
      '/api/v1/catalogs',
      encodeURIComponent(manifest.type),
      encodeURIComponent(manifest.packId),
      encodeURIComponent(manifest.version),
      'keys',
      encodeURIComponent(encryption.keyId)
    ].join('/')
  }

  private buildLatestManifestUrl(type: CatalogPackType): string {
    const url = this.buildUrl(`/api/v1/catalogs/${encodeURIComponent(type)}/latest`)
    url.searchParams.set('schemaVersion', String(CATALOG_SCHEMA_VERSION))
    url.searchParams.set('sdkapi', String(CATALOG_CLIENT_SDKAPI))
    return url.toString()
  }

  private buildPackUrl(manifest: CatalogManifestV1): string {
    return this.buildUrl(
      [
        '/api/v1/catalogs',
        encodeURIComponent(manifest.type),
        encodeURIComponent(manifest.packId),
        encodeURIComponent(manifest.version),
        `${encodeURIComponent(manifest.payloadSha256)}.json`
      ].join('/')
    ).toString()
  }

  private buildUrl(path: string): URL {
    const baseUrl = this.resolveBaseUrl().replace(/\/+$/, '')
    return new URL(path, `${baseUrl}/`)
  }
}

async function readBoundedStream(
  response: CatalogStreamResponse,
  maxBytes: number,
  overflowCode:
    | typeof CATALOG_ERROR_CODES.manifestTooLarge
    | typeof CATALOG_ERROR_CODES.payloadTooLarge
): Promise<Uint8Array> {
  let contentLength: number | null
  try {
    contentLength = parseContentLength(response.headers)
  } catch (error) {
    response.stream.destroy()
    throw error
  }
  if (contentLength !== null && contentLength > maxBytes) {
    response.stream.destroy()
    throw new CatalogContractError(
      overflowCode,
      'Catalog response exceeds the supported byte limit'
    )
  }

  const chunks: Buffer[] = []
  let totalBytes = 0
  try {
    for await (const rawChunk of response.stream) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
      totalBytes += chunk.byteLength
      if (totalBytes > maxBytes) {
        response.stream.destroy()
        throw new CatalogContractError(
          overflowCode,
          'Catalog response exceeds the supported byte limit'
        )
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (error instanceof CatalogContractError) throw error
    throw remoteError(CATALOG_ERROR_CODES.remoteUnavailable, 'Catalog response stream failed')
  }

  return Buffer.concat(chunks, totalBytes)
}

function parseContentLength(headers: Record<string, string>): number | null {
  const raw = headers['content-length']
  if (raw === undefined) return null
  if (!/^\d+$/.test(raw)) {
    throw remoteError(CATALOG_ERROR_CODES.remoteUnavailable, 'Catalog response length is invalid')
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) {
    throw remoteError(CATALOG_ERROR_CODES.remoteUnavailable, 'Catalog response length is invalid')
  }
  return value
}

function assertSuccessfulStatus(response: CatalogStreamResponse): void {
  if (response.status >= 200 && response.status < 300) return
  response.stream.destroy()
  throw remoteError(CATALOG_ERROR_CODES.remoteUnavailable, 'Catalog request failed')
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof NetworkHttpStatusError && error.status === status
}

function rethrowRemoteFailure(
  error: unknown,
  fallbackCode: typeof CATALOG_ERROR_CODES.remoteUnavailable
): never {
  if (error instanceof CatalogContractError) throw error
  throw remoteError(fallbackCode, 'Catalog request failed')
}

function payloadKeyError(): CatalogContractError {
  return new CatalogContractError(
    CATALOG_ERROR_CODES.payloadKeyUnavailable,
    'Catalog payload key is unavailable'
  )
}

function remoteError(
  code: typeof CATALOG_ERROR_CODES.remoteUnavailable | typeof CATALOG_ERROR_CODES.remoteMissing,
  message: string
): CatalogContractError {
  return new CatalogContractError(code, message)
}
