const {
  plugin,
  clipboard,
  permission,
  logger,
  TuffItemBuilder,
} = globalThis

const PLUGIN_NAME = 'touch-markdown-craft'
const FEATURE_ID = 'markdown-craft'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const VALID_BADGE_STYLES = new Set(['flat', 'flat-square', 'plastic', 'for-the-badge', 'social'])
const BADGE_PRESETS = [
  { label: 'Build', message: 'passing', color: 'brightgreen', style: 'flat-square', logo: '' },
  { label: 'License', message: 'MIT', color: 'blue', style: 'flat-square', logo: '' },
  { label: 'Version', message: 'v1.0.0', color: 'blueviolet', style: 'flat', logo: '' },
  { label: 'TypeScript', message: '5.x', color: '3178C6', style: 'for-the-badge', logo: 'typescript' },
  { label: 'PRs', message: 'welcome', color: 'brightgreen', style: 'flat', logo: '' },
]

let triggerGeneration = 0
let actionCounter = 0
let issuedOutputs = new Map()

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return String(query?.text ?? query?.query ?? '')
}

function truncateLine(value, max = 104) {
  const single = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!single)
    return ''
  if (single.length <= max)
    return single
  return `${single.slice(0, max - 1)}…`
}

function isWideCharCode(code) {
  return (
    (code >= 0x1100 && code <= 0x115F)
    || (code >= 0x2E80 && code <= 0xA4CF)
    || (code >= 0xAC00 && code <= 0xD7A3)
    || (code >= 0xF900 && code <= 0xFAFF)
    || (code >= 0xFE10 && code <= 0xFE6F)
    || (code >= 0xFF00 && code <= 0xFF60)
    || (code >= 0xFFE0 && code <= 0xFFE6)
    || (code >= 0x20000 && code <= 0x2FFFD)
    || (code >= 0x30000 && code <= 0x3FFFD)
  )
}

function displayWidth(text) {
  let width = 0
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0) ?? 0
    width += isWideCharCode(code) ? 2 : 1
  }
  return width
}

function padCell(text, targetWidth, align = 'left') {
  const str = String(text ?? '')
  const gap = Math.max(0, targetWidth - displayWidth(str))
  if (align === 'right')
    return `${' '.repeat(gap)}${str}`
  if (align === 'center') {
    const left = Math.floor(gap / 2)
    return `${' '.repeat(left)}${str}${' '.repeat(gap - left)}`
  }
  return `${str}${' '.repeat(gap)}`
}

function escapeMarkdownCell(value) {
  if (value === null || value === undefined)
    return ''
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return raw
    .replace(/\r?\n/g, '<br>')
    .replace(/\|/g, '\\|')
    .trim()
}

function parseDelimitedText(input, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const text = String(input ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        }
        else {
          inQuotes = false
        }
      }
      else {
        field += ch
      }
      continue
    }

    if (ch === '"' && field === '') {
      inQuotes = true
      continue
    }

    if (ch === delimiter) {
      row.push(field.trim())
      field = ''
      continue
    }

    if (ch === '\n') {
      row.push(field.trim())
      if (row.some(cell => cell.length > 0))
        rows.push(row)
      row = []
      field = ''
      continue
    }

    field += ch
  }

  row.push(field.trim())
  if (row.some(cell => cell.length > 0))
    rows.push(row)

  return rows
}

function isNumericCell(value) {
  const trimmed = normalizeText(value)
  if (!trimmed)
    return false
  return /^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(trimmed)
}

