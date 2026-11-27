import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { formatQuotedSnippet } from './workspace-file-tree'

export interface SourceRange {
  start: number
  end: number
}

export interface LocateSelectionOptions {
  /** Explicit character offsets into `source` when captured from the editor selection. */
  sourceRange?: SourceRange | null
}

export interface ApplyCanvasRevisionOptions {
  /** Explicit edit scope; `'document'` replaces the entire file, `'selection'` requires a source match. */
  scope?: 'selection' | 'document'
  /** Explicit character offsets into `source` when captured from the editor selection. */
  sourceRange?: SourceRange | null
}

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
  /** Exact prompt submitted by this Canvas request to bind its own user/assistant turn. */
  requestPrompt?: string
  /** Optional matched user message id once observed. */
  boundUserMessageId?: string
}

export interface MessageFileWriteInspection {
  running: boolean
  completedCount: number
  unknownRunning: boolean
  unknownCompletedCount: number
}

const REVISION_HEADING_CUE_RE =
  /(?:润色后|优化后|修改后|改写后|修订后|完整文本|更新后|最终版本|revised|polished|updated|improved|rewritten)/i

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

interface AtomicInlineSpan {
  rawStart: number
  rawEnd: number
  normStart: number
  normEnd: number
}

interface PairedInlineSpan {
  openStart: number
  openEnd: number
  closeStart: number
  closeEnd: number
  innerNormStart: number
  innerNormEnd: number
}

interface NormalizedLineOffsetMap {
  text: string
  rawStarts: number[]
  rawEnds: number[]
  atomicSpans: AtomicInlineSpan[]
  pairedSpans: PairedInlineSpan[]
}

function normalizeInlineChar(ch: string): string {
  if (ch === '“' || ch === '”' || ch === '「' || ch === '」' || ch === '『' || ch === '』') {
    return '"'
  }
  if (ch === '‘' || ch === '’') return "'"
  if (ch === '—' || ch === '–') return '-'
  return ch
}

function findBalancedInlinePairs(
  rawLine: string,
  contentStart: number,
  skipRanges: readonly SourceRange[]
): Array<{ openStart: number; openEnd: number; closeStart: number; closeEnd: number }> {
  const isSkipped = (idx: number): boolean =>
    skipRanges.some((range) => idx >= range.start && idx < range.end)
  const stack: Array<{ marker: string; start: number; end: number }> = []
  const pairs: Array<{ openStart: number; openEnd: number; closeStart: number; closeEnd: number }> =
    []

  let i = contentStart
  while (i < rawLine.length) {
    if (isSkipped(i)) {
      i += 1
      continue
    }
    const ch = rawLine[i]!
    if (ch !== '*' && ch !== '_' && ch !== '`' && ch !== '~') {
      i += 1
      continue
    }
    let j = i
    while (j < rawLine.length && rawLine[j] === ch && !isSkipped(j)) {
      j += 1
    }
    const marker = rawLine.slice(i, j)
    let matchedIdx = -1
    for (let s = stack.length - 1; s >= 0; s -= 1) {
      if (stack[s]!.marker === marker) {
        matchedIdx = s
        break
      }
    }
    if (matchedIdx >= 0) {
      const open = stack[matchedIdx]!
      stack.splice(matchedIdx)
      if (i > open.end) {
        pairs.push({
          openStart: open.start,
          openEnd: open.end,
          closeStart: i,
          closeEnd: j
        })
      }
    } else {
      stack.push({ marker, start: i, end: j })
    }
    i = j
  }
  return pairs
}

