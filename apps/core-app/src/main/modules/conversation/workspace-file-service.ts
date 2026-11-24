import type {
  WorkspaceFileEntry,
  WorkspaceOpenFileExternalRequest,
  WorkspaceOpenFileExternalResult,
  WorkspacePickFileRequest,
  WorkspacePickFileResult,
  WorkspaceReadFileRequest,
  WorkspaceReadFileResult
} from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, dialog, shell } from 'electron'
import { getProject } from '../project/project-store'
import { peekConversationWorkspaceRoot } from '../local-ai-cli/workspace-root'
import { getConversation } from './conversation-store'

const DEFAULT_TEXT_MAX_BYTES = 2 * 1024 * 1024
const HARD_TEXT_MAX_BYTES = 4 * 1024 * 1024
const BINARY_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
const DIRECTORY_ENTRY_LIMIT = 500
const BINARY_SNIFF_BYTES = 8192

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif'
}

const TEXT_MIME_BY_EXT: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  svg: 'image/svg+xml',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  css: 'text/css',
  scss: 'text/x-scss',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  vue: 'text/x-vue',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  csv: 'text/csv',
  txt: 'text/plain',
  log: 'text/plain'
}

const KNOWN_TEXT_EXTS = new Set([
  ...Object.keys(TEXT_MIME_BY_EXT),
  'py',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rb',
  'php',
  'swift',
  'kt',
  'kts',
  'dart',
  'sh',
  'bash',
  'zsh',
  'fish',
  'toml',
  'ini',
  'conf',
  'cfg',
  'env',
  'sql',
  'graphql',
  'gql',
  'dockerfile',
  'makefile',
  'gitignore',
  'editorconfig',
  'eslintrc',
  'prettierrc',
  'npmrc',
  'lock',
  'mdc',
  'mdx',
  'less',
  'sass',
  'svelte',
  'astro',
  'lua',
  'r',
  'm',
  'mm',
  'zig',
  'nim',
  'ex',
  'exs',
  'erl',
  'hs',
  'scala',
  'clj',
  'tex',
  'rst',
  'diff',
  'patch'
])

/** Extensions that OS openPath would execute instead of merely viewing. */
const EXECUTABLE_EXTENSIONS = new Set([
  'app',
  'command',
  'sh',
  'bash',
  'zsh',
  'bat',
  'cmd',
  'exe',
  'msi',
  'pkg',
  'dmg',
  'vbs',
  'vbe',
  'wsf',
  'wsh',
  'ps1',
  'psm1',
  'scpt',
  'workflow',
  'action',
  'jar',
  'com',
  'scr',
  'cpl',
  'reg',
  'msc',
  'out',
  'bin',
  'run',
  'appimage',
  'deb',
  'rpm',
  'desktop',
  'lnk',
  'pif',
  'hta'
])

const BLOCKED_HOME_SUBPATHS = [
  '.ssh',
  '.aws',
  '.azure',
  '.gnupg',
  '.kube',
  path.join('Library', 'Keychains')
]

const approvedPickedPaths = new Set<string>()

export interface WorkspaceFileServicePorts {
  resolveConversationRoot?: (conversationId: string) => Promise<string | null>
  openDialog?: typeof dialog.showOpenDialog
  openPath?: (target: string) => Promise<string>
  showItemInFolder?: (target: string) => void
  homedir?: () => string
}

function normalizeComparable(value: string): string {
  const resolved = path.resolve(value)
  if (process.platform === 'darwin' && resolved.startsWith('/private/')) {
    return resolved.slice('/private'.length).toLowerCase()
  }
  return process.platform === 'darwin' || process.platform === 'win32'
    ? resolved.toLowerCase()
    : resolved
}

function isWithinDir(target: string, root: string): boolean {
  const compTarget = normalizeComparable(target)
  const compRoot = normalizeComparable(root)
  if (compTarget === compRoot) return true
  const sep = process.platform === 'win32' ? '\\' : '/'
  const prefix = compRoot.endsWith(sep) ? compRoot : `${compRoot}${sep}`
  return compTarget.startsWith(prefix)
}

export function isBlockedSensitivePath(targetPath: string, homeDir = os.homedir()): boolean {
  const normalizedHome = path.resolve(homeDir)
  for (const sub of BLOCKED_HOME_SUBPATHS) {
    if (isWithinDir(targetPath, path.join(normalizedHome, sub))) {
      return true
    }
  }
  if (process.platform !== 'win32') {
    const comp = normalizeComparable(targetPath)
    if (comp === '/etc/shadow' || comp === '/etc/master.passwd') {
      return true
    }
  }
  return false
}

export function isExecutableFilePath(targetPath: string): boolean {
  const ext = path.extname(targetPath).replace(/^\./, '').toLowerCase()
  return Boolean(ext && EXECUTABLE_EXTENSIONS.has(ext))
}

function normalizeInputPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('\0')) {
    throw new Error('WORKSPACE_FILE_PATH_INVALID')
  }
  if (/^file:\/\//i.test(trimmed)) {
    return fileURLToPath(trimmed)
  }
  return trimmed
}

async function defaultResolveConversationRoot(conversationId: string): Promise<string | null> {
  const conversation = await getConversation(conversationId).catch(() => null)
  if (conversation?.projectId) {
    const project = await getProject(conversation.projectId).catch(() => null)
    if (project?.rootPath) return project.rootPath
  }
  return await peekConversationWorkspaceRoot(conversationId)
}

async function resolveTargetPath(
  rawPath: string,
  conversationId: string | null | undefined,
  ports: WorkspaceFileServicePorts
): Promise<string> {
  const normalized = normalizeInputPath(rawPath)
  if (path.isAbsolute(normalized)) {
    return path.resolve(normalized)
  }
  if (normalized.startsWith('~/') || normalized === '~') {
    const home = (ports.homedir ?? os.homedir)()
    return path.resolve(path.join(home, normalized.slice(1)))
  }
  if (conversationId) {
    const rootResolver = ports.resolveConversationRoot ?? defaultResolveConversationRoot
    const root = await rootResolver(conversationId)
    if (root) {
      return path.resolve(root, normalized)
    }
  }
  return path.resolve(process.cwd(), normalized)
}

function hasBinaryNullByte(buffer: Uint8Array): boolean {
  const limit = Math.min(buffer.length, BINARY_SNIFF_BYTES)
  for (let index = 0; index < limit; index += 1) {
    if (buffer[index] === 0) return true
  }
  return false
}

function fileExtensionOf(filePath: string): string {
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase()
  if (ext) return ext
  const base = path.basename(filePath).toLowerCase()
  if (base === 'dockerfile' || base === 'makefile') return base
  return ''
}

export async function readWorkspaceFile(
  request: WorkspaceReadFileRequest,
  ports: WorkspaceFileServicePorts = {}
): Promise<WorkspaceReadFileResult> {
  const candidate = await resolveTargetPath(request?.path ?? '', request?.conversationId, ports)
  const homeDir = (ports.homedir ?? os.homedir)()

  let canonical: string
  try {
    canonical = await fs.realpath(candidate)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new Error(`ENOENT: ${candidate}`)
    }
    throw error
  }

  if (isBlockedSensitivePath(canonical, homeDir) || isBlockedSensitivePath(candidate, homeDir)) {
    throw new Error('WORKSPACE_FILE_FORBIDDEN')
  }

  const stats = await fs.stat(canonical)
  const name = path.basename(canonical) || canonical
  const ext = fileExtensionOf(canonical)

  if (stats.isDirectory()) {
    const dirEntries = await fs.readdir(canonical, { withFileTypes: true })
    const filtered = dirEntries
      .filter((entry) => entry.name !== '.DS_Store')
      .slice(0, DIRECTORY_ENTRY_LIMIT)

    const entries: WorkspaceFileEntry[] = await Promise.all(
      filtered.map(async (entry) => {
        const entryPath = path.join(canonical, entry.name)
        let size: number | undefined
        if (!entry.isDirectory()) {
          const entryStat = await fs.stat(entryPath).catch(() => null)
          size = entryStat?.size
        }
        return {
          name: entry.name,
          path: entryPath,
          isDirectory: entry.isDirectory(),
          ...(size !== undefined ? { size } : {})
        }
      })
    )

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

    return {
      path: canonical,
      name,
      ext: '',
      kind: 'directory',
      mimeType: 'inode/directory',
      size: entries.length,
      truncated: dirEntries.length > DIRECTORY_ENTRY_LIMIT,
      mtimeMs: stats.mtimeMs,
      entries
    }
  }

  if (!stats.isFile()) {
    throw new Error('WORKSPACE_FILE_UNSUPPORTED')
  }

  // Images (non-SVG)
  if (ext && Object.hasOwn(IMAGE_MIME_BY_EXT, ext)) {
    if (stats.size > BINARY_PREVIEW_MAX_BYTES) {
      return {
        path: canonical,
        name,
        ext,
        kind: 'binary',
        mimeType: IMAGE_MIME_BY_EXT[ext]!,
        size: stats.size,
        truncated: true,
        mtimeMs: stats.mtimeMs
      }
    }
    const raw = await fs.readFile(canonical)
    return {
      path: canonical,
      name,
      ext,
      kind: 'image',
      mimeType: IMAGE_MIME_BY_EXT[ext]!,
      size: stats.size,
      truncated: false,
      mtimeMs: stats.mtimeMs,
      base64: raw.toString('base64')
    }
  }

  // PDF
  if (ext === 'pdf') {
    if (stats.size > BINARY_PREVIEW_MAX_BYTES) {
      return {
        path: canonical,
        name,
        ext,
        kind: 'binary',
        mimeType: 'application/pdf',
        size: stats.size,
        truncated: true,
        mtimeMs: stats.mtimeMs
      }
    }
    const raw = await fs.readFile(canonical)
    return {
      path: canonical,
      name,
      ext,
      kind: 'pdf',
      mimeType: 'application/pdf',
      size: stats.size,
      truncated: false,
      mtimeMs: stats.mtimeMs,
      base64: raw.toString('base64')
    }
  }

  // Read bounded head for text/code or binary classification
  const requestedMax =
    typeof request?.maxBytes === 'number' && Number.isFinite(request.maxBytes)
      ? Math.max(1024, Math.min(HARD_TEXT_MAX_BYTES, Math.trunc(request.maxBytes)))
      : DEFAULT_TEXT_MAX_BYTES
  const readSize = Math.min(stats.size, requestedMax)
  const handle = await fs.open(canonical, 'r')
  let buffer: Buffer
  try {
    buffer = Buffer.alloc(readSize)
    if (readSize > 0) {
      const { bytesRead } = await handle.read(buffer, 0, readSize, 0)
      buffer = buffer.subarray(0, bytesRead)
    }
  } finally {
    await handle.close()
  }

  if (!KNOWN_TEXT_EXTS.has(ext) && hasBinaryNullByte(buffer)) {
    return {
      path: canonical,
      name,
      ext,
      kind: 'binary',
      mimeType: 'application/octet-stream',
      size: stats.size,
      truncated: stats.size > readSize,
      mtimeMs: stats.mtimeMs
    }
  }

  return {
    path: canonical,
    name,
    ext,
    kind: 'text',
    mimeType: TEXT_MIME_BY_EXT[ext] ?? 'text/plain',
    size: stats.size,
    truncated: stats.size > readSize,
    mtimeMs: stats.mtimeMs,
    text: buffer.toString('utf-8')
  }
}

