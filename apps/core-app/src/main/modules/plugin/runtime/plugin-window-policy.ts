import type {
  LegacyPluginWindowProperties,
  PluginWindowBounds,
  PluginWindowCommand,
  PluginWindowErrorCode,
  PluginWindowErrorData,
  PluginWindowNewRequest,
  PluginWindowOptions
} from '@talex-touch/utils/transport/events/types'
import type { PluginViewSecurityProfile } from './plugin-view-security-profile'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PLUGIN_WINDOW_ERROR_CODES } from '@talex-touch/utils/transport/events/types'

const WINDOW_OPTION_KEYS = new Set([
  'width',
  'height',
  'x',
  'y',
  'title',
  'resizable',
  'alwaysOnTop',
  'visible'
])
const WINDOW_REQUEST_KEYS = new Set(['file', 'options', '_sdkapi'])
const BOUNDS_KEYS = new Set(['width', 'height', 'x', 'y'])
const MAX_WINDOW_DIMENSION = 8192
const MIN_WINDOW_DIMENSION = 100
const MAX_WINDOW_COORDINATE = 100_000
const MAX_WINDOW_TITLE_LENGTH = 256
const HTML_FILE_EXTENSION = /\.html?$/i
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export class PluginWindowPolicyError extends Error {
  readonly code: PluginWindowErrorCode

  constructor(code: PluginWindowErrorCode, message: string) {
    super(message)
    this.name = 'PluginWindowPolicyError'
    this.code = code
  }
}

export function toPluginWindowErrorData(error: unknown): PluginWindowErrorData {
  if (error instanceof PluginWindowPolicyError) {
    return { code: error.code, message: error.message }
  }

  return {
    code: PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
    message: 'Plugin window request failed.'
  }
}

export function resolveExactLoopbackDevOrigin(
  address: unknown,
  options: { appIsPackaged: boolean; pluginDevEnabled: boolean; pluginDevSource: boolean }
): URL | null {
  if (options.appIsPackaged || !options.pluginDevEnabled || !options.pluginDevSource) {
    return null
  }
  if (typeof address !== 'string' || !address.trim()) {
    return null
  }

  try {
    const url = new URL(address)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!LOOPBACK_HOSTS.has(url.hostname)) return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalidOptions(message: string): never {
  throw new PluginWindowPolicyError(PLUGIN_WINDOW_ERROR_CODES.OPTIONS_INVALID, message)
}

function removedCommand(message: string): never {
  throw new PluginWindowPolicyError(PLUGIN_WINDOW_ERROR_CODES.COMMAND_REMOVED, message)
}

function normalizeInteger(value: unknown, name: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    return invalidOptions(`${name} must be an integer between ${minimum} and ${maximum}.`)
  }
  return value as number
}

function normalizeCoordinate(value: unknown, name: string): number {
  return normalizeInteger(value, name, -MAX_WINDOW_COORDINATE, MAX_WINDOW_COORDINATE)
}

function normalizeDimension(value: unknown, name: string): number {
  return normalizeInteger(value, name, MIN_WINDOW_DIMENSION, MAX_WINDOW_DIMENSION)
}

function normalizeBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') {
    return invalidOptions(`${name} must be a boolean.`)
  }
  return value
}

export function normalizePluginWindowOptions(value: unknown): PluginWindowOptions {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    return invalidOptions('Plugin window options must be an object.')
  }

  const unknownKey = Object.keys(value).find((key) => !WINDOW_OPTION_KEYS.has(key))
  if (unknownKey) {
    return invalidOptions(`Plugin window option "${unknownKey}" is not supported.`)
  }

  const options: PluginWindowOptions = {}
  if (value.width !== undefined) options.width = normalizeDimension(value.width, 'width')
  if (value.height !== undefined) options.height = normalizeDimension(value.height, 'height')
  if (value.x !== undefined) options.x = normalizeCoordinate(value.x, 'x')
  if (value.y !== undefined) options.y = normalizeCoordinate(value.y, 'y')
  if (value.title !== undefined) {
    if (
      typeof value.title !== 'string' ||
      value.title.length > MAX_WINDOW_TITLE_LENGTH ||
      value.title.includes('\0')
    ) {
      return invalidOptions('title must be a valid string of at most 256 characters.')
    }
    options.title = value.title
  }
  if (value.resizable !== undefined) {
    options.resizable = normalizeBoolean(value.resizable, 'resizable')
  }
  if (value.alwaysOnTop !== undefined) {
    options.alwaysOnTop = normalizeBoolean(value.alwaysOnTop, 'alwaysOnTop')
  }
  if (value.visible !== undefined) {
    options.visible = normalizeBoolean(value.visible, 'visible')
  }

  return options
}

