import type { ContextSignal } from '@talex-touch/utils/core-box'
import path from 'node:path'
import {
  isAppSourceType,
  isBrowserApp,
  isCollaborationChatApp,
  isDeveloperTool,
  isDownloadToolApp,
  isEditorApp,
  isEntertainmentOrSocialApp,
  isFileManagerApp,
  isIDE,
  isImageApp,
  isJetBrainsIDE,
  isTerminalApp,
  isTextEditor,
  isVSCode
} from './app-category-rules'
import { isSameAppIdentity } from './app-identity-match'
import {
  FILE_RECOMMENDATION_ALIASES,
  FILE_RECOMMENDATION_SOURCE_ID
} from './file-recommendation-source'

/**
 * A captured selection is the same privacy tier as the clipboard but a weaker
 * intent signal — it is often minutes old and was captured for another action.
 */
export const SELECTION_CONTEXT_WEIGHT = 0.6

/**
 * Minimum identity a volatile-context matcher needs. Cached TuffItems are
 * projected onto this shape so the same matchers serve both the fresh scoring
 * pass and the post-cache re-rank.
 */
export interface VolatileCandidate {
  sourceId: string
  itemId: string
  sourceType: string
}

const FILE_SOURCE_ID_SET: ReadonlySet<string> = new Set([
  FILE_RECOMMENDATION_SOURCE_ID,
  ...FILE_RECOMMENDATION_ALIASES
])

const SENSITIVE_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  '.ssh',
  '.gnupg',
  '.aws',
  '.kube',
  '.docker',
  'keychains'
])

const SENSITIVE_EXACT_BASENAMES: ReadonlySet<string> = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.htpasswd',
  'id_rsa',
  'id_ed25519',
  'id_ecdsa',
  'id_dsa',
  'known_hosts',
  'authorized_keys',
  'credentials',
  'credentials.json',
  'secrets.json',
  'secrets.yaml',
  'secrets.yml',
  'kubeconfig'
])

const SENSITIVE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.keystore',
  '.jks',
  '.kdbx',
  '.ovpn',
  '.der',
  '.csr'
])

const LANGUAGE_EXTENSION_AFFINITY: Readonly<Record<string, readonly string[]>> = {
  typescript: ['ts', 'tsx', 'mts', 'cts', 'json', 'md'],
  javascript: ['js', 'jsx', 'mjs', 'cjs', 'json', 'md'],
  python: ['py', 'ipynb', 'toml', 'yaml', 'yml', 'md'],
  rust: ['rs', 'toml', 'md'],
  go: ['go', 'mod', 'yaml', 'yml', 'md'],
  java: ['java', 'kt', 'gradle', 'xml', 'md'],
  kotlin: ['kt', 'kts', 'java', 'gradle', 'md'],
  swift: ['swift', 'plist', 'md'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'h', 'cmake', 'md'],
  c: ['c', 'h', 'md'],
  csharp: ['cs', 'csproj', 'sln', 'json', 'md'],
  sql: ['sql', 'db', 'csv', 'md'],
  shell: ['sh', 'zsh', 'bash', 'env', 'yaml', 'yml', 'md']
}

const CODE_DOC_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'py',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'cs',
  'sh',
  'zsh',
  'sql',
  'json',
  'yaml',
  'yml',
  'toml',
  'md',
  'mdx'
])

const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'md',
  'txt',
  'rtf'
])

const TEXT_NOTE_EXTENSIONS: ReadonlySet<string> = new Set([
  'md',
  'mdx',
  'markdown',
  'txt',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'csv',
  'pdf'
])

const IMAGE_DESIGN_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
  'fig',
  'sketch',
  'psd',
  'ai',
  'pdf'
])

const SHAREABLE_ATTACHMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'zip',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'md'
])

