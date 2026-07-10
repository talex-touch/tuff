import type {
  LegacyPluginWindowProperties,
  PluginWindowBounds,
  PluginWindowCommand,
  PluginWindowErrorCode,
  PluginWindowNewRequest,
  PluginWindowOptions,
  PluginWindowResponseError,
} from '../../../transport/events/types'
import { createPluginTuffTransport } from '../../../transport'
import { PluginEvents } from '../../../transport/events'
import { PLUGIN_WINDOW_ERROR_CODES } from '../../../transport/events/types'
import { useChannel } from '../channel'
import { tryGetPluginSdkApi } from '../plugin-info'

const CREATE_REQUEST_KEYS = new Set(['file', 'options'])
const WINDOW_OPTION_KEYS = new Set([
  'width',
  'height',
  'x',
  'y',
  'title',
  'resizable',
  'alwaysOnTop',
  'visible',
])

export interface PluginWindowCreateOptions {
  file: string
  options?: PluginWindowOptions
}

function createWindowSdkError(code: PluginWindowErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code })
}

function throwResponseError(error: PluginWindowResponseError | undefined): void {
  if (!error) {
    return
  }

  if (typeof error === 'string') {
    throw new Error(error)
  }

  throw Object.assign(new Error(error.message), { code: error.code })
}

function throwTransportBoundaryError(response: unknown): void {
  if (!isRecord(response)) return
  if (typeof response.code !== 'string' || typeof response.message !== 'string') return
  throw Object.assign(new Error(response.message), { code: response.code })
}

function withSdkApi<T extends object>(payload: T): T & { _sdkapi?: number } {
  const sdkapi = tryGetPluginSdkApi()
  return typeof sdkapi === 'number' ? { ...payload, _sdkapi: sdkapi } : payload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCreateRequest(value: unknown): PluginWindowNewRequest {
  if (!isRecord(value)) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window request must be an object.',
    )
  }

  if ('url' in value) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.REMOTE_URL_DENIED,
      'Remote plugin window URLs are not supported.',
    )
  }

  if (Object.keys(value).some((key) => !CREATE_REQUEST_KEYS.has(key))) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.OPTIONS_INVALID,
      'Plugin window request contains unsupported options.',
    )
  }

  const file = typeof value.file === 'string' ? value.file.trim() : ''
  if (!file) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window file is required.',
    )
  }

  const options = value.options
  if (options !== undefined) {
    if (!isRecord(options) || Object.keys(options).some((key) => !WINDOW_OPTION_KEYS.has(key))) {
      throw createWindowSdkError(
        PLUGIN_WINDOW_ERROR_CODES.OPTIONS_INVALID,
        'Plugin window options contain unsupported fields.',
      )
    }
  }

  return {
    file,
    ...(options ? { options: options as PluginWindowOptions } : {}),
  }
}

function isWindowBounds(value: unknown): value is PluginWindowBounds {
  if (!isRecord(value)) return false
  return typeof value.width === 'number' && typeof value.height === 'number'
}

function translateLegacyProperty(property: LegacyPluginWindowProperties): PluginWindowCommand {
  if (!isRecord(property) || Object.keys(property).some((key) => key !== 'window')) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.COMMAND_REMOVED,
      'Reflective plugin window properties were removed.',
    )
  }

  const windowProperties = property.window
  if (!isRecord(windowProperties)) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.COMMAND_REMOVED,
      'A supported plugin window command is required.',
    )
  }

  const entries = Object.entries(windowProperties)
  if (entries.length !== 1) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.COMMAND_REMOVED,
      'Exactly one supported plugin window command is required.',
    )
  }

  const [name, args] = entries[0]
  if (!Array.isArray(args)) {
    throw createWindowSdkError(
      PLUGIN_WINDOW_ERROR_CODES.COMMAND_REMOVED,
      'Legacy plugin window command arguments must be an array.',
    )
  }

  if (name === 'focus' && args.length === 0) return { type: 'focus' }
  if (name === 'close' && args.length === 0) return { type: 'close' }
  if (name === 'setBounds' && args.length === 1 && isWindowBounds(args[0])) {
    return { type: 'setBounds', bounds: args[0] }
  }
  if (name === 'setAlwaysOnTop' && args.length === 1 && typeof args[0] === 'boolean') {
    return { type: 'setAlwaysOnTop', value: args[0] }
  }

  throw createWindowSdkError(
    PLUGIN_WINDOW_ERROR_CODES.COMMAND_REMOVED,
    `Plugin window command "${name}" is no longer supported.`,
  )
}

export async function createWindow(request: PluginWindowCreateOptions): Promise<number> {
  const channel = useChannel('[Plugin SDK] Window creation requires renderer channel.')
  const transport = createPluginTuffTransport(channel)
  const payload = withSdkApi(normalizeCreateRequest(request))
  const res = await transport.send(PluginEvents.window.new, payload)
  throwTransportBoundaryError(res)
  throwResponseError(res?.error)
  if (typeof res?.id !== 'number')
    throw new Error('[Plugin SDK] Window creation did not return a window id.')

  return res.id
}

export async function toggleWinVisible(id: number, visible?: boolean): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Window visibility requires renderer channel.')
  const transport = createPluginTuffTransport(channel)
  const res = await transport.send(
    PluginEvents.window.visible,
    withSdkApi(visible !== undefined ? { id, visible } : { id }),
  )
  throwTransportBoundaryError(res)
  throwResponseError(res?.error)
  if (typeof res?.visible !== 'boolean')
    throw new Error('[Plugin SDK] Window visibility did not return a boolean result.')

  return res.visible
}

export async function executeWindowCommand(
  id: number,
  command: PluginWindowCommand,
): Promise<boolean> {
  const channel = useChannel('[Plugin SDK] Window command requires renderer channel.')
  const transport = createPluginTuffTransport(channel)
  const res = await transport.send(PluginEvents.window.command, withSdkApi({ id, command }))
  throwTransportBoundaryError(res)
  throwResponseError(res?.error)
  if (typeof res?.success !== 'boolean')
    throw new Error('[Plugin SDK] Window command did not return a boolean result.')

  return res.success
}

/**
 * @deprecated Use executeWindowCommand() with the typed command union.
 */
export async function setWindowProperty(
  id: number,
  property: LegacyPluginWindowProperties,
): Promise<boolean> {
  return await executeWindowCommand(id, translateLegacyProperty(property))
}

export type WindowProperties = LegacyPluginWindowProperties
export type {
  LegacyPluginWindowProperties,
  PluginWindowBounds,
  PluginWindowCommand,
  PluginWindowOptions,
}
