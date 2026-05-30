import type { IndexedSourceRecord } from '@talex-touch/utils/search'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const SUPPORTED_BROWSER_IDS = ['chrome', 'edge', 'brave', 'arc'] as const
const MAX_PROFILES_PER_BROWSER = 8

export type BrowserBookmarkBrowserId = (typeof SUPPORTED_BROWSER_IDS)[number]

export type BrowserBookmarkDiagnosticStatus =
  | 'supported'
  | 'unsupported'
  | 'available'
  | 'not-found'
  | 'read-failed'

export interface BrowserBookmarkDefinition {
  id: BrowserBookmarkBrowserId
  name: string
  root: string
}

export interface BrowserBookmarkFile {
  browserId: BrowserBookmarkBrowserId
  browserName: string
  profile: string
  path: string
}

export interface BrowserBookmarkItem {
  id: string
  browserId: BrowserBookmarkBrowserId
  browserName: string
  profile: string
  title: string
  url: string
  folder: string
  dateAdded: string
  sourcePath: string
}

export interface BrowserBookmarkSourceDiagnostic {
  browserId: BrowserBookmarkBrowserId
  browserName: string
  root: string
  status: BrowserBookmarkDiagnosticStatus
  profileCount: number
  reason: string
  lastError: string
  failedProfile?: string
}

export interface BrowserBookmarkScanResult {
  items: BrowserBookmarkItem[]
  diagnostics: BrowserBookmarkSourceDiagnostic[]
}

interface DirentLike {
  name: string
  isDirectory: () => boolean
}

export interface BrowserBookmarkFs {
  existsSync: (filePath: string) => boolean
  readdirSync: (filePath: string, options: { withFileTypes: true }) => DirentLike[]
  readFileSync: (filePath: string, encoding: 'utf8') => string
}

export interface BrowserBookmarkScanOptions {
  platform?: NodeJS.Platform
  homeDir?: string
  env?: NodeJS.ProcessEnv
  fs?: BrowserBookmarkFs
  browserFilter?: string
  definitions?: BrowserBookmarkDefinition[]
}

const BROWSER_LABELS: Record<BrowserBookmarkBrowserId, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  brave: 'Brave',
  arc: 'Arc'
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function normalizeUrl(value: unknown): string {
  const text = normalizeText(value)
  if (!text) return ''

  try {
    const parsed = new URL(text)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
    return parsed.toString()
  } catch {
    return ''
  }
}

function isSupportedBrowserId(value: string): value is BrowserBookmarkBrowserId {
  return SUPPORTED_BROWSER_IDS.includes(value as BrowserBookmarkBrowserId)
}

export function getBrowserBookmarkDefinitions(
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir(),
  env: NodeJS.ProcessEnv = process.env
): BrowserBookmarkDefinition[] {
  if (platform === 'darwin') {
    const appSupport = path.join(homeDir, 'Library', 'Application Support')
    return [
      { id: 'chrome', name: 'Chrome', root: path.join(appSupport, 'Google', 'Chrome') },
      { id: 'edge', name: 'Edge', root: path.join(appSupport, 'Microsoft Edge') },
      {
        id: 'brave',
        name: 'Brave',
        root: path.join(appSupport, 'BraveSoftware', 'Brave-Browser')
      },
      { id: 'arc', name: 'Arc', root: path.join(appSupport, 'Arc', 'User Data') }
    ]
  }

  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
    return [
      {
        id: 'chrome',
        name: 'Chrome',
        root: path.join(localAppData, 'Google', 'Chrome', 'User Data')
      },
      {
        id: 'edge',
        name: 'Edge',
        root: path.join(localAppData, 'Microsoft', 'Edge', 'User Data')
      },
      {
        id: 'brave',
        name: 'Brave',
        root: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')
      },
      {
        id: 'arc',
        name: 'Arc',
        root: path.join(
          localAppData,
          'Packages',
          'TheBrowserCompany.Arc_ttt1ap7aakyb4',
          'LocalCache',
          'Local',
          'Arc',
          'User Data'
        )
      }
    ]
  }

  if (platform === 'linux') {
    const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, '.config')
    return [
      { id: 'chrome', name: 'Chrome', root: path.join(configHome, 'google-chrome') },
      { id: 'edge', name: 'Edge', root: path.join(configHome, 'microsoft-edge') },
      {
        id: 'brave',
        name: 'Brave',
        root: path.join(configHome, 'BraveSoftware', 'Brave-Browser')
      }
    ]
  }

  return []
}