const TERMINAL_AFFINITY_EXTENSIONS: ReadonlySet<string> = new Set([
  'sh',
  'zsh',
  'bash',
  'py',
  'mjs',
  'js',
  'ts',
  'json',
  'yaml',
  'yml',
  'toml',
  'sql',
  'md',
  'txt'
])

/**
 * Rejects secret/credential files (`.env`, `.ssh/*`, `id_rsa`, `*.pem`, `*.key`, etc.)
 * from entering volatile contextual recall or receiving context-match boosts.
 */
export function isSensitiveFilePath(filePath: string): boolean {
  const trimmed = typeof filePath === 'string' ? filePath.trim() : ''
  if (!trimmed) return false

  const normalized = trimmed.replace(/\\/g, '/')
  const segments = normalized.split('/')
  const basename = (segments[segments.length - 1] ?? '').toLowerCase()
  if (!basename) return false

  if (
    SENSITIVE_EXACT_BASENAMES.has(basename) ||
    basename.startsWith('.env.') ||
    basename.endsWith('.env') ||
    basename.startsWith('id_rsa') ||
    basename.startsWith('id_ed25519') ||
    basename.startsWith('id_ecdsa') ||
    basename.startsWith('id_dsa')
  ) {
    return true
  }

  const ext = path.posix.extname(basename).toLowerCase()
  if (ext && SENSITIVE_FILE_EXTENSIONS.has(ext)) {
    return true
  }

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!.toLowerCase()
    if (segment && SENSITIVE_PATH_SEGMENTS.has(segment)) {
      return true
    }
  }

  return false
}

export function isFileVolatileCandidate(candidate: VolatileCandidate): boolean {
  return candidate.sourceType === 'file' || FILE_SOURCE_ID_SET.has(candidate.sourceId)
}

function extractFileExtension(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const ext = path.posix.extname(normalized).toLowerCase()
  return ext.startsWith('.') ? ext.slice(1) : ext
}

function hasNoisyDirectorySegment(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return (
    normalized.includes('/node_modules/') ||
    normalized.includes('/.git/') ||
    normalized.includes('/dist/') ||
    normalized.includes('/build/')
  )
}

function resolveProjectPathAffinity(candidatePath: string, meta?: Record<string, unknown>): number {
  if (!meta) return 0
  const rawHint =
    (typeof meta.projectRoot === 'string' && meta.projectRoot) ||
    (typeof meta.directory === 'string' && meta.directory) ||
    (typeof meta.pathHint === 'string' && meta.pathHint) ||
    ''
  if (!rawHint) return 0

  const normalizedCandidate = candidatePath.replace(/\\/g, '/').toLowerCase()
  const normalizedHint = rawHint.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  if (!normalizedHint || normalizedHint === '/') return 0

  if (
    normalizedCandidate === normalizedHint ||
    normalizedCandidate.startsWith(`${normalizedHint}/`)
  ) {
    return 35
  }

  const hintBase = path.posix.basename(normalizedHint)
  if (hintBase.length >= 3 && normalizedCandidate.includes(`/${hintBase}/`)) {
    return 20
  }

  return 0
}

