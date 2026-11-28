/**
 * Speculatively closes inline markup that the stream has not finished writing.
 *
 * Markdown is only meaningful once a construct is closed, so a document caught
 * mid-token renders its own syntax: `**bold` shows the asterisks, `` `code ``
 * shows the backtick, `[text](htt` shows the brackets. Every one of those
 * resolves a few tokens later, which makes the reply flicker between prose and
 * punctuation for the whole of its arrival.
 *
 * The fix is to close the open construct for the parser and let the real
 * closer, when it lands, simply match. Text never changes — only the styling
 * arrives slightly early, which is invisible, where the punctuation was not.
 *
 * Only the *end* of the document is speculative. An unterminated run in the
 * middle is a deliberate literal (`2 * 3 * 4`), and rewriting it would corrupt
 * what the author actually wrote.
 */

/** Runs longer than this are almost certainly a horizontal rule or ASCII art. */
const MAX_RUN = 3

interface OpenRun {
  /** `*`, `_` or `~`. */
  char: string
  length: number
  /** Character offset in `content` immediately after the opening run. */
  after: number
}

const LIST_PREFIX_RE = /^ {0,3}(?:[*+-]|\d+[.)])(?:[ \t]+|$)/
const BARE_LIST_MARKER_RE = /^ {0,3}(?:[-*+]|\d+[.)])$/
const BARE_HEADING_MARKER_RE = /^ {0,3}#{1,6}$/

/**
 * Holds back an unspaced block marker sitting alone on the trailing line
 * (`\n\n-`, `\n\n1.`, `\n\n##`) until its space or first word lands, so the
 * reader never sees a raw `-` / `1.` / `##` paragraph flash and snap into a
 * list or heading on the next token. An opened marker with a trailing space
 * (`## `, `- `) is left intact so the caret can wait at the new line's start.
 */
export function trimIncompleteBlockMarker(content: string): string {
  if (!content) return content

  const lines = content.split('\n')
  let inFence = false
  let fenceMarker = ''
  for (let i = 0; i < lines.length - 1; i++) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]!)
    if (!fence) continue
    const marker = fence[1]!
    if (!inFence) {
      inFence = true
      fenceMarker = marker
    } else if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
      inFence = false
      fenceMarker = ''
    }
  }
  if (inFence) return content

  const last = lines[lines.length - 1]!
  const prev = lines.length >= 2 ? lines[lines.length - 2]! : ''
  const afterBoundary = lines.length === 1 || prev.trim() === '' || LIST_PREFIX_RE.test(prev)

  if (BARE_HEADING_MARKER_RE.test(last) || (afterBoundary && BARE_LIST_MARKER_RE.test(last))) {
    return lines.slice(0, -1).join('\n')
  }

  return content
}

/**
 * Returns the content with any unterminated inline construct closed.
 *
 * Never called on settled content: a finished document says what it says.
 */