function buildNormalizedLineOffsetMap(rawLine: string): NormalizedLineOffsetMap {
  let contentStart = 0
  const prefixPatterns = [/^\s*(?:>\s*)+/, /^\s*#{1,6}\s+/, /^\s*(?:[-*+]|\d+\.)\s+/]
  for (const re of prefixPatterns) {
    const match = re.exec(rawLine.slice(contentStart))
    if (match) {
      contentStart += match[0].length
    }
  }

  // Locate inline Markdown links and images first so formatting markers inside URLs are ignored.
  const linkTokenRe = /!?\[([^\]]*)\]\([^)]*\)/g
  linkTokenRe.lastIndex = contentStart
  const linkTokens: Array<{ start: number; end: number; labelStart: number; labelEnd: number }> = []
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkTokenRe.exec(rawLine)) !== null) {
    const tokenStart = linkMatch.index
    const tokenEnd = tokenStart + linkMatch[0].length
    const bracketOffset = linkMatch[0].startsWith('!') ? 2 : 1
    const labelStart = tokenStart + bracketOffset
    const labelEnd = labelStart + (linkMatch[1]?.length ?? 0)
    linkTokens.push({ start: tokenStart, end: tokenEnd, labelStart, labelEnd })
  }

  const rawPairs = findBalancedInlinePairs(
    rawLine,
    contentStart,
    linkTokens.map((t) => ({ start: t.start, end: t.end }))
  )

  const chars: string[] = []
  const rawStarts: number[] = []
  const rawEnds: number[] = []
  const atomicSpans: AtomicInlineSpan[] = []

  const appendTextSlice = (sliceStart: number, sliceEnd: number): void => {
    let idx = sliceStart
    while (idx < sliceEnd) {
      const ch = rawLine[idx]!
      if (ch === '*' || ch === '_' || ch === '`' || ch === '~') {
        idx += 1
        continue
      }
      if (/\s/.test(ch)) {
        const wsStart = idx
        while (idx < sliceEnd && /\s/.test(rawLine[idx]!)) {
          idx += 1
        }
        if (chars.length > 0 && chars[chars.length - 1] !== ' ') {
          chars.push(' ')
          rawStarts.push(wsStart)
          rawEnds.push(idx)
        } else if (chars.length > 0 && chars[chars.length - 1] === ' ') {
          rawEnds[rawEnds.length - 1] = idx
        }
        continue
      }
      chars.push(normalizeInlineChar(ch))
      rawStarts.push(idx)
      rawEnds.push(idx + 1)
      idx += 1
    }
  }

  let cursor = contentStart
  for (const token of linkTokens) {
    if (token.start > cursor) {
      appendTextSlice(cursor, token.start)
    }
    const normStart = chars.length
    appendTextSlice(token.labelStart, token.labelEnd)
    const normEnd = chars.length
    if (normEnd > normStart) {
      atomicSpans.push({
        rawStart: token.start,
        rawEnd: token.end,
        normStart,
        normEnd
      })
    }
    cursor = token.end
  }
  if (cursor < rawLine.length) {
    appendTextSlice(cursor, rawLine.length)
  }

  // Trim trailing normalized space if present.
  while (chars.length > 0 && chars[chars.length - 1] === ' ') {
    chars.pop()
    rawStarts.pop()
    rawEnds.pop()
  }

  const pairedSpans: PairedInlineSpan[] = []
  for (const pair of rawPairs) {
    let innerNormStart = -1
    let innerNormEnd = -1
    for (let k = 0; k < rawStarts.length; k += 1) {
      const s = rawStarts[k]!
      const e = rawEnds[k]!
      if (s >= pair.openEnd && e <= pair.closeStart) {
        if (innerNormStart === -1) innerNormStart = k
        innerNormEnd = k + 1
      }
    }
    if (innerNormStart >= 0 && innerNormEnd > innerNormStart) {
      pairedSpans.push({
        openStart: pair.openStart,
        openEnd: pair.openEnd,
        closeStart: pair.closeStart,
        closeEnd: pair.closeEnd,
        innerNormStart,
        innerNormEnd
      })
    }
  }

  return {
    text: chars.join(''),
    rawStarts,
    rawEnds,
    atomicSpans,
    pairedSpans
  }
}

/**
 * Maps a normalized substring back to exact character offsets inside `rawLine`.
 * Absorbs balanced Markdown formatting pairs completely contained within the selection and
 * declines (`null`) ambiguous duplicates or matches straddling formatting/link boundaries.
 */