export function normalizePluginWindowRequest(value: unknown): PluginWindowNewRequest {
  if (!isRecord(value)) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window request must be an object.'
    )
  }
  if ('url' in value) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.REMOTE_URL_DENIED,
      'Remote plugin window URLs are not supported.'
    )
  }
  const unknownKey = Object.keys(value).find((key) => !WINDOW_REQUEST_KEYS.has(key))
  if (unknownKey) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.OPTIONS_INVALID,
      `Plugin window request field "${unknownKey}" is not supported.`
    )
  }

  const file = typeof value.file === 'string' ? value.file.trim() : ''
  if (!file) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window file is required.'
    )
  }

  return {
    file,
    options: normalizePluginWindowOptions(value.options),
    ...(typeof value._sdkapi === 'number' ? { _sdkapi: value._sdkapi } : {})
  }
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function rejectUrlLikeTarget(file: string): void {
  if (URL_SCHEME.test(file) || file.startsWith('//') || file.startsWith('\\\\')) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.REMOTE_URL_DENIED,
      'Remote plugin window URLs are not supported.'
    )
  }
}

export async function resolveLocalPluginWindowTarget(
  pluginRoot: string,
  requestedFile: unknown
): Promise<string> {
  const file = typeof requestedFile === 'string' ? requestedFile.trim() : ''
  if (!file) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window file is required.'
    )
  }
  rejectUrlLikeTarget(file)

  let realRoot: string
  try {
    realRoot = await fs.realpath(pluginRoot)
  } catch {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin root is unavailable.'
    )
  }

  const unresolvedTarget = path.isAbsolute(file) ? path.resolve(file) : path.resolve(realRoot, file)
  if (!isPathInside(realRoot, unresolvedTarget)) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.PATH_OUTSIDE_ROOT,
      'Plugin window target is outside the plugin root.'
    )
  }

  let realTarget: string
  try {
    realTarget = await fs.realpath(unresolvedTarget)
  } catch {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window target does not exist.'
    )
  }

  if (!isPathInside(realRoot, realTarget)) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.PATH_OUTSIDE_ROOT,
      'Plugin window target is outside the plugin root.'
    )
  }

  let stats
  try {
    stats = await fs.stat(realTarget)
  } catch {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window target is unavailable.'
    )
  }

  if (!stats.isFile() || !HTML_FILE_EXTENSION.test(realTarget)) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin window target must be a local HTML file.'
    )
  }

  return realTarget
}

function normalizeBounds(value: unknown): PluginWindowBounds {
  if (!isRecord(value)) {
    return removedCommand('setBounds requires a bounds object.')
  }
  const unknownKey = Object.keys(value).find((key) => !BOUNDS_KEYS.has(key))
  if (unknownKey) {
    return removedCommand(`setBounds field "${unknownKey}" is not supported.`)
  }

  const bounds: PluginWindowBounds = {
    width: normalizeDimension(value.width, 'bounds.width'),
    height: normalizeDimension(value.height, 'bounds.height')
  }
  if (value.x !== undefined) bounds.x = normalizeCoordinate(value.x, 'bounds.x')
  if (value.y !== undefined) bounds.y = normalizeCoordinate(value.y, 'bounds.y')
  return bounds
}

