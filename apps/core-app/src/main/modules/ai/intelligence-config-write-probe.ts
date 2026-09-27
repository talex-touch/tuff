/**
 * Instrumentation for the write path where main's own Intelligence config writes meet the renderer's
 * copy of the document.
 *
 * Main writes the document for reasons the renderer never sees (it seeds channels, reconciles the
 * on-device route against the installed speech models), the renderer holds its own copy, and it
 * commits that copy wholesale. A copy taken before one of those writes would take the write with it,
 * and nothing in the store distinguishes that from a normal edit: the losing write simply arrives.
 *
 * One reading of this store looked exactly like that and was not. Three `text.chat` bindings present
 * on disk vanished after an unrelated UI action, and the capability editor turned out to rewrite a
 * capability as its *enabled* bindings, reaping the `enabled: false` leftovers on any toggle. An
 * instrument that only counted drops would have reported the same number for both stories, so this
 * one separates them:
 *
 * - Drops split by the state the stored binding was in. Idle drops are the editor's reaping and say
 *   nothing; a live entry leaving the document is what a lost main write or a user's own toggle
 *   looks like, and only the rest of the log can say which.
 * - The program-owned on-device entry, which no surface may release: any drop or switch-off of it is
 *   reported at `warn`, because nothing but main's own reconcile can legitimately do that.
 * - The version the writer claimed. `clientVersion === undefined` means main's conflict gate was
 *   skipped for this write — the one shape of stale write the gate cannot reject.
 *
 * Renderer logs never reach the main log, and only the renderer knows what its copy looked like, so
 * the comparison happens on the main side, where the outcome is written to disk either way. Nothing
 * here changes a write: it observes and logs only, and a document it cannot read is reported as "no
 * regression" rather than allowed to break the save it is describing.
 */
import { createLogger } from '../../utils/logger'
import {
  isOnDeviceAsrBinding,
  isOnDeviceAsrProvider
} from '@talex-touch/utils/intelligence/voice-asr'

/**
 * The main-process logger, not `getLogger` from the shared package: only this one reaches the log
 * file the product keeps on disk. A probe whose evidence lives in a terminal nobody reads is not
 * instrumentation, and the console-only logger is exactly what made this report invisible until the
 * app's stdout was opened.
 */
const probeLog = createLogger('Intelligence').child('WriteProbe')

/** How many ids one report enumerates before keeping only the counts. */
const MAX_LISTED_ENTRIES = 8

interface ProviderRecord {
  id: string
  metadata?: Record<string, unknown>
}

interface BindingRecord {
  /** `<capability>/<providerId>`, the identity used in every reported list. */
  key: string
  enabled: boolean
  programOwned: boolean
}

/**
 * What one renderer write changed relative to the document it replaced.
 *
 * Every list holds only identifiers — provider ids and `<capability>/<providerId>` keys. A provider
 * document carries credentials, and a log is not the place for them, so no value is copied here.
 */
export interface IntelligenceWriteRegression {
  /** The version the writer claimed to be based on; `undefined` means main's conflict gate was skipped. */
  clientVersion: number | undefined
  serverVersion: number
  /** Whether this write could not be rejected as stale, because it claimed no base version at all. */
  unconditional: boolean
  droppedProviderIds: string[]
  /** Bindings the stored document had bound and enabled, which the write no longer carries. */
  droppedLiveBindingKeys: string[]
  /** Bindings the stored document carried switched off — the capability editor reaps these. */
  droppedIdleBindingKeys: string[]
  disabledBindingKeys: string[]
  /** Subset of the lists above that touches the program-owned on-device channel. */
  programOwnedLosses: string[]
  providerCount: { before: number; after: number }
  bindingCount: { before: number; after: number }
}

function asDocument(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    if (value.length === 0) return null
    try {
      return asDocument(JSON.parse(value))
    } catch {
      return null
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asRecordList(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null
  )
}

/** The provider records of a document, keeping only entries a report can name. */
function readProviders(document: Record<string, unknown> | null): ProviderRecord[] {
  return asRecordList(document?.providers)
    .filter((entry) => typeof entry.id === 'string' && entry.id.length > 0)
    .map((entry) => {
      const metadata = entry.metadata
      return {
        id: entry.id as string,
        metadata:
          typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : undefined
      }
    })
}

/** Every capability binding of a document, keyed by `<capability>/<providerId>`. */
function readBindings(document: Record<string, unknown> | null): Map<string, BindingRecord> {
  const bindings = new Map<string, BindingRecord>()
  const capabilities = document?.capabilities
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) {
    return bindings
  }

  for (const [capability, value] of Object.entries(capabilities as Record<string, unknown>)) {
    const entry = asDocument(value)
    for (const candidate of asRecordList(entry?.providers)) {
      const providerId = candidate.providerId
      if (typeof providerId !== 'string' || providerId.length === 0) continue
      const key = `${capability}/${providerId}`
      bindings.set(key, {
        key,
        enabled: candidate.enabled !== false,
        programOwned: isOnDeviceAsrBinding({ providerId })
      })
    }
  }

  return bindings
}

