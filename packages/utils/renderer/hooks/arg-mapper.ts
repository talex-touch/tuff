import type { AssistantType, CoreType, TouchType, WindowRole } from '../window-role'
import { isKnownAssistantType, isKnownCoreType, isKnownTouchType, parseWindowArgs } from '../window-role'

/**
 * Interface for command line argument mapper options
 * @interface IArgMapperOptions
 */
export interface IArgMapperOptions {
  /** The type of touch window - main, core-box popup, or assistant window */
  touchType?: TouchType
  /** The sub-type for core-box windows (e.g., division-box, omni-panel) */
  coreType?: CoreType
  /** The sub-type for assistant windows */
  assistantType?: AssistantType
  /** Whether this is a meta-overlay WebContentsView */
  metaOverlay?: 'true' | 'false'
  /** Raw touchType value for unknown protocol compatibility */
  rawTouchType?: string
  /** Raw coreType value for unknown protocol compatibility */
  rawCoreType?: string
  /** Raw assistantType value for unknown protocol compatibility */
  rawAssistantType?: string
  /** User data directory path */
  userDataDir?: string
  /** Application path */
  appPath?: string
  /** Renderer client identifier */
  rendererClientId?: string
  /** Launch time ticks value */
  launchTimeTicks?: string
  /** Time ticks value */
  timeTicks?: string
  /** Additional dynamic string properties */
  [key: string]: string | undefined
}

declare global {
  export interface Window {
    /** Global argument mapper cache */
    $argMapper: IArgMapperOptions
  }
}

/**
 * Reads the window role the preload published over the contextBridge.
 *
 * Undefined in the preload's own realm — `window.api` is what it exposes to the main world, not
 * something it can read back — so callers must keep the argv path as a fallback.
 */
function readBridgedWindowRole(): WindowRole | undefined {
  const api = (window as unknown as { api?: { getStartupContextSnapshot?: () => unknown } }).api
  const snapshot = api?.getStartupContextSnapshot?.()
  if (!snapshot || typeof snapshot !== 'object') {
    return undefined
  }
  const role = (snapshot as { role?: WindowRole }).role
  return role && typeof role === 'object' ? role : undefined
}

function roleToArgMapper(role: WindowRole): IArgMapperOptions {
  const mapper: IArgMapperOptions = {}
  if (role.touchType) mapper.touchType = role.touchType
  if (role.coreType) mapper.coreType = role.coreType
  if (role.assistantType) mapper.assistantType = role.assistantType
  if (typeof role.metaOverlay === 'boolean') {
    mapper.metaOverlay = role.metaOverlay ? 'true' : 'false'
  }
  return mapper
}

/**
 * Converts environment arguments into a structured mapper object
 *
 * Resolution order is bridge-then-argv, and an empty result is never cached. Both matter: the
 * renderer's main world has no `process` (contextIsolation + sandbox are on for every window), so
 * argv resolved to `[]` there, and because `{}` is truthy the empty parse was cached permanently —
 * turning a missing source into a stuck answer. `isMainWindow()` was therefore always false in the
 * renderer, which silently disabled the manual update check and every update prompt.
 *
 * @param args - Array of command line arguments (defaults to process.argv)
 * @returns Mapped command line arguments as key-value pairs
 */
