/**
 * The speech-model catalog Nexus serves to Tuff clients.
 *
 * **Why this exists.** Tuff resolves on-device models from a directory on the user's disk,
 * and something has to tell it what it may install. That something is this catalog: which
 * model bundles exist, which one we recommend, and — separately — the engine runtime a
 * bundle needs. It is served by Nexus rather than hardcoded in the client so a model can be
 * published, re-weighted, or withdrawn without shipping a new desktop build.
 *
 * **Where the truth lives.** Model facts are *not* authored here. The canonical catalog is
 * `catalog.json` in the `tuff-speech-models` repository, where every version is digest-pinned
 * and the tooling refuses to publish a bundle whose weights do not match. This module fetches
 * that catalog, fetches each version's `model.json` beside it, and projects the two into the
 * shape a client installs from: same ids, same digests, same descriptors — no re-derivation,
 * no second source of truth. A model therefore reaches users by being published upstream,
 * and the cloud picks it up.
 *
 * **What the cloud does own.** The `runtimes` list: the engine executables (`sherpa-onnx-offline`)
 * that a bundle cannot run without. Those are platform-specific distribution details — an
 * upstream release URL per OS/arch — which belong to a distribution surface rather than to a
 * model repository that publishes weights. `whisper-cpp` is deliberately absent: upstream ships
 * no macOS binary, so Tuff keeps resolving `whisper-cli` from PATH/Homebrew for whisper bundles,
 * and only sherpa models are provisioned end to end.
 *
 * **Failure is explicit.** An upstream that cannot be read produces an error, never a partial
 * or stale-forever catalog: a client that cannot learn what exists must not be told "nothing
 * is installable".
 */

import { NetworkHttpStatusError, network } from '@talex-touch/utils/network'
import { createHash } from 'node:crypto'

/** Where the canonical catalog lives. Overridable so dev and tests can point elsewhere. */
export const SPEECH_MODEL_CATALOG_SOURCE =
  process.env.NEXUS_SPEECH_CATALOG_URL?.trim() ||
  'https://raw.githubusercontent.com/talex-touch/tuff-speech-models/main'

export const SPEECH_CATALOG_CACHE_MS = 5 * 60 * 1000
export const SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY = 4
export const SPEECH_CATALOG_REQUEST_TIMEOUT_MS = 5_000
export const SPEECH_CATALOG_BUILD_TIMEOUT_MS = 16_000

export interface SpeechCatalogRuntime {
  id: 'sherpa-onnx'
  version: string
  platform: string
  bytes: number
  sha256: string
  url: string
  archive: 'tar.bz2' | 'tar.gz' | 'zip'
  binary: string
}

/**
 * Engine runtimes a bundle needs, pinned by digest.
 *
 * Hand-maintained on purpose: these are upstream release artifacts, not model versions, and a
 * wrong digest here fails the client's install rather than silently substituting a binary.
 * `sherpa-onnx-offline` is what Tuff spawns; the archive is the official release build.
 */
export const SPEECH_CATALOG_RUNTIMES: readonly SpeechCatalogRuntime[] = [
  {
    id: 'sherpa-onnx',
    version: '1.13.8',
    platform: 'darwin-arm64',
    bytes: 18252168,
    sha256: '91b96512c4fa1960f8a9ed5360a6c8dda53a4b5015d0590244f14086a234557a',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-osx-arm64-shared-no-tts.tar.bz2',
    archive: 'tar.bz2',
    binary: 'bin/sherpa-onnx-offline',
  },
]

interface UpstreamCatalogEntry {
  id: string
  version: string
  name?: string
  engine?: string
  languages?: string[]
  descriptor?: string
  bytes?: number
  sha256?: string
  default?: boolean
}

interface UpstreamCatalog {
  schemaVersion?: number
  generatedAt?: string
  models?: UpstreamCatalogEntry[]
}

export interface SpeechCatalogPayload {
  schemaVersion: 1
  generatedAt: string
  recommended?: { id: string; version: string }
  models: Array<{
    id: string
    version: string
    name: string
    engine: string
    languages: string[]
    bytes: number
    sha256: string
    descriptor: unknown
  }>
  runtimes: readonly SpeechCatalogRuntime[]
}

export class SpeechCatalogUnavailableError extends Error {
  constructor(detail: string, options?: { cause?: unknown }) {
    super(detail, options)
    this.name = 'SpeechCatalogUnavailableError'
  }
}

interface CachedSpeechCatalog {
  payload: SpeechCatalogPayload
  bytes: Uint8Array
  sha256: string
  at: number
}

const cachedCatalogs = new Map<string, CachedSpeechCatalog>()
const catalogBuilds = new Map<string, Promise<CachedSpeechCatalog>>()

/** Test seam: drop the in-process cache and any completed build references. */
export function resetSpeechCatalogCache(): void {
  cachedCatalogs.clear()
  catalogBuilds.clear()
}