function mapNormalizedSubstringToRawSpan(
  rawLine: string,
  needle: string,
  mode: 'any' | 'prefix' | 'suffix'
): SourceRange | null {
  if (!needle) return null
  const mapped = buildNormalizedLineOffsetMap(rawLine)
  if (!mapped.text) return null

  let matchStart = -1
  let matchEnd = -1
  if (mode === 'prefix') {
    if (!mapped.text.startsWith(needle)) return null
    matchStart = 0
    matchEnd = needle.length
  } else if (mode === 'suffix') {
    if (!mapped.text.endsWith(needle)) return null
    matchStart = mapped.text.length - needle.length
    matchEnd = mapped.text.length
  } else {
    const first = mapped.text.indexOf(needle)
    if (first < 0) return null
    if (mapped.text.indexOf(needle, first + 1) >= 0) return null
    matchStart = first
    matchEnd = first + needle.length
  }

  if (matchStart < 0 || matchEnd <= matchStart || matchEnd > mapped.rawEnds.length) {
    return null
  }

  let start = mapped.rawStarts[matchStart]!
  let end = mapped.rawEnds[matchEnd - 1]!

  for (const atomic of mapped.atomicSpans) {
    if (matchStart <= atomic.normStart && matchEnd >= atomic.normEnd) {
      start = Math.min(start, atomic.rawStart)
      end = Math.max(end, atomic.rawEnd)
    } else if (matchStart < atomic.normEnd && matchEnd > atomic.normStart) {
      return null
    }
  }

  for (const pair of mapped.pairedSpans) {
    if (matchStart <= pair.innerNormStart && matchEnd >= pair.innerNormEnd) {
      start = Math.min(start, pair.openStart)
      end = Math.max(end, pair.closeEnd)
    } else if (matchStart >= pair.innerNormStart && matchEnd <= pair.innerNormEnd) {
      // Selection stays strictly inside the paired run; delimiters remain balanced outside.
      continue
    } else if (matchStart < pair.innerNormEnd && matchEnd > pair.innerNormStart) {
      // Crosses one delimiter without its matching partner -> decline to avoid broken Markdown.
      return null
    }
  }

  return start < end ? { start, end } : null
}

function sourceSliceMatchesSelection(slice: string, normalizedSelected: string): boolean {
  const normalizedSlice = slice.replace(/\r\n/g, '\n').trim()
  if (!normalizedSlice) return false
  if (normalizedSlice === normalizedSelected) return true
  const sliceLines = normalizedSlice
    .split('\n')
    .map((line) => normalizeMarkdownMatchText(line))
    .filter(Boolean)
  const selLines = normalizedSelected
    .split('\n')
    .map((line) => normalizeMarkdownMatchText(line))
    .filter(Boolean)
  if (sliceLines.length === 0 || sliceLines.length !== selLines.length) return false
  return sliceLines.every((line, idx) => line === selLines[idx])
}

/**
 * Locates a rendered preview text selection inside raw Markdown / text source.
 * Honors an explicit `sourceRange` when available; otherwise requires a single unambiguous match
 * and maps partial selections back to exact source boundaries without expanding to whole lines.
 */