function isProfileDirectoryName(name: string): boolean {
  return name === 'Default' || name === 'Guest Profile' || /^Profile \d+$/i.test(name)
}

export function discoverBrowserBookmarkFiles(
  definition: BrowserBookmarkDefinition,
  fsImpl: BrowserBookmarkFs = fs
): BrowserBookmarkFile[] {
  if (!definition.root || !fsImpl.existsSync(definition.root)) {
    return []
  }

  const candidates: BrowserBookmarkFile[] = []
  const directPath = path.join(definition.root, 'Bookmarks')
  if (fsImpl.existsSync(directPath)) {
    candidates.push({
      browserId: definition.id,
      browserName: definition.name,
      profile: 'Default',
      path: directPath
    })
  }

  let entries: DirentLike[] = []
  try {
    entries = fsImpl.readdirSync(definition.root, { withFileTypes: true })
  } catch {
    return candidates
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isProfileDirectoryName(entry.name)) {
      continue
    }

    const bookmarkPath = path.join(definition.root, entry.name, 'Bookmarks')
    if (!fsImpl.existsSync(bookmarkPath)) {
      continue
    }

    candidates.push({
      browserId: definition.id,
      browserName: definition.name,
      profile: entry.name,
      path: bookmarkPath
    })

    if (candidates.length >= MAX_PROFILES_PER_BROWSER) {
      break
    }
  }

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (seen.has(candidate.path)) return false
    seen.add(candidate.path)
    return true
  })
}

interface ChromiumBookmarkNode {
  type?: string
  name?: string
  url?: string
  date_added?: string
  children?: ChromiumBookmarkNode[]
}

interface ChromiumBookmarksPayload {
  roots?: Record<string, ChromiumBookmarkNode>
}

function collectBookmarkNodes(
  node: ChromiumBookmarkNode | undefined,
  source: BrowserBookmarkFile,
  folder: string[],
  result: BrowserBookmarkItem[]
): void {
  if (!node || typeof node !== 'object') {
    return
  }

  if (node.type === 'url') {
    const url = normalizeUrl(node.url)
    if (!url) return

    const title = normalizeText(node.name) || url
    result.push({
      id: `${source.browserId}:${source.profile}:${url}`,
      browserId: source.browserId,
      browserName: source.browserName,
      profile: source.profile,
      title,
      url,
      folder: folder.join(' / '),
      dateAdded: normalizeText(node.date_added),
      sourcePath: source.path
    })
    return
  }

  const nextFolder = node.name ? [...folder, normalizeText(node.name)] : folder
  for (const child of node.children ?? []) {
    collectBookmarkNodes(child, source, nextFolder, result)
  }
}

export function parseChromiumBookmarks(
  payload: ChromiumBookmarksPayload,
  source: BrowserBookmarkFile
): BrowserBookmarkItem[] {
  const roots = payload?.roots && typeof payload.roots === 'object' ? payload.roots : {}
  const result: BrowserBookmarkItem[] = []

  for (const root of Object.values(roots)) {
    collectBookmarkNodes(root, source, [], result)
  }

  return result
}

function readJsonFile(filePath: string, fsImpl: BrowserBookmarkFs): ChromiumBookmarksPayload {
  return JSON.parse(fsImpl.readFileSync(filePath, 'utf8')) as ChromiumBookmarksPayload
}

function dedupeBookmarks(bookmarks: BrowserBookmarkItem[]): BrowserBookmarkItem[] {
  const byUrl = new Map<string, BrowserBookmarkItem>()

  for (const bookmark of bookmarks) {
    const existing = byUrl.get(bookmark.url)
    if (!existing) {
      byUrl.set(bookmark.url, bookmark)
      continue
    }

    byUrl.set(bookmark.url, {
      ...existing,
      title: existing.title || bookmark.title,
      folder: existing.folder || bookmark.folder,
      browserName: existing.browserName || bookmark.browserName,
      profile: existing.profile || bookmark.profile,
      sourcePath: existing.sourcePath || bookmark.sourcePath
    })
  }

  return Array.from(byUrl.values())
}

