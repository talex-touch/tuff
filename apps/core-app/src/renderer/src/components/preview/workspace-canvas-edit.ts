import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { formatQuotedSnippet } from './workspace-file-tree'

export interface SourceSelectionMatch {
  start: number
  end: number
  isFullDocument: boolean
}

export interface CanvasApplyResult {
  nextContent: string
  changed: boolean
  mode: 'selection' | 'document'
}

export interface CanvasDiffLine {
  type: 'context' | 'add' | 'del'
  text: string
  oldLine?: number
  newLine?: number
}

export interface CanvasDiffSummary {
  lines: CanvasDiffLine[]
  additions: number
  deletions: number
  /** 1-based line numbers in the updated text that were added or changed. */
  changedNewLines: Set<number>
}

export interface CanvasTurnBaseline {
  knownMessageIds: ReadonlySet<string>
  initialCount: number
}

const REVISION_HEADING_CUE_RE =
  /(?:润色后|优化后|修改后|改写后|修订后|完整文本|更新后|最终版本|revised|polished|updated|improved|rewritten)/i

const META_REPLY_CUE_RE =
  /(?:^|\n)\s*(?:#{1,4}\s*(?:修改|优化|润色|建议|说明|总结|改动|changes|summary|suggestions)|(?:主要改动|修改说明|优化说明|变更说明|Changes made|Summary of changes)\s*[:：]|[-*]\s*["“「][^"\n]+["”」]\s*(?:->|→))/im

const CLAIMED_DISK_UPDATE_RE =
  /(?:已直接更新|已更新文件|已落盘|文件已更新|已将修改写入|已写入文件|工具返回[\s\S]{0,24}success|updated the file|saved to disk|written to disk|file has been updated)/i

/**
 * Returns true when an assistant reply claims it already wrote changes to disk
 * (for example, "已直接更新文件 xxx.md（工具返回 success: true）").
 */
export function isClaimedDiskUpdateReply(reply: string): boolean {
  return CLAIMED_DISK_UPDATE_RE.test(reply)
}

const NON_PROSE_FENCE_LANGS = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'fish',
  'powershell',
  'ps1',
  'cmd',
  'bat',
  'json',
  'jsonc',
  'diff',
  'patch',
  'sql',
  'yaml',
  'yml',
  'toml',
  'ini',
  'xml'
])

const FILE_WRITE_TOOL_NAME_RE =
  /^(?:file\.write|tuff_write_file|write_file|edit_file|patch_file|replace_in_file|str_replace_editor|write|edit|multiedit|apply_patch)$/i

const FILE_TOUCH_TOOL_NAME_RE =
  /^(?:file\.(?:read|write|exists|list|search|patch|edit)|tuff_(?:read|write|edit)_file|(?:read|write|edit|patch)_file|replace_in_file|str_replace_editor|write|edit|multiedit|apply_patch|bash|shell|terminal)$/i

const IMPLICIT_CURRENT_FILE_EDIT_CUE_RE =
  /(?:当前文件|这个文件|这份文档|这篇(?:文章|文档|故事|内容)|右侧(?:文档|文件|内容|预览)|帮我(?:再)?(?:改|修改|润色|优化|重写|扩写|精简|调整|更新)|(?:this|current|open)\s+(?:file|doc|document)|(?:polish|rewrite|improve|edit|update|refactor|fix)\s+(?:it|this|the\s+(?:file|doc|document|text|passage|article|story)))/i

export interface CanvasFileIdentity {
  fileName: string
  displayPath?: string
  filePath?: string
}

/**
 * Normalizes typography and strips lightweight Markdown markers solely for fuzzy comparison
 * between rendered preview selections and raw Markdown source lines.
 */