export function locateSelectionInSource(
  source: string,
  selectedText: string,
  options?: LocateSelectionOptions
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
    if (
      nonEmptySource.length >= 2 &&
      /^\s*#\s+/.test(nonEmptySource[0]!.raw) &&
      covered === nonEmptySource.length - 1
    ) {
      return false
    }
    return false
  }

  // Tier 0: Explicit source range captured from the editor selection (resolves duplicate paragraphs).
  const explicitRange = options?.sourceRange
  if (
    explicitRange &&
    Number.isInteger(explicitRange.start) &&
    Number.isInteger(explicitRange.end) &&
    explicitRange.start >= 0 &&
    explicitRange.end > explicitRange.start &&
    explicitRange.end <= source.length
  ) {
    const slice = source.slice(explicitRange.start, explicitRange.end)
    if (sourceSliceMatchesSelection(slice, normalizedSelected)) {
      return {
        start: explicitRange.start,
        end: explicitRange.end,
        isFullDocument: checkFullDoc(explicitRange.start, explicitRange.end)
      }
    }
  }

  // Tier 1: Unique exact substring match (reject duplicate matches when no source range is given).
  const exactIdx = source.indexOf(normalizedSelected)
  if (exactIdx >= 0) {
    if (source.indexOf(normalizedSelected, exactIdx + 1) >= 0) {
      return null
    }
    const end = exactIdx + normalizedSelected.length
    return { start: exactIdx, end, isFullDocument: checkFullDoc(exactIdx, end) }
  }

  // Also try unique exact match on LF-normalized text when source has CRLF.
  if (source.includes('\r\n')) {
    const lfIdx = normalizedSource.indexOf(normalizedSelected)
    if (lfIdx >= 0) {
      if (normalizedSource.indexOf(normalizedSelected, lfIdx + 1) >= 0) {
        return null
      }
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
    // Prefer unique exact full-line normalized match first.
    const exactLines = nonEmptySource.filter((line) => line.stripped === needle)
    if (exactLines.length === 1) {
      const exactLine = exactLines[0]!
      return {
        start: exactLine.start,
        end: exactLine.end,
        isFullDocument: checkFullDoc(exactLine.start, exactLine.end)
      }
    }
    if (exactLines.length > 1) return null

    // Partial substring inside one source line: map normalized offsets back to exact raw bounds.
    const partialMatches: SourceRange[] = []
    for (const line of nonEmptySource) {
      const rawIdx = line.raw.indexOf(normalizedSelected)
      if (rawIdx >= 0) {
        if (line.raw.indexOf(normalizedSelected, rawIdx + 1) >= 0) return null
        partialMatches.push({
          start: line.start + rawIdx,
          end: line.start + rawIdx + normalizedSelected.length
        })
        continue
      }
      if (line.stripped.includes(needle)) {
        const mapped = mapNormalizedSubstringToRawSpan(line.raw, needle, 'any')
        if (!mapped) return null
        partialMatches.push({
          start: line.start + mapped.start,
          end: line.start + mapped.end
        })
      }
    }
    if (partialMatches.length === 1) {
      const match = partialMatches[0]!
      return {
        start: match.start,
        end: match.end,
        isFullDocument: checkFullDoc(match.start, match.end)
      }
    }
    return null
  }

  // Contiguous non-empty line sequence match (must be unique; partial boundary lines map exact offsets).
  if (selLines.length <= nonEmptySource.length) {
    const windowMatches: SourceRange[] = []
    for (let i = 0; i <= nonEmptySource.length - selLines.length; i += 1) {
      let allMatch = true
      let firstOffset = 0
      let lastEndOffset = nonEmptySource[i + selLines.length - 1]!.raw.length
      for (let j = 0; j < selLines.length; j += 1) {
        const span = nonEmptySource[i + j]!
        const srcLine = span.stripped
        const selLine = selLines[j]!
        if (srcLine === selLine) continue
        if (j === 0 && srcLine.endsWith(selLine)) {
          const mapped = mapNormalizedSubstringToRawSpan(span.raw, selLine, 'suffix')
          if (!mapped) {
            allMatch = false
            break
          }
          firstOffset = mapped.start
          continue
        }
        if (j === selLines.length - 1 && srcLine.startsWith(selLine)) {
          const mapped = mapNormalizedSubstringToRawSpan(span.raw, selLine, 'prefix')
          if (!mapped) {
            allMatch = false
            break
          }
          lastEndOffset = mapped.end
          continue
        }
        allMatch = false
        break
      }
      if (allMatch) {
        const firstSpan = nonEmptySource[i]!
        const lastSpan = nonEmptySource[i + selLines.length - 1]!
        windowMatches.push({
          start: firstSpan.start + firstOffset,
          end: lastSpan.start + lastEndOffset
        })
      }
    }
    if (windowMatches.length === 1) {
      const match = windowMatches[0]!
      return {
        start: match.start,
        end: match.end,
        isFullDocument: checkFullDoc(match.start, match.end)
      }
    }
    if (windowMatches.length > 1) return null
  }

  // Tier 3: First + last line anchor match (handles soft line wraps inside a multi-paragraph selection).
  if (selLines.length >= 2) {
    const firstNeedle = selLines[0]!
    const lastNeedle = selLines[selLines.length - 1]!
    const startCandidates = nonEmptySource.filter(
      (line) => line.stripped === firstNeedle || line.stripped.endsWith(firstNeedle)
    )
    const endCandidates = nonEmptySource.filter(
      (line) => line.stripped === lastNeedle || line.stripped.startsWith(lastNeedle)
    )
    if (startCandidates.length === 1 && endCandidates.length === 1) {
      const firstSpan = startCandidates[0]!
      const lastSpan = endCandidates[0]!
      if (lastSpan.index >= firstSpan.index) {
        let startOffset = 0
        if (firstSpan.stripped !== firstNeedle) {
          const mapped = mapNormalizedSubstringToRawSpan(firstSpan.raw, firstNeedle, 'suffix')
          if (!mapped) return null
          startOffset = mapped.start
        }
        let endOffset = lastSpan.raw.length
        if (lastSpan.stripped !== lastNeedle) {
          const mapped = mapNormalizedSubstringToRawSpan(lastSpan.raw, lastNeedle, 'prefix')
          if (!mapped) return null
          endOffset = mapped.end
        }
        const start = firstSpan.start + startOffset
        const end = lastSpan.start + endOffset
        return {
          start,
          end,
          isFullDocument: checkFullDoc(start, end)
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

  // Fail closed for automatic writes: unstructured prose or refusals are surfaced for review
  // in chat rather than auto-written over the document.
  return null
}

/**
 * Merges an extracted AI revision back into the full source document without duplicating
 * leading headings or clobbering untouched sections.
 */
export function applyCanvasRevisionToSource(
  source: string,
  selectedText: string,
  revision: string,
  options?: ApplyCanvasRevisionOptions
): CanvasApplyResult | null {
  const cleanRevision = revision.replace(/\r\n/g, '\n').trim()
  if (!cleanRevision) return null

  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingNewline = source.endsWith('\n')
  const formattedRevision = eol === '\r\n' ? cleanRevision.replace(/\n/g, '\r\n') : cleanRevision

  if (options?.scope === 'document') {
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

  const match = locateSelectionInSource(
    source,
    selectedText,
    options?.sourceRange ? { sourceRange: options.sourceRange } : undefined
  )
  if (!match) return null

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

function normalizeTurnPrompt(raw: string | undefined): string {
  return (raw ?? '').replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
}

/**
 * Finds the assistant message belonging strictly to the user turn initiated by this Canvas request.
 * Never accepts replies belonging to a prior known turn or an unrelated concurrent/queued prompt.
 */
export function findTargetAssistantMessage(
  messages: readonly ConversationMessage[],
  baseline: CanvasTurnBaseline
): ConversationMessage | null {
  const expectedPrompt = normalizeTurnPrompt(baseline.requestPrompt)
  let matchedUserIdx = -1

  if (baseline.boundUserMessageId) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]!
      if (msg.role === 'user' && msg.id === baseline.boundUserMessageId) {
        matchedUserIdx = i
        break
      }
    }
  } else if (expectedPrompt) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]!
      if (msg.role !== 'user' || baseline.knownMessageIds.has(msg.id)) continue
      const content = normalizeTurnPrompt(msg.content)
      if (!content) continue
      if (content === expectedPrompt || content.includes(expectedPrompt)) {
        matchedUserIdx = i
        break
      }
    }
  } else {
    // Without an explicit request prompt, still require a NEW user turn after baseline so an
    // unrelated in-flight assistant reply to a prior known user turn is never accepted.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]!
      if (msg.role === 'user' && baseline.knownMessageIds.has(msg.id)) break
      if (msg.role === 'user' && !baseline.knownMessageIds.has(msg.id)) {
        matchedUserIdx = i
        break
      }
    }
  }

  if (matchedUserIdx < 0) return null

  let candidate: ConversationMessage | null = null
  for (let i = matchedUserIdx + 1; i < messages.length; i += 1) {
    const msg = messages[i]!
    if (msg.role === 'user') break
    if (msg.role === 'assistant' && !baseline.knownMessageIds.has(msg.id)) {
      candidate = msg
    }
  }
  return candidate
}

