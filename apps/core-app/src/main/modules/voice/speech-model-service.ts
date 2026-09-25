/**
 * On-device speech models, installed by Tuff itself.
 *
 * Until now a model reached a user's disk only through a separate repository's CLI, and Tuff
 * could do no more than read whatever it found there. This service closes that gap: it fetches
 * the catalog the cloud publishes, installs the bundle a user picks, and reports what is
 * installed. The division of labour is what makes the flow verifiable end to end:
 *
 * - **The cloud says what exists.** `GET /api/v1/speech/models` carries ids, versions, sizes,
 *   digests, descriptors and download URLs. None of it is trusted blindly: the payload's digest
 *   is checked against the `x-content-sha256` header the same response carried, each descriptor
 *   is validated with the runtime's own validator, and each entry's descriptor must hash to the
 *   digest the catalog published for that version.
 * - **The client verifies every byte it runs.** Weights and auxiliary files are streamed through
 *   SHA-256 and refused on mismatch, so neither a URL that starts serving something else nor a
 *   catalog that was tampered with can put unverified bytes in front of the recogniser.
 * - **A bundle that needs an engine gets one.** A sherpa-onnx model is inert without
 *   `sherpa-onnx-offline`, which has no Homebrew formula; the runtime is fetched from the same
 *   catalog with the same guarantees, so installing a model is enough to be able to use it.
 */