export function normalizeMarkdownMatchText(raw: string): string {
  return raw
    .replace(/^\s*(?:>\s*)+/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/[“”「」『』]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

interface SourceLineSpan {
  index: number
  raw: string
  stripped: string
  start: number
  end: number
}

function splitSourceLineSpans(source: string): SourceLineSpan[] {
  const spans: SourceLineSpan[] = []
  let cursor = 0
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const rawWithCr = lines[i] ?? ''
    const raw = rawWithCr.endsWith('\r') ? rawWithCr.slice(0, -1) : rawWithCr
    const start = cursor
    const end = start + raw.length
    spans.push({
      index: i,
      raw,
      stripped: normalizeMarkdownMatchText(raw),
      start,
      end
    })
    cursor += rawWithCr.length + 1
  }
  return spans
}

/**
 * Locates a rendered preview text selection inside raw Markdown / text source.
 * Supports exact matches, multi-paragraph selections across blank lines, Markdown syntax
 * differences (`#`, `**`, smart quotes), and partial single-line selections.
 */
export function locateSelectionInSource(
  source: string,
  selectedText: string
): SourceSelectionMatch | null {
  if (!source || !selectedText.trim()) return null

  const normalizedSource = source.replace(/\r\n/g, '\n')
  const normalizedSelected = selectedText.replace(/\r\n/g, '\n').trim()
  if (!normalizedSelected) return null

  const spans = splitSourceLineSpans(source)
  const nonEmptySource = spans.filter((line) => line.stripped.length > 0)

  const checkFullDoc = (start: number, end: number): boolean => {
    if (nonEmptySource.length === 0) return true
    const covered = nonEmptySource.filter((line) => line.start >= start && line.end <= end).length
    if (covered / nonEmptySource.length >= 0.85) return true
    // Also treat selecting everything after a single top-level H1 heading as body-full.
    if (
      nonEmptySource.length >= 2 &&
      /^\s*#\s+/.test(nonEmptySource[0]!.raw) &&
      covered === nonEmptySource.length - 1
    ) {
      return false
    }
    return false
  }

  // Tier 1: Exact substring match (fast path for plain text or identical raw markdown).
  const exactIdx = source.indexOf(normalizedSelected)
  if (exactIdx >= 0) {
    const end = exactIdx + normalizedSelected.length
    return { start: exactIdx, end, isFullDocument: checkFullDoc(exactIdx, end) }
  }

  // Also try exact match on LF-normalized text when source has CRLF.
  if (source.includes('\r\n')) {
    const lfIdx = normalizedSource.indexOf(normalizedSelected)
    if (lfIdx >= 0) {
      // Map LF index back to CRLF index.
      const prefix = normalizedSource.slice(0, lfIdx)
      const crCountBefore = (prefix.match(/\n/g) ?? []).length
      const matchedSlice = normalizedSource.slice(lfIdx, lfIdx + normalizedSelected.length)
      const crCountInside = (matchedSlice.match(/\n/g) ?? []).length
      const start = lfIdx + crCountBefore
      const end = start + normalizedSelected.length + crCountInside
      return { start, end, isFullDocument: checkFullDoc(start, end) }
    }
  }

  // Tier 2: Line-sequence normalized match across rendered paragraphs & Markdown syntax.
  const selLines = normalizedSelected
    .split('\n')
    .map((line) => normalizeMarkdownMatchText(line))
    .filter(Boolean)

  if (selLines.length === 0 || nonEmptySource.length === 0) return null

  if (selLines.length === 1) {
    const needle = selLines[0]!
    // Prefer exact full-line normalized match first.
    const exactLine = nonEmptySource.find((line) => line.stripped === needle)
    if (exactLine) {
      return {
        start: exactLine.start,
        end: exactLine.end,
        isFullDocument: checkFullDoc(exactLine.start, exactLine.end)
      }
    }
    // Partial substring inside one source line.
    for (const line of nonEmptySource) {
      const rawIdx = line.raw.indexOf(normalizedSelected)
      if (rawIdx >= 0) {
        const start = line.start + rawIdx
        const end = start + normalizedSelected.length
        return { start, end, isFullDocument: false }
      }
      if (line.stripped.includes(needle)) {
        return {
          start: line.start,
          end: line.end,
          isFullDocument: checkFullDoc(line.start, line.end)
        }
      }
    }
  }

  // Contiguous non-empty line sequence match.
  if (selLines.length <= nonEmptySource.length) {
    for (let i = 0; i <= nonEmptySource.length - selLines.length; i += 1) {
      let allMatch = true
      for (let j = 0; j < selLines.length; j += 1) {
        const srcLine = nonEmptySource[i + j]!.stripped
        const selLine = selLines[j]!
        if (srcLine === selLine) continue
        // Allow partial boundary match on the very first or very last selected line.
        const isFirst = j === 0 && srcLine.endsWith(selLine)
        const isLast = j === selLines.length - 1 && srcLine.startsWith(selLine)
        if (!isFirst && !isLast) {
          allMatch = false
          break
        }
      }
      if (allMatch) {
        const firstSpan = nonEmptySource[i]!
        const lastSpan = nonEmptySource[i + selLines.length - 1]!
        return {
          start: firstSpan.start,
          end: lastSpan.end,
          isFullDocument: checkFullDoc(firstSpan.start, lastSpan.end)
        }
      }
    }
  }

  // Tier 3: First + last line anchor match (handles soft line wraps inside a multi-paragraph selection).
  if (selLines.length >= 2) {
    const firstNeedle = selLines[0]!
    const lastNeedle = selLines[selLines.length - 1]!
    const startCandidates = nonEmptySource.filter(
      (line) => line.stripped === firstNeedle || line.stripped.includes(firstNeedle)
    )
    const endCandidates = nonEmptySource.filter(
      (line) => line.stripped === lastNeedle || line.stripped.includes(lastNeedle)
    )
    if (startCandidates.length === 1 && endCandidates.length === 1) {
      const firstSpan = startCandidates[0]!
      const lastSpan = endCandidates[0]!
      if (lastSpan.index >= firstSpan.index) {
        return {
          start: firstSpan.start,
          end: lastSpan.end,
          isFullDocument: checkFullDoc(firstSpan.start, lastSpan.end)
        }
      }
    }
  }

  return null
}

/**
 * Strips accidental leading `> ` blockquote prefixes that LLMs often echo back when the user
 * prompt quoted the original selection as a Markdown blockquote.
 */
function stripAccidentalBlockquotePrefix(candidate: string, originalSelection: string): string {
  const originalLines = originalSelection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const originalQuotedRatio =
    originalLines.length > 0
      ? originalLines.filter((line) => /^>/.test(line)).length / originalLines.length
      : 0
  if (originalQuotedRatio >= 0.3) return candidate

  const lines = candidate.replace(/\r\n/g, '\n').split('\n')
  const nonEmpty = lines.filter((line) => line.trim().length > 0)
  if (nonEmpty.length === 0) return candidate

  const quotedCount = nonEmpty.filter((line) => /^\s*>/.test(line)).length
  if (quotedCount / nonEmpty.length < 0.75) return candidate

  return lines
    .map((line) => {
      if (/^\s*>\s?$/.test(line)) return ''
      return line.replace(/^\s*>\s?/, '')
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface ParsedFence {
  lang: string
  code: string
  precedingText: string
  index: number
}

function collectClosedFences(reply: string): ParsedFence[] {
  const fences: ParsedFence[] = []
  const lines = reply.replace(/\r\n/g, '\n').split('\n')
  let open: { marker: string; lang: string; lines: string[]; startLine: number } | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (!open) {
      const startMatch = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/.exec(line)
      if (startMatch) {
        open = {
          marker: startMatch[1]!,
          lang: (startMatch[2] ?? '').toLowerCase(),
          lines: [],
          startLine: i
        }
      }
      continue
    }
    const trimmed = line.trim()
    const isClose =
      trimmed.startsWith(open.marker) &&
      (open.marker[0] === '`' ? /^`+\s*$/.test(trimmed) : /^~+\s*$/.test(trimmed))
    if (isClose) {
      const precedingText = lines.slice(Math.max(0, open.startLine - 4), open.startLine).join('\n')
      fences.push({
        lang: open.lang,
        code: open.lines.join('\n').trim(),
        precedingText,
        index: fences.length
      })
      open = null
    } else {
      open.lines.push(line)
    }
  }
  return fences
}

/**
 * Extracts revised document/passage text from an AI chat reply when the agent did not write
 * directly to disk (e.g. Chat mode or a model that answered with a Markdown code block).
 * Returns `null` when the reply looks like commentary only so the file is never corrupted.
 */
export function extractCanvasRevisionFromReply(
  reply: string,
  options: {
    originalSource: string
    selectedText: string
    fileExt?: string
  }
): string | null {
  const trimmed = reply.trim()
  if (!trimmed) return null

  // 1. Explicit structured canvas-edit tag if present.
  const tagged = /<tuff-canvas-edit>([\s\S]*?)<\/tuff-canvas-edit>/i.exec(trimmed)
  if (tagged?.[1]?.trim()) {
    return stripAccidentalBlockquotePrefix(tagged[1].trim(), options.selectedText)
  }

  // 2. Closed fenced code blocks (most common LLM fallback, e.g. ```markdown ... ```).
  const ext = (options.fileExt ?? '').toLowerCase()
  const fences = collectClosedFences(trimmed).filter((fence) => {
    if (!fence.code) return false
    if (ext && fence.lang === ext) return true
    if (NON_PROSE_FENCE_LANGS.has(fence.lang)) return false
    return true
  })

  if (fences.length > 0) {
    let best = fences[0]!
    let bestScore = -Infinity
    for (const fence of fences) {
      let score = 0
      if (
        fence.lang === 'markdown' ||
        fence.lang === 'md' ||
        fence.lang === 'mdc' ||
        fence.lang === 'mdx' ||
        fence.lang === 'text' ||
        fence.lang === 'txt' ||
        fence.lang === '' ||
        (ext && fence.lang === ext)
      ) {
        score += 30
      }
      if (REVISION_HEADING_CUE_RE.test(fence.precedingText)) {
        score += 50
      }
      // Prefer substantial blocks proportional to the selection.
      score += Math.min(25, fence.code.length / 40)
      // Tie-break toward later revised block.
      score += fence.index * 0.5
      if (score > bestScore) {
        bestScore = score
        best = fence
      }
    }
    const cleaned = stripAccidentalBlockquotePrefix(best.code, options.selectedText)
    return cleaned || null
  }

  // 3. Pure direct rewrite without fences (reject commentary/status-report replies fail-closed).
  if (META_REPLY_CUE_RE.test(trimmed) || isClaimedDiskUpdateReply(trimmed)) return null

  const selLen = Math.max(1, options.selectedText.trim().length)
  if (trimmed.length > Math.max(4000, selLen * 4)) return null
  if (trimmed.length < Math.min(4, selLen * 0.2)) return null

  const cleaned = stripAccidentalBlockquotePrefix(trimmed, options.selectedText)
  return cleaned || null
}

/**
 * Merges an extracted AI revision back into the full source document without duplicating
 * leading headings or clobbering untouched sections.
 */
export function applyCanvasRevisionToSource(
  source: string,
  selectedText: string,
  revision: string
): CanvasApplyResult | null {
  const cleanRevision = revision.replace(/\r\n/g, '\n').trim()
  if (!cleanRevision) return null

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingNewline = source.endsWith('\n')
  const formattedRevision = eol === '\r\n' ? cleanRevision.replace(/\n/g, '\r\n') : cleanRevision

  const match = locateSelectionInSource(source, selectedText)
  if (match) {
    let effectiveStart = match.start
    // If the original document starts with a heading (e.g. `# 无名`) before the selection,
    // and the AI returned the full document including that same heading, replace from 0 so
    // the heading is not duplicated.
    if (effectiveStart > 0) {
      const prefixTrimmed = source.slice(0, effectiveStart).trim()
      const firstRevLine = cleanRevision.split('\n')[0]?.trim() ?? ''
      if (
        prefixTrimmed &&
        !prefixTrimmed.includes('\n') &&
        normalizeMarkdownMatchText(prefixTrimmed) === normalizeMarkdownMatchText(firstRevLine)
      ) {
        effectiveStart = 0
      }
    }

    let nextContent = source.slice(0, effectiveStart) + formattedRevision + source.slice(match.end)
    if (hadTrailingNewline && !nextContent.endsWith(eol)) {
      nextContent += eol
    }

    return {
      nextContent,
      changed: nextContent !== source,
      mode: match.isFullDocument || effectiveStart === 0 ? 'document' : 'selection'
    }
  }

  // Fallback: if selection could not be matched character-by-character but covered virtually the
  // entire document, allow full-document replacement cleanly.
  const normSource = normalizeMarkdownMatchText(source)
  const normSel = normalizeMarkdownMatchText(selectedText)
  if (normSource && normSel && normSel.length / normSource.length >= 0.8) {
    let nextContent = formattedRevision
    if (hadTrailingNewline && !nextContent.endsWith(eol)) {
      nextContent += eol
    }
    return {
      nextContent,
      changed: nextContent !== source,
      mode: 'document'
    }
  }

  return null
}

const MAX_LCS_LINES = 1200

/**
 * Computes a clean line-level diff between `before` and `after` for inline diff preview and
 * changed-line highlights. Uses exact LCS up to `MAX_LCS_LINES` and falls back to common
 * prefix/suffix diff for very large files so the main thread stays sub-millisecond.
 */
export function computeCanvasLineDiff(before: string, after: string): CanvasDiffSummary {
  const oldLines = before.replace(/\r\n/g, '\n').split('\n')
  const newLines = after.replace(/\r\n/g, '\n').split('\n')

  let prefix = 0
  while (
    prefix < oldLines.length &&
    prefix < newLines.length &&
    oldLines[prefix] === newLines[prefix]
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const lines: CanvasDiffLine[] = []
  const changedNewLines = new Set<number>()
  let additions = 0
  let deletions = 0

  for (let i = 0; i < prefix; i += 1) {
    lines.push({
      type: 'context',
      text: oldLines[i]!,
      oldLine: i + 1,
      newLine: i + 1
    })
  }

  const oldMid = oldLines.slice(prefix, oldLines.length - suffix)
  const newMid = newLines.slice(prefix, newLines.length - suffix)

  if (oldMid.length === 0 && newMid.length === 0) {
    return { lines, additions: 0, deletions: 0, changedNewLines }
  }

  if (oldMid.length * newMid.length > MAX_LCS_LINES * MAX_LCS_LINES) {
    // Bounded fallback for huge files.
    for (let i = 0; i < oldMid.length; i += 1) {
      deletions += 1
      lines.push({ type: 'del', text: oldMid[i]!, oldLine: prefix + i + 1 })
    }
    for (let j = 0; j < newMid.length; j += 1) {
      additions += 1
      const lineNo = prefix + j + 1
      changedNewLines.add(lineNo)
      lines.push({ type: 'add', text: newMid[j]!, newLine: lineNo })
    }
  } else {
    const m = oldMid.length
    const n = newMid.length
    const cols = n + 1
    const dp = new Uint32Array((m + 1) * cols)
    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        if (oldMid[i] === newMid[j]) {
          dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)]! + 1
        } else {
          const down = dp[(i + 1) * cols + j]!
          const right = dp[i * cols + (j + 1)]!
          dp[i * cols + j] = down >= right ? down : right
        }
      }
    }

    let i = 0
    let j = 0
    while (i < m && j < n) {
      if (oldMid[i] === newMid[j]) {
        lines.push({
          type: 'context',
          text: oldMid[i]!,
          oldLine: prefix + i + 1,
          newLine: prefix + j + 1
        })
        i += 1
        j += 1
      } else if (dp[(i + 1) * cols + j]! >= dp[i * cols + (j + 1)]!) {
        deletions += 1
        lines.push({ type: 'del', text: oldMid[i]!, oldLine: prefix + i + 1 })
        i += 1
      } else {
        additions += 1
        const lineNo = prefix + j + 1
        changedNewLines.add(lineNo)
        lines.push({ type: 'add', text: newMid[j]!, newLine: lineNo })
        j += 1
      }
    }
    while (i < m) {
      deletions += 1
      lines.push({ type: 'del', text: oldMid[i]!, oldLine: prefix + i + 1 })
      i += 1
    }
    while (j < n) {
      additions += 1
      const lineNo = prefix + j + 1
      changedNewLines.add(lineNo)
      lines.push({ type: 'add', text: newMid[j]!, newLine: lineNo })
      j += 1
    }
  }

  for (let k = 0; k < suffix; k += 1) {
    const oldIdx = oldLines.length - suffix + k
    const newIdx = newLines.length - suffix + k
    lines.push({
      type: 'context',
      text: newLines[newIdx]!,
      oldLine: oldIdx + 1,
      newLine: newIdx + 1
    })
  }

  return { lines, additions, deletions, changedNewLines }
}

/**
 * Computes which rendered block indices in `afterBlocks` were added or changed compared with
 * `beforeBlocks` using LCS so GPT Canvas animations target the exact modified paragraphs.
 */
export function computeChangedBlockIndices(
  beforeBlocks: readonly string[],
  afterBlocks: readonly string[]
): Set<number> {
  const m = beforeBlocks.length
  const n = afterBlocks.length
  const changed = new Set<number>()
  if (n === 0) return changed
  if (m === 0) {
    for (let j = 0; j < n; j += 1) changed.add(j)
    return changed
  }

  if (m * n > 400 * 400) {
    for (let j = 0; j < n; j += 1) {
      if (beforeBlocks[j] !== afterBlocks[j]) changed.add(j)
    }
    return changed
  }

  const cols = n + 1
  const dp = new Uint32Array((m + 1) * cols)
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (beforeBlocks[i] === afterBlocks[j]) {
        dp[i * cols + j] = dp[(i + 1) * cols + (j + 1)]! + 1
      } else {
        const down = dp[(i + 1) * cols + j]!
        const right = dp[i * cols + (j + 1)]!
        dp[i * cols + j] = down >= right ? down : right
      }
    }
  }

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (beforeBlocks[i] === afterBlocks[j]) {
      i += 1
      j += 1
    } else if (dp[(i + 1) * cols + j]! >= dp[i * cols + (j + 1)]!) {
      i += 1
    } else {
      changed.add(j)
      j += 1
    }
  }
  while (j < n) {
    changed.add(j)
    j += 1
  }
  return changed
}

