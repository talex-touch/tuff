import type { WorkspaceFileEntry } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'

export interface FileBreadcrumbSegment {
  label: string
  path: string
  isLast: boolean
}

export interface FlatFileTreeRow {
  path: string
  name: string
  isDirectory: boolean
  depth: number
  expanded: boolean
  loading: boolean
  size?: number
  isActive: boolean
  isHidden: boolean
}

export interface MarkdownHeadingItem {
  id: string
  level: number
  text: string
  index: number
}

export interface WorkspaceFileAiActionPayload {
  mode: 'send' | 'quote'
  filePath: string
  displayPath: string
  selectedText: string
  prompt: string
}

export interface MarkdownReviewComment {
  id: string
  quote: string
  comment: string
  createdAt: number
}

const DEFAULT_HIDDEN_NAMES = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  '.turbo',
  '.nuxt',
  '.next',
  '.cache'
])

export function normalizePosixPath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/\/+$/, '') || (rawPath.startsWith('/') ? '/' : '')
}

export function isDefaultHiddenEntry(name: string): boolean {
  if (!name) return false
  return name.startsWith('.') || DEFAULT_HIDDEN_NAMES.has(name)
}

export function formatCompactFileSize(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function resolveFileIconClass(
  name: string,
  isDirectory: boolean,
  isExpanded = false
): string {
  if (isDirectory) {
    return isExpanded ? 'i-ri-folder-open-line' : 'i-ri-folder-3-line'
  }
  const lower = name.toLowerCase()
  const dotIdx = lower.lastIndexOf('.')
  const ext = dotIdx > 0 ? lower.slice(dotIdx + 1) : ''
  if (['md', 'markdown', 'mdc', 'mdx'].includes(ext)) return 'i-ri-markdown-line'
  if (ext === 'html' || ext === 'htm') return 'i-ri-html5-line'
  if (ext === 'json' || ext === 'jsonc' || ext === 'json5') return 'i-ri-braces-line'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'avif'].includes(ext)) {
    return 'i-ri-image-2-line'
  }
  if (ext === 'pdf') return 'i-ri-file-pdf-2-line'
  if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return 'i-ri-terminal-box-line'
  if (['css', 'scss', 'sass', 'less'].includes(ext)) return 'i-ri-css3-line'
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return 'i-ri-javascript-line'
  if (
    [
      'ts',
      'mts',
      'cts',
      'tsx',
      'vue',
      'py',
      'rs',
      'go',
      'java',
      'kt',
      'swift',
      'c',
      'cpp',
      'h',
      'rb',
      'php',
      'sql'
    ].includes(ext)
  ) {
    return 'i-ri-file-code-line'
  }
  if (['yaml', 'yml', 'toml', 'ini', 'env', 'lock'].includes(ext) || lower.startsWith('.env')) {
    return 'i-ri-settings-3-line'
  }
  return 'i-ri-file-text-line'
}

/**
 * Builds interactive breadcrumb segments for a file or directory path.
 * When `workspaceRoot` contains `fullPath`, starts cleanly at the workspace root folder name
 * so deep system prefixes do not crowd narrow panes; otherwise shows all path segments.
 */
