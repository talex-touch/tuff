import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSpeechCatalog,
  readSpeechCatalog,
  resetSpeechCatalogCache,
  SPEECH_CATALOG_CACHE_MS,
  SPEECH_CATALOG_RUNTIMES,
  SpeechCatalogUnavailableError,
} from './speechCatalogStore'

const SOURCE = 'https://catalog.test/tuff-speech-models'

const DESCRIPTOR = {
  schemaVersion: 1,
  id: 'demo-model',
  version: '1.0.0',
  name: 'Demo',
  engine: 'sherpa-onnx',
  sherpa: { family: 'sense-voice' },
  languages: ['zh'],
  runtime: { kind: 'onnx', file: 'model.onnx', bytes: 12, sha256: 'a'.repeat(64) },
  auxiliary: [
    { role: 'tokenizer', file: 'tokens.txt', bytes: 3, sha256: 'b'.repeat(64), url: 'https://cdn.test/tokens.txt' },
  ],
  capabilities: { stream: true, upload: true },
  source: { provider: 'test', url: 'https://cdn.test/model.onnx' },
  license: { spdx: 'Apache-2.0', redistributable: true },
}

const CATALOG = {
  schemaVersion: 1,
  generatedAt: '2026-09-18T00:00:00.000Z',
  models: [
    {
      id: 'demo-model',
      version: '1.0.0',
      name: 'Demo',
      engine: 'sherpa-onnx',
      languages: ['zh'],
      descriptor: 'models/demo-model/1.0.0/model.json',
      bytes: 15,
      sha256: 'c'.repeat(64),
      default: true,
    },
    {
      id: 'other-model',
      version: '2.0.0',
      name: 'Other',
      engine: 'whisper-cpp',
      languages: ['zh', 'en'],
      descriptor: 'models/other-model/2.0.0/model.json',
      bytes: 100,
      sha256: 'd'.repeat(64),
      default: false,
    },
  ],
}

function serve(routes: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    const body = routes[url]
    if (body === undefined) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('speech catalog store', () => {
  beforeEach(() => {
    resetSpeechCatalogCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetSpeechCatalogCache()
  })

  it('embeds each version descriptor and keeps the upstream identity', async () => {
    serve({
      [`${SOURCE}/catalog.json`]: CATALOG,
      [`${SOURCE}/models/demo-model/1.0.0/model.json`]: DESCRIPTOR,
      [`${SOURCE}/models/other-model/2.0.0/model.json`]: { ...DESCRIPTOR, id: 'other-model' },
    })

    const payload = await buildSpeechCatalog(SOURCE)

    expect(payload.models.map((model) => `${model.id}@${model.version}`)).toEqual([
      'demo-model@1.0.0',
      'other-model@2.0.0',
    ])
    // The descriptor travels verbatim: the client re-validates it and hashes it against the
    // digest the catalog published, so the cloud must not re-derive any of it.
    expect(payload.models[0]!.descriptor).toEqual(DESCRIPTOR)
    expect(payload.models[0]!.sha256).toBe('c'.repeat(64))
    expect(payload.recommended).toEqual({ id: 'demo-model', version: '1.0.0' })
    expect(payload.runtimes).toEqual(SPEECH_CATALOG_RUNTIMES)
    expect(payload.generatedAt).toBe('2026-09-18T00:00:00.000Z')
  })

  it('fails loudly when a descriptor cannot be read', async () => {
    serve({
      [`${SOURCE}/catalog.json`]: CATALOG,
      [`${SOURCE}/models/demo-model/1.0.0/model.json`]: DESCRIPTOR,
      // other-model's descriptor is absent
    })

    await expect(buildSpeechCatalog(SOURCE)).rejects.toBeInstanceOf(SpeechCatalogUnavailableError)
  })

  it('refuses an empty catalog instead of reporting nothing is installable', async () => {
    serve({ [`${SOURCE}/catalog.json`]: { schemaVersion: 1, models: [] } })

    await expect(buildSpeechCatalog(SOURCE)).rejects.toThrow(/lists no models/)
  })

  it('serves one cached copy inside the window and refetches after it', async () => {
    const fetchMock = serve({
      [`${SOURCE}/catalog.json`]: CATALOG,
      [`${SOURCE}/models/demo-model/1.0.0/model.json`]: DESCRIPTOR,
      [`${SOURCE}/models/other-model/2.0.0/model.json`]: { ...DESCRIPTOR, id: 'other-model' },
    })

    const first = await readSpeechCatalog(SOURCE, 1_000)
    const callsAfterFirst = fetchMock.mock.calls.length
    const second = await readSpeechCatalog(SOURCE, 1_000 + SPEECH_CATALOG_CACHE_MS - 1)

    expect(second.sha256).toBe(first.sha256)
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst)

    await readSpeechCatalog(SOURCE, 1_000 + SPEECH_CATALOG_CACHE_MS + 1)
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('digests the exact bytes it returns, so a client can pin what it read', async () => {
    serve({
      [`${SOURCE}/catalog.json`]: CATALOG,
      [`${SOURCE}/models/demo-model/1.0.0/model.json`]: DESCRIPTOR,
      [`${SOURCE}/models/other-model/2.0.0/model.json`]: { ...DESCRIPTOR, id: 'other-model' },
    })

    const { bytes, sha256, payload } = await readSpeechCatalog(SOURCE, 1_000)

    expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify(payload))
    const { createHash } = await import('node:crypto')
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
  })
})