function normalizeComparableToolPath(raw: string): string {
  return raw
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function collectPathsFromJsonValue(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 4 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const item of value) collectPathsFromJsonValue(item, out, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const record = value as Record<string, unknown>
  const pathKeys = [
    'path',
    'filePath',
    'file_path',
    'targetPath',
    'target_path',
    'filename',
    'file'
  ]
  for (const key of pathKeys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) {
      out.add(candidate.trim())
    }
  }
  for (const nestedKey of ['files', 'edits', 'operations', 'patches']) {
    if (nestedKey in record) {
      collectPathsFromJsonValue(record[nestedKey], out, depth + 1)
    }
  }
}

function extractToolTargetPaths(part: {
  input?: string
  summary?: string
  output?: string
}): string[] {
  const paths = new Set<string>()
  const rawInput = typeof part.input === 'string' ? part.input.trim() : ''
  if (rawInput) {
    if (rawInput.startsWith('{') || rawInput.startsWith('[')) {
      try {
        collectPathsFromJsonValue(JSON.parse(rawInput), paths)
      } catch {
        // Fallback regex below handles streaming/truncated JSON input.
      }
    }
    const jsonFieldRe =
      /"(?:path|filePath|file_path|targetPath|target_path|filename|file)"\s*:\s*"([^"]+)"/g
    let m: RegExpExecArray | null
    while ((m = jsonFieldRe.exec(rawInput)) !== null) {
      if (m[1]?.trim()) paths.add(m[1].trim())
    }
  }

  const combined = `${rawInput}\n${part.summary ?? ''}`
  const patchRe = /^\s*(?:\*\*\*\s+(?:Update|Add|Delete)\s+File:|\+\+\+\s+(?:b\/)?)\s*([^\r\n]+)/gm
  let pm: RegExpExecArray | null
  while ((pm = patchRe.exec(combined)) !== null) {
    const candidate = pm[1]?.trim()
    if (candidate && candidate !== '/dev/null') {
      paths.add(candidate)
    }
  }

  return Array.from(paths)
}

