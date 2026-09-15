import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CATALOG_MAX_MANIFEST_BYTES,
  CATALOG_MAX_PACK_BYTES,
  CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES,
  CatalogContractError,
  type CatalogErrorCode,
  type CatalogManifestV1
} from '@talex-touch/utils/i18n'
import { NetworkHttpStatusError, type NetworkRequestOptions } from '@talex-touch/utils/network'
import type { NexusResponsePayload } from '@talex-touch/utils/transport/events/auth'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  NexusCatalogRemote,
  type CatalogStreamClient,
  type CatalogStreamResponse
} from './catalog-remote'

function manifest(overrides: Partial<CatalogManifestV1> = {}): CatalogManifestV1 {
  return {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'official.domain-lexicon',
    version: '2026.07.15_beta',
    schemaVersion: 1,
    createdAt: '2026-07-15T00:00:00.000Z',
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: ['zh-CN', 'en-US'],
    entryCount: 1,
    payloadBytes: 2,
    payloadSha256: 'a'.repeat(64),
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA==',
    ...overrides
  }
}

function response(
  stream: Readable,
  options: { status?: number; headers?: Record<string, string> } = {}
): CatalogStreamResponse {
  return {
    status: options.status ?? 200,
    statusText: options.status === 404 ? 'Not Found' : 'OK',
    headers: options.headers ?? {},
    url: 'https://nexus.example.test/response',
    stream
  }
}

function remoteWith(
  requestStream: (options: NetworkRequestOptions) => Promise<CatalogStreamResponse>
): { remote: NexusCatalogRemote; network: CatalogStreamClient } {
  const network = { requestStream: vi.fn(requestStream) }
  return {
    network,
    remote: new NexusCatalogRemote({
      network,
      resolveBaseUrl: () => 'https://nexus.example.test/root/'
    })
  }
}

async function expectCode(promise: Promise<unknown>, code: CatalogErrorCode): Promise<void> {
  try {
    await promise
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogContractError)
    expect((error as CatalogContractError).code).toBe(code)
  }
}

