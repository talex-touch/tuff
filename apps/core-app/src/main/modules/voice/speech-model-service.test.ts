import { createHash } from 'node:crypto'
import { NetworkTimeoutError, NetworkTransportError } from '@talex-touch/utils/network'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ performNexusRequestWithAuth: vi.fn() }))

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('../auth', () => auth)
vi.mock('../nexus/runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.test'
}))
// The cloud descriptor validator is a true external boundary; every runtime export is stubbed so
// only the classification in fetchSpeechCatalog is under test.
vi.mock('@talex-touch/tuff-voice', () => ({
  catalogEntryToItem: vi.fn(),
  currentPlatformTag: () => 'darwin-arm64',
  installSpeechBundle: vi.fn(),
  installSpeechRuntime: vi.fn(),
  listInstalledModels: vi.fn(async () => []),
  parseSpeechModelCatalog: vi.fn(() => {
    throw new Error('SCHEMA_REJECTED: the catalog shape is not recognised')
  }),
  removeSpeechBundle: vi.fn(),
  resolveEngineRoot: () => '/engines',
  resolveInstalledRuntime: vi.fn(async () => null),
  resolveModelStoreRoot: () => '/models'
}))
import type { ParsedSpeechModelCatalog } from '@talex-touch/tuff-voice'
import { installSpeechBundle, parseSpeechModelCatalog } from '@talex-touch/tuff-voice'
import { registerVoicePorts } from './voice-ports'
import {
  clearSpeechCatalogCache,
  fetchSpeechCatalog,
  installSpeechModel,
  projectSpeechCatalogApiError
} from './speech-model-service'

registerVoicePorts({
  auth: {
    getAuthToken: () => null,
    getSanitizedAuthSessionState: () => ({ isLoaded: false, isSignedIn: false, user: null }),
    subscribeAuthState: () => () => undefined,
    performNexusRequestWithAuth: auth.performNexusRequestWithAuth
  },
  nexus: {
    getRuntimeNexusBaseUrl: () => 'https://nexus.example.test',
    transcribeNexusAudio: vi.fn(),
    requestNexusVoiceToken: vi.fn(),
    settleNexusVoiceUsage: vi.fn()
  }
})
const VALID_CATALOG_BODY = '{"schemaVersion":1,"models":[],"runtimes":[]}'
const MALFORMED_CATALOG_BODY = '{"schemaVersion":'
// The digest verifyServedDigest recomputes for each body, so those cases clear the integrity
// check and then fail at JSON.parse / parseSpeechModelCatalog rather than on the digest itself.
const VALID_CATALOG_DIGEST = createHash('sha256').update(VALID_CATALOG_BODY, 'utf8').digest('hex')
const MALFORMED_CATALOG_DIGEST = createHash('sha256')
  .update(MALFORMED_CATALOG_BODY, 'utf8')
  .digest('hex')

interface NexusResponseOverrides {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

function nexusResponse(overrides: Partial<NexusResponseOverrides> = {}) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    url: 'https://nexus.example.test/api/v1/speech/models',
    body: '',
    ...overrides
  }
}

interface CatalogFailureCase {
  name: string
  arrange: () => void
  code: string
  retryable: boolean
}