/**
 * The regression a write carries, or `null` when it drops nothing, disables nothing, and claimed the
 * version it was based on.
 *
 * `previous` is the document the write replaces — the stored one, before this write is applied.
 */
export function describeIntelligenceWriteRegression(
  previous: unknown,
  incoming: unknown,
  context: { clientVersion?: number; serverVersion: number }
): IntelligenceWriteRegression | null {
  try {
    const previousDocument = asDocument(previous)
    const incomingDocument = asDocument(incoming)
    // An unreadable incoming document is not evidence of a loss: every entry would look dropped.
    // Reporting that would be a false alarm about the write that could not be judged.
    if (!incomingDocument) return null
    const previousProviders = readProviders(previousDocument)
    const incomingProviders = readProviders(incomingDocument)
    const previousBindings = readBindings(previousDocument)
    const incomingBindings = readBindings(incomingDocument)

    const incomingProviderIds = new Set(incomingProviders.map((provider) => provider.id))
    const droppedProviderIds: string[] = []
    const programOwnedLosses: string[] = []

    for (const provider of previousProviders) {
      if (incomingProviderIds.has(provider.id)) continue
      droppedProviderIds.push(provider.id)
      if (isOnDeviceAsrProvider(provider)) programOwnedLosses.push(`provider ${provider.id}`)
    }

    const droppedLiveBindingKeys: string[] = []
    const droppedIdleBindingKeys: string[] = []
    const disabledBindingKeys: string[] = []

    for (const [key, binding] of previousBindings) {
      const incomingBinding = incomingBindings.get(key)
      if (!incomingBinding) {
        if (binding.enabled) {
          droppedLiveBindingKeys.push(key)
        } else {
          droppedIdleBindingKeys.push(key)
        }
        if (binding.programOwned) programOwnedLosses.push(`binding ${key}`)
        continue
      }
      if (binding.enabled && !incomingBinding.enabled) {
        disabledBindingKeys.push(key)
        if (binding.programOwned) programOwnedLosses.push(`binding ${key} disabled`)
      }
    }

    const unconditional = context.clientVersion === undefined
    if (
      droppedProviderIds.length === 0 &&
      droppedLiveBindingKeys.length === 0 &&
      droppedIdleBindingKeys.length === 0 &&
      disabledBindingKeys.length === 0 &&
      !unconditional
    ) {
      return null
    }

    return {
      clientVersion: context.clientVersion,
      serverVersion: context.serverVersion,
      unconditional,
      droppedProviderIds: droppedProviderIds.slice(0, MAX_LISTED_ENTRIES),
      droppedLiveBindingKeys: droppedLiveBindingKeys.slice(0, MAX_LISTED_ENTRIES),
      droppedIdleBindingKeys: droppedIdleBindingKeys.slice(0, MAX_LISTED_ENTRIES),
      disabledBindingKeys: disabledBindingKeys.slice(0, MAX_LISTED_ENTRIES),
      programOwnedLosses,
      providerCount: { before: previousProviders.length, after: incomingProviders.length },
      bindingCount: { before: previousBindings.size, after: incomingBindings.size }
    }
  } catch (error) {
    probeLog.debug('Intelligence write probe could not read a document', { error })
    return null
  }
}

/**
 * Writes one regression to the log.
 *
 * Losing a program-owned entry is a warning: main seeds and reconciles that channel from the model
 * store, no surface offers it any more, and a renderer write that takes it away leaves dictation
 * pointing at nothing until the next install. Everything else is recorded without being called a
 * fault, because a user may legitimately delete a channel or switch one off — the report splits the
 * lists by what the stored entries were doing so that reading the log is enough to tell a reaped
 * leftover from a route that was in use.
 *
 * The line is flat `key=value` text because the main logger's structured meta takes primitives only,
 * and the lists are the whole point.
 */
export function reportIntelligenceWriteRegression(regression: IntelligenceWriteRegression): void {
  const fields = [
    `client=v${regression.clientVersion ?? 'none'}`,
    `server=v${regression.serverVersion}`,
    regression.unconditional ? 'unconditional=true' : null,
    regression.droppedProviderIds.length
      ? `providers=${regression.droppedProviderIds.join(',')}`
      : null,
    regression.droppedLiveBindingKeys.length
      ? `live=${regression.droppedLiveBindingKeys.join(',')}`
      : null,
    regression.droppedIdleBindingKeys.length
      ? `idle=${regression.droppedIdleBindingKeys.join(',')}`
      : null,
    regression.disabledBindingKeys.length
      ? `disabled=${regression.disabledBindingKeys.join(',')}`
      : null,
    regression.programOwnedLosses.length
      ? `programOwned=${regression.programOwnedLosses.join(',')}`
      : null,
    `counts=${regression.providerCount.before}->${regression.providerCount.after}p/${regression.bindingCount.before}->${regression.bindingCount.after}b`
  ]
    .filter((field): field is string => field !== null)
    .join(' ')

  if (regression.programOwnedLosses.length > 0) {
    probeLog.warn(`Renderer write removed a program-owned intelligence route ${fields}`)
    return
  }
  probeLog.info(`Renderer write regressed the intelligence config ${fields}`)
}