function normalizeTargetIdentity(target?: string | CanvasFileIdentity): CanvasFileIdentity | null {
  if (!target) return null
  if (typeof target === 'string') {
    const trimmed = target.trim()
    return trimmed ? { fileName: trimmed } : null
  }
  if (!target.fileName.trim() && !target.displayPath?.trim() && !target.filePath?.trim()) {
    return null
  }
  return target
}

function doesToolPathMatchIdentity(rawToolPath: string, identity: CanvasFileIdentity): boolean {
  const toolPath = normalizeComparableToolPath(rawToolPath)
  if (!toolPath) return false
  const fullPath = identity.filePath ? normalizeComparableToolPath(identity.filePath) : ''
  const displayPath = identity.displayPath ? normalizeComparableToolPath(identity.displayPath) : ''
  const fileName = normalizeComparableToolPath(identity.fileName)

  if (fullPath && toolPath === fullPath) return true
  if (displayPath && toolPath === displayPath) return true

  const toolHasDir = toolPath.includes('/')
  if (toolHasDir) {
    if (fullPath && (fullPath.endsWith(`/${toolPath}`) || toolPath.endsWith(`/${fullPath}`))) {
      return true
    }
    if (
      displayPath &&
      (displayPath.endsWith(`/${toolPath}`) || toolPath.endsWith(`/${displayPath}`))
    ) {
      return true
    }
    // When only basename was provided as identity, allow matching exact basename segment.
    if (!fullPath && !displayPath && fileName && toolPath.endsWith(`/${fileName}`)) {
      return true
    }
    return false
  }

  return Boolean(fileName && toolPath === fileName)
}

/**
 * Inspects file-writing tool calls on an assistant message against the currently open file.
 * Confirmed target-path mismatches (e.g. `other.md` while `notes.md` is open) are ignored;
 * tool calls whose target path cannot be parsed are tracked separately as unknown.
 */
export function inspectMessageFileWrites(
  message: ConversationMessage,
  target?: string | CanvasFileIdentity
): MessageFileWriteInspection {
  let running = false
  let completedCount = 0
  let unknownRunning = false
  let unknownCompletedCount = 0
  const identity = normalizeTargetIdentity(target)
  const needles = identity ? buildFileNeedles(identity) : []

  for (const part of message.parts ?? []) {
    if (part.type !== 'tool-call') continue
    const isFileWrite = FILE_WRITE_TOOL_NAME_RE.test(part.name)
    const haystack = `${part.input ?? ''}\n${part.summary ?? ''}\n${part.output ?? ''}`
    const isWriteLike =
      isFileWrite || /(?:write|edit|patch|sed|cat\s*>|tee\s)/i.test(`${part.name} ${haystack}`)
    if (!isWriteLike) continue

    let classification: 'match' | 'mismatch' | 'unknown'
    if (!identity) {
      classification = 'match'
    } else {
      const exposedPaths = extractToolTargetPaths(part)
      if (exposedPaths.length > 0) {
        classification = exposedPaths.some((p) => doesToolPathMatchIdentity(p, identity))
          ? 'match'
          : 'mismatch'
      } else if (textMentionsFile(haystack, needles)) {
        classification = 'match'
      } else if (isFileWrite) {
        classification = 'unknown'
      } else {
        classification = 'mismatch'
      }
    }

    if (classification === 'mismatch') continue
    if (classification === 'match') {
      if (part.status === 'running') running = true
      else if (part.status === 'done') completedCount += 1
    } else {
      if (part.status === 'running') unknownRunning = true
      else if (part.status === 'done') unknownCompletedCount += 1
    }
  }

  return { running, completedCount, unknownRunning, unknownCompletedCount }
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
        const exposedPaths = extractToolTargetPaths(part)
        if (FILE_TOUCH_TOOL_NAME_RE.test(part.name)) {
          if (exposedPaths.length > 0) {
            if (exposedPaths.some((p) => doesToolPathMatchIdentity(p, identity))) return true
            continue
          }
          if (textMentionsFile(haystack, needles)) return true
        }
        if (FILE_WRITE_TOOL_NAME_RE.test(part.name) && part.status === 'running') {
          if (exposedPaths.length > 0) {
            if (exposedPaths.some((p) => doesToolPathMatchIdentity(p, identity))) return true
          } else if (!part.input || textMentionsFile(haystack, needles)) {
            return true
          }
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
