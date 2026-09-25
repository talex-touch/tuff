import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildSpeechCatalog,
  readSpeechCatalog,
  resetSpeechCatalogCache,
  SPEECH_CATALOG_BUILD_TIMEOUT_MS,
  SPEECH_CATALOG_CACHE_MS,
  SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY,
  SPEECH_CATALOG_REQUEST_TIMEOUT_MS,
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** A real fetch rejects the moment its signal aborts; a gated stub has to do the same. */
function abortedError(): Error {
  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

/** Drains the microtask chains the store schedules, without advancing real time. */
function flushMicrotasks(): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setImmediate(resolve)
  return promise
}

function entryFor(index: number): Record<string, unknown> {
  return {
    id: `model-${index}`,
    version: '1.0.0',
    name: `Model ${index}`,
    descriptor: `models/model-${index}/1.0.0/model.json`,
  }
}

function descriptorFor(index: number): Record<string, unknown> {
  return {
    ...DESCRIPTOR,
    id: `model-${index}`,
    runtime: { ...DESCRIPTOR.runtime, file: `model-${index}.onnx` },
  }
}

describe('speech catalog store', () => {
  beforeEach(() => {
    resetSpeechCatalogCache()
  })

  afterEach(() => {
    vi.useRealTimers()
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

    expect(payload.models.map(model => `${model.id}@${model.version}`)).toEqual([
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
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256)
  })

  it('loads descriptors with bounded concurrency and keeps the catalog order', async () => {
    const entries = Array.from({ length: SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY * 2 }, (_, index) => entryFor(index))
    const descriptorUrls = entries.map(entry => `${SOURCE}/${entry.descriptor}`)
    const gates = new Map<string, PromiseWithResolvers<Response>>()
    const issued: string[] = []
    let inFlight = 0
    let peakInFlight = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === `${SOURCE}/catalog.json`) return jsonResponse({ schemaVersion: 1, models: entries })

        issued.push(url)
        inFlight += 1
        peakInFlight = Math.max(peakInFlight, inFlight)
        const gate = Promise.withResolvers<Response>()
        gates.set(url, gate)
        const signal = init?.signal
        if (signal?.aborted) gate.reject(abortedError())
        else signal?.addEventListener('abort', () => gate.reject(abortedError()), { once: true })
        try {
          return await gate.promise
        } finally {
          inFlight -= 1
        }
      }),
    )

    const build = buildSpeechCatalog(SOURCE)
    await flushMicrotasks()

    // The pool fills to exactly the exported limit and stops there: a serial loop would have one
    // descriptor in flight, an unbounded Promise.all would have all of them.
    expect(issued).toHaveLength(SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY)
    expect(peakInFlight).toBe(SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY)

    // Release out of catalog order; every completion must refill the pool without exceeding it.
    const released = new Set<number>()
    while (released.size < descriptorUrls.length) {
      const next = descriptorUrls
        .map((url, index) => ({ url, index }))
        .filter(({ url, index }) => gates.has(url) && !released.has(index))
        .sort((left, right) => right.index - left.index)[0]
      if (!next) break
      released.add(next.index)
      gates.get(next.url)!.resolve(jsonResponse(descriptorFor(next.index)))
      await flushMicrotasks()
      expect(peakInFlight).toBeLessThanOrEqual(SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY)
    }

    const payload = await build

    expect(released.size).toBe(descriptorUrls.length)
    // Completion order was reversed, so appending results as they land would reorder the catalog;
    // the output must stay in upstream order, each model carrying its own descriptor.
    expect(payload.models.map(model => model.id)).toEqual(entries.map(entry => entry.id))
    expect(payload.models.map(model => model.descriptor)).toEqual(entries.map((_, index) => descriptorFor(index)))
  })

  it('coalesces simultaneous reads of one source into a single upstream build', async () => {
    const catalogGate = Promise.withResolvers<Response>()
    const catalogRequests: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${SOURCE}/catalog.json`) {
        catalogRequests.push(url)
        return await catalogGate.promise
      }
      return jsonResponse({ ...DESCRIPTOR, id: url })
    })
    vi.stubGlobal('fetch', fetchMock)

    const first = readSpeechCatalog(SOURCE, 1_000)
    const second = readSpeechCatalog(SOURCE, 1_000)
    await flushMicrotasks()

    expect(catalogRequests).toHaveLength(1)

    catalogGate.resolve(jsonResponse(CATALOG))
    const [a, b] = await Promise.all([first, second])

    expect(catalogRequests).toHaveLength(1)
    expect(a.sha256).toBe(b.sha256)
    // One catalog read plus one descriptor read per model: the second caller joined the first's
    // in-flight build instead of starting its own.
    expect(fetchMock.mock.calls).toHaveLength(1 + CATALOG.models.length)
  })

  it('does not share one build across different sources', async () => {
    const sourceA = `${SOURCE}/alpha`
    const sourceB = `${SOURCE}/beta`
    const catalogRequests: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === `${sourceA}/catalog.json`) {
          catalogRequests.push(url)
          return jsonResponse({ schemaVersion: 1, models: [entryFor(0)] })
        }
        if (url === `${sourceB}/catalog.json`) {
          catalogRequests.push(url)
          return jsonResponse({ schemaVersion: 1, models: [entryFor(1)] })
        }
        return jsonResponse({ ...DESCRIPTOR, id: url })
      }),
    )

    const [alpha, beta] = await Promise.all([readSpeechCatalog(sourceA, 1_000), readSpeechCatalog(sourceB, 1_000)])

    expect(catalogRequests).toHaveLength(2)
    expect(alpha.payload.models.map(model => model.id)).toEqual(['model-0'])
    expect(beta.payload.models.map(model => model.id)).toEqual(['model-1'])
  })

  it('rejects an invalid later entry before requesting any descriptor', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === `${SOURCE}/catalog.json`) {
        return jsonResponse({
          schemaVersion: 1,
          models: [entryFor(0), { id: 'broken', version: '9.9.9' }],
        })
      }
      return jsonResponse(descriptorFor(0))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(buildSpeechCatalog(SOURCE)).rejects.toThrow(/broken@9\.9\.9 names no descriptor/)

    // The catalog is validated before the fan-out, so a bad entry costs zero descriptor reads.
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([`${SOURCE}/catalog.json`])
  })

  it('rejects the whole catalog when one descriptor fails, without caching the failure', async () => {
    let upstreamHealthy = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === `${SOURCE}/catalog.json`) return jsonResponse(CATALOG)
        if (url === `${SOURCE}/models/demo-model/1.0.0/model.json`) return jsonResponse(DESCRIPTOR)
        if (url === `${SOURCE}/models/other-model/2.0.0/model.json`) {
          return upstreamHealthy
            ? jsonResponse({ ...DESCRIPTOR, id: 'other-model' })
            : new Response('boom', { status: 500 })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    await expect(readSpeechCatalog(SOURCE, 1_000)).rejects.toBeInstanceOf(SpeechCatalogUnavailableError)

    // The failed build must not be remembered: the next read retries and returns the complete
    // catalog once upstream recovers, rather than replaying a cached rejection or a half-built list.
    upstreamHealthy = true
    const recovered = await readSpeechCatalog(SOURCE, 1_000)
    expect(recovered.payload.models.map(model => `${model.id}@${model.version}`)).toEqual([
      'demo-model@1.0.0',
      'other-model@2.0.0',
    ])
  })

  it('aborts an unresponsive request at the request deadline and rejects', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === `${SOURCE}/catalog.json`) return jsonResponse(CATALOG)

        const signal = init?.signal
        if (signal) signals.push(signal)
        const hung = Promise.withResolvers<Response>()
        if (signal?.aborted) hung.reject(abortedError())
        else signal?.addEventListener('abort', () => hung.reject(abortedError()), { once: true })
        return await hung.promise
      }),
    )

    const read = readSpeechCatalog(SOURCE, 1_000)
    const unresolved = Symbol('unresolved')
    await vi.advanceTimersByTimeAsync(SPEECH_CATALOG_REQUEST_TIMEOUT_MS - 1)
    await expect(Promise.race([read, Promise.resolve(unresolved)])).resolves.toBe(unresolved)

    const rejection = expect(read).rejects.toBeInstanceOf(SpeechCatalogUnavailableError)
    await vi.advanceTimersByTimeAsync(1)
    await rejection

    // The hung upstream request was actually aborted, not merely abandoned.
    expect(signals).toHaveLength(Math.min(SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY, CATALOG.models.length))
    expect(signals.every(signal => signal.aborted)).toBe(true)
  })

  it('aborts the whole build at the build deadline when the descriptor queue outlasts the budget', async () => {
    vi.useFakeTimers()
    const entries = Array.from({ length: SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY * 4 }, (_, index) => entryFor(index))
    const descriptorUrls = entries.map(entry => `${SOURCE}/${entry.descriptor}`)
    const gates = new Map<string, PromiseWithResolvers<Response>>()
    // Every batch answers inside its own request deadline; it is the queue of four batches, not
    // one slow request, that has to run past the build budget.
    const batchStepMs = SPEECH_CATALOG_REQUEST_TIMEOUT_MS - 500

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === `${SOURCE}/catalog.json`) return jsonResponse({ schemaVersion: 1, models: entries })

        const gate = Promise.withResolvers<Response>()
        gates.set(url, gate)
        const signal = init?.signal
        if (signal?.aborted) gate.reject(abortedError())
        else signal?.addEventListener('abort', () => gate.reject(abortedError()), { once: true })
        return await gate.promise
      }),
    )

    const build = buildSpeechCatalog(SOURCE)
    const rejection = expect(build).rejects.toBeInstanceOf(SpeechCatalogUnavailableError)

    // Let the three batches that fit inside the build budget answer in time. The fourth is issued
    // just before the budget expires, so only the build deadline can end the read.
    for (let batch = 0; batch < 3; batch++) {
      await vi.advanceTimersByTimeAsync(batchStepMs)
      const first = batch * SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY
      for (let index = first; index < first + SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY; index++)
        gates.get(descriptorUrls[index]!)!.resolve(jsonResponse(descriptorFor(index)))
    }
    await vi.advanceTimersByTimeAsync(SPEECH_CATALOG_BUILD_TIMEOUT_MS - batchStepMs * 3 + 1)

    await rejection
  })
})