function buildGfmTable(headers, dataRows, { aligned = true } = {}) {
  const colCount = headers.length
  const safeHeaders = headers.map(escapeMarkdownCell)
  const safeRows = dataRows.map((r) => {
    const padded = []
    for (let c = 0; c < colCount; c += 1)
      padded.push(escapeMarkdownCell(r[c] ?? ''))
    return padded
  })

  const alignments = safeHeaders.map((_, colIdx) => {
    const nonEmpty = safeRows.map(r => r[colIdx]).filter(Boolean)
    if (nonEmpty.length > 0 && nonEmpty.every(isNumericCell))
      return 'right'
    return 'left'
  })

  if (!aligned) {
    const headLine = `| ${safeHeaders.join(' | ')} |`
    const sepLine = `| ${alignments.map(a => (a === 'right' ? '---:' : '---')).join(' | ')} |`
    const bodyLines = safeRows.map(r => `| ${r.join(' | ')} |`)
    return [headLine, sepLine, ...bodyLines].join('\n')
  }

  const widths = safeHeaders.map((header, colIdx) => {
    let maxW = Math.max(3, displayWidth(header))
    for (const r of safeRows)
      maxW = Math.max(maxW, displayWidth(r[colIdx]))
    return maxW
  })

  const headLine = `| ${safeHeaders.map((h, i) => padCell(h, widths[i], alignments[i])).join(' | ')} |`
  const sepLine = `| ${widths.map((w, i) => (alignments[i] === 'right' ? `${'-'.repeat(Math.max(2, w - 1))}:` : '-'.repeat(Math.max(3, w)))).join(' | ')} |`
  const bodyLines = safeRows.map(r => `| ${r.map((cell, i) => padCell(cell, widths[i], alignments[i])).join(' | ')} |`)

  return [headLine, sepLine, ...bodyLines].join('\n')
}

function tryConvertTabularInput(rawText) {
  const trimmed = normalizeText(rawText)
  if (!trimmed)
    return null

  // 1. JSON array of objects or JSON array of arrays
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (parsed.every(entry => entry && typeof entry === 'object' && !Array.isArray(entry))) {
          const keyOrder = []
          const seenKeys = new Set()
          for (const entry of parsed) {
            for (const key of Object.keys(entry)) {
              if (!seenKeys.has(key)) {
                seenKeys.add(key)
                keyOrder.push(key)
              }
            }
          }
          if (keyOrder.length > 0) {
            const rows = parsed.map(entry => keyOrder.map(k => entry[k]))
            return {
              format: 'JSON Array',
              rowCount: rows.length,
              colCount: keyOrder.length,
              alignedTable: buildGfmTable(keyOrder, rows, { aligned: true }),
              compactTable: buildGfmTable(keyOrder, rows, { aligned: false }),
            }
          }
        }
        if (parsed.every(entry => Array.isArray(entry)) && parsed.length >= 2 && parsed[0].length >= 2) {
          const headers = parsed[0].map(cell => String(cell ?? ''))
          const rows = parsed.slice(1)
          return {
            format: 'JSON Matrix',
            rowCount: rows.length,
            colCount: headers.length,
            alignedTable: buildGfmTable(headers, rows, { aligned: true }),
            compactTable: buildGfmTable(headers, rows, { aligned: false }),
          }
        }
      }
    }
    catch {
      // Not valid JSON
    }
  }

  // 2. TSV or CSV (requires >= 2 lines and >= 2 columns)
  if (!trimmed.includes('\n'))
    return null

  const firstLine = trimmed.split(/\r?\n/, 1)[0] || ''
  let delimiter = ''
  let format = ''
  if (firstLine.includes('\t')) {
    delimiter = '\t'
    format = 'TSV'
  }
  else if (firstLine.includes(',')) {
    delimiter = ','
    format = 'CSV'
  }
  else {
    return null
  }

  const rows = parseDelimitedText(trimmed, delimiter)
  if (rows.length < 2)
    return null

  const colCount = Math.max(...rows.map(r => r.length))
  if (colCount < 2)
    return null

  const headerRow = [...rows[0]]
  while (headerRow.length < colCount)
    headerRow.push(`Col ${headerRow.length + 1}`)

  const dataRows = rows.slice(1)
  return {
    format,
    rowCount: dataRows.length,
    colCount,
    alignedTable: buildGfmTable(headerRow, dataRows, { aligned: true }),
    compactTable: buildGfmTable(headerRow, dataRows, { aligned: false }),
  }
}

function encodeShieldsSegment(text) {
  return encodeURIComponent(
    String(text ?? '')
      .trim()
      .replace(/-/g, '--')
      .replace(/_/g, '__'),
  )
}