describe('NexusCatalogRemote', () => {
  it('builds the exact latest-manifest route from the runtime Nexus origin', async () => {
    const { remote, network } = remoteWith(async () => response(Readable.from([Buffer.from('{}')])))

    await expect(remote.fetchLatestManifest('domain-lexicon')).resolves.toEqual(Buffer.from('{}'))
    expect(network.requestStream).toHaveBeenCalledWith({
      method: 'GET',
      url:
        'https://nexus.example.test/api/v1/catalogs/domain-lexicon/latest' +
        `?schemaVersion=1&sdkapi=${CATALOG_CLIENT_SDKAPI}`,
      headers: { Accept: 'application/json' },
      responseType: 'stream'
    })
  })

  it('derives the immutable artifact route only from normalized signed identity fields', async () => {
    const { remote, network } = remoteWith(async () => response(Readable.from([Buffer.from('{}')])))
    const signed = manifest()

    await remote.fetchPack(signed)

    expect(network.requestStream).toHaveBeenCalledWith(
      expect.objectContaining({
        url:
          'https://nexus.example.test/api/v1/catalogs/domain-lexicon/' +
          `official.domain-lexicon/2026.07.15_beta/${'a'.repeat(64)}.json`
      })
    )

    const hostile = {
      ...signed,
      artifactUrl: 'https://untrusted.example/pack.json'
    } as CatalogManifestV1
    await expectCode(remote.fetchPack(hostile), CATALOG_ERROR_CODES.manifestInvalid)
    expect(network.requestStream).toHaveBeenCalledTimes(1)
  })

  it('maps latest-manifest 404 to null and artifact 404 to a stable missing code', async () => {
    const notFound = new NetworkHttpStatusError(
      404,
      'Not Found',
      'https://nexus.example.test/missing'
    )
    const { remote } = remoteWith(async () => {
      throw notFound
    })

    await expect(remote.fetchLatestManifest('domain-lexicon')).resolves.toBeNull()
    await expectCode(remote.fetchPack(manifest()), CATALOG_ERROR_CODES.remoteMissing)
  })

  it('destroys the stream immediately when content-length exceeds the applicable bound', async () => {
    const manifestStream = Readable.from([Buffer.from('not consumed')])
    const manifestDestroy = vi.spyOn(manifestStream, 'destroy')
    const packStream = Readable.from([Buffer.from('not consumed')])
    const packDestroy = vi.spyOn(packStream, 'destroy')
    let request = 0
    const { remote } = remoteWith(async () => {
      request += 1
      return request === 1
        ? response(manifestStream, {
            headers: { 'content-length': String(CATALOG_MAX_MANIFEST_BYTES + 1) }
          })
        : response(packStream, {
            headers: { 'content-length': String(CATALOG_MAX_PACK_BYTES + 1) }
          })
    })

    await expectCode(
      remote.fetchLatestManifest('domain-lexicon'),
      CATALOG_ERROR_CODES.manifestTooLarge
    )
    await expectCode(remote.fetchPack(manifest()), CATALOG_ERROR_CODES.payloadTooLarge)
    expect(manifestDestroy).toHaveBeenCalled()
    expect(packDestroy).toHaveBeenCalled()
  })

  it('cancels a streamed overflow without issuing a second request', async () => {
    const stream = Readable.from([Buffer.alloc(CATALOG_MAX_MANIFEST_BYTES), Buffer.from('x')])
    const destroy = vi.spyOn(stream, 'destroy')
    const { remote, network } = remoteWith(async () => response(stream))

    await expectCode(
      remote.fetchLatestManifest('domain-lexicon'),
      CATALOG_ERROR_CODES.manifestTooLarge
    )
    expect(destroy).toHaveBeenCalled()
    expect(network.requestStream).toHaveBeenCalledTimes(1)
  })

  it('maps partial stream failures without replaying immutable response bytes', async () => {
    const stream = new Readable({
      read() {
        this.push(Buffer.from('partial'))
        this.destroy(new Error('upstream dropped'))
      }
    })
    const { remote, network } = remoteWith(async () => response(stream))

    await expectCode(
      remote.fetchLatestManifest('domain-lexicon'),
      CATALOG_ERROR_CODES.remoteUnavailable
    )
    expect(network.requestStream).toHaveBeenCalledTimes(1)
  })

  it('accepts an exact-limit stream and rejects invalid length metadata', async () => {
    const exact = Buffer.alloc(CATALOG_MAX_MANIFEST_BYTES, 1)
    const invalidLengthStream = Readable.from([Buffer.from('{}')])
    const invalidLengthDestroy = vi.spyOn(invalidLengthStream, 'destroy')
    let request = 0
    const { remote } = remoteWith(async () => {
      request += 1
      return request === 1
        ? response(Readable.from([exact]), {
            headers: { 'content-length': String(CATALOG_MAX_MANIFEST_BYTES) }
          })
        : response(invalidLengthStream, {
            headers: { 'content-length': 'not-a-number' }
          })
    })

    await expect(remote.fetchLatestManifest('domain-lexicon')).resolves.toHaveLength(
      CATALOG_MAX_MANIFEST_BYTES
    )
    await expectCode(
      remote.fetchLatestManifest('domain-lexicon'),
      CATALOG_ERROR_CODES.remoteUnavailable
    )
    expect(invalidLengthDestroy).toHaveBeenCalled()
  })

  it('maps non-404 status and network failures to a sanitized remote code', async () => {
    const { remote: statusRemote } = remoteWith(async () =>
      response(Readable.from([]), { status: 503 })
    )
    await expectCode(
      statusRemote.fetchLatestManifest('domain-lexicon'),
      CATALOG_ERROR_CODES.remoteUnavailable
    )

    const { remote: failureRemote } = remoteWith(async () => {
      throw new Error('sensitive upstream detail')
    })
    await expectCode(failureRemote.fetchPack(manifest()), CATALOG_ERROR_CODES.remoteUnavailable)
  })
})