export function buildPathBreadcrumbs(
  fullPath: string,
  workspaceRoot?: string
): FileBreadcrumbSegment[] {
  const trimmed = fullPath.trim()
  if (!trimmed) return []

  const usesBackslash = trimmed.includes('\\') && !trimmed.includes('/')
  const sep = usesBackslash ? '\\' : '/'
  const normFull = normalizePosixPath(trimmed)
  const normRoot = workspaceRoot ? normalizePosixPath(workspaceRoot.trim()) : ''

  if (
    normRoot &&
    normRoot !== '/' &&
    (normFull === normRoot || normFull.startsWith(`${normRoot}/`))
  ) {
    const rootLabel = normRoot.split('/').filter(Boolean).pop() || normRoot
    const rel = normFull.slice(normRoot.length).replace(/^\/+/, '')
    const relParts = rel ? rel.split('/').filter(Boolean) : []
    const rootOutPath = usesBackslash ? normRoot.replace(/\//g, '\\') : normRoot
    const segments: FileBreadcrumbSegment[] = [
      {
        label: rootLabel,
        path: rootOutPath,
        isLast: relParts.length === 0
      }
    ]
    let acc = rootOutPath
    for (let i = 0; i < relParts.length; i += 1) {
      const part = relParts[i]!
      acc = `${acc}${sep}${part}`
      segments.push({
        label: part,
        path: acc,
        isLast: i === relParts.length - 1
      })
    }
    return segments
  }

  // Handle POSIX absolute paths (e.g. /Users/foo/bar.md) and Windows drive paths (C:\foo\bar.md).
  const driveMatch = /^([A-Za-z]:)(?:\/(.*))?$/.exec(normFull)
  if (driveMatch) {
    const drive = driveMatch[1]!
    const restParts = (driveMatch[2] ?? '').split('/').filter(Boolean)
    const segments: FileBreadcrumbSegment[] = [
      { label: drive, path: `${drive}${sep}`, isLast: restParts.length === 0 }
    ]
    let acc = drive
    for (let i = 0; i < restParts.length; i += 1) {
      const part = restParts[i]!
      acc = `${acc}${sep}${part}`
      segments.push({
        label: part,
        path: acc,
        isLast: i === restParts.length - 1
      })
    }
    return segments
  }

  const isAbs = normFull.startsWith('/')
  const parts = normFull.split('/').filter(Boolean)
  if (parts.length === 0) {
    return [{ label: '/', path: '/', isLast: true }]
  }

  const segments: FileBreadcrumbSegment[] = []
  let acc = ''
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!
    acc = isAbs ? `${acc}/${part}` : acc ? `${acc}/${part}` : part
    segments.push({
      label: part,
      path: usesBackslash ? acc.replace(/\//g, '\\') : acc,
      isLast: i === parts.length - 1
    })
  }
  return segments
}

/**
 * Returns ancestor directory paths from `rootPath` down to the parent of `targetPath`
 * (or `targetPath` itself when `includeTarget` is true) so a tree can expand sequentially.
 */
export function resolveAncestorDirectories(
  targetPath: string,
  rootPath: string,
  includeTarget = false
): string[] {
  const normTarget = normalizePosixPath(targetPath)
  const normRoot = normalizePosixPath(rootPath)
  if (!normTarget || !normRoot) return []
  if (normTarget === normRoot) return includeTarget ? [normRoot] : []
  if (!normTarget.startsWith(`${normRoot}/`)) return []

  const relParts = normTarget
    .slice(normRoot.length + 1)
    .split('/')
    .filter(Boolean)
  const stopLen = includeTarget ? relParts.length : Math.max(0, relParts.length - 1)
  const ancestors: string[] = [normRoot]
  let acc = normRoot
  for (let i = 0; i < stopLen; i += 1) {
    acc = `${acc}/${relParts[i]!}`
    ancestors.push(acc)
  }
  return ancestors
}

/**
 * Flattens cached directory entries into display rows for the Orca-style workspace file tree.
 */
export function flattenFileTree(options: {
  rootPath: string
  childrenByDir: Record<string, WorkspaceFileEntry[]>
  expandedDirs: ReadonlySet<string>
  loadingDirs: ReadonlySet<string>
  activePath?: string
  showHidden?: boolean
  query?: string
}): FlatFileTreeRow[] {
  const normRoot = normalizePosixPath(options.rootPath)
  if (!normRoot) return []

  const normActive = options.activePath ? normalizePosixPath(options.activePath) : ''
  const query = (options.query ?? '').trim().toLowerCase()
  const showHidden = Boolean(options.showHidden)
  const rows: FlatFileTreeRow[] = []

  const walk = (dirPath: string, depth: number): boolean => {
    const entries = options.childrenByDir[dirPath] ?? []
    let matchedAnyInSubtree = false

    for (const entry of entries) {
      const hidden = isDefaultHiddenEntry(entry.name)
      if (!showHidden && hidden) continue

      const entryNorm = normalizePosixPath(entry.path)
      const expanded = entry.isDirectory && options.expandedDirs.has(entryNorm)
      const loading = entry.isDirectory && options.loadingDirs.has(entryNorm)
      const isActive = Boolean(normActive && entryNorm === normActive)

      if (!query) {
        rows.push({
          path: entry.path,
          name: entry.name,
          isDirectory: entry.isDirectory,
          depth,
          expanded,
          loading,
          size: entry.size,
          isActive,
          isHidden: hidden
        })
        if (expanded) {
          walk(entryNorm, depth + 1)
        }
        continue
      }

      const nameMatches = entry.name.toLowerCase().includes(query)
      const insertIdx = rows.length
      rows.push({
        path: entry.path,
        name: entry.name,
        isDirectory: entry.isDirectory,
        depth,
        expanded:
          entry.isDirectory && (expanded || Boolean(options.childrenByDir[entryNorm]?.length)),
        loading,
        size: entry.size,
        isActive,
        isHidden: hidden
      })

      let childMatched = false
      if (entry.isDirectory && options.childrenByDir[entryNorm]?.length) {
        childMatched = walk(entryNorm, depth + 1)
      }

      if (nameMatches || childMatched) {
        matchedAnyInSubtree = true
      } else {
        rows.splice(insertIdx, 1)
      }
    }

    return matchedAnyInSubtree
  }

  walk(normRoot, 0)
  return rows
}

/**
 * Extracts ATX headings (`#`..`####`) from Markdown source while ignoring fenced code blocks.
 */
export function extractMarkdownHeadings(markdown: string): MarkdownHeadingItem[] {
  if (!markdown) return []
  const lines = markdown.split(/\r?\n/)
  const headings: MarkdownHeadingItem[] = []
  let inFence = false
  let fenceChar = ''

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fenceMatch) {
      const ch = fenceMatch[1]![0]!
      if (!inFence) {
        inFence = true
        fenceChar = ch
      } else if (ch === fenceChar) {
        inFence = false
        fenceChar = ''
      }
      continue
    }
    if (inFence) continue

    const headingMatch = /^\s*(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!headingMatch) continue
    const level = headingMatch[1]!.length
    const text = headingMatch[2]!
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim()
    if (!text) continue
    headings.push({
      id: `md-heading-${headings.length}`,
      level,
      text,
      index: headings.length
    })
  }
  return headings
}

export function formatQuotedSnippet(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n')
}

export function formatSingleSelectionPrompt(options: {
  displayPath: string
  selectedText: string
  instruction: string
}): string {
  const quote = formatQuotedSnippet(options.selectedText)
  const header = options.displayPath ? `\`${options.displayPath}\`` : ''
  const instruction = options.instruction.trim()
  if (!instruction) {
    return header ? `${header}\n${quote}\n\n` : `${quote}\n\n`
  }
  return header ? `${header}\n${quote}\n\n${instruction}` : `${quote}\n\n${instruction}`
}

export function formatBatchCommentsPrompt(options: {
  displayPath: string
  comments: MarkdownReviewComment[]
  intro: string
}): string {
  const header = options.displayPath
    ? `${options.intro} \`${options.displayPath}\`：`
    : `${options.intro}：`
  const blocks = options.comments.map((item, idx) => {
    const quote = formatQuotedSnippet(item.quote)
    return `${idx + 1}.\n${quote}\n${item.comment.trim()}`
  })
  return `${header}\n\n${blocks.join('\n\n')}`
}