function buildShieldsBadge({ label, message, color = 'blue', style = '', logo = '' }) {
  const safeLabel = normalizeText(label) || 'Status'
  const safeMessage = normalizeText(message) || 'ready'
  const safeColor = normalizeText(color).replace(/^#/, '') || 'blue'
  const encodedPath = `${encodeShieldsSegment(safeLabel)}-${encodeShieldsSegment(safeMessage)}-${encodeURIComponent(safeColor)}`
  const params = new URLSearchParams()
  if (style && VALID_BADGE_STYLES.has(style))
    params.set('style', style)
  if (logo)
    params.set('logo', logo)
  const queryStr = params.toString()
  const url = `https://img.shields.io/badge/${encodedPath}${queryStr ? `?${queryStr}` : ''}`
  const alt = `${safeLabel}: ${safeMessage}`
  return {
    label: safeLabel,
    message: safeMessage,
    color: safeColor,
    url,
    markdown: `![${alt}](${url})`,
    html: `<img alt="${alt.replace(/"/g, '&quot;')}" src="${url}" />`,
  }
}

function parseBadgeSpec(rawSpec) {
  let text = normalizeText(rawSpec)
  if (!text)
    return null

  let style = ''
  let logo = ''

  text = text.replace(/\bstyle=([a-z0-9-]+)\b/gi, (_, value) => {
    const candidate = value.toLowerCase()
    if (VALID_BADGE_STYLES.has(candidate))
      style = candidate
    return ''
  })
  text = text.replace(/\blogo=([a-z0-9._-]+)\b/gi, (_, value) => {
    logo = value.trim()
    return ''
  })
  text = text.trim()
  if (!text)
    return null

  if (text.includes('|')) {
    const parts = text.split('|').map(part => part.trim()).filter(Boolean)
    if (parts.length < 2)
      return null
    return buildShieldsBadge({
      label: parts[0],
      message: parts[1],
      color: parts[2] || 'blue',
      style: parts[3] || style,
      logo,
    })
  }

  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length < 2)
    return null
  const label = tokens[0]
  const message = tokens[1]
  const color = tokens[2] || 'blue'
  const maybeStyle = tokens[3] && VALID_BADGE_STYLES.has(tokens[3].toLowerCase())
    ? tokens[3].toLowerCase()
    : style
  return buildShieldsBadge({ label, message, color, style: maybeStyle, logo })
}

function githubAnchorSlug(headingText) {
  return String(headingText ?? '')
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function extractMarkdownToc(markdownText) {
  const lines = String(markdownText ?? '').replace(/\r\n/g, '\n').split('\n')
  const headings = []
  const slugCounts = new Map()
  let activeFenceChar = ''
  let activeFenceLen = 0

  for (const rawLine of lines) {
    const fenceMatch = rawLine.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!activeFenceChar) {
        activeFenceChar = marker[0]
        activeFenceLen = marker.length
      }
      else if (marker[0] === activeFenceChar && marker.length >= activeFenceLen) {
        activeFenceChar = ''
        activeFenceLen = 0
      }
      continue
    }
    if (activeFenceChar)
      continue

    const headingMatch = rawLine.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!headingMatch)
      continue

    const level = headingMatch[1].length
    const text = headingMatch[2].trim()
    const baseSlug = githubAnchorSlug(text) || 'section'
    const count = slugCounts.get(baseSlug) ?? 0
    slugCounts.set(baseSlug, count + 1)
    const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`
    headings.push({ level, text, slug })
  }

  if (!headings.length)
    return null

  const minLevel = Math.min(...headings.map(h => h.level))
  const tocLines = headings.map((h) => {
    const indent = '  '.repeat(Math.max(0, h.level - minLevel))
    return `${indent}- [${h.text}](#${h.slug})`
  })
  const anchorLines = headings.map(h => `#${h.slug}`)

  return {
    headings,
    tocMarkdown: tocLines.join('\n'),
    anchorsText: anchorLines.join('\n'),
  }
}