/**
 * Formats an optimization / direct-edit prompt that instructs tool-capable agents to update the
 * file in place while giving chat-only models a clean fenced output format for auto-apply.
 */
export function formatCanvasImprovePrompt(options: {
  displayPath: string
  selectedText: string
  instruction: string
  userSuggestion?: string
  isFullDocument?: boolean
}): string {
  const suggestion = options.userSuggestion?.trim() ?? ''
  const instruction = options.instruction.trim()
  const header = options.displayPath ? `\`${options.displayPath}\`` : ''
  const directive = suggestion ? `${suggestion}\n\n${instruction}` : instruction
  if (options.isFullDocument) {
    return header ? `${header}\n\n${directive}` : directive
  }
  const quote = formatQuotedSnippet(options.selectedText)
  return header ? `${header}\n${quote}\n\n${directive}` : `${quote}\n\n${directive}`
}

/**
 * Finds the assistant message spawned after `baseline` was captured when a Canvas action fired.
 * Avoids matching pre-existing assistant turns even if their IDs are re-minted on snapshot sync.
 */
export function findTargetAssistantMessage(
  messages: readonly ConversationMessage[],
  baseline: CanvasTurnBaseline
): ConversationMessage | null {
  // Walk backward for the latest assistant message introduced after baseline.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]!
    if (msg.role === 'user' && baseline.knownMessageIds.has(msg.id)) {
      break
    }
    if (msg.role !== 'assistant') continue
    if (
      !baseline.knownMessageIds.has(msg.id) &&
      (i >= baseline.initialCount || msg.status === 'streaming')
    ) {
      return msg
    }
  }
  // Fallback for adapters that re-index without preserving prior IDs.
  if (messages.length > baseline.initialCount) {
    const tail = messages[messages.length - 1]
    if (tail?.role === 'assistant') return tail
  }
  return null
}