// Expected codes are spelled as wire literals rather than read from the shared constant: the
// renderer matches these exact strings, so a renamed constant has to fail here.
const cases: CatalogFailureCase[] = [
  {
    name: 'a missing signed-in session',
    arrange: () => auth.performNexusRequestWithAuth.mockResolvedValueOnce(null),
    code: 'SPEECH_CATALOG_AUTH_REQUIRED',
    retryable: false
  },
  {
    name: 'an HTTP 401 refusal',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({ status: 401, statusText: 'Unauthorized' })
      ),
    code: 'SPEECH_CATALOG_AUTH_REQUIRED',
    retryable: false
  },
  {
    name: 'an HTTP 403 refusal',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({ status: 403, statusText: 'Forbidden' })
      ),
    code: 'SPEECH_CATALOG_AUTH_REQUIRED',
    retryable: false
  },
  {
    name: 'a request deadline',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockRejectedValueOnce(new NetworkTimeoutError(25_000)),
    code: 'SPEECH_CATALOG_TIMEOUT',
    retryable: true
  },
  {
    name: 'a request aborted before dispatch',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockRejectedValueOnce(
        Object.assign(new Error('NETWORK_ABORTED'), { code: 'NETWORK_ABORTED' })
      ),
    code: 'SPEECH_CATALOG_TIMEOUT',
    retryable: true
  },
  {
    name: 'a normalized connection failure',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockRejectedValueOnce(
        new NetworkTransportError('net::ERR_CONNECTION_REFUSED')
      ),
    code: 'SPEECH_CATALOG_UPSTREAM_UNAVAILABLE',
    retryable: true
  },
  {
    name: 'an HTTP 503 upstream failure',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({ status: 503, statusText: 'Service Unavailable' })
      ),
    code: 'SPEECH_CATALOG_UPSTREAM_UNAVAILABLE',
    retryable: true
  },
  {
    name: 'a digest mismatch on a 200',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({
          headers: { 'x-content-sha256': 'a'.repeat(64) },
          body: VALID_CATALOG_BODY
        })
      ),
    code: 'SPEECH_CATALOG_INVALID',
    retryable: false
  },
  {
    name: 'malformed JSON on a 200 with a valid digest',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({
          headers: { 'x-content-sha256': MALFORMED_CATALOG_DIGEST },
          body: MALFORMED_CATALOG_BODY
        })
      ),
    code: 'SPEECH_CATALOG_INVALID',
    retryable: false
  },
  {
    name: 'a schema rejection on a 200 with a valid digest',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({
          headers: { 'x-content-sha256': VALID_CATALOG_DIGEST },
          body: VALID_CATALOG_BODY
        })
      ),
    code: 'SPEECH_CATALOG_INVALID',
    retryable: false
  },
  {
    name: 'an unexpected HTTP status',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({ status: 500, statusText: 'Internal Server Error' })
      ),
    code: 'SPEECH_CATALOG_UNAVAILABLE',
    retryable: true
  },
  {
    name: 'an unclassified request failure',
    arrange: () =>
      auth.performNexusRequestWithAuth.mockRejectedValueOnce(new Error('catalog exploded')),
    code: 'SPEECH_CATALOG_UNAVAILABLE',
    retryable: true
  }
]

async function catalogFailure(): Promise<unknown> {
  return fetchSpeechCatalog().then(
    () => {
      throw new Error('expected fetchSpeechCatalog to reject')
    },
    (rejection) => rejection
  )
}