function analyzeTextStats(rawText) {
  const text = String(rawText ?? '')
  const trimmed = text.trim()
  const cjkMatches = text.match(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []
  const cjkCount = cjkMatches.length

  const textWithoutCjk = text.replace(/[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g, ' ')
  const latinMatches = textWithoutCjk.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []
  const latinWordCount = latinMatches.length
  const totalWords = cjkCount + latinWordCount

  const charCount = Array.from(text).length
  const charsNoSpace = Array.from(text.replace(/\s/g, '')).length
  const lineCount = trimmed ? text.replace(/\r\n/g, '\n').split('\n').length : 0
  const paragraphCount = trimmed ? trimmed.split(/\r?\n\s*\r?\n/).filter(Boolean).length : 0
  const utf8Bytes = new TextEncoder().encode(text).length

  // Dual-script reading speed: ~300 CJK chars/min, ~220 Latin words/min
  const readingMinutesRaw = (cjkCount / 300) + (latinWordCount / 220)
  const readingSeconds = Math.max(1, Math.round(readingMinutesRaw * 60))
  const readingLabel = readingSeconds < 60
    ? `${readingSeconds}s`
    : `${Math.floor(readingSeconds / 60)}m ${readingSeconds % 60}s`

  // Practical BPE LLM token heuristic (GPT/Claude/Gemini range)
  const latinChars = latinMatches.reduce((sum, w) => sum + w.length, 0)
  const otherVisible = Math.max(0, charsNoSpace - cjkCount - latinChars)
  const estimatedTokens = Math.max(
    trimmed ? 1 : 0,
    Math.round((cjkCount * 1.65) + Math.max(latinWordCount * 1.28, latinChars / 3.9) + (otherVisible * 0.55)),
  )

  const summaryMarkdown = [
    '| Metric | Value |',
    '| :--- | ---: |',
    `| Words (Total) | ${totalWords} |`,
    `| CJK Characters | ${cjkCount} |`,
    `| Latin Words | ${latinWordCount} |`,
    `| Characters (incl. spaces) | ${charCount} |`,
    `| Characters (no spaces) | ${charsNoSpace} |`,
    `| Lines / Paragraphs | ${lineCount} / ${paragraphCount} |`,
    `| UTF-8 Bytes | ${utf8Bytes} |`,
    `| Reading Time | ${readingLabel} |`,
    `| Est. LLM Tokens | ~${estimatedTokens} |`,
  ].join('\n')

  return {
    totalWords,
    cjkCount,
    latinWordCount,
    charCount,
    charsNoSpace,
    lineCount,
    paragraphCount,
    utf8Bytes,
    readingSeconds,
    readingLabel,
    estimatedTokens,
    summaryMarkdown,
  }
}

function detectCodeLanguage(code) {
  const sample = String(code ?? '').trim()
  if (!sample)
    return ''
  if ((sample.startsWith('{') && sample.endsWith('}')) || (sample.startsWith('[') && sample.endsWith(']'))) {
    try {
      JSON.parse(sample)
      return 'json'
    }
    catch {
      // fall through
    }
  }
  if (/^\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE TABLE|WITH)\b/im.test(sample))
    return 'sql'
  if (/^\s*(?:interface|type)\s+\w+\s*[={]|:\s*(?:string|number|boolean|Promise<)/m.test(sample))
    return 'ts'
  if (/^\s*(?:const|let|var|function|export|import)\b|=>/m.test(sample))
    return 'js'
  if (/^\s*(?:def |class |from \S+ import |import \S+)/m.test(sample))
    return 'python'
  if (/^\s*(?:#!\/bin\/|curl |pnpm |npm |git |docker )/m.test(sample))
    return 'bash'
  if (/^\s*<[a-z][\w-]*(?:\s[^>]*)?>[\s\S]*<\/[a-z][\w-]*>\s*$/i.test(sample))
    return 'html'
  if (/^\s*[a-zA-Z0-9_-]+:\s+\S+/m.test(sample) && sample.includes('\n'))
    return 'yaml'
  return ''
}

function wrapInCodeFence(code, explicitLang = '') {
  const body = String(code ?? '').replace(/\r\n/g, '\n')
  const lang = normalizeText(explicitLang) || detectCodeLanguage(body)
  let maxBackticks = 0
  for (const match of body.matchAll(/`+/g)) {
    if (match[0].length > maxBackticks)
      maxBackticks = match[0].length
  }
  const fence = '`'.repeat(Math.max(3, maxBackticks + 1))
  return {
    lang: lang || 'text',
    fence,
    output: `${fence}${lang}\n${body}\n${fence}`,
  }
}

function stripMarkdownToPlainText(markdownText) {
  let text = String(markdownText ?? '').replace(/\r\n/g, '\n')

  // Remove fenced code delimiters while preserving inner code content
  text = text.replace(/^[ \t]*(?:`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?[ \t]*(?:`{3,}|~{3,})[ \t]*$/gm, '$1')
  // Images ![alt](url) -> alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  // Links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Reference links [label][ref] -> label
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
  // Reference definitions [ref]: url
  text = text.replace(/^\s*\[[^\]]+\]:\s+\S+.*$/gm, '')
  // Inline code `code` -> code
  text = text.replace(/`+([^`]+)`+/g, '$1')
  // ATX Headings
  text = text.replace(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/gm, '$1')
  // Setext heading underlines & horizontal rules
  text = text.replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
  // Blockquotes
  text = text.replace(/^\s{0,3}(?:>\s?)+/gm, '')
  // Task list checkboxes & unordered/ordered list markers
  text = text.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '')
  text = text.replace(/^\s*[-*+]\s+/gm, '')
  text = text.replace(/^\s*\d+\.\s+/gm, '')
  // Table separator rows and pipes
  text = text.replace(/^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/gm, '')
  text = text.replace(/^\s*\|(.+)\|\s*$/gm, (_, row) =>
    row.split('|').map(cell => cell.trim()).join('  '))
  // Bold / italic / strikethrough
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2')
  text = text.replace(/~~(.*?)~~/g, '$1')
  text = text.replace(/(^|[^\w])\*([^*]+)\*(?!\w)/g, '$1$2')
  text = text.replace(/(^|[^\w])_([^_]+)_(?!\w)/g, '$1$2')
  // Escaped punctuation
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
  // Inline HTML tags
  text = text.replace(/<\/?[a-z][^>]*>/gi, '')
  // Collapse excess whitespace/blank lines
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()

  return text
}

function looksLikeMarkdown(text) {
  return /(?:^\s*#{1,6}\s+|^\s*>\s+|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|!\[[^\]]*\]\([^)]+\)|`[^`]+`|^\s*[-*+]\s+\[[ xX]\])/m.test(text)
}

function registerOutput(text) {
  actionCounter += 1
  const token = `md-${triggerGeneration}-${actionCounter}`
  issuedOutputs.set(token, { text, generation: triggerGeneration })
  return token
}

function buildInfoItem({ id, title, subtitle }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: 'none',
    })
    .build()
}

function buildCopyItem({ id, title, subtitle, output, actionId = 'copy', extraOutputs = [] }) {
  const primaryToken = registerOutput(output)
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: actionId,
    })
    .createAndAddAction(actionId, 'plugin', title, { token: primaryToken })

  for (const extra of extraOutputs) {
    const extraToken = registerOutput(extra.output)
    builder.createAndAddAction(extra.id, 'plugin', extra.label, { token: extraToken })
  }

  return builder.build()
}