function matchFileCandidateClipboard(
  itemId: string,
  clipboard: { type: string; contentType?: string; meta?: Record<string, unknown> }
): number {
  if (isSensitiveFilePath(itemId) || hasNoisyDirectorySegment(itemId)) {
    return -100
  }

  const ext = extractFileExtension(itemId)
  let score = resolveProjectPathAffinity(itemId, clipboard.meta)

  const clipboardExt =
    typeof clipboard.meta?.fileExtension === 'string'
      ? clipboard.meta.fileExtension.replace(/^\./, '').toLowerCase()
      : ''
  if (clipboardExt && ext && clipboardExt === ext) {
    score += 55
  }

  const fileType = clipboard.meta?.fileType
  const language =
    typeof clipboard.meta?.language === 'string' ? clipboard.meta.language.toLowerCase() : ''

  if (fileType === 'code' || clipboard.contentType === 'code') {
    const langExts = language ? LANGUAGE_EXTENSION_AFFINITY[language] : undefined
    if (langExts && ext && langExts.includes(ext)) {
      score += 50
    } else if (ext && CODE_DOC_EXTENSIONS.has(ext)) {
      score += 35
    }
  } else if (fileType === 'document') {
    if (ext && DOCUMENT_EXTENSIONS.has(ext)) {
      score += 55
    }
  } else if (fileType === 'text') {
    if (ext && TEXT_NOTE_EXTENSIONS.has(ext)) {
      score += 45
    }
  } else if (fileType === 'image' || clipboard.type === 'image') {
    if (ext && IMAGE_DESIGN_EXTENSIONS.has(ext)) {
      score += 55
    }
  } else if (
    clipboard.type === 'text' &&
    clipboard.contentType !== 'url' &&
    !clipboard.meta?.isUrl
  ) {
    if (ext && (DOCUMENT_EXTENSIONS.has(ext) || CODE_DOC_EXTENSIONS.has(ext))) {
      score += 25
    }
  } else if (clipboard.type === 'files') {
    if (ext && SHAREABLE_ATTACHMENT_EXTENSIONS.has(ext)) {
      score += 30
    }
  }

  return Math.min(85, score)
}

/**
 * Calculates total volatile context match score across clipboard, selection,
 * foreground app, and system state.
 */
export function calculateContextMatch(
  candidate: VolatileCandidate,
  context: ContextSignal
): number {
  let score = 0

  if (context.clipboard) {
    score += matchClipboardContent(candidate, context.clipboard)
  }

  if (context.selection) {
    score +=
      matchClipboardContent(candidate, { ...context.selection, type: 'text' }) *
      SELECTION_CONTEXT_WEIGHT
  }

  if (context.foregroundApp) {
    score += matchForegroundApp(candidate, context.foregroundApp)
  }

  if (context.systemState) {
    score += matchSystemState(candidate, context.systemState)
  }

  return score
}

/**
 * Matches clipboard/selection content metadata against app and file candidates.
 * App scoring branches remain exact; file candidates receive extension/project/path affinity.
 */
export function matchClipboardContent(
  candidate: VolatileCandidate,
  clipboard: { type: string; contentType?: string; meta?: Record<string, unknown> }
): number {
  const { sourceType, itemId } = candidate

  if (!isAppSourceType(sourceType)) {
    if (isFileVolatileCandidate(candidate)) {
      return matchFileCandidateClipboard(itemId, clipboard)
    }
    return 0
  }

  if (clipboard.meta?.fileType === 'code' && clipboard.meta.language) {
    const language = clipboard.meta.language

    if (language === 'java' || language === 'kotlin') {
      if (isJetBrainsIDE(itemId, ['idea', 'android-studio'])) {
        return 100
      }
    }

    if (language === 'python') {
      if (isJetBrainsIDE(itemId, ['pycharm'])) {
        return 100
      }
      if (isVSCode(itemId)) {
        return 90
      }
    }

    if (language === 'javascript' || language === 'typescript') {
      if (isVSCode(itemId)) {
        return 100
      }
      if (isJetBrainsIDE(itemId, ['webstorm'])) {
        return 95
      }
    }

    if (isIDE(itemId)) {
      return 80
    }
  }

  if (clipboard.meta?.fileType === 'text') {
    if (isTextEditor(itemId)) {
      return 85
    }
  }

  if (clipboard.meta?.fileType === 'image') {
    if (isImageApp(itemId)) {
      return 100
    }
  }

  const isUrl = clipboard.contentType === 'url' || clipboard.meta?.isUrl === true

  if (clipboard.type === 'text') {
    if (isUrl) {
      if (isBrowserApp(itemId)) {
        return 100
      }
      if (isDownloadToolApp(itemId)) {
        return 80
      }
    } else if (isEditorApp(itemId)) {
      return 70
    }
  } else if (clipboard.type === 'image') {
    if (isImageApp(itemId)) {
      return 100
    }
  } else if (clipboard.type === 'files') {
    if (isFileManagerApp(itemId)) {
      return 80
    }
  }

  return 0
}