/**
 * Returns true if the assistant message contains a file-writing tool call (optionally matching
 * `targetFileName`), and distinguishes in-flight vs finished tool calls.
 */
export function inspectMessageFileWrites(
  message: ConversationMessage,
  targetFileName?: string
): { running: boolean; completedCount: number } {
  let running = false
  let completedCount = 0
  const needle = targetFileName?.trim().toLowerCase() || ''

  for (const part of message.parts ?? []) {
    if (part.type !== 'tool-call') continue
    const isFileWrite = FILE_WRITE_TOOL_NAME_RE.test(part.name)
    const haystack =
      `${part.input ?? ''}\n${part.summary ?? ''}\n${part.output ?? ''}`.toLowerCase()
    const touchesTarget = !needle || haystack.includes(needle)
    if (!isFileWrite && !touchesTarget) continue
    if (
      !isFileWrite &&
      !/(?:write|edit|patch|sed|cat\s*>|tee\s)/i.test(`${part.name} ${haystack}`)
    ) {
      continue
    }
    if (part.status === 'running') running = true
    else if (part.status === 'done') completedCount += 1
  }

  return { running, completedCount }
}

/**
 * Returns true while an assistant reply is actively streaming a Markdown/text code fence or
 * explicit `<tuff-canvas-edit>` block.
 */