function parseIntent(rawQuery) {
  const raw = String(rawQuery ?? '')
  const trimmed = raw.trim()
  if (!trimmed)
    return { mode: 'home', payload: '' }

  const stripped = trimmed.replace(/^(?:mdcraft|markdown|mdtable|mdtoc|md)\s+/i, '')
  const badgeMatch = stripped.match(/^badge(?:\s+([\s\S]*))?$/i)
  if (badgeMatch)
    return { mode: 'badge', payload: (badgeMatch[1] || '').trim() }

  const tableMatch = stripped.match(/^(?:table|csv|tsv)\s+([\s\S]+)$/i)
  if (tableMatch)
    return { mode: 'table', payload: tableMatch[1].trim() }

  const tocMatch = stripped.match(/^(?:toc|slug|anchors)\s+([\s\S]+)$/i)
  if (tocMatch)
    return { mode: 'toc', payload: tocMatch[1] }

  const fenceMatch = stripped.match(/^(?:fence|code)\s+([a-z0-9+#.-]+)\s+([\s\S]+)$/i)
  if (fenceMatch)
    return { mode: 'fence', lang: fenceMatch[1], payload: fenceMatch[2] }

  const fenceAutoMatch = stripped.match(/^(?:fence|code)\s+([\s\S]+)$/i)
  if (fenceAutoMatch)
    return { mode: 'fence', lang: '', payload: fenceAutoMatch[1] }

  const stripMatch = stripped.match(/^(?:strip|plain|text)\s+([\s\S]+)$/i)
  if (stripMatch)
    return { mode: 'strip', payload: stripMatch[1] }

  const statsMatch = stripped.match(/^(?:stats|count|tokens)\s+([\s\S]+)$/i)
  if (statsMatch)
    return { mode: 'stats', payload: statsMatch[1] }

  return { mode: 'auto', payload: stripped }
}

async function publishItems(items, generation) {
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
}

async function copyTextWithGate(text) {
  if (typeof permission?.check !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-sdk-unavailable',
      message: 'Permission SDK unavailable',
    }
  }

  let granted
  try {
    granted = await permission.check('clipboard.write')
  }
  catch {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-check-failed',
      message: 'Failed to check clipboard.write permission',
    }
  }

  if (granted !== true) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: 'Grant clipboard.write permission to copy Markdown output',
    }
  }

  if (typeof clipboard?.writeText !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: 'Clipboard capability is unavailable',
    }
  }

  try {
    await clipboard.writeText(String(text ?? ''))
    return {
      externalAction: true,
      success: true,
      status: 'copied',
      message: 'Copied Markdown output to clipboard',
    }
  }
  catch (error) {
    logger?.warn?.('[touch-markdown-craft] Clipboard write failed')
    const denied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: denied ? 'permission-denied' : 'clipboard-write-failed',
      message: denied ? 'Missing clipboard.write permission' : 'Failed to copy to clipboard',
    }
  }
}

