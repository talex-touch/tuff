import type { TuffItem } from '@talex-touch/utils'
import type { IClipboardItem } from './clipboard-history-persistence'
import { randomUUID } from 'node:crypto'

export interface ClipboardAttachedPluginRef {
  name: string
  _uniqueChannelKey?: string
}

export interface ClipboardCoreBoxPort {
  hideCoreBox(): void
  isCoreBoxWindowVisible(): boolean
  getAttachedPlugin(): ClipboardAttachedPluginRef | null
  shouldForwardClipboardChange(itemType: 'text' | 'image' | 'files'): boolean
}

export interface ClipboardAppSemanticAliasInput {
  name?: string | null
  displayName?: string | null
  bundleId?: string | null
  path?: string | null
}

export interface ClipboardPreviousAppContext {
  prevApp?: string
  prevAppName?: string
}

export interface ClipboardAcceptedExecuteRecord {
  item: TuffItem
  sessionId?: string | null
  entryPoint: 'core-box'
  eventId: string
  previousApp?: string | null
}

export interface ClipboardSearchPort {
  resolveAppSemanticAliases(app: ClipboardAppSemanticAliasInput): string[]
  resolvePreviousAppContext(): Promise<ClipboardPreviousAppContext>
  resolveExecuteEventId(eventId?: string | null): string
  recordAcceptedExecute(record: ClipboardAcceptedExecuteRecord): Promise<void>
}

export interface ClipboardOcrEnqueueJob {
  clipboardId: number
  item: IClipboardItem
  formats: string[]
  languageHint?: string
}

export interface ClipboardOcrPort {
  setTransportChannel(channel: unknown): void
  start(): Promise<void>
  registerClipboardMetaListener(
    listener: (clipboardId: number, patch: Record<string, unknown>) => void
  ): void
  enqueueFromClipboard(payload: ClipboardOcrEnqueueJob): Promise<void>
}

export interface ClipboardPluginPort {
  getPluginSdkApi(pluginId: string): number | undefined
}

export interface ClipboardPorts {
  coreBox: ClipboardCoreBoxPort
  search: ClipboardSearchPort
  ocr: ClipboardOcrPort
  plugin: ClipboardPluginPort
}

export interface ClipboardPortsPatch {
  coreBox?: Partial<ClipboardCoreBoxPort>
  search?: Partial<ClipboardSearchPort>
  ocr?: Partial<ClipboardOcrPort>
  plugin?: Partial<ClipboardPluginPort>
}

function defaultResolveExecuteEventId(eventId?: string | null): string {
  return typeof eventId === 'string' && eventId.length > 0 ? eventId : randomUUID()
}

function createDefaultClipboardPorts(): ClipboardPorts {
  return {
    coreBox: {
      hideCoreBox: () => {},
      isCoreBoxWindowVisible: () => false,
      getAttachedPlugin: () => null,
      shouldForwardClipboardChange: () => false
    },
    search: {
      resolveAppSemanticAliases: () => [],
      resolvePreviousAppContext: async () => ({}),
      resolveExecuteEventId: defaultResolveExecuteEventId,
      recordAcceptedExecute: async () => {}
    },
    ocr: {
      setTransportChannel: () => {},
      start: async () => {},
      registerClipboardMetaListener: () => {},
      enqueueFromClipboard: async () => {}
    },
    plugin: {
      getPluginSdkApi: () => undefined
    }
  }
}

let activeClipboardPorts: ClipboardPorts = createDefaultClipboardPorts()

export function getClipboardPorts(): Readonly<ClipboardPorts> {
  return activeClipboardPorts
}

export function registerClipboardPorts(patch: ClipboardPortsPatch): () => void {
  const previous = activeClipboardPorts
  const next: ClipboardPorts = {
    coreBox: { ...previous.coreBox, ...patch.coreBox },
    search: { ...previous.search, ...patch.search },
    ocr: { ...previous.ocr, ...patch.ocr },
    plugin: { ...previous.plugin, ...patch.plugin }
  }
  activeClipboardPorts = next
  return () => {
    if (activeClipboardPorts === next) {
      activeClipboardPorts = previous
    }
  }
}

export function resetClipboardPorts(): void {
  activeClipboardPorts = createDefaultClipboardPorts()
}