export async function pickWorkspaceFile(
  request: WorkspacePickFileRequest = {},
  ports: WorkspaceFileServicePorts = {}
): Promise<WorkspacePickFileResult> {
  let defaultPath = request?.defaultPath?.trim()
  if (!defaultPath && request?.conversationId) {
    const rootResolver = ports.resolveConversationRoot ?? defaultResolveConversationRoot
    defaultPath = (await rootResolver(request.conversationId)) ?? undefined
  }
  if (defaultPath) {
    const exists = await fs
      .stat(defaultPath)
      .then((s) => s.isDirectory())
      .catch(() => false)
    if (!exists) defaultPath = undefined
  }

  const openDialog = ports.openDialog ?? dialog.showOpenDialog.bind(dialog)
  const focused = BrowserWindow.getFocusedWindow()
  const dialogOptions = {
    ...(defaultPath ? { defaultPath } : {}),
    properties: ['openFile' as const]
  }
  const result = focused
    ? await openDialog(focused, dialogOptions)
    : await openDialog(dialogOptions)

  if (result.canceled || !result.filePaths.length) {
    return { path: null }
  }

  const picked = path.resolve(result.filePaths[0]!)
  approvedPickedPaths.add(normalizeComparable(picked))
  return { path: picked }
}

export async function openWorkspaceFileExternal(
  request: WorkspaceOpenFileExternalRequest,
  ports: WorkspaceFileServicePorts = {}
): Promise<WorkspaceOpenFileExternalResult> {
  const candidate = await resolveTargetPath(request?.path ?? '', request?.conversationId, ports)
  const homeDir = (ports.homedir ?? os.homedir)()

  let canonical: string
  try {
    canonical = await fs.realpath(candidate)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new Error(`ENOENT: ${candidate}`)
    }
    throw error
  }

  if (isBlockedSensitivePath(canonical, homeDir) || isBlockedSensitivePath(candidate, homeDir)) {
    throw new Error('WORKSPACE_FILE_FORBIDDEN')
  }

  const stats = await fs.stat(canonical)
  const showItemInFolder =
    ports.showItemInFolder ?? ((target: string) => shell.showItemInFolder(target))
  const openPath = ports.openPath ?? ((target: string) => shell.openPath(target))

  // Never execute bundles, shell scripts, or binaries via OS association; reveal them instead.
  if (
    isExecutableFilePath(canonical) ||
    (process.platform === 'darwin' && canonical.toLowerCase().endsWith('.app'))
  ) {
    showItemInFolder(canonical)
    return { opened: false, revealed: true }
  }

  if (!stats.isFile() && !stats.isDirectory()) {
    throw new Error('WORKSPACE_FILE_UNSUPPORTED')
  }

  const errorMessage = await openPath(canonical)
  if (errorMessage) {
    throw new Error(errorMessage)
  }
  return { opened: true }
}

export function isApprovedPickedWorkspacePath(targetPath: string): boolean {
  return approvedPickedPaths.has(normalizeComparable(targetPath))
}