function addBadgeItems(items, badge, prefix = 'badge') {
  items.push(buildCopyItem({
    id: `${FEATURE_ID}-${prefix}-md`,
    title: `Shields.io Badge · ${badge.label}: ${badge.message}`,
    subtitle: truncateLine(badge.markdown),
    output: badge.markdown,
    actionId: 'copy-markdown',
    extraOutputs: [
      { id: 'copy-html', label: 'Copy HTML <img>', output: badge.html },
      { id: 'copy-url', label: 'Copy Badge URL', output: badge.url },
    ],
  }))
  items.push(buildCopyItem({
    id: `${FEATURE_ID}-${prefix}-html`,
    title: 'Shields.io HTML <img> Tag',
    subtitle: truncateLine(badge.html),
    output: badge.html,
    actionId: 'copy-html',
  }))
  items.push(buildCopyItem({
    id: `${FEATURE_ID}-${prefix}-url`,
    title: 'Shields.io Raw SVG URL',
    subtitle: truncateLine(badge.url),
    output: badge.url,
    actionId: 'copy-url',
  }))
}

function addStatsItem(items, text) {
  const stats = analyzeTextStats(text)
  items.push(buildCopyItem({
    id: `${FEATURE_ID}-stats`,
    title: `${stats.totalWords} words (CJK ${stats.cjkCount} · Latin ${stats.latinWordCount}) · ~${stats.estimatedTokens} tokens`,
    subtitle: `${stats.charCount} chars (${stats.charsNoSpace} non-ws) · Read ${stats.readingLabel} · ${stats.utf8Bytes} B — Copy table`,
    output: stats.summaryMarkdown,
    actionId: 'copy-stats',
  }))
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId = FEATURE_ID, query) {
    if (featureId !== FEATURE_ID)
      return false

    const generation = ++triggerGeneration
    issuedOutputs = new Map()

    try {
      const intent = parseIntent(getQueryText(query))
      const items = []

      if (intent.mode === 'home') {
        items.push(buildInfoItem({
          id: `${FEATURE_ID}-guide`,
          title: 'Markdown Craft · Offline Power Workbench',
          subtitle: 'Paste CSV/TSV/JSON for tables, headings for TOC, or run: badge · fence · strip · stats',
        }))
        BADGE_PRESETS.forEach((preset, idx) => {
          const badge = buildShieldsBadge(preset)
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-preset-badge-${idx}`,
            title: `Quick Badge · ${badge.label}: ${badge.message}`,
            subtitle: badge.markdown,
            output: badge.markdown,
            actionId: 'copy-markdown',
            extraOutputs: [
              { id: 'copy-html', label: 'Copy HTML <img>', output: badge.html },
              { id: 'copy-url', label: 'Copy Badge URL', output: badge.url },
            ],
          }))
        })
      }
      else if (intent.mode === 'badge') {
        const badge = parseBadgeSpec(intent.payload)
        if (badge) {
          addBadgeItems(items, badge, 'custom')
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-badge-help`,
            title: 'Shields.io Badge Builder',
            subtitle: 'Usage: badge Label | Message | color  or  badge Build passing brightgreen style=for-the-badge logo=github',
          }))
          BADGE_PRESETS.forEach((preset, idx) => {
            const b = buildShieldsBadge(preset)
            items.push(buildCopyItem({
              id: `${FEATURE_ID}-badge-preset-${idx}`,
              title: `${b.label}: ${b.message} (${b.color})`,
              subtitle: b.markdown,
              output: b.markdown,
              actionId: 'copy-markdown',
            }))
          })
        }
      }
      else if (intent.mode === 'table') {
        const tableResult = tryConvertTabularInput(intent.payload)
        if (tableResult) {
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-table-aligned`,
            title: `Aligned GFM Table (${tableResult.format} · ${tableResult.rowCount}×${tableResult.colCount})`,
            subtitle: truncateLine(tableResult.alignedTable.split('\n')[0]),
            output: tableResult.alignedTable,
            actionId: 'copy-table',
            extraOutputs: [
              { id: 'copy-compact-table', label: 'Copy Compact GFM Table', output: tableResult.compactTable },
            ],
          }))
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-table-compact`,
            title: 'Compact GFM Table',
            subtitle: truncateLine(tableResult.compactTable.split('\n')[0]),
            output: tableResult.compactTable,
            actionId: 'copy-compact-table',
          }))
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-table-invalid`,
            title: 'Unable to Parse Table Data',
            subtitle: 'Paste valid JSON array of objects, multi-line CSV (commas), or TSV (tabs)',
          }))
        }
      }
      else if (intent.mode === 'toc') {
        const toc = extractMarkdownToc(intent.payload)
        if (toc) {
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-toc-md`,
            title: `Markdown TOC (${toc.headings.length} heading(s))`,
            subtitle: truncateLine(toc.tocMarkdown.replace(/\n/g, ' · ')),
            output: toc.tocMarkdown,
            actionId: 'copy-toc',
            extraOutputs: [
              { id: 'copy-anchors', label: 'Copy GitHub Anchor Slugs', output: toc.anchorsText },
            ],
          }))
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-toc-anchors`,
            title: 'GitHub Anchor Slugs',
            subtitle: truncateLine(toc.anchorsText.replace(/\n/g, ' · ')),
            output: toc.anchorsText,
            actionId: 'copy-anchors',
          }))
        }
        else {
          items.push(buildInfoItem({
            id: `${FEATURE_ID}-toc-empty`,
            title: 'No Markdown Headings Detected',
            subtitle: 'Include ATX headings like "# Title" and "## Section" (code fences are skipped automatically)',
          }))
        }
      }
      else if (intent.mode === 'fence') {
        const fenced = wrapInCodeFence(intent.payload, intent.lang)
        items.push(buildCopyItem({
          id: `${FEATURE_ID}-fence`,
          title: `Wrap in Code Fence (${fenced.lang})`,
          subtitle: truncateLine(fenced.output),
          output: fenced.output,
          actionId: 'copy-fence',
        }))
        addStatsItem(items, intent.payload)
      }
      else if (intent.mode === 'strip') {
        const plain = stripMarkdownToPlainText(intent.payload)
        items.push(buildCopyItem({
          id: `${FEATURE_ID}-strip`,
          title: 'Plain Text (Markdown Stripped)',
          subtitle: truncateLine(plain || '(empty)'),
          output: plain,
          actionId: 'copy-plain',
        }))
        addStatsItem(items, plain)
      }
      else if (intent.mode === 'stats') {
        addStatsItem(items, intent.payload)
      }
      else {
        // Auto mode: detect tables, TOC, markdown strip, code fence, plus CJK/LLM stats
        const payload = intent.payload
        const tableResult = tryConvertTabularInput(payload)
        if (tableResult) {
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-auto-table`,
            title: `Aligned GFM Table (${tableResult.format} · ${tableResult.rowCount}×${tableResult.colCount})`,
            subtitle: truncateLine(tableResult.alignedTable.split('\n')[0]),
            output: tableResult.alignedTable,
            actionId: 'copy-table',
            extraOutputs: [
              { id: 'copy-compact-table', label: 'Copy Compact GFM Table', output: tableResult.compactTable },
            ],
          }))
        }

        const toc = extractMarkdownToc(payload)
        if (toc) {
          items.push(buildCopyItem({
            id: `${FEATURE_ID}-auto-toc`,
            title: `Extract Markdown TOC (${toc.headings.length} heading(s))`,
            subtitle: truncateLine(toc.tocMarkdown.replace(/\n/g, ' · ')),
            output: toc.tocMarkdown,
            actionId: 'copy-toc',
            extraOutputs: [
              { id: 'copy-anchors', label: 'Copy Anchor Slugs', output: toc.anchorsText },
            ],
          }))
        }

        if (looksLikeMarkdown(payload)) {
          const plain = stripMarkdownToPlainText(payload)
          if (plain && plain !== payload.trim()) {
            items.push(buildCopyItem({
              id: `${FEATURE_ID}-auto-strip`,
              title: 'Strip Markdown to Plain Text',
              subtitle: truncateLine(plain),
              output: plain,
              actionId: 'copy-plain',
            }))
          }
        }

        addStatsItem(items, payload)

        const fenced = wrapInCodeFence(payload)
        items.push(buildCopyItem({
          id: `${FEATURE_ID}-auto-fence`,
          title: `Wrap in Code Fence (${fenced.lang})`,
          subtitle: truncateLine(fenced.output),
          output: fenced.output,
          actionId: 'copy-fence',
        }))
      }

      await publishItems(items, generation)
      return true
    }
    catch {
      if (generation !== triggerGeneration)
        return true
      logger?.error?.('[touch-markdown-craft] Failed to handle query')
      try {
        await publishItems([
          buildInfoItem({
            id: `${FEATURE_ID}-error`,
            title: 'Markdown Craft Error',
            subtitle: 'Unable to transform input right now',
          }),
        ], generation)
        return true
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (
      !item
      || typeof item !== 'object'
      || item.source?.type !== 'plugin'
      || ![SOURCE_ID, PLUGIN_NAME].includes(item.source?.id)
      || (item.meta?.pluginName && item.meta.pluginName !== PLUGIN_NAME)
      || item.meta?.featureId !== FEATURE_ID
    ) {
      return
    }

    const actionId = normalizeText(
      context?.actionId || item.meta?.defaultAction || item.actions?.[0]?.id,
    )
    if (!actionId || actionId === 'none')
      return

    const action = Array.isArray(item.actions)
      ? item.actions.find(candidate => candidate?.id === actionId && candidate?.type === 'plugin')
      : null
    const token = normalizeText(action?.payload?.token)
    if (!token) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: 'Action payload is missing or invalid',
      }
    }

    const issued = issuedOutputs.get(token)
    if (!issued) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'stale-request',
        message: 'Output expired; re-run your query',
      }
    }

    return copyTextWithGate(issued.text)
  },

  onDestroy() {
    triggerGeneration += 1
    issuedOutputs = new Map()
  },
}

module.exports = pluginLifecycle