function validateCatalogEntries(entries: UpstreamCatalogEntry[]): UpstreamCatalogEntry[] {
  for (const entry of entries) {
    if (typeof entry.id !== 'string' || typeof entry.version !== 'string')
      throw new SpeechCatalogUnavailableError('catalog: an entry is missing id or version')
    if (typeof entry.descriptor !== 'string')
      throw new SpeechCatalogUnavailableError(`catalog: ${entry.id}@${entry.version} names no descriptor file`)
  }
  return entries
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await map(items[index]!, index)
      }
    }),
  )
  return results
}

async function fetchJson(url: string, label: string, buildSignal: AbortSignal): Promise<unknown> {
  const requestController = new AbortController()
  const abortFromBuild = (): void => requestController.abort()
  buildSignal.addEventListener('abort', abortFromBuild, { once: true })
  if (buildSignal.aborted) abortFromBuild()
  const requestTimer = setTimeout(() => requestController.abort(), SPEECH_CATALOG_REQUEST_TIMEOUT_MS)

  try {
    const response = await network.request<unknown>({
      url,
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: requestController.signal,
    })
    return response.data
  } catch (error) {
    if (error instanceof NetworkHttpStatusError) {
      throw new SpeechCatalogUnavailableError(`${label}: ${url} answered HTTP ${error.status}`, {
        cause: error,
      })
    }
    if (requestController.signal.aborted) {
      const detail = buildSignal.aborted ? 'catalog build deadline exceeded' : 'request timed out'
      throw new SpeechCatalogUnavailableError(`${label}: ${url} ${detail}`, { cause: error })
    }
    throw new SpeechCatalogUnavailableError(`${label}: ${url} could not be reached`, { cause: error })
  } finally {
    clearTimeout(requestTimer)
    buildSignal.removeEventListener('abort', abortFromBuild)
  }
}

/**
 * Read the canonical catalog and project it for clients.
 *
 * Every version's descriptor is fetched and embedded, because a client cannot install a bundle
 * from an id alone: it needs the descriptor (engine, family, runtime file and digest) plus the
 * auxiliary files, and it verifies all of it against the entry's published digest.
 */
export async function buildSpeechCatalog(source = SPEECH_MODEL_CATALOG_SOURCE): Promise<SpeechCatalogPayload> {
  const buildController = new AbortController()
  const buildTimer = setTimeout(() => buildController.abort(), SPEECH_CATALOG_BUILD_TIMEOUT_MS)

  try {
    const upstream = (await fetchJson(`${source}/catalog.json`, 'catalog', buildController.signal)) as UpstreamCatalog
    const entries = validateCatalogEntries(Array.isArray(upstream.models) ? upstream.models : [])
    if (!entries.length) throw new SpeechCatalogUnavailableError('catalog: the upstream catalog lists no models')

    let models: SpeechCatalogPayload['models']
    try {
      models = await mapWithConcurrency(entries, SPEECH_CATALOG_DESCRIPTOR_CONCURRENCY, async entry => {
        const descriptor = (await fetchJson(
          `${source}/${entry.descriptor}`,
          `${entry.id}@${entry.version} descriptor`,
          buildController.signal,
        )) as Record<string, unknown>

        return {
          id: entry.id,
          version: entry.version,
          name: typeof entry.name === 'string' && entry.name ? entry.name : entry.id,
          engine: typeof entry.engine === 'string' ? entry.engine : String(descriptor.engine ?? ''),
          languages: Array.isArray(entry.languages)
            ? entry.languages.filter((language): language is string => typeof language === 'string')
            : Array.isArray(descriptor.languages)
              ? (descriptor.languages as unknown[]).filter(
                  (language): language is string => typeof language === 'string',
                )
              : [],
          bytes: typeof entry.bytes === 'number' ? entry.bytes : 0,
          sha256: typeof entry.sha256 === 'string' ? entry.sha256 : '',
          descriptor,
        }
      })
    } catch (error) {
      buildController.abort()
      throw error
    }

    const recommendedEntry = entries.find(entry => entry.default === true)
    return {
      schemaVersion: 1,
      generatedAt: typeof upstream.generatedAt === 'string' ? upstream.generatedAt : '',
      ...(recommendedEntry ? { recommended: { id: recommendedEntry.id, version: recommendedEntry.version } } : {}),
      models,
      runtimes: SPEECH_CATALOG_RUNTIMES,
    }
  } finally {
    clearTimeout(buildTimer)
  }
}

/** The catalog plus the digest a client can pin, cached in-process for {@link SPEECH_CATALOG_CACHE_MS}. */
export async function readSpeechCatalog(
  source = SPEECH_MODEL_CATALOG_SOURCE,
  now = Date.now(),
): Promise<{ payload: SpeechCatalogPayload; bytes: Uint8Array; sha256: string }> {
  const cached = cachedCatalogs.get(source)
  if (cached && now - cached.at < SPEECH_CATALOG_CACHE_MS) return cached

  const activeBuild = catalogBuilds.get(source)
  if (activeBuild) return await activeBuild

  const build = (async (): Promise<CachedSpeechCatalog> => {
    const payload = await buildSpeechCatalog(source)
    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const next = { payload, bytes, sha256, at: now }
    cachedCatalogs.set(source, next)
    return next
  })()
  catalogBuilds.set(source, build)

  try {
    return await build
  } finally {
    if (catalogBuilds.get(source) === build) catalogBuilds.delete(source)
  }
}
