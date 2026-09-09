// Ported from torph/src/lib/text-morph/utils/segment.ts
// (https://github.com/lochie/torph). MIT License © lochie. Kept intentionally
// close to upstream so its fixes stay diffable; deviations are limited to
// tuffex lint style, the `Morph*` type prefix, `locale` narrowed to `string`,
// and invisible separators written as `\u` escapes rather than raw characters.

import type { MorphSegment } from './types'
import { isNumericWord, segmentNumber } from './number'

const NBSP = '\u00A0'

// A collision makes two segments fight over one element and one silently loses its
// text, so uniqueness has to hold across the whole value, not per line.
export function createIdAllocator() {
  const used = new Set<string>()

  return {
    reserve(id: string) {
      used.add(id)
    },
    has(id: string) {
      return used.has(id)
    },
    take(base: string): string {
      if (!used.has(base)) {
        used.add(base)
        return base
      }
      let i = 1
      while (used.has(`${base}~${i}`)) i++
      const id = `${base}~${i}`
      used.add(id)
      return id
    },
  }
}

export type IdAllocator = ReturnType<typeof createIdAllocator>

/** Whitespace-delimited words — the unit the diff aligns on, and so a number's bounds. */
export function groupIntoWords(segments: MorphSegment[]): { word: string, segments: MorphSegment[] }[] {
  const groups: { word: string, segments: MorphSegment[] }[] = []
  let current: MorphSegment[] = []

  const flush = () => {
    if (current.length === 0)
      return
    groups.push({ word: current.map(s => s.string).join(''), segments: current })
    current = []
  }

  for (const seg of segments) {
    if (seg.string === NBSP || seg.string === '\n')
      flush()
    else
      current.push(seg)
  }
  flush()

  return groups
}

/**
 * Re-cuts every numeric word into per-character segments carrying a kind. A pass over
 * the finished segmentation, not part of it: `Intl.Segmenter` splits "$1,234" on its
 * own terms, and regrouping on whitespace is what keeps this and the diff agreeing.
 */
function expandNumbers(segments: MorphSegment[]): MorphSegment[] {
  const out: MorphSegment[] = []
  let run: MorphSegment[] = []

  const flush = () => {
    if (run.length === 0)
      return
    const word = run.map(s => s.string).join('')
    if (isNumericWord(word))
      out.push(...segmentNumber(word))
    else
      out.push(...run)
    run = []
  }

  for (const seg of segments) {
    if (seg.string === NBSP || seg.string === '\n') {
      flush()
      out.push(seg)
    }
    else {
      run.push(seg)
    }
  }
  flush()

  return out
}

export function segmentText(value: string, locale: string, numbers = true): MorphSegment[] {
  const hasNewlines = value.includes('\n')
  const byWord = value.includes(' ') || hasNewlines
  const alloc = createIdAllocator()

  if (hasNewlines) {
    // `offset` indexes the full value, so IDs derived from it stay unique across lines.
    const lines = value.split('\n')
    const allSegments: MorphSegment[] = []
    let offset = 0

    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        allSegments.push({ id: alloc.take(`newline-${offset}`), string: '\n' })
        offset += 1
      }
      if (line.length > 0)
        allSegments.push(...segmentLine(line, locale, true, offset, alloc))
      offset += line.length
    })

    return numbers ? expandNumbers(allSegments) : allSegments
  }

  const segments = segmentLine(value, locale, byWord, 0, alloc)
  return numbers ? expandNumbers(segments) : segments
}

function segmentLine(
  line: string,
  locale: string,
  byWord: boolean,
  offset: number,
  alloc: IdAllocator,
): MorphSegment[] {
  if (typeof Intl.Segmenter !== 'undefined') {
    const segmenter = new Intl.Segmenter(locale, { granularity: byWord ? 'word' : 'grapheme' })
    return segmentsFromIntl(segmenter.segment(line)[Symbol.iterator](), offset, alloc)
  }

  return segmentsFallback(line, byWord, offset, alloc)
}

function segmentsFromIntl(
  iterator: Intl.SegmentIterator<Intl.SegmentData>,
  offset: number,
  alloc: IdAllocator,
): MorphSegment[] {
  const segments: MorphSegment[] = []

  for (const data of Array.from(iterator)) {
    const index = offset + data.index
    if (data.segment === ' ')
      segments.push({ id: alloc.take(`space-${index}`), string: NBSP })
    else
      segments.push({ id: allocSegmentId(data.segment, index, alloc), string: data.segment })
  }

  return segments
}

function allocSegmentId(part: string, index: number, alloc: IdAllocator): string {
  return alloc.has(part) ? alloc.take(`${part}-${index}`) : alloc.take(part)
}

function segmentsFallback(
  value: string,
  byWord: boolean,
  offset: number,
  alloc: IdAllocator,
): MorphSegment[] {
  const parts = byWord ? value.split(' ') : value.split('')
  const segments: MorphSegment[] = []
  let index = offset

  parts.forEach((part, i) => {
    if (byWord && i > 0) {
      segments.push({ id: alloc.take(`space-${index}`), string: NBSP })
      index += 1
    }
    segments.push({ id: allocSegmentId(part, index, alloc), string: part })
    index += part.length
  })

  return segments
}
