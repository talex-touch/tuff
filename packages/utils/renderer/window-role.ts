const FLAG_PREFIX = '--'

export const TOUCH_TYPES = ['main', 'core-box', 'assistant', 'screenshot'] as const
export const CORE_TYPES = ['division-box', 'omni-panel'] as const
export const ASSISTANT_TYPES = ['floating-ball', 'voice-panel'] as const

export const SCREENSHOT_TYPES = ['overlay', 'editor'] as const

export type TouchType = (typeof TOUCH_TYPES)[number]
export type CoreType = (typeof CORE_TYPES)[number]
export type AssistantType = (typeof ASSISTANT_TYPES)[number]
export type ScreenshotType = (typeof SCREENSHOT_TYPES)[number]

export interface WindowRole {
  touchType?: TouchType
  coreType?: CoreType
  assistantType?: AssistantType
  screenshotType?: ScreenshotType
  metaOverlay?: boolean
}

export type RendererWindowMode =
  | 'MainApp'
  | 'CoreBox'
  | 'DivisionBox'
  | 'OmniPanel'
  | 'Assistant'
  | 'AssistantFloatingBall'
  | 'AssistantVoicePanel'
  | 'ScreenshotOverlay'
  | 'ScreenshotEditor'
  | 'MetaOverlay'

export function isKnownTouchType(value: string | undefined): value is TouchType {
  return typeof value === 'string' && (TOUCH_TYPES as readonly string[]).includes(value)
}

export function isKnownCoreType(value: string | undefined): value is CoreType {
  return typeof value === 'string' && (CORE_TYPES as readonly string[]).includes(value)
}

export function isKnownAssistantType(value: string | undefined): value is AssistantType {
  return typeof value === 'string' && (ASSISTANT_TYPES as readonly string[]).includes(value)
}

export function isKnownScreenshotType(value: string | undefined): value is ScreenshotType {
  return typeof value === 'string' && (SCREENSHOT_TYPES as readonly string[]).includes(value)
}

function parseRawArgs(argv: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const arg of argv) {
    if (!arg.startsWith(FLAG_PREFIX) || !arg.includes('=')) continue
    const [rawKey, ...valueParts] = arg.slice(2).split('=')
    if (!rawKey) continue
    const value = valueParts.join('=')
    map[rawKey] = value
  }
  return map
}

export function parseWindowArgs(argv: string[]): WindowRole {
  const argMap = parseRawArgs(argv)
  const touchType = isKnownTouchType(argMap['touch-type']) ? argMap['touch-type'] : undefined
  const coreType = isKnownCoreType(argMap['core-type']) ? argMap['core-type'] : undefined
  const assistantType = isKnownAssistantType(argMap['assistant-type']) ? argMap['assistant-type'] : undefined
  const screenshotType = isKnownScreenshotType(argMap['screenshot-type']) ? argMap['screenshot-type'] : undefined
  const rawMetaOverlay = argMap['meta-overlay']
  const metaOverlay = rawMetaOverlay === 'true' ? true : rawMetaOverlay === 'false' ? false : undefined

  return {
    touchType,
    coreType,
    assistantType,
    screenshotType,
    metaOverlay,
  }
}

export function buildWindowArgs(role: WindowRole): string[] {
  const args: string[] = []
  if (role.touchType) {
    args.push(`--touch-type=${role.touchType}`)
  }
  if (role.coreType) {
    args.push(`--core-type=${role.coreType}`)
  }
  if (role.assistantType) {
    args.push(`--assistant-type=${role.assistantType}`)
  }
  if (role.screenshotType) {
    args.push(`--screenshot-type=${role.screenshotType}`)
  }
  if (typeof role.metaOverlay === 'boolean') {
    args.push(`--meta-overlay=${role.metaOverlay ? 'true' : 'false'}`)
  }
  return args
}

export function resolveRendererWindowMode(role: WindowRole): RendererWindowMode {
  if (role.metaOverlay) {
    return 'MetaOverlay'
  }

  if (role.touchType === 'assistant') {
    if (role.assistantType === 'floating-ball') {
      return 'AssistantFloatingBall'
    }
    if (role.assistantType === 'voice-panel') {
      return 'AssistantVoicePanel'
    }
    return 'Assistant'
  }

  if (role.touchType === 'screenshot') {
    if (role.screenshotType === 'overlay') {
      return 'ScreenshotOverlay'
    }
    if (role.screenshotType === 'editor') {
      return 'ScreenshotEditor'
    }
    return 'MainApp'
  }

  if (role.touchType === 'core-box') {
    if (role.coreType === 'division-box') {
      return 'DivisionBox'
    }
    if (role.coreType === 'omni-panel') {
      return 'OmniPanel'
    }
    return 'CoreBox'
  }

  return 'MainApp'
}
