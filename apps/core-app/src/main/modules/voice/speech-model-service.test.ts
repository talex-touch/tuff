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

import { fetchSpeechCatalog, projectSpeechCatalogApiError } from './speech-model-service'

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
})