export function normalizePluginWindowCommand(value: unknown): PluginWindowCommand {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return removedCommand('A typed plugin window command is required.')
  }

  switch (value.type) {
    case 'focus':
    case 'close': {
      if (Object.keys(value).some((key) => key !== 'type')) {
        return removedCommand(`${value.type} does not accept arguments.`)
      }
      return { type: value.type }
    }
    case 'setBounds': {
      if (Object.keys(value).some((key) => key !== 'type' && key !== 'bounds')) {
        return removedCommand('setBounds contains unsupported arguments.')
      }
      return { type: 'setBounds', bounds: normalizeBounds(value.bounds) }
    }
    case 'setAlwaysOnTop': {
      if (Object.keys(value).some((key) => key !== 'type' && key !== 'value')) {
        return removedCommand('setAlwaysOnTop contains unsupported arguments.')
      }
      if (typeof value.value !== 'boolean') {
        return removedCommand('setAlwaysOnTop requires a boolean value.')
      }
      return { type: 'setAlwaysOnTop', value: value.value }
    }
    default:
      return removedCommand(`Plugin window command "${value.type}" is not supported.`)
  }
}

export interface PluginWindowCommandTarget {
  focus: () => void
  close: () => void
  setBounds: (bounds: PluginWindowBounds) => void
  setAlwaysOnTop: (value: boolean) => void
}

export function executePluginWindowCommand(
  target: PluginWindowCommandTarget,
  command: PluginWindowCommand
): void {
  switch (command.type) {
    case 'focus':
      target.focus()
      return
    case 'close':
      target.close()
      return
    case 'setBounds':
      target.setBounds(command.bounds)
      return
    case 'setAlwaysOnTop':
      target.setAlwaysOnTop(command.value)
      return
  }
}

export function translateLegacyWindowProperty(value: unknown): PluginWindowCommand {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'window')) {
    return removedCommand('Reflective plugin window properties were removed.')
  }

  const windowProperties = value.window
  if (!isRecord(windowProperties)) {
    return removedCommand('A supported legacy plugin window command is required.')
  }

  const entries = Object.entries(windowProperties)
  if (entries.length !== 1) {
    return removedCommand('Exactly one legacy plugin window command is allowed.')
  }

  const [name, args] = entries[0]
  if (!Array.isArray(args)) {
    return removedCommand('Legacy plugin window command arguments must be an array.')
  }

  const legacy = value as LegacyPluginWindowProperties
  if (name === 'focus' && args.length === 0 && legacy.window?.focus) return { type: 'focus' }
  if (name === 'close' && args.length === 0 && legacy.window?.close) return { type: 'close' }
  if (name === 'setBounds' && args.length === 1) {
    return normalizePluginWindowCommand({ type: 'setBounds', bounds: args[0] })
  }
  if (name === 'setAlwaysOnTop' && args.length === 1) {
    return normalizePluginWindowCommand({ type: 'setAlwaysOnTop', value: args[0] })
  }

  return removedCommand(`Legacy plugin window command "${name}" is not supported.`)
}

export type PluginViewNavigationPolicy =
  | {
      kind: 'local'
      entryUrl: string
      entryPath: string
      pluginRoot: string
      allowLegacyWebview: boolean
    }
  | {
      kind: 'development'
      entryUrl: string
      origin: string
      pluginRoot: string
      allowLegacyWebview: boolean
    }

export interface PluginViewNavigationPolicyOptions {
  pluginRoot: string
  targetUrl: string
  securityProfile: PluginViewSecurityProfile
  devAddress?: string
  appIsPackaged?: boolean
  pluginDevEnabled?: boolean
  pluginDevSource?: boolean
  allowLegacyWebview: boolean
}