export function useArgMapper(args: string[] = (globalThis as any)?.process?.argv ?? []): IArgMapperOptions {
  const cached = window.$argMapper
  if (cached && Object.keys(cached).length > 0)
    return cached

  const bridgedRole = readBridgedWindowRole()
  if (bridgedRole) {
    const bridged = roleToArgMapper(bridgedRole)
    if (Object.keys(bridged).length > 0)
      return window.$argMapper = bridged
  }

  const mapper: IArgMapperOptions = {}
  for (const arg of args) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, ...valueParts] = arg.slice(2).split('=')
      const value = valueParts.join('=')
      if (!key)
        continue
      const camelCaseKey = key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
      mapper[camelCaseKey] = value
    }
  }

  const role = parseWindowArgs(args)
  if (mapper.touchType && !isKnownTouchType(mapper.touchType)) {
    mapper.rawTouchType = mapper.touchType
    delete mapper.touchType
  } else if (role.touchType) {
    mapper.touchType = role.touchType
  }

  if (mapper.coreType && !isKnownCoreType(mapper.coreType)) {
    mapper.rawCoreType = mapper.coreType
    delete mapper.coreType
  } else if (role.coreType) {
    mapper.coreType = role.coreType
  }

  if (mapper.assistantType && !isKnownAssistantType(mapper.assistantType)) {
    mapper.rawAssistantType = mapper.assistantType
    delete mapper.assistantType
  } else if (role.assistantType) {
    mapper.assistantType = role.assistantType
  }

  if (typeof role.metaOverlay === 'boolean') {
    mapper.metaOverlay = role.metaOverlay ? 'true' : 'false'
  }

  // An empty parse means the source was unavailable, not that this window has no role. Caching it
  // would make the next call — possibly after the bridge is ready — return the same empty answer.
  if (Object.keys(mapper).length === 0)
    return mapper

  return window.$argMapper = mapper
}

/**
 * Gets the current touch type from command line arguments
 * @returns The touch type ('main' | 'core-box' | 'assistant') or undefined
 */
export function useTouchType(): TouchType | undefined {
  const argMapper = useArgMapper()

  return argMapper.touchType
}

/**
 * Checks if the current window is the main window
 * @returns True if the current window is the main window
 */
export function isMainWindow() {
  return useTouchType() === 'main'
}

/**
 * Checks if the current window is a core-box popup
 * @returns True if the current window is a core-box popup
 */
export function isCoreBox() {
  return useTouchType() === 'core-box'
}

/**
 * Checks if the current window is an assistant window
 * @returns True if the current window is an assistant window
 */
export function isAssistantWindow() {
  return useTouchType() === 'assistant'
}

/**
 * Gets the core-box sub-type from command line arguments
 * @returns The core type ('division-box' | 'omni-panel') or undefined
 */
export function useCoreType(): CoreType | undefined {
  const argMapper = useArgMapper()
  return argMapper.coreType
}

/**
 * Gets the assistant sub-type from command line arguments
 * @returns The assistant type ('floating-ball' | 'voice-panel') or undefined
 */
export function useAssistantType(): AssistantType | undefined {
  const argMapper = useArgMapper()
  return argMapper.assistantType
}

/**
 * Checks if the current window is a division-box window
 * @returns True if the current window is a division-box
 */
export function isDivisionBox() {
  return isCoreBox() && useCoreType() === 'division-box'
}

/**
 * Checks if the current window is an OmniPanel window
 * @returns True if the current window is an OmniPanel
 */
export function isOmniPanel() {
  return isCoreBox() && useCoreType() === 'omni-panel'
}

/**
 * Checks if the current window is a meta-overlay WebContentsView
 * @returns True if the current window is a meta-overlay
 */
export function isMetaOverlay() {
  const argMapper = useArgMapper()
  return argMapper.metaOverlay === 'true'
}

/**
 * Checks if the current assistant window is a floating-ball window
 * @returns True if the current window is a floating-ball window
 */
export function isFloatingBallWindow() {
  return isAssistantWindow() && useAssistantType() === 'floating-ball'
}

/**
 * Checks if the current assistant window is a voice-panel window
 * @returns True if the current window is a voice-panel window
 */
export function isVoicePanelWindow() {
  return isAssistantWindow() && useAssistantType() === 'voice-panel'
}

export function useWindowRole(): WindowRole {
  const argMapper = useArgMapper()
  return {
    touchType: argMapper.touchType,
    coreType: argMapper.coreType,
    assistantType: argMapper.assistantType,
    metaOverlay:
      typeof argMapper.metaOverlay === 'string'
        ? argMapper.metaOverlay === 'true'
        : undefined
  }
}
