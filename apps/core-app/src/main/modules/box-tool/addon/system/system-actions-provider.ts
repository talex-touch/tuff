import type {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { IManifest } from '@talex-touch/utils/plugin'
import type { ProviderContext } from '../../search-engine/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { shell } from 'electron'
import {
  StorageList,
  TuffInputType,
  TuffItemBuilder,
  TuffSearchResultBuilder
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { i18nMsgWithParams } from '@talex-touch/utils/i18n'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { getMainConfig } from '../../../storage'
import {
  getDirectoryTerminals,
  normalizeDirectoryTerminalId,
  openDirectoryInTerminal,
  primeDirectoryTerminalDiscovery,
  resolvePreferredTerminal,
  revealPathInFileManager,
  type DirectoryTerminal,
  type DirectoryTerminalInventory
} from '../../../../utils/directory-terminal'
import { installDevPluginFromPath } from '../../../plugin/dev-plugin-installer'
import { pluginModule } from '../../../plugin/plugin-module'
import { screenshotSessionModule } from '../../../screenshot-session'
import { appProvider } from '../apps/app-provider'
import { fileProvider } from '../files/file-provider'
import { recordAcceptedExecute, resolveExecuteEventId } from '../../search-engine/execute-recorder'

type SystemActionType =
  | 'dev-plugin'
  | 'tpex-plugin'
  | 'app-index'
  | 'file-index'
  | 'screenshot-cursor-display'
  | 'directory-terminal-default'
  | 'directory-terminal'
  | 'directory-reveal'

/**
 * The path actions, split out because everything below treats them differently from the four
 * clipboard-driven index installers: they are emitted for a directory that exists right now, they are
 * ordered among themselves by an ordinal, and they lead the result list.
 */
type PathActionType = 'directory-terminal-default' | 'directory-terminal' | 'directory-reveal'

const PATH_ACTION_TYPES: Readonly<Partial<Record<SystemActionType, true>>> = {
  'directory-terminal-default': true,
  'directory-terminal': true,
  'directory-reveal': true
}

function isPathActionType(value: SystemActionType): value is PathActionType {
  return PATH_ACTION_TYPES[value] === true
}

const SYSTEM_ACTION_TYPES: ReadonlySet<string> = new Set([
  'dev-plugin',
  'tpex-plugin',
  'app-index',
  'file-index',
  'screenshot-cursor-display',
  'directory-terminal-default',
  'directory-terminal',
  'directory-reveal'
])

function isSystemActionType(value: string): value is SystemActionType {
  return SYSTEM_ACTION_TYPES.has(value)
}

/**
 * Whether an action of this type still means anything when replayed from usage history — that is,
 * without the clipboard content or dropped path that produced it in the first place.
 *
 * Four of the five types are contextual one-shots. Their item ids embed the path
 * (`system-actions:file-index:/Users/x/Downloads`), so every distinct folder a user ever added
 * became its own usage record and then its own "frequent" recommendation: three of them were
 * holding ⌘7–⌘9 in the empty state, each titled `加入文件索引：…` and truncated to an ellipsis
 * because the name no longer had any context to sit in. Re-running them is a no-op anyway — the
 * folder is already indexed, the plugin is already installed.
 *
 * A `Record` rather than a set of the recommendable ones so that adding a `SystemActionType` is a
 * compile error until someone decides. The implicit default that produced this bug was "everything
 * is recommendable", which is wrong for four types out of five.
 */
const RECOMMENDABLE_ACTION_TYPES: Record<SystemActionType, boolean> = {
  'dev-plugin': false,
  'tpex-plugin': false,
  'app-index': false,
  'file-index': false,
  // Carries no context: it captures whichever display the cursor is on, right now, every time.
  'screenshot-cursor-display': true,
  // Path actions name the folder they were built from, so they are the same one-shot shape as the
  // index installers above. Their action ids additionally carry a terminal id — see
  // {@link PATH_ACTION_TERMINAL_SEPARATOR} — and a folder the user opened once is not a habit.
  'directory-terminal-default': false,
  'directory-terminal': false,
  'directory-reveal': false
}

interface ParsedActionItemId {
  type: SystemActionType
  actionPath: string
  terminalId?: string
}

/** Terminal ids contain no colon; splitting at the first colon preserves the remaining path. */
const PATH_ACTION_TERMINAL_SEPARATOR = ':'

/** Splits provider/type prefixes, then an optional terminal id, without rewriting the path. */
function parseActionItemId(providerId: string, itemId: string): ParsedActionItemId | null {
  const prefix = `${providerId}:`
  if (!itemId.startsWith(prefix)) return null

  const encodedAction = itemId.slice(prefix.length)
  const separatorIndex = encodedAction.indexOf(':')
  if (separatorIndex <= 0) return null

  const type = encodedAction.slice(0, separatorIndex)
  const remainder = encodedAction.slice(separatorIndex + 1)
  if (!isSystemActionType(type) || !remainder) return null

  if (type !== 'directory-terminal') {
    return { type, actionPath: remainder }
  }

  const terminalSeparator = remainder.indexOf(PATH_ACTION_TERMINAL_SEPARATOR)
  if (terminalSeparator <= 0) return null
  const terminalId = remainder.slice(0, terminalSeparator)
  const actionPath = remainder.slice(terminalSeparator + 1)
  if (!actionPath) return null

  return { type, actionPath, terminalId }
}

interface SystemActionMeta {
  action: SystemActionType
  path: string
  terminalId?: string
}

/** Present only on path actions; the sorter reads `ordinal` to lead the list. See tuff-sorter. */
interface PathActionMeta {
  kind: 'terminal-default' | 'terminal' | 'reveal'
  ordinal: number
  path: string
  terminalId?: string
}

interface ResolvedAction {
  type: SystemActionType
  path: string
  displayName: string
  displayPath: string
  isDirectory?: boolean
  /** Path actions only: the terminal this row launches, absent for the Finder row. */
  terminal?: DirectoryTerminal
  /** Path actions only: true when the user configured this terminal rather than accepting the OS default. */
  terminalConfigured?: boolean
  /** Path actions only: relative rank within the path action group. */
  ordinal?: number
}

/**
 * Ranks path actions ahead of every other result row.
 *
 * Deliberately below 99 minus nothing: {@link PATH_ACTION_ORDINAL_STEP} in the sorter gives each
 * ordinal 1000 points of separation, so the whole group stays inside one band.
 */
const PATH_ACTION_ORDINAL_DEFAULT_TERMINAL = 0
const PATH_ACTION_ORDINAL_INSTALLED_TERMINAL = 1
const PATH_ACTION_ORDINAL_REVEAL = 90

/** How many terminal rows one directory may add before the list stops being about the directory. */
const MAX_TERMINAL_ROWS_PER_PATH = 4

const MAX_ACTION_ITEMS = 8
const systemActionsLog = getLogger('system-actions-provider')
const SCREENSHOT_ACTION_PATH = 'native:screenshot:cursor-display:copy'
const SCREENSHOT_ACTION_KEYWORDS = [
  'screenshot',
  'screen shot',
  'capture screen',
  'snip',
  '截图',
  '截屏',
  '屏幕截图'
]
const WINDOWS_APP_EXTENSIONS = new Set(['.exe', '.lnk', '.appref-ms'])
const LINUX_APP_EXTENSIONS = new Set(['.desktop', '.appimage'])
const FILE_URL_PATTERN = /\b(?:file|tfile):\/\/[^\s"'<>]+/gi
const WINDOWS_SHELL_APP_PATTERN = /\bshell:AppsFolder\\[^\s"'<>]+/gi
const WINDOWS_UWP_APP_ID_PATTERN = /\b[A-Za-z0-9][A-Za-z0-9._-]+_[A-Za-z0-9]+![A-Za-z0-9._-]+\b/g
const WINDOWS_DRIVE_PATH_START_PATTERN = /[a-zA-Z]:\\/g
const WINDOWS_ENV_PATH_START_PATTERN = /%[^%\s"'<>]+%[\\/]/g
const QUOTED_PATH_PATTERN = /(['"])(\/[^'"]+|[a-zA-Z]:\\[^'"]+|%[^%\s"'<>]+%[\\/][^'"]+)\1/g
const UNQUOTED_PATH_PATTERN = /(?:~\/|\/|[a-zA-Z]:\\)[^\s'"]+/g
/** Path prefixes that make the whole query a single path rather than a sentence about one. */
const DIRECT_PATH_PREFIX_PATTERN =
  /^(?:~($|[\\/])|\/|[a-zA-Z]:[\\/]|%[^%\s"'<>]+%[\\/]|(?:file|tfile):\/\/)/i
const MAX_DIRECT_PATH_LENGTH = 4096

/**
 * The whole query as one path, spaces and all.
 *
 * `UNQUOTED_PATH_PATTERN` stops at whitespace, which is right for `open ~/Notes/Report.md please`
 * and wrong for the same string typed as a path — a folder may legally be named `My Documents`, and
 * the user who drops it in the box typed the whole thing. Only a query that *starts* with a path
 * prefix qualifies; a sentence that merely mentions a path keeps the word-by-word behaviour, and the
 * candidate is dropped downstream anyway when nothing exists at that exact name.
 */
function extractDirectPathCandidate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_DIRECT_PATH_LENGTH) return null
  if (/[\r\n]/.test(trimmed)) return null
  return DIRECT_PATH_PREFIX_PATTERN.test(trimmed) ? trimmed : null
}

const ACTION_ICON_MAP: Record<SystemActionType, { type: 'class'; value: string }> = {
  'dev-plugin': {
    type: 'class',
    value: 'i-carbon-ibm-watsonx-code-assistant-for-z-validation-assistant'
  },
  'tpex-plugin': { type: 'class', value: 'i-carbon-package-node' },
  'app-index': { type: 'class', value: 'i-carbon-app' },
  'file-index': { type: 'class', value: 'i-carbon-folders' },
  'screenshot-cursor-display': { type: 'class', value: 'i-carbon-screen' },
  'directory-terminal-default': { type: 'class', value: 'i-ri-terminal-box-line' },
  'directory-terminal': { type: 'class', value: 'i-ri-terminal-box-line' },
  'directory-reveal': { type: 'class', value: 'i-ri-finder-line' }
}

/**
 * Read the user's configured default terminal; see the util's `readPreferredTerminalId` contract.
 */
function readPreferredTerminalId(): string | null {
  try {
    const settings = getMainConfig(StorageList.APP_SETTING) as
      | { directory?: { terminalId?: unknown } }
      | undefined
    const value = settings?.directory?.terminalId
    return typeof value === 'string' && value.trim() ? normalizeDirectoryTerminalId(value) : null
  } catch {
    // Storage is not ready during early startup; the OS default is the right answer then.
    return null
  }
}

type ChannelKeyManagerHolder = {
  keyManager?: unknown
}

const resolveKeyManager = (channel: unknown): unknown => {
  if (!channel || typeof channel !== 'object') return channel
  if (!('keyManager' in channel)) return channel
  return (channel as ChannelKeyManagerHolder).keyManager ?? channel
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, '')
}

function expandHome(value: string): string {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

function getWindowsEnvironmentValue(name: string): string | undefined {
  const direct = process.env[name]
  if (direct !== undefined) return direct

  const matchedKey = Object.keys(process.env).find(
    (key) => key.toLowerCase() === name.toLowerCase()
  )
  return matchedKey ? process.env[matchedKey] : undefined
}

function expandWindowsEnvironmentVariables(value: string): string {
  if (process.platform !== 'win32' || !value.includes('%')) return value

  let expanded = value
  for (let i = 0; i < 3; i += 1) {
    const next = expanded.replace(/%([^%\s"'<>]+)%/g, (token, name: string) => {
      const resolved = getWindowsEnvironmentValue(name)
      return resolved && resolved.length > 0 ? resolved : token
    })
    if (next === expanded) break
    expanded = next
  }

  return expanded
}

function decodeStable(value: string): string {
  let decoded = value
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }
  return decoded
}

function normalizeAbsolutePath(value: string): string {
  const normalized = value.replace(/\\/g, '/')
  if (/^\/[a-z]:\//i.test(normalized)) {
    return normalized.slice(1)
  }
  if (/^[a-z]:\//i.test(normalized)) {
    return normalized
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function resolveTfilePath(raw: string): string | null {
  if (!/^tfile:/i.test(raw)) return null

  let resolved = raw
  if (/^tfile:\/\//i.test(raw)) {
    const tail = raw.replace(/^tfile:\/\//i, '')
    const tailIndex = tail.search(/[?#]/)
    const body = tailIndex >= 0 ? tail.slice(0, tailIndex) : tail
    resolved = decodeStable(body.startsWith('/') ? body : `/${body}`)
  } else {
    try {
      const parsed = new URL(raw)
      if (parsed.hostname && /^[a-z]$/i.test(parsed.hostname) && parsed.pathname.startsWith('/')) {
        resolved = decodeStable(`${parsed.hostname}:${parsed.pathname}`)
      } else {
        const merged = parsed.hostname ? `/${parsed.hostname}${parsed.pathname}` : parsed.pathname
        resolved = decodeStable(merged)
      }
    } catch {
      const fallback = raw.replace(/^tfile:\/\//i, '').split(/[?#]/)[0] ?? ''
      resolved = decodeStable(fallback)
    }
  }

  return normalizeAbsolutePath(resolved)
}

function normalizeCandidatePath(raw: string): string | null {
  const trimmed = stripOuterQuotes(raw.trim())
  if (!trimmed) return null

  if (isWindowsShellAppPath(trimmed)) {
    return process.platform === 'win32' ? trimmed : null
  }

  if (isWindowsUwpAppId(trimmed)) {
    return process.platform === 'win32' ? `shell:AppsFolder\\${trimmed}` : null
  }

  let candidate = trimmed
  if (/^tfile:/i.test(candidate)) {
    const resolved = resolveTfilePath(candidate)
    if (!resolved) return null
    candidate = resolved
  } else if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate)
    } catch {
      return null
    }
  }

  candidate = expandWindowsEnvironmentVariables(expandHome(candidate))
  if (process.platform === 'win32' && /^[a-zA-Z]:[\\/]/.test(candidate)) {
    return path.win32.normalize(candidate)
  }
  if (!path.isAbsolute(candidate)) return null
  return path.normalize(candidate)
}

function isWindowsShellAppPath(value: string): boolean {
  return /^shell:AppsFolder\\[^\s"'<>]+$/i.test(value)
}

function isWindowsUwpAppId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]+_[A-Za-z0-9]+![A-Za-z0-9._-]+$/.test(value)
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

async function extractExistingWindowsAppPath(raw: string): Promise<string | null> {
  if (process.platform !== 'win32') return null

  const trimmed = expandWindowsEnvironmentVariables(stripOuterQuotes(raw.trim()))
  if (!/^[a-zA-Z]:[\\/]/.test(trimmed)) return null

  const lower = trimmed.toLowerCase()
  const extensionMatches = [...lower.matchAll(/\.(?:exe|lnk|appref-ms)\b/g)]
  for (const match of extensionMatches) {
    if (match.index === undefined) continue
    const candidate = trimmed.slice(0, match.index + match[0].length)
    try {
      const stats = await fs.stat(candidate)
      if (stats.isFile()) return path.win32.normalize(candidate)
    } catch {
      // Continue probing shorter executable-looking prefixes.
    }
  }

  return null
}

export function extractTextCandidates(value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return []

  const results: string[] = []
  const pushCandidate = (candidate: string): void => {
    const cleaned = candidate.trim()
    if (cleaned) {
      results.push(cleaned)
    }
  }

  // First, because it is the most specific reading of the input: a single path that happens to
  // contain spaces must not be shredded into word fragments before it is ever tried as a whole.
  const directPath = extractDirectPathCandidate(value)
  if (directPath) pushCandidate(directPath)

  for (const match of trimmed.matchAll(FILE_URL_PATTERN)) {
    pushCandidate(match[0])
  }

  for (const match of trimmed.matchAll(WINDOWS_SHELL_APP_PATTERN)) {
    pushCandidate(match[0])
  }

  for (const match of trimmed.matchAll(WINDOWS_UWP_APP_ID_PATTERN)) {
    pushCandidate(match[0])
  }

  if (process.platform === 'win32') {
    for (const line of splitLines(value)) {
      for (const match of line.matchAll(WINDOWS_DRIVE_PATH_START_PATTERN)) {
        if (match.index === undefined) continue
        pushCandidate(line.slice(match.index))
      }
      for (const match of line.matchAll(WINDOWS_ENV_PATH_START_PATTERN)) {
        if (match.index === undefined) continue
        pushCandidate(line.slice(match.index))
      }
    }
  }

  for (const match of trimmed.matchAll(QUOTED_PATH_PATTERN)) {
    pushCandidate(match[2])
  }

  for (const match of trimmed.matchAll(UNQUOTED_PATH_PATTERN)) {
    pushCandidate(match[0])
  }

  if (results.length === 0) {
    return splitLines(value)
  }

  return results
}

async function expandWindowsCommandLineCandidates(candidates: string[]): Promise<string[]> {
  if (process.platform !== 'win32') return candidates

  const expanded: string[] = []
  for (const candidate of candidates) {
    expanded.push(candidate)
    const appPath = await extractExistingWindowsAppPath(candidate)
    if (appPath) {
      expanded.push(appPath)
    }
  }

  return expanded
}

function parseFilesInput(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[') || trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
      if (typeof parsed === 'string') {
        return [parsed]
      }
    } catch {
      return extractTextCandidates(trimmed)
    }
  }

  return extractTextCandidates(trimmed)
}

function buildDisplayName(value: string): string {
  const base = path.basename(value)
  return base || value
}

function stripExtension(value: string, ext: string): string {
  if (!value.toLowerCase().endsWith(ext.toLowerCase())) {
    return value
  }
  return value.slice(0, -ext.length)
}

function resolvePluginNameFromPath(sourcePath: string): string {
  const base = path.basename(sourcePath)
  if (base.toLowerCase() === 'manifest.json') {
    return path.basename(path.dirname(sourcePath))
  }
  if (base.toLowerCase().endsWith('.tpex')) {
    return stripExtension(base, '.tpex')
  }
  return base
}

export class SystemActionsProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'system-actions-provider'
  readonly type = 'system' as const
  readonly name = 'System Actions'
  readonly supportedInputTypes = [TuffInputType.Text, TuffInputType.Files, TuffInputType.Html]
  readonly priority = 'fast' as const

  private context: ProviderContext | null = null

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
    // Warm the terminal inventory in the background: discovery shells out to the filesystem, and the
    // first keystroke must not be the one that pays for it. Nothing here is awaited.
    primeDirectoryTerminalDiscovery()
  }

  async onSearch(query: TuffQuery, signal: AbortSignal): Promise<TuffSearchResult> {
    const startTime = performance.now()
    if (signal.aborted) {
      return this.createEmptyResult(query, startTime)
    }

    const candidates = await this.collectCandidatePaths(query)
    if (candidates.length === 0) {
      const screenshotAction = this.buildScreenshotActionFromQuery(query)
      if (screenshotAction) {
        return this.createResult(query, startTime, [this.buildActionItem(screenshotAction)])
      }
      return this.createEmptyResult(query, startTime)
    }

    const inventory = await getDirectoryTerminals()
    const items: TuffItem[] = []
    const screenshotAction = this.buildScreenshotActionFromQuery(query)
    if (screenshotAction) {
      items.push(this.buildActionItem(screenshotAction))
    }

    for (const candidate of candidates) {
      if (signal.aborted) break
      const resolvedActions = await this.resolveCandidateActions(candidate, inventory)
      for (const resolved of resolvedActions) {
        items.push(this.buildActionItem(resolved))
        if (items.length >= MAX_ACTION_ITEMS) break
      }
      if (items.length >= MAX_ACTION_ITEMS) break
    }

    return this.createResult(query, startTime, items)
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const meta = (args.item.meta?.extension as { systemAction?: SystemActionMeta } | undefined)
      ?.systemAction
    if (!meta?.path) return null

    let accepted = false
    try {
      switch (meta.action) {
        case 'dev-plugin': {
          const result = await installDevPluginFromPath(meta.path)
          const name = result.manifest?.name || resolvePluginNameFromPath(meta.path)
          if (result.status === 'exists') {
            systemActionsLog.info('Dev plugin already exists', {
              meta: { path: meta.path, name: result.manifest?.name }
            })
            this.notifyPluginInstallResult(name, 'dev', 'exists')
          } else if (result.status !== 'success') {
            systemActionsLog.warn('Dev plugin install failed', {
              meta: { path: meta.path, ...result }
            })
            this.notifyPluginInstallResult(name, 'dev', 'error', result.error)
          } else {
            this.notifyPluginInstallResult(name, 'dev', 'success')
            accepted = true
          }
          break
        }
        case 'tpex-plugin': {
          const manager = pluginModule.pluginManager
          if (!manager?.installFromSource) {
            systemActionsLog.warn('Plugin manager not ready for tpex install')
            break
          }
          const fallbackName = resolvePluginNameFromPath(meta.path)
          try {
            const summary = await manager.installFromSource({
              source: meta.path,
              hintType: PluginProviderType.TPEX
            })
            const name = summary?.manifest?.name || fallbackName
            this.notifyPluginInstallResult(name, 'tpex', 'success')
            accepted = true
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            systemActionsLog.warn('Tpex plugin install failed', {
              error,
              meta: { path: meta.path }
            })
            this.notifyPluginInstallResult(fallbackName, 'tpex', 'error', message)
          }
          break
        }
        case 'app-index': {
          await appProvider.addAppByPath(meta.path)
          accepted = true
          break
        }
        case 'file-index': {
          systemActionsLog.info('System action file-index start', {
            meta: { path: meta.path }
          })
          const result = await fileProvider.addWatchPath(meta.path)

          systemActionsLog.info('System action file-index result', {
            meta: {
              requestPath: meta.path,
              result
            }
          })
          accepted = result.success === true
          break
        }
        case 'screenshot-cursor-display': {
          await screenshotSessionModule.startStandalone('system-action')
          accepted = true
          break
        }
        case 'directory-terminal-default':
        case 'directory-terminal': {
          accepted = await this.executeTerminalPathAction(meta)
          break
        }
        case 'directory-reveal': {
          accepted = await this.executeRevealPathAction(meta.path)
          break
        }
      }
    } catch (error) {
      systemActionsLog.warn('System action execution failed', { error })
    }

    // A built-in action counts only when its branch completed what the user asked for: an install
    // that was already present, a manager that was not ready, or a throw is not a use.
    if (accepted) {
      recordAcceptedExecute({
        item: args.item,
        sessionId: args.searchResult?.sessionId ?? null,
        entryPoint: 'core-box',
        eventId: resolveExecuteEventId(args.eventId)
      }).catch((error) => {
        systemActionsLog.warn('Failed to record system action usage', { error })
      })
    }

    return null
  }

  private async collectCandidatePaths(query: TuffQuery): Promise<string[]> {
    const candidates = await expandWindowsCommandLineCandidates(this.collectRawCandidates(query))

    const normalized: string[] = []
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const normalizedPath = normalizeCandidatePath(candidate)
      if (!normalizedPath) continue
      const key = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
      if (seen.has(key)) continue
      seen.add(key)
      normalized.push(normalizedPath)
    }

    return normalized.slice(0, MAX_ACTION_ITEMS)
  }

  private buildScreenshotActionFromQuery(query: TuffQuery): ResolvedAction | null {
    const text = (query.text ?? '').trim().toLowerCase()
    if (!text) return null

    const matched = SCREENSHOT_ACTION_KEYWORDS.some((keyword) => text.includes(keyword))
    if (!matched) return null

    return {
      type: 'screenshot-cursor-display',
      path: SCREENSHOT_ACTION_PATH,
      displayName: 'cursor-display',
      displayPath: SCREENSHOT_ACTION_PATH
    }
  }

  private collectRawCandidates(query: TuffQuery): string[] {
    const candidates: string[] = []
    const inputs = query.inputs ?? []

    for (const input of inputs) {
      if (!input?.content) continue
      if (input.type === TuffInputType.Files) {
        candidates.push(...parseFilesInput(input.content))
      } else if (input.type === TuffInputType.Text || input.type === TuffInputType.Html) {
        candidates.push(...extractTextCandidates(input.rawContent ?? input.content))
      }
    }

    if (typeof query.text === 'string' && query.text.trim()) {
      candidates.push(...extractTextCandidates(query.text))
    }

    return candidates
  }

  /**
   * Every action one candidate path produces, in the order the user should see them.
   *
   * A directory yields the terminal rows and then the Finder row; a plain file yields only the Finder
   * row (plus the index installer, which is appended by the caller's shared tail below); a missing
   * path yields nothing. The directory branch sits after the bundle/plugin branches so an `.app` is
   * still an app — a directory with a different meaning.
   */
  private async resolveCandidateActions(
    candidate: string,
    inventory: DirectoryTerminalInventory
  ): Promise<ResolvedAction[]> {
    if (isWindowsShellAppPath(candidate)) {
      const displayName = candidate.replace(/^shell:AppsFolder\\/i, '')
      return [
        {
          type: 'app-index',
          path: candidate,
          displayName,
          displayPath: candidate
        }
      ]
    }

    let stats: Awaited<ReturnType<typeof fs.stat>> | null = null
    try {
      stats = await fs.stat(candidate)
    } catch {
      return []
    }

    const devManifest = await this.resolveDevManifest(candidate, stats)
    if (devManifest) {
      const displayName = devManifest.manifest.name || buildDisplayName(devManifest.sourceDir)
      return [
        {
          type: 'dev-plugin',
          path: devManifest.sourcePath,
          displayName,
          displayPath: devManifest.sourceDir
        }
      ]
    }

    if (stats.isFile() && candidate.toLowerCase().endsWith('.tpex')) {
      const baseName = buildDisplayName(candidate)
      return [
        {
          type: 'tpex-plugin',
          path: candidate,
          displayName: stripExtension(baseName, '.tpex'),
          displayPath: candidate
        }
      ]
    }

    const appPath = this.normalizeAppCandidate(candidate, stats)
    if (appPath) {
      const name = buildDisplayName(appPath)
      const displayName = process.platform === 'darwin' ? stripExtension(name, '.app') : name
      return [
        {
          type: 'app-index',
          path: appPath,
          displayName,
          displayPath: appPath
        }
      ]
    }

    const indexAction: ResolvedAction = {
      type: 'file-index',
      path: candidate,
      displayName: buildDisplayName(candidate),
      displayPath: candidate
    }

    if (stats.isDirectory()) {
      return [...this.buildDirectoryPathActions(candidate, inventory), indexAction]
    }

    // Not a directory: the file manager gets a reveal, the terminal is never told a file is a cwd.
    return [this.buildRevealPathAction(candidate), indexAction]
  }

  /**
   * Terminal rows for a directory that exists, followed by its Finder row.
   *
   * The configured default terminal is emitted once, as `directory-terminal-default`; the installed
   * terminals are the rows for the *other* terminals, so a user with one terminal sees one terminal
   * row plus one Finder row and never the same application twice.
   */
  private buildDirectoryPathActions(
    dirPath: string,
    inventory: DirectoryTerminalInventory
  ): ResolvedAction[] {
    const actions: ResolvedAction[] = []
    const preferred = resolvePreferredTerminal(inventory, readPreferredTerminalId())
    if (preferred.terminal) {
      actions.push({
        type: 'directory-terminal-default',
        path: dirPath,
        displayName: preferred.terminal.name,
        displayPath: dirPath,
        terminal: preferred.terminal,
        terminalConfigured: preferred.configured,
        ordinal: PATH_ACTION_ORDINAL_DEFAULT_TERMINAL
      })
    }

    const others = inventory.all.filter((terminal) => terminal.id !== preferred.terminal?.id)
    let ordinal = PATH_ACTION_ORDINAL_INSTALLED_TERMINAL
    for (const terminal of others) {
      if (actions.length >= MAX_TERMINAL_ROWS_PER_PATH) break
      actions.push({
        type: 'directory-terminal',
        path: dirPath,
        displayName: terminal.name,
        displayPath: dirPath,
        terminal,
        terminalConfigured: true,
        ordinal
      })
      ordinal += 1
    }

    actions.push(this.buildRevealPathAction(dirPath, true))
    return actions
  }

  private buildRevealPathAction(targetPath: string, isDirectory = false): ResolvedAction {
    return {
      type: 'directory-reveal',
      path: targetPath,
      displayName: buildDisplayName(targetPath),
      displayPath: targetPath,
      isDirectory,
      ordinal: PATH_ACTION_ORDINAL_REVEAL
    }
  }

  private normalizeAppCandidate(
    candidate: string,
    stats: Awaited<ReturnType<typeof fs.stat>>
  ): string | null {
    if (process.platform === 'darwin') {
      let appPath = candidate
      if (appPath.includes('.app/')) {
        appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      }
      if (!appPath.toLowerCase().endsWith('.app')) return null
      return appPath
    }

    if (!stats.isFile()) return null
    const ext = path.extname(candidate).toLowerCase()
    if (process.platform === 'win32') {
      return WINDOWS_APP_EXTENSIONS.has(ext) ? candidate : null
    }
    return LINUX_APP_EXTENSIONS.has(ext) ? candidate : null
  }

  private async resolveDevManifest(
    candidate: string,
    stats: Awaited<ReturnType<typeof fs.stat>>
  ): Promise<{ manifest: IManifest; sourceDir: string; sourcePath: string } | null> {
    let manifestPath: string | null = null
    let sourceDir = candidate

    if (stats.isFile() && path.basename(candidate).toLowerCase() === 'manifest.json') {
      manifestPath = candidate
      sourceDir = path.dirname(candidate)
    }

    if (!manifestPath) return null

    try {
      const manifestRaw = await fs.readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(manifestRaw) as IManifest
      if (!manifest?.name) return null
      return { manifest, sourceDir, sourcePath: candidate }
    } catch (error) {
      systemActionsLog.warn('Failed to read manifest.json for dev plugin', {
        error,
        meta: { path: manifestPath }
      })
      return null
    }
  }

  private getTransport() {
    if (!this.context?.touchApp) {
      return null
    }
    const channel = this.context.touchApp.channel
    const keyManager = resolveKeyManager(channel as ChannelKeyManagerHolder)
    return getTuffTransportMain(channel, keyManager)
  }

  private focusMainWindow(): void {
    const mainWindow = this.context?.touchApp.window.window
    if (!mainWindow || mainWindow.isDestroyed()) {
      systemActionsLog.warn('Main window not available for plugin install notification')
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }

  private notifyPluginInstallResult(
    name: string,
    source: 'dev' | 'tpex',
    status: 'success' | 'exists' | 'error',
    error?: string
  ): void {
    const transport = this.getTransport()
    if (!transport) {
      systemActionsLog.warn('Transport not ready for plugin install notification')
      return
    }
    if (status !== 'error') {
      this.focusMainWindow()
    }
    const win = this.context?.touchApp.window.window
    if (!win || win.isDestroyed()) return
    transport
      .sendTo(win.webContents, PluginEvents.install.completed, {
        name,
        source,
        status,
        error
      })
      .catch((error) => {
        systemActionsLog.warn('Failed to notify plugin install completion', {
          error,
          meta: { name }
        })
      })
  }

  async rebuildItem(itemId: string): Promise<TuffItem | null> {
    const parsed = parseActionItemId(this.id, itemId)
    if (!parsed) return null

    const { type, actionPath, terminalId } = parsed

    if (type === 'screenshot-cursor-display') {
      if (actionPath !== SCREENSHOT_ACTION_PATH) return null
      return this.buildActionItem({
        type,
        path: actionPath,
        displayName: 'cursor-display',
        displayPath: actionPath
      })
    }

    // The candidate still resolves to its current actions — a folder that no longer exists produces
    // none, and a terminal that was uninstalled simply is not in the inventory any more.
    const inventory = await getDirectoryTerminals()
    const resolvedActions = await this.resolveCandidateActions(actionPath, inventory)
    const match = resolvedActions.find(
      (action) =>
        action.type === type &&
        (type !== 'directory-terminal' || action.terminal?.id === terminalId)
    )
    if (!match) return null
    return this.buildActionItem(match)
  }

  /**
   * The recommendation grid only ever gets the types that survive without their originating
   * context; see {@link RECOMMENDABLE_ACTION_TYPES}.
   *
   * Filtering here rather than in `rebuildItem` keeps that method a plain id → item rebuild, and
   * puts the recommendation-specific rule in the method whose name says "recommendation". It also
   * means the historical usage rows for one-shot actions stay where they are and simply stop being
   * honoured — no migration, and nothing to redo if the policy changes.
   */
  async rebuildRecommendationItems(itemIds: readonly string[]): Promise<TuffItem[]> {
    const recommendable = itemIds.filter((itemId) => {
      const parsed = parseActionItemId(this.id, itemId)
      return parsed !== null && RECOMMENDABLE_ACTION_TYPES[parsed.type]
    })

    const rebuilt = await Promise.all(recommendable.map((itemId) => this.rebuildItem(itemId)))
    return rebuilt.filter((item): item is TuffItem => item !== null)
  }

  private buildActionItem(action: ResolvedAction): TuffItem {
    const titleKeyMap: Record<SystemActionType, string> = {
      'dev-plugin': 'corebox.systemActions.addDevPluginTitle',
      'tpex-plugin': 'corebox.systemActions.addTpexPluginTitle',
      'app-index': 'corebox.systemActions.addAppIndexTitle',
      'file-index': 'corebox.systemActions.addFileIndexTitle',
      'screenshot-cursor-display': 'corebox.systemActions.screenshotCursorDisplayTitle',
      'directory-terminal-default': 'corebox.systemActions.openDirectoryInDefaultTerminalTitle',
      'directory-terminal': 'corebox.systemActions.openDirectoryInTerminalTitle',
      'directory-reveal': 'corebox.systemActions.openDirectoryRevealTitle'
    }
    if (action.type === 'directory-reveal' && process.platform === 'darwin') {
      titleKeyMap['directory-reveal'] = action.isDirectory
        ? 'corebox.systemActions.openDirectoryInFinderTitle'
        : 'corebox.systemActions.revealInFinderTitle'
    }
    const subtitleKeyMap: Record<SystemActionType, string> = {
      'dev-plugin': 'corebox.systemActions.addDevPluginSubtitle',
      'tpex-plugin': 'corebox.systemActions.addTpexPluginSubtitle',
      'app-index': 'corebox.systemActions.addAppIndexSubtitle',
      'file-index': 'corebox.systemActions.addFileIndexSubtitle',
      'screenshot-cursor-display': 'corebox.systemActions.screenshotCursorDisplaySubtitle',
      'directory-terminal-default': 'corebox.systemActions.openDirectoryInDefaultTerminalSubtitle',
      'directory-terminal': 'corebox.systemActions.openDirectoryInTerminalSubtitle',
      'directory-reveal': 'corebox.systemActions.openDirectoryRevealSubtitle'
    }

    const titleParams: Record<string, string> = { name: action.displayName }
    const subtitleParams: Record<string, string> = { path: action.displayPath }
    let subtitleKey = subtitleKeyMap[action.type]
    if (isPathActionType(action.type) && action.terminal) {
      titleParams.terminal = action.terminal.name
      subtitleParams.terminal = action.terminal.name
      // Whether the named terminal is the user's choice or merely the OS default is a fact the row
      // must not hide — a user who configured nothing should not read the row as a configured one.
      if (action.type === 'directory-terminal-default' && !action.terminalConfigured) {
        subtitleKey = 'corebox.systemActions.openDirectoryInSystemTerminalSubtitle'
      } else if (action.type === 'directory-terminal-default') {
        subtitleKey = 'corebox.systemActions.openDirectoryInConfiguredTerminalSubtitle'
      }
    }

    const title = i18nMsgWithParams(titleKeyMap[action.type], titleParams)
    const subtitle = i18nMsgWithParams(subtitleKey, subtitleParams)

    return new TuffItemBuilder(this.buildActionItemId(action))
      .setSource(this.type, this.id, this.name, undefined, 'system')
      .setKind('action')
      .setTitle(title)
      .setSubtitle(subtitle)
      .setIcon(ACTION_ICON_MAP[action.type])
      .setActions([
        {
          id: `system-action-${action.type}`,
          type: 'execute',
          label: title,
          primary: true
        }
      ])
      .setMeta({
        extension: {
          systemAction: {
            action: action.type,
            path: action.path,
            ...(action.terminal ? { terminalId: action.terminal.id } : {})
          },
          // Only path actions carry it, and its presence is what the sorter reads, so it is added
          // here rather than left to a consumer to infer from the type string.
          ...(action.ordinal !== undefined
            ? {
                pathAction: {
                  kind: this.pathActionKind(action.type),
                  ordinal: action.ordinal,
                  path: action.path,
                  ...(action.terminal ? { terminalId: action.terminal.id } : {})
                } satisfies PathActionMeta
              }
            : {})
        }
      })
      .build()
  }

  /**
   * `<providerId>:<type>:<path>`, with the terminal id folded into a `directory-terminal` id.
   *
   * A terminal id contains no colon, so the first separator after that id is unambiguous.
   * Colons inside the remaining path are preserved.
   */
  private buildActionItemId(action: ResolvedAction): string {
    if (action.type === 'directory-terminal' && action.terminal) {
      return `${this.id}:${action.type}:${action.terminal.id}${PATH_ACTION_TERMINAL_SEPARATOR}${action.path}`
    }
    return `${this.id}:${action.type}:${action.path}`
  }

  private pathActionKind(type: SystemActionType): PathActionMeta['kind'] {
    if (type === 'directory-terminal-default') return 'terminal-default'
    if (type === 'directory-terminal') return 'terminal'
    return 'reveal'
  }

  /**
   * Opens the directory in a terminal and reports whether the user got what they asked for.
   *
   * The directory is re-checked here: the result list can be a keystroke old, and the folder may have
   * been deleted in between. A terminal named by a stored item but no longer installed resolves to
   * nothing, which is a failure, not a silent launch of a different application.
   */
  private async executeTerminalPathAction(meta: SystemActionMeta): Promise<boolean> {
    const inventory = await getDirectoryTerminals()

    let terminal: DirectoryTerminal | null = null
    if (meta.action === 'directory-terminal') {
      terminal = inventory.all.find((candidate) => candidate.id === meta.terminalId) ?? null
    } else {
      terminal = resolvePreferredTerminal(inventory, readPreferredTerminalId()).terminal
    }

    if (!terminal) {
      systemActionsLog.warn('No terminal available for directory action', {
        meta: { path: meta.path, terminalId: meta.terminalId }
      })
      return false
    }

    return await openDirectoryInTerminal(terminal, meta.path)
  }

  /** Reveals the path with the OS file manager; a directory opens, a file is selected in its parent. */
  private async executeRevealPathAction(targetPath: string): Promise<boolean> {
    const port = shell ?? null
    if (!port) {
      systemActionsLog.warn('File manager shell unavailable for reveal action', {
        meta: { path: targetPath }
      })
      return false
    }
    return await revealPathInFileManager(targetPath, port)
  }

  private createEmptyResult(query: TuffQuery, startedAt: number): TuffSearchResult {
    return this.createResult(query, startedAt, [])
  }

  private createResult(query: TuffQuery, startedAt: number, items: TuffItem[]): TuffSearchResult {
    const duration = performance.now() - startedAt
    return new TuffSearchResultBuilder(query)
      .setItems(items)
      .setDuration(duration)
      .setSources([
        {
          providerId: this.id,
          providerName: this.name ?? this.id,
          duration,
          resultCount: items.length,
          status: 'success'
        }
      ])
      .build()
  }
}

export const systemActionsProvider = new SystemActionsProvider()