export async function createPluginViewNavigationPolicy(
  options: PluginViewNavigationPolicyOptions
): Promise<PluginViewNavigationPolicy> {
  let target: URL
  try {
    target = new URL(options.targetUrl)
  } catch {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin view target URL is invalid.'
    )
  }

  let realRoot: string
  try {
    realRoot = await fs.realpath(options.pluginRoot)
  } catch {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
      'Plugin root is unavailable.'
    )
  }

  if (target.protocol === 'file:') {
    let entryPath: string
    try {
      entryPath = await fs.realpath(fileURLToPath(target))
    } catch {
      throw new PluginWindowPolicyError(
        PLUGIN_WINDOW_ERROR_CODES.TARGET_INVALID,
        'Plugin view entry is unavailable.'
      )
    }
    if (!isPathInside(realRoot, entryPath)) {
      throw new PluginWindowPolicyError(
        PLUGIN_WINDOW_ERROR_CODES.PATH_OUTSIDE_ROOT,
        'Plugin view entry is outside the plugin root.'
      )
    }
    return {
      kind: 'local',
      entryUrl: pathToFileURL(entryPath).href,
      entryPath,
      pluginRoot: realRoot,
      allowLegacyWebview: options.allowLegacyWebview
    }
  }

  if (options.securityProfile !== 'trusted-plugin-view') {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.REMOTE_URL_DENIED,
      'Compatibility plugin views are local-only.'
    )
  }

  const devAddress = resolveExactLoopbackDevOrigin(options.devAddress, {
    appIsPackaged: options.appIsPackaged ?? true,
    pluginDevEnabled: options.pluginDevEnabled ?? false,
    pluginDevSource: options.pluginDevSource ?? false
  })
  if (!devAddress || target.origin !== devAddress.origin) {
    throw new PluginWindowPolicyError(
      PLUGIN_WINDOW_ERROR_CODES.REMOTE_URL_DENIED,
      'Plugin development view origin is not allowed.'
    )
  }

  return {
    kind: 'development',
    entryUrl: target.toString(),
    origin: devAddress.origin,
    pluginRoot: realRoot,
    allowLegacyWebview: options.allowLegacyWebview
  }
}

function resolveCanonicalFilePath(url: URL): string | null {
  try {
    return fsSync.realpathSync(fileURLToPath(url))
  } catch {
    return null
  }
}

export function isPluginViewNavigationAllowed(
  policy: PluginViewNavigationPolicy,
  targetUrl: string
): boolean {
  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    return false
  }

  if (policy.kind === 'development') {
    return target.origin === policy.origin
  }
  if (target.protocol !== 'file:') return false
  return resolveCanonicalFilePath(target) === policy.entryPath
}

function resolveWebSocketHttpOrigin(target: URL): string | null {
  if (target.protocol !== 'ws:' && target.protocol !== 'wss:') return null
  const protocol = target.protocol === 'ws:' ? 'http:' : 'https:'
  return `${protocol}//${target.host}`
}

export function isPluginViewResourceAllowed(
  policy: PluginViewNavigationPolicy,
  targetUrl: string
): boolean {
  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    return false
  }

  if (target.protocol === 'data:') return true
  if (target.protocol === 'blob:') {
    return policy.kind === 'local' || target.origin === policy.origin
  }

  if (policy.kind === 'development') {
    return target.origin === policy.origin || resolveWebSocketHttpOrigin(target) === policy.origin
  }

  if (target.protocol !== 'file:') return false
  const targetPath = resolveCanonicalFilePath(target)
  return Boolean(targetPath && isPathInside(policy.pluginRoot, targetPath))
}

export function installPluginViewNavigationPolicy(
  webContents: Electron.WebContents,
  policy: PluginViewNavigationPolicy
): void {
  webContents.on('will-navigate', (event, targetUrl) => {
    if (!isPluginViewNavigationAllowed(policy, targetUrl)) {
      event.preventDefault()
    }
  })
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!policy.allowLegacyWebview || !isPluginViewResourceAllowed(policy, params.src)) {
      event.preventDefault()
      return
    }

    delete webPreferences.preload
    delete webPreferences.partition
    webPreferences.nodeIntegration = false
    webPreferences.nodeIntegrationInSubFrames = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.webSecurity = true
  })
  webContents.on('did-attach-webview', (_event, guestWebContents) => {
    guestWebContents.on('will-navigate', (event, targetUrl) => {
      if (!isPluginViewResourceAllowed(policy, targetUrl)) {
        event.preventDefault()
      }
    })
    guestWebContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })

  webContents.session.setPermissionCheckHandler(() => false)
  webContents.session.setPermissionRequestHandler(
    (_requestingWebContents, _permission, callback) => {
      callback(false)
    }
  )
  webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) =>
    callback({ cancel: !isPluginViewResourceAllowed(policy, details.url) })
  )
}