describe('NexusCatalogRemote voice-provider payload key', () => {
  function voiceManifest(overrides: Partial<CatalogManifestV1> = {}): CatalogManifestV1 {
    return {
      contractVersion: 1,
      type: 'voice-provider',
      packId: 'official.voice-provider',
      version: '20260701',
      schemaVersion: 1,
      createdAt: '2026-07-15T00:00:00.000Z',
      minSdkapi: CATALOG_CLIENT_SDKAPI,
      locales: ['zh-CN', 'en-US'],
      entryCount: 1,
      payloadBytes: 200,
      payloadSha256: 'b'.repeat(64),
      payloadEncryption: { algorithm: 'aes-256-gcm', keyId: 'voice-key-v1' },
      signatureAlgorithm: 'rsa-sha256',
      keyId: 'release-v1',
      signature: 'AA==',
      ...overrides
    }
  }

  function keyBody(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      version: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'voice-key-v1',
      key: Buffer.alloc(32, 9).toString('base64'),
      ...overrides
    })
  }

  function nexusResponse(body: string, status = 200): NexusResponsePayload {
    return {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: {},
      url: 'https://nexus.example.test/keys',
      body
    }
  }

  function voiceRemoteWith(
    requestWithAuth: (path: string) => Promise<NexusResponsePayload | null>
  ) {
    const requester = vi.fn(requestWithAuth)
    return {
      requester,
      remote: new NexusCatalogRemote({
        network: { requestStream: vi.fn() },
        resolveBaseUrl: () => 'https://nexus.example.test/root/',
        requestWithAuth: requester
      })
    }
  }

  it('fetches the payload key from the exact authenticated route and decodes canonical bytes', async () => {
    const { remote, requester } = voiceRemoteWith(async () => nexusResponse(keyBody()))

    const material = await remote.fetchVoiceProviderPayloadKey(voiceManifest())

    expect(material.keyId).toBe('voice-key-v1')
    expect(Buffer.from(material.keyBytes)).toEqual(Buffer.alloc(32, 9))
    expect(requester).toHaveBeenCalledWith(
      '/api/v1/catalogs/voice-provider/official.voice-provider/20260701/keys/voice-key-v1'
    )
  })

  it.each([401, 403, 500])(
    'maps an authenticated key endpoint status %i to payloadKeyUnavailable',
    async (status) => {
      const { remote } = voiceRemoteWith(async () => nexusResponse(keyBody(), status))

      await expectCode(
        remote.fetchVoiceProviderPayloadKey(voiceManifest()),
        CATALOG_ERROR_CODES.payloadKeyUnavailable
      )
    }
  )

  it('maps a missing authenticated response to payloadKeyUnavailable', async () => {
    const { remote } = voiceRemoteWith(async () => null)

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(voiceManifest()),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it('sanitizes an authenticated request failure to payloadKeyUnavailable', async () => {
    const { remote } = voiceRemoteWith(async () => {
      throw new Error('sensitive upstream detail')
    })

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(voiceManifest()),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it.each([
    ['a non-JSON body', 'not-json'],
    [
      'a missing key field',
      JSON.stringify({ version: 1, algorithm: 'aes-256-gcm', keyId: 'voice-key-v1' })
    ],
    ['a wrong-length key', keyBody({ key: Buffer.alloc(16, 9).toString('base64') })],
    ['a non-canonical key encoding', keyBody({ key: 'not base64!!' })],
    ['an unexpected field', keyBody({ extra: true })]
  ])('maps %s to payloadKeyUnavailable', async (_label, body) => {
    const { remote } = voiceRemoteWith(async () => nexusResponse(body))

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(voiceManifest()),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it('rejects a key response over the supported byte bound with payloadKeyUnavailable', async () => {
    const { remote } = voiceRemoteWith(async () =>
      nexusResponse('x'.repeat(CATALOG_MAX_PAYLOAD_KEY_RESPONSE_BYTES + 1))
    )

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(voiceManifest()),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it.each([
    ['key id', { keyId: 'other-key-v1' }],
    ['algorithm', { algorithm: 'aes-128-gcm' }]
  ])(
    'rejects a key response whose %s disagrees with the manifest encryption',
    async (_label, overrides) => {
      const { remote } = voiceRemoteWith(async () => nexusResponse(keyBody(overrides)))

      await expectCode(
        remote.fetchVoiceProviderPayloadKey(voiceManifest()),
        CATALOG_ERROR_CODES.payloadKeyUnavailable
      )
    }
  )

  it('fails closed without an authenticated requester', async () => {
    const remote = new NexusCatalogRemote({
      network: { requestStream: vi.fn() },
      resolveBaseUrl: () => 'https://nexus.example.test/root/'
    })

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(voiceManifest()),
      CATALOG_ERROR_CODES.payloadKeyUnavailable
    )
  })

  it('rejects a non-voice-provider manifest with typeUnsupported', async () => {
    const { remote } = voiceRemoteWith(async () => nexusResponse(keyBody()))

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(
        voiceManifest({ type: 'domain-lexicon', payloadEncryption: undefined })
      ),
      CATALOG_ERROR_CODES.typeUnsupported
    )
  })

  it('requires encryption metadata before requesting a payload key', async () => {
    const { remote, requester } = voiceRemoteWith(async () => nexusResponse(keyBody()))

    await expectCode(
      remote.fetchVoiceProviderPayloadKey(voiceManifest({ payloadEncryption: undefined })),
      CATALOG_ERROR_CODES.payloadEncryptionRequired
    )
    expect(requester).not.toHaveBeenCalled()
  })
})