function buildDiagnostics(
  platform: NodeJS.Platform,
  definitions: BrowserBookmarkDefinition[],
  browserFilter: string
): BrowserBookmarkSourceDiagnostic[] {
  const definitionsById = new Map(definitions.map((definition) => [definition.id, definition]))
  const ids: readonly BrowserBookmarkBrowserId[] =
    browserFilter && isSupportedBrowserId(browserFilter) ? [browserFilter] : SUPPORTED_BROWSER_IDS

  return ids.map((id): BrowserBookmarkSourceDiagnostic => {
    const definition = definitionsById.get(id)
    if (!definition) {
      return {
        browserId: id,
        browserName: BROWSER_LABELS[id],
        root: '',
        status: 'unsupported',
        profileCount: 0,
        reason: `${BROWSER_LABELS[id]} bookmarks are unsupported on ${platform}`,
        lastError: ''
      }
    }

    return {
      browserId: definition.id,
      browserName: definition.name,
      root: definition.root,
      status: 'supported',
      profileCount: 0,
      reason: '',
      lastError: ''
    }
  })
}

export function scanBrowserBookmarks(
  options: BrowserBookmarkScanOptions = {}
): BrowserBookmarkScanResult {
  const platform = options.platform ?? process.platform
  const homeDir = options.homeDir ?? os.homedir()
  const env = options.env ?? process.env
  const fsImpl = options.fs ?? fs
  const browserFilter = normalizeText(options.browserFilter).toLowerCase()
  const definitions = (
    options.definitions ?? getBrowserBookmarkDefinitions(platform, homeDir, env)
  ).filter((definition) => !browserFilter || definition.id === browserFilter)
  const diagnostics = buildDiagnostics(platform, definitions, browserFilter)
  const diagnosticsById = new Map(diagnostics.map((item) => [item.browserId, item]))
  const items: BrowserBookmarkItem[] = []

  for (const definition of definitions) {
    const files = discoverBrowserBookmarkFiles(definition, fsImpl)
    const diagnostic = diagnosticsById.get(definition.id)

    if (diagnostic) {
      diagnostic.status = files.length > 0 ? 'available' : 'not-found'
      diagnostic.profileCount = files.length
      diagnostic.reason = files.length > 0 ? '' : 'Bookmarks file not found'
      diagnostic.lastError = ''
    }

    for (const file of files) {
      try {
        items.push(...parseChromiumBookmarks(readJsonFile(file.path, fsImpl), file))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'read-failed'
        if (diagnostic) {
          diagnostic.status = 'read-failed'
          diagnostic.reason = message
          diagnostic.lastError = message
          diagnostic.failedProfile = file.profile
        }
      }
    }
  }

  return {
    items: dedupeBookmarks(items),
    diagnostics
  }
}

function hashUrl(url: string): string {
  return createHash('sha1').update(url).digest('hex').slice(0, 16)
}

export function mapBrowserBookmarkToIndexedSourceRecord(
  sourceId: string,
  bookmark: BrowserBookmarkItem
): IndexedSourceRecord {
  const keywords = [
    bookmark.title,
    bookmark.url,
    bookmark.folder,
    bookmark.browserName,
    bookmark.profile
  ].filter(Boolean)

  return {
    sourceId,
    recordId: `${sourceId}:${hashUrl(bookmark.url)}`,
    stableKey: bookmark.url,
    kind: 'browser-bookmark',
    title: bookmark.title,
    subtitle: [bookmark.url, bookmark.browserName, bookmark.profile, bookmark.folder]
      .filter(Boolean)
      .join(' · '),
    uri: bookmark.url,
    keywords,
    tags: ['browser-bookmark', bookmark.browserId],
    metadata: {
      browserId: bookmark.browserId,
      browserName: bookmark.browserName,
      profile: bookmark.profile,
      folder: bookmark.folder,
      dateAdded: bookmark.dateAdded,
      sourcePath: bookmark.sourcePath,
      content: keywords.join(' ')
    }
  }
}
