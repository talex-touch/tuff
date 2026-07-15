import type { ActiveAppSnapshot } from './types'
import type { SelectionCaptureResult } from '../../transport/events/types'
import type { ITuffTransport } from '../../transport/types'
import { createPluginTuffTransport } from '../../transport'
import { AppEvents } from '../../transport/events'
import { useChannel } from './channel'

function normalizeActiveAppSnapshot(value: unknown): ActiveAppSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Record<string, unknown>
  return {
    identifier: typeof raw.identifier === 'string' ? raw.identifier : null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    bundleId: typeof raw.bundleId === 'string' ? raw.bundleId : null,
    processId: typeof raw.processId === 'number' ? raw.processId : null,
    executablePath: typeof raw.executablePath === 'string' ? raw.executablePath : null,
    platform:
      raw.platform === 'macos' || raw.platform === 'windows' || raw.platform === 'linux'
        ? raw.platform
        : null,
    windowTitle: typeof raw.windowTitle === 'string' ? raw.windowTitle : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    lastUpdated: typeof raw.lastUpdated === 'number' ? raw.lastUpdated : Date.now(),
  }
}

function normalizeSelectionCaptureResult(value: unknown): SelectionCaptureResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Selection capture returned an invalid result.')
  }

  const raw = value as Record<string, unknown>
  const supportLevel = raw.supportLevel
  const issueCode = raw.issueCode
  const limitations = raw.limitations
  if (
    typeof raw.text !== 'string'
    || (supportLevel !== 'supported'
      && supportLevel !== 'best_effort'
      && supportLevel !== 'unsupported')
    || (issueCode !== undefined
      && issueCode !== 'disabled'
      && issueCode !== 'empty'
      && issueCode !== 'failed'
      && issueCode !== 'unsupported')
    || (raw.issueMessage !== undefined && typeof raw.issueMessage !== 'string')
    || (limitations !== undefined
      && (!Array.isArray(limitations) || !limitations.every(item => typeof item === 'string')))
    || typeof raw.capturedAt !== 'number'
    || !Number.isFinite(raw.capturedAt)
  ) {
    throw new TypeError('Selection capture returned an invalid result.')
  }

  return {
    text: raw.text,
    supportLevel,
    issueCode,
    issueMessage: raw.issueMessage,
    limitations,
    capturedAt: raw.capturedAt,
  }
}

export interface PluginSystemSDK {
  getActiveAppSnapshot: (options?: {
    forceRefresh?: boolean
    includeIcon?: boolean
  }) => Promise<ActiveAppSnapshot | null>
  captureSelection: () => Promise<SelectionCaptureResult>
}

export function createPluginSystemSDK(
  transport: Pick<ITuffTransport, 'send'>,
): PluginSystemSDK {
  return {
    getActiveAppSnapshot: async (options = {}) => {
      const result = await transport.send(AppEvents.system.getActiveApp, {
        forceRefresh: options.forceRefresh === true,
        includeIcon: options.includeIcon === true,
      })
      return normalizeActiveAppSnapshot(result)
    },
    captureSelection: async () => {
      const result = await transport.send(AppEvents.system.captureSelection, {})
      return normalizeSelectionCaptureResult(result)
    },
  }
}

function getRendererSystemSdk(): PluginSystemSDK {
  const channel = useChannel(
    '[Plugin SDK] System channel requires plugin renderer context with $channel available.',
  )
  return createPluginSystemSDK(createPluginTuffTransport(channel))
}

export async function getTypedActiveAppSnapshot(
  options: { forceRefresh?: boolean, includeIcon?: boolean } = {},
): Promise<ActiveAppSnapshot | null> {
  return await getRendererSystemSdk().getActiveAppSnapshot(options)
}

export async function getActiveAppSnapshot(
  options: { forceRefresh?: boolean, includeIcon?: boolean } = {},
): Promise<ActiveAppSnapshot | null> {
  return await getTypedActiveAppSnapshot(options)
}

export async function captureSelectedText(): Promise<SelectionCaptureResult> {
  return await getRendererSystemSdk().captureSelection()
}

export const system: PluginSystemSDK = {
  getActiveAppSnapshot,
  captureSelection: captureSelectedText,
}