export function isMessageStreamingCanvasEdit(message: ConversationMessage): boolean {
  const text = message.content ?? ''
  if (!text) return false
  if (/<tuff-canvas-edit>/i.test(text)) return true
  return /(?:^|\n)\s*```(?:markdown|md|mdc|mdx|text|txt)?\s*\n/i.test(text)
}

function buildFileNeedles(identity: CanvasFileIdentity): string[] {
  const raw = [identity.fileName, identity.displayPath ?? '', identity.filePath ?? '']
  const needles: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const trimmed = item.trim().toLowerCase()
    if (trimmed.length < 2 || seen.has(trimmed)) continue
    seen.add(trimmed)
    needles.push(trimmed)
  }
  return needles
}

function textMentionsFile(text: string | undefined, needles: readonly string[]): boolean {
  if (!text || needles.length === 0) return false
  const lower = text.toLowerCase()
  return needles.some((needle) => lower.includes(needle))
}

/**
 * Detects whether an actively streaming AI turn is operating on the currently open file —
 * covering right-side selection actions, review comments, lint fixes, and direct chat requests.
 */
export function isStreamingTurnTargetingFile(
  messages: readonly ConversationMessage[],
  identity: CanvasFileIdentity,
  aiStreaming: boolean
): boolean {
  const tail = messages.at(-1)
  const streaming = Boolean(
    aiStreaming || (tail?.role === 'assistant' && tail.status === 'streaming')
  )
  if (!streaming) return false

  const needles = buildFileNeedles(identity)
  if (needles.length === 0) return false

  if (tail?.role === 'assistant') {
    for (const part of tail.parts ?? []) {
      if (part.type === 'tool-call') {
        const haystack = `${part.input ?? ''}\n${part.summary ?? ''}\n${part.output ?? ''}`
        if (FILE_TOUCH_TOOL_NAME_RE.test(part.name) && textMentionsFile(haystack, needles)) {
          return true
        }
        if (FILE_WRITE_TOOL_NAME_RE.test(part.name) && part.status === 'running') {
          if (!part.input || textMentionsFile(haystack, needles)) return true
        }
      } else if (part.type === 'reasoning') {
        const reasoningText = 'text' in part && typeof part.text === 'string' ? part.text : ''
        if (textMentionsFile(reasoningText, needles)) return true
      }
    }
    if (textMentionsFile(tail.content, needles)) return true
  }

  // Inspect the user prompt that initiated this active turn.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]!
    if (msg.role !== 'user') continue
    if (textMentionsFile(msg.content, needles)) return true
    if (IMPLICIT_CURRENT_FILE_EDIT_CUE_RE.test(msg.content ?? '')) return true
    break
  }

  return false
}
