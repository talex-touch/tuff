import type { ActiveAppSnapshot } from './types'
import type { ResolvedApplication, SelectionCaptureResult } from '../../transport/events/types'
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
    platform: raw.platform === 'macos' || raw.platform === 'windows' || raw.platform === 'linux' ? raw.platform : null,
    windowTitle: typeof raw.windowTitle === 'string' ? raw.windowTitle : null,
    url: typeof raw.url === 'string' ? raw.url : null,
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    lastUpdated: typeof raw.lastUpdated === 'number' ? raw.lastUpdated : Date.now(),
  }
}

function normalizeResolvedApplication(value: unknown): ResolvedApplication | null {
  if (value === null) {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Application resolution returned an invalid result.')
  }

  const raw = value as Record<string, unknown>
  const identifier = typeof raw.identifier === 'string' ? raw.identifier.trim() : ''
  const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : ''
  const icon = raw.icon
  if (
    !identifier ||
    identifier.length > 512 ||
    !displayName ||
    displayName.length > 256 ||
    (icon !== null && (typeof icon !== 'string' || !icon.startsWith('tfile:')))
  ) {
    throw new TypeError('Application resolution returned an invalid result.')
  }

  return {
    identifier,
    displayName,
    icon,
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
    typeof raw.text !== 'string' ||
    (supportLevel !== 'supported' && supportLevel !== 'best_effort' && supportLevel !== 'unsupported') ||
    (issueCode !== undefined &&
      issueCode !== 'disabled' &&
      issueCode !== 'empty' &&
      issueCode !== 'failed' &&
      issueCode !== 'unsupported') ||
    (raw.issueMessage !== undefined && typeof raw.issueMessage !== 'string') ||
    (limitations !== undefined &&
      (!Array.isArray(limitations) || !limitations.every(item => typeof item === 'string'))) ||
    typeof raw.capturedAt !== 'number' ||
    !Number.isFinite(raw.capturedAt)
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
  resolveApplication: (identifier: string) => Promise<ResolvedApplication | null>
  captureSelection: () => Promise<SelectionCaptureResult>
  /**
   * Show and focus the host application's main window.
   */
  showMainWindow: () => Promise<void>
  /**
   * Open a URL in the user's default browser.
   *
   * Requires the `system.shell` permission, the same one the Prelude's `open-url`
   * capability requires — a surface must not be the cheaper way to reach the same shell.
   * The host validates the protocol; this only rejects an empty argument.
   */
  openExternal: (url: string) => Promise<void>
  /**
   * Reveal a path in the system file manager. Directories open, files are selected
   * in their parent.
   *
   * Requires the `system.shell` permission. The host resolves and stats the path, so a
   * caller cannot use this to walk the filesystem without holding that permission.
   */
  showInFolder: (path: string) => Promise<void>
}

export function createPluginSystemSDK(transport: Pick<ITuffTransport, 'send'>): PluginSystemSDK {
  return {
    getActiveAppSnapshot: async (options = {}) => {
      const result = await transport.send(AppEvents.system.getActiveApp, {
        forceRefresh: options.forceRefresh === true,
        includeIcon: options.includeIcon === true,
      })
      return normalizeActiveAppSnapshot(result)
    },
    resolveApplication: async identifier => {
      const normalizedIdentifier = identifier.trim()
      if (!normalizedIdentifier || normalizedIdentifier.length > 512) {
        throw new TypeError('Application identifier is required.')
      }
      const result = await transport.send(AppEvents.system.resolveApplication, {
        identifier: normalizedIdentifier,
      })
      return normalizeResolvedApplication(result)
    },
    captureSelection: async () => {
      const result = await transport.send(AppEvents.system.captureSelection, {})
      return normalizeSelectionCaptureResult(result)
    },
    showMainWindow: async () => {
      await transport.send(AppEvents.window.show, undefined)
    },
    openExternal: async url => {
      const normalizedUrl = typeof url === 'string' ? url.trim() : ''
      if (!normalizedUrl) {
        throw new TypeError('External URL is required.')
      }
      await transport.send(AppEvents.system.openExternal, { url: normalizedUrl })
    },
    showInFolder: async path => {
      const normalizedPath = typeof path === 'string' ? path.trim() : ''
      if (!normalizedPath) {
        throw new TypeError('Path is required.')
      }
      await transport.send(AppEvents.system.showInFolder, { path: normalizedPath })
    },
  }
}

function getRendererSystemSdk(): PluginSystemSDK {
  const channel = useChannel('[Plugin SDK] System channel requires plugin renderer context with $channel available.')
  return createPluginSystemSDK(createPluginTuffTransport(channel))
}

export async function getTypedActiveAppSnapshot(
  options: { forceRefresh?: boolean; includeIcon?: boolean } = {},
): Promise<ActiveAppSnapshot | null> {
  return await getRendererSystemSdk().getActiveAppSnapshot(options)
}

export async function getActiveAppSnapshot(
  options: { forceRefresh?: boolean; includeIcon?: boolean } = {},
): Promise<ActiveAppSnapshot | null> {
  return await getTypedActiveAppSnapshot(options)
}

export async function resolveApplication(identifier: string): Promise<ResolvedApplication | null> {
  return await getRendererSystemSdk().resolveApplication(identifier)
}
export async function captureSelectedText(): Promise<SelectionCaptureResult> {
  return await getRendererSystemSdk().captureSelection()
}

export async function showMainWindow(): Promise<void> {
  await getRendererSystemSdk().showMainWindow()
}

export async function openExternal(url: string): Promise<void> {
  await getRendererSystemSdk().openExternal(url)
}

export async function showInFolder(path: string): Promise<void> {
  await getRendererSystemSdk().showInFolder(path)
}

export const system: PluginSystemSDK = {
  getActiveAppSnapshot,
  resolveApplication,
  captureSelection: captureSelectedText,
  showMainWindow,
  openExternal,
  showInFolder,
}