export function completeInlineMarkup(content: string): string {
  if (!content) return content

  const lines = content.split('\n')
  let inFence = false
  let fenceMarker = ''

  // Delimiter state is per-document, not per-line: emphasis spans newlines.
  let backtickRun = 0
  let backtickAfter = -1
  const runs: OpenRun[] = []
  let openBracket = false
  let openParen = false
  let lineOffset = 0

  for (const [lineIndex, line] of lines.entries()) {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      const marker = fence[1]!
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker[0] === fenceMarker[0] && marker.length >= fenceMarker.length) {
        inFence = false
        fenceMarker = ''
      }
      lineOffset += line.length + 1
      continue
    }
    // Fenced code is verbatim; its asterisks and backticks are not markup.
    if (inFence) {
      lineOffset += line.length + 1
      continue
    }

    // Skip list markers (`* `, `- `, `+ `, `1. `) so a `* ` bullet is never
    // mistaken for an unclosed italic delimiter.
    const listPrefix = backtickRun === 0 ? LIST_PREFIX_RE.exec(line) : null
    const startIndex = listPrefix ? listPrefix[0].length : 0

    for (let index = startIndex; index < line.length; index++) {
      const char = line[index]!

      if (char === '\\') {
        // An escape consumes the next character, delimiter or not.
        index += 1
        continue
      }

      if (char === '`') {
        let length = 1
        while (line[index + length] === '`') length += 1
        if (backtickRun === 0) {
          backtickRun = length
          backtickAfter = lineOffset + index + length
        }
        else if (backtickRun === length) {
          backtickRun = 0
          backtickAfter = -1
        }
        index += length - 1
        continue
      }

      // Inside inline code nothing else is markup.
      if (backtickRun > 0) continue

      if (char === '*' || char === '_' || char === '~') {
        let length = 1
        while (line[index + length] === char) length += 1
        index += length - 1
        if (length > MAX_RUN) continue

        const last = runs[runs.length - 1]
        if (last && last.char === char && last.length === length) runs.pop()
        else runs.push({ char, length, after: lineOffset + index + 1 })
        continue
      }

      if (char === '[') {
        openBracket = true
        continue
      }
      if (char === ']') {
        openBracket = false
        // `](` opens a destination that has to be closed before the link reads
        // as a link rather than as literal brackets.
        if (line[index + 1] === '(') {
          openParen = true
          index += 1
        }
        continue
      }
      if (char === ')' && openParen) {
        openParen = false
        continue
      }
    }

    // A blank line ends every inline construct: emphasis cannot span
    // paragraphs, so state must not leak into the next one.
    if (line.trim() === '' && lineIndex < lines.length - 1) {
      backtickRun = 0
      backtickAfter = -1
      runs.length = 0
      openBracket = false
      openParen = false
    }

    lineOffset += line.length + 1
  }

  // An unterminated fence is the block stream's business, not this function's —
  // it already renders those as code, and closing one here would end the block
  // early and make the next token land outside it.
  if (inFence) return content

  let completed = content
  // A lone opener sitting at EOF with no text after it (`hello **`, ``hello ` ``)
  // would turn into literal `****` if closed; hold it back until its first char lands.
  if (backtickRun > 0 && backtickAfter === completed.length) {
    completed = completed.slice(0, completed.length - backtickRun)
    backtickRun = 0
  }
  while (runs.length > 0 && runs[runs.length - 1]!.after === completed.length) {
    const emptyRun = runs.pop()!
    completed = completed.slice(0, completed.length - emptyRun.length)
  }

  if (openParen) completed += ')'
  else if (openBracket) completed += ']'
  // Innermost first, or the closers nest wrongly.
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index]!
    completed += run.char.repeat(run.length)
  }
  if (backtickRun > 0) completed += '`'.repeat(backtickRun)

  return completed
}

/**
 * Completes a GFM table that the stream has only half written.
 *
 * A table is not a table until its delimiter row lands, so until then marked
 * renders the header as a paragraph of pipes — the ugliest flicker of the lot,
 * because a wide table shows several seconds of `| a | b | c |` before snapping
 * into shape.
 *
 * Synthesising the delimiter row lets the header render as a header
 * immediately and the body rows arrive underneath it. Streaming only: a
 * finished document containing pipe-art meant the pipes.
 */
export function completeTable(content: string): string {
  const lines = content.split('\n')
  // Walk back over the trailing run of pipe rows. Anything before it is settled
  // markdown that this must not touch.
  let start = lines.length
  while (start > 0 && /^\s*\|/.test(lines[start - 1] ?? '')) start -= 1
  if (start === lines.length) return content

  const run = lines.slice(start)
  const header = run[0]!
  // A delimiter row already present means the table parses; nothing to do.
  if (run.length > 1 && /^\s*\|?[\s:|-]+\|?\s*$/.test(run[1]!) && run[1]!.includes('-')) {
    return content
  }

  const columns = header.split('|').filter((_, index, all) => index > 0 && index < all.length - 1).length
  if (columns === 0) return content

  const delimiter = `|${' --- |'.repeat(columns)}`
  // Only the header has arrived: give it a delimiter so it renders as one row.
  if (run.length === 1) return `${content}\n${delimiter}`

  // A second row arrived before the delimiter did — it is a body row, so the
  // delimiter has to be spliced between them rather than appended.
  return [...lines.slice(0, start + 1), delimiter, ...lines.slice(start + 1)].join('\n')
}