describe('speech catalog failure projection', () => {
  beforeEach(() => {
    auth.performNexusRequestWithAuth.mockReset()
    clearSpeechCatalogCache()
  })

  it.each(cases)('maps $name to $code', async ({ arrange, code, retryable }) => {
    arrange()

    const projection = projectSpeechCatalogApiError(await catalogFailure())

    expect(projection?.code).toBe(code)
    expect(projection?.retryable).toBe(retryable)
    expect(projection?.error).toBeTruthy()
  })

  it('publishes only the fixed safe message, never the upstream URL, status, or digest', async () => {
    const digest = 'b'.repeat(64)
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({ headers: { 'x-content-sha256': digest }, body: VALID_CATALOG_BODY })
    )

    const projection = projectSpeechCatalogApiError(await catalogFailure())

    expect(projection?.code).toBe('SPEECH_CATALOG_INVALID')
    expect(projection?.error).not.toMatch(
      /https?:\/\/|nexus\.example|sha256|SPEECH_CATALOG_|[a-f0-9]{16}/i
    )
  })

  it('declines errors it does not own so the generic redaction still applies', () => {
    expect(projectSpeechCatalogApiError(new Error('raw upstream detail'))).toBeUndefined()
    expect(projectSpeechCatalogApiError('raw upstream detail')).toBeUndefined()
    expect(projectSpeechCatalogApiError(undefined)).toBeUndefined()
  })

  it('reuses in-memory cached catalog on consecutive calls within TTL', async () => {
    const fakeCatalog: ParsedSpeechModelCatalog = {
      catalog: { schemaVersion: 1, generatedAt: '2026-10-14T00:00:00Z', models: [], runtimes: [] },
      items: [],
      runtimes: [],
      recommended: null
    }
    vi.mocked(parseSpeechModelCatalog).mockReturnValueOnce(fakeCatalog)

    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({
        headers: { 'x-content-sha256': VALID_CATALOG_DIGEST },
        body: VALID_CATALOG_BODY
      })
    )

    const first = await fetchSpeechCatalog()
    expect(first.catalog.generatedAt).toBe('2026-10-14T00:00:00Z')
    expect(auth.performNexusRequestWithAuth).toHaveBeenCalledTimes(1)

    const second = await fetchSpeechCatalog()
    expect(second).toBe(first)
    expect(auth.performNexusRequestWithAuth).toHaveBeenCalledTimes(1)
  })

  it('strictly serializes 3+ concurrent installSpeechModel calls in FIFO order', async () => {
    const fakeCatalog: ParsedSpeechModelCatalog = {
      catalog: { schemaVersion: 1, generatedAt: '2026-10-14T00:00:00Z', models: [], runtimes: [] },
      items: [
        {
          entry: {
            id: 'model-a',
            version: '1.0.0',
            name: 'Model A',
            engine: 'whisper-cpp',
            bytes: 100,
            languages: ['zh'],
            defaultLanguage: 'zh',
            recommended: false
          } as never,
          spec: {
            id: 'model-a',
            version: '1.0.0',
            engine: 'whisper-cpp',
            files: [],
            descriptor: {}
          },
          descriptor: {} as never
        }
      ],
      runtimes: [],
      recommended: null
    }
    vi.mocked(parseSpeechModelCatalog).mockReturnValueOnce(fakeCatalog)
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({
        headers: { 'x-content-sha256': VALID_CATALOG_DIGEST },
        body: VALID_CATALOG_BODY
      })
    )

    let active = 0
    let peakActive = 0
    const order: number[] = []
    let seq = 0

    const createDeferred = () => {
      let resolve!: () => void
      const promise = new Promise<void>((res) => {
        resolve = res
      })
      return { promise, resolve }
    }

    const started = [createDeferred(), createDeferred(), createDeferred()]
    const release = [createDeferred(), createDeferred(), createDeferred()]

    vi.mocked(installSpeechBundle).mockImplementation(async () => {
      const mySeq = ++seq
      active += 1
      peakActive = Math.max(peakActive, active)
      order.push(mySeq)
      started[mySeq - 1]!.resolve()
      await release[mySeq - 1]!.promise
      active -= 1
      return {
        id: 'model-a',
        version: '1.0.0',
        directory: '/models/model-a/1.0.0',
        downloaded: [{ file: 'weights.bin', bytes: 100 }],
        reused: []
      }
    })

    const installs = [
      installSpeechModel('model-a', '1.0.0'),
      installSpeechModel('model-a', '1.0.0'),
      installSpeechModel('model-a', '1.0.0')
    ]

    await started[0]!.promise
    expect(order).toEqual([1])
    expect(active).toBe(1)

    release[0]!.resolve()
    await started[1]!.promise
    expect(order).toEqual([1, 2])
    expect(active).toBe(1)

    release[1]!.resolve()
    await started[2]!.promise
    expect(order).toEqual([1, 2, 3])
    expect(active).toBe(1)

    release[2]!.resolve()
    const results = await Promise.all(installs)

    expect(results).toHaveLength(3)
    expect(peakActive).toBe(1)
    expect(order).toEqual([1, 2, 3])
  })
})
