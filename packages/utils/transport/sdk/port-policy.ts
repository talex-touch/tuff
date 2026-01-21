import { getEnv } from '../../env'
import { AppEvents, ClipboardEvents, CoreBoxEvents } from '../events'

const PORT_CHANNELS_ENV = 'TALEX_TRANSPORT_PORT_CHANNELS'

const DEFAULT_PORT_CHANNELS = new Set<string>([
  ClipboardEvents.change.toEventName(),
  AppEvents.fileIndex.progress.toEventName(),
  CoreBoxEvents.search.update.toEventName(),
  CoreBoxEvents.search.end.toEventName(),
  CoreBoxEvents.search.noResults.toEventName(),
])

let cachedRaw: string | undefined
let cachedAllowlist: ReadonlySet<string> | null = null

const parsePortChannels = (raw: string): ReadonlySet<string> => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return new Set()
  }
  const entries = trimmed.split(/[,;\s]+/).map(item => item.trim()).filter(Boolean)
  return new Set(entries)
}

export function resolvePortChannelAllowlist(): ReadonlySet<string> {
  const raw = getEnv(PORT_CHANNELS_ENV)
  if (cachedAllowlist && raw === cachedRaw) {
    return cachedAllowlist
  }
  cachedRaw = raw
  cachedAllowlist = raw === undefined ? DEFAULT_PORT_CHANNELS : parsePortChannels(raw)
  return cachedAllowlist
}

export function isPortChannelEnabled(channel: string): boolean {
  return resolvePortChannelAllowlist().has(channel)
}