import { createHash } from 'node:crypto'
import { isTimeoutLikeError, isTransportFailureError } from '@talex-touch/utils/network'
import type { NexusResponsePayload } from '@talex-touch/utils/transport/events/auth'
import {
  VOICE_SPEECH_CATALOG_ERROR_CODES,
  type VoiceSpeechCatalogErrorCode
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { installSpeechBundle, removeSpeechBundle } from '@talex-touch/tuff-voice'
import {
  catalogEntryToItem,
  currentPlatformTag,
  installSpeechRuntime,
  listInstalledModels,
  parseSpeechModelCatalog,
  resolveEngineRoot,
  resolveInstalledRuntime,
  resolveModelStoreRoot,
  type ParsedSpeechModelCatalog,
  type SpeechModelCatalogItem,
  type SpeechRuntimeEntryV1
} from '@talex-touch/tuff-voice'
import { performNexusRequestWithAuth } from '../auth'
import { getRuntimeNexusBaseUrl } from '../nexus/runtime-base'
import { createLogger } from '../../utils/logger'

const speechModelLog = createLogger('SpeechModelCatalog')
const SPEECH_CATALOG_CLIENT_TIMEOUT_MS = 25_000

const SPEECH_CATALOG_PUBLIC_MESSAGES: Record<VoiceSpeechCatalogErrorCode, string> = {
  [VOICE_SPEECH_CATALOG_ERROR_CODES.authRequired]:
    'Sign in to access the on-device speech model catalog.',
  [VOICE_SPEECH_CATALOG_ERROR_CODES.timeout]: 'The speech model catalog request timed out.',
  [VOICE_SPEECH_CATALOG_ERROR_CODES.upstreamUnavailable]:
    'The speech model catalog service is temporarily unavailable.',
  [VOICE_SPEECH_CATALOG_ERROR_CODES.invalid]:
    'The speech model catalog failed its integrity checks.',
  [VOICE_SPEECH_CATALOG_ERROR_CODES.unavailable]: 'The speech model catalog could not be loaded.'
}

class SpeechCatalogClientError extends Error {
  constructor(
    readonly code: VoiceSpeechCatalogErrorCode,
    readonly retryable: boolean,
    detail: string,
    options?: { cause?: unknown }
  ) {
    super(detail, options)
    this.name = 'SpeechCatalogClientError'
  }
}

export function projectSpeechCatalogApiError(
  error: unknown
): { error: string; code: VoiceSpeechCatalogErrorCode; retryable: boolean } | undefined {
  if (!(error instanceof SpeechCatalogClientError)) return undefined
  return {
    error: SPEECH_CATALOG_PUBLIC_MESSAGES[error.code],
    code: error.code,
    retryable: error.retryable
  }
}

/** Host tag the cloud catalog is matched against, e.g. `darwin-arm64`. */
export { currentPlatformTag }

export interface InstalledSpeechModelView {
  id: string
  version: string
  name: string
  engine: string
  bytes: number
  directory: string
}

export interface SpeechModelCatalogView {
  generatedAt: string
  recommended: { id: string; version: string } | null
  models: Array<{
    id: string
    version: string
    name: string
    engine: string
    languages: string[]
    bytes: number
    installed: boolean
    /** True when this host can already run it: the engine executable is present. */
    runnable: boolean
    /** Set when the bundle needs a runtime this host does not have yet. */
    needsRuntime: string | null
  }>
}

export interface SpeechModelInstallProgress {
  id: string
  version: string
  phase: 'runtime' | 'weights' | 'done'
  received: number
  total: number
}

let progress: SpeechModelInstallProgress | null = null
let inFlight: Promise<unknown> | null = null

export function getSpeechModelProgress(): SpeechModelInstallProgress | null {
  return progress
}

/** Digest the served catalog claimed for itself, kept for the integrity check below. */
function verifyServedDigest(body: string, header: string | undefined): void {
  if (!header || !/^[a-f0-9]{64}$/.test(header))
    throw new Error('SPEECH_CATALOG_DIGEST_MISSING_OR_INVALID')
  const actual = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('hex')
  if (actual !== header)
    throw new Error(
      `SPEECH_CATALOG_DIGEST_MISMATCH: the catalog body hashes to ${actual}, but the response advertised ${header}`
    )
}

export async function fetchSpeechCatalog(): Promise<ParsedSpeechModelCatalog> {
  const baseUrl = getRuntimeNexusBaseUrl()
  let response: NexusResponsePayload | null
  try {
    response = await performNexusRequestWithAuth(
      {
        url: `${baseUrl.replace(/\/+$/, '')}/api/v1/speech/models`,
        method: 'GET',
        context: 'voice.speech-models.catalog'
      },
      { timeoutMs: SPEECH_CATALOG_CLIENT_TIMEOUT_MS, rejectRedirects: true }
    )
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : ''
    if (isTimeoutLikeError(error) || code === 'NETWORK_ABORTED') {
      throw new SpeechCatalogClientError(
        VOICE_SPEECH_CATALOG_ERROR_CODES.timeout,
        true,
        'Speech model catalog request exceeded its deadline.',
        { cause: error }
      )
    }
    if (isTransportFailureError(error)) {
      throw new SpeechCatalogClientError(
        VOICE_SPEECH_CATALOG_ERROR_CODES.upstreamUnavailable,
        true,
        'Speech model catalog transport failed.',
        { cause: error }
      )
    }
    throw new SpeechCatalogClientError(
      VOICE_SPEECH_CATALOG_ERROR_CODES.unavailable,
      true,
      'Speech model catalog request failed.',
      { cause: error }
    )
  }

  if (!response) {
    throw new SpeechCatalogClientError(
      VOICE_SPEECH_CATALOG_ERROR_CODES.authRequired,
      false,
      'Speech model catalog requires an authenticated Nexus session.'
    )
  }
  if (response.status === 401 || response.status === 403) {
    throw new SpeechCatalogClientError(
      VOICE_SPEECH_CATALOG_ERROR_CODES.authRequired,
      false,
      `Speech model catalog authorization failed with HTTP ${response.status}.`
    )
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new SpeechCatalogClientError(
      VOICE_SPEECH_CATALOG_ERROR_CODES.upstreamUnavailable,
      true,
      `Speech model catalog upstream failed with HTTP ${response.status}.`
    )
  }
  if (response.status < 200 || response.status >= 300) {
    throw new SpeechCatalogClientError(
      VOICE_SPEECH_CATALOG_ERROR_CODES.unavailable,
      true,
      `Speech model catalog request failed with HTTP ${response.status}.`
    )
  }

  try {
    verifyServedDigest(response.body, response.headers['x-content-sha256'])
    return parseSpeechModelCatalog(JSON.parse(response.body))
  } catch (error) {
    throw new SpeechCatalogClientError(
      VOICE_SPEECH_CATALOG_ERROR_CODES.invalid,
      false,
      'Speech model catalog response failed digest, JSON, or schema validation.',
      { cause: error }
    )
  }
}

async function runtimeForBundle(
  runtimes: readonly SpeechRuntimeEntryV1[],
  engine: string
): Promise<{ entry: SpeechRuntimeEntryV1; binaryPath: string } | null> {
  const entry = runtimes.find(
    (runtime) => runtime.id === engine && runtime.platform === currentPlatformTag()
  )
  if (!entry) return null
  progress = {
    id: entry.id,
    version: entry.version,
    phase: 'runtime',
    received: 0,
    total: entry.bytes
  }
  const installed = await installSpeechRuntime(entry, {
    onProgress: ({ received, total }) => {
      progress = { id: entry.id, version: entry.version, phase: 'runtime', received, total }
    }
  })
  return { entry, binaryPath: installed.binaryPath }
}

/** Engines that resolve without provisioning (whisper-cli from PATH/Homebrew). */
const PATH_RESOLVED_ENGINES = new Set(['whisper-cpp'])

export async function speechModelCatalogView(): Promise<SpeechModelCatalogView> {
  const parsed = await fetchSpeechCatalog()
  const installed = await listInstalledModels(resolveModelStoreRoot())
  const installedKeys = new Set(installed.map((model) => `${model.id}@${model.version}`))

  const models: SpeechModelCatalogView['models'] = []
  for (const item of parsed.items) {
    // What this host still lacks to run the bundle: nothing for an engine resolved from
    // PATH, otherwise the engine name until its runtime is provisioned.
    const needsRuntime =
      PATH_RESOLVED_ENGINES.has(item.entry.engine) ||
      (await resolveInstalledRuntime(item.entry.engine, item.entry.engine)) !== null
        ? null
        : item.entry.engine
    models.push({
      id: item.entry.id,
      version: item.entry.version,
      name: item.entry.name,
      engine: item.entry.engine,
      languages: [...item.entry.languages],
      bytes: item.entry.bytes,
      installed: installedKeys.has(`${item.entry.id}@${item.entry.version}`),
      runnable: needsRuntime === null,
      needsRuntime
    })
  }

  return {
    generatedAt: parsed.catalog.generatedAt,
    recommended: parsed.recommended
      ? { id: parsed.recommended.entry.id, version: parsed.recommended.entry.version }
      : null,
    models
  }
}

export async function installedSpeechModels(): Promise<InstalledSpeechModelView[]> {
  const models = await listInstalledModels(resolveModelStoreRoot())
  return models.map((model) => ({
    id: model.id,
    version: model.version,
    name: model.name,
    engine: model.engine,
    bytes: model.bytes,
    directory: model.directory
  }))
}

/**
 * Install one bundle, and the runtime it needs first.
 *
 * Serialised against itself: two concurrent installs would race on the same version directory,
 * and the runtime download is the larger of the two, so a second request waits rather than
 * competing for the same disk and network.
 */
export async function installSpeechModel(
  id: string,
  version: string
): Promise<{ id: string; version: string; bytes: number; reused: number; downloaded: number }> {
  if (inFlight) await inFlight.catch(() => undefined)
  const task = (async () => {
    const parsed = await fetchSpeechCatalog()
    const item: SpeechModelCatalogItem | undefined = parsed.items.find(
      (candidate) => candidate.entry.id === id && candidate.entry.version === version
    )
    if (!item) throw new Error(`SPEECH_MODEL_NOT_IN_CATALOG: ${id}@${version}`)

    if (!PATH_RESOLVED_ENGINES.has(item.entry.engine)) {
      const runtime = await runtimeForBundle(parsed.runtimes, item.entry.engine)
      if (!runtime)
        throw new Error(
          `SPEECH_MODEL_RUNTIME_UNAVAILABLE: ${id}@${version} needs the ${item.entry.engine} runtime on ${currentPlatformTag()}, which the catalog does not publish`
        )
    }

    progress = { id, version, phase: 'weights', received: 0, total: item.entry.bytes }
    const report = await installSpeechBundle(item.spec, {
      root: resolveModelStoreRoot(),
      onProgress: ({ received, total }) => {
        progress = { id, version, phase: 'weights', received, total }
      }
    })
    progress = { id, version, phase: 'done', received: item.entry.bytes, total: item.entry.bytes }
    speechModelLog.info('Installed speech model', {
      meta: { id, version, downloaded: report.downloaded.length }
    })
    return {
      id,
      version,
      bytes: item.entry.bytes,
      reused: report.reused.length,
      downloaded: report.downloaded.length
    }
  })()

  inFlight = task
  try {
    return await task
  } finally {
    inFlight = null
    progress = null
  }
}

export async function uninstallSpeechModel(id: string, version: string): Promise<boolean> {
  const removed = await removeSpeechBundle(resolveModelStoreRoot(), id, version)
  if (removed) speechModelLog.info('Removed speech model', { meta: { id, version } })
  return removed
}

/**
 * Path of the engine executable for an installed bundle, when Tuff provisioned one.
 *
 * The voice runtime passes this into the engine so a model that needed a downloaded runtime runs
 * it, rather than reporting a missing binary the user cannot install.
 */
export async function managedEngineBinary(engine: string): Promise<string | null> {
  if (PATH_RESOLVED_ENGINES.has(engine)) return null
  return await resolveInstalledRuntime(engine, '', resolveEngineRoot())
}

/** Test seam: catalogEntryToItem is re-exported so tests can build items without the network. */
export { catalogEntryToItem }