function matchWindowTitlePathOverlap(filePath: string, windowTitle?: string): number {
  if (!windowTitle || windowTitle.trim().length < 3) return 0
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase()
  const tokens = windowTitle
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/gu)
    .filter((token) => token.length >= 3)

  for (const token of tokens) {
    if (normalizedPath.includes(token)) {
      return 20
    }
  }
  return 0
}

function matchFileCandidateForegroundApp(
  itemId: string,
  foregroundApp: NonNullable<ContextSignal['foregroundApp']> & { windowTitle?: string }
): number {
  if (isSensitiveFilePath(itemId) || hasNoisyDirectorySegment(itemId)) {
    return -100
  }

  const ext = extractFileExtension(itemId)
  const appIdentity = `${foregroundApp.bundleId} ${foregroundApp.name || ''}`
  const titleBonus = matchWindowTitlePathOverlap(itemId, foregroundApp.windowTitle)

  if (isCollaborationChatApp(appIdentity)) {
    return (ext && SHAREABLE_ATTACHMENT_EXTENSIONS.has(ext) ? 35 : 0) + titleBonus
  }

  if (isIDE(appIdentity)) {
    return (ext && CODE_DOC_EXTENSIONS.has(ext) ? 35 : 0) + titleBonus
  }

  if (isImageApp(appIdentity)) {
    return (ext && IMAGE_DESIGN_EXTENSIONS.has(ext) ? 40 : 0) + titleBonus
  }

  if (isTerminalApp(appIdentity)) {
    return (ext && TERMINAL_AFFINITY_EXTENSIONS.has(ext) ? 35 : 0) + titleBonus
  }

  return titleBonus
}

/**
 * Matches foreground app against candidate items.
 */
export function matchForegroundApp(
  candidate: VolatileCandidate,
  foregroundApp: NonNullable<ContextSignal['foregroundApp']> & { windowTitle?: string }
): number {
  const { sourceType, itemId } = candidate

  if (!isAppSourceType(sourceType)) {
    if (isFileVolatileCandidate(candidate)) {
      return matchFileCandidateForegroundApp(itemId, foregroundApp)
    }
    return 0
  }

  if (isSameAppIdentity(itemId, foregroundApp)) {
    return -50
  }

  if (isIDE(foregroundApp.bundleId) && isTerminalApp(itemId)) {
    return 60
  }

  if (isBrowserApp(foregroundApp.bundleId) && isDeveloperTool(itemId)) {
    return 50
  }

  return 0
}

export function matchSystemState(
  candidate: VolatileCandidate,
  systemState: NonNullable<ContextSignal['systemState']>
): number {
  const { sourceType, itemId } = candidate
  if (!isAppSourceType(sourceType)) {
    if (isFileVolatileCandidate(candidate) && isSensitiveFilePath(itemId)) {
      return -100
    }
    return 0
  }

  let score = 0
  const isBatteryConstrained =
    systemState.powerMode === 'battery' &&
    (typeof systemState.batteryLevel !== 'number' || systemState.batteryLevel <= 25)

  if (systemState.isOnline === false) {
    if (isBrowserApp(itemId) || isDownloadToolApp(itemId)) {
      score -= 25
    }
  }

  if (isBatteryConstrained) {
    if (isImageApp(itemId) || isIDE(itemId)) {
      score -= 16
    }
    if (isTextEditor(itemId) || isTerminalApp(itemId)) {
      score += 8
    }
  }

  if (systemState.focusMode === 'active' || systemState.isDNDEnabled) {
    if (isIDE(itemId) || isTerminalApp(itemId) || isTextEditor(itemId)) {
      score += 12
    }
    if (isEntertainmentOrSocialApp(itemId)) {
      score -= 20
    }
  }

  return score
}
