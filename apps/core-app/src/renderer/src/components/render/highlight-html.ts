export interface HighlightRange {
  start: number
  end: number
}

export interface HighlightHtmlOptions {
  className?: string
  base?: 0 | 1
  inclusiveEnd?: boolean
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderHighlightedTextHtml(
  text: string,
  matchedIndices?: HighlightRange[],
  options: HighlightHtmlOptions = {}
): string {
  if (!matchedIndices?.length) return escapeHtml(text)

  const { className = 'font-semibold text-red', base = 0, inclusiveEnd = false } = options
  const textLength = text.length
  const normalizedRanges = matchedIndices
    .map((range) => {
      let start = base === 1 ? range.start - 1 : range.start
      let end = base === 1 ? range.end - 1 : range.end
      if (inclusiveEnd) end += 1
      start = Math.max(0, Math.min(start, textLength))
      end = Math.max(start, Math.min(end, textLength))
      return { start, end }
    })
    .filter((range) => range.start < range.end)
    .sort((left, right) => left.start - right.start)

  if (normalizedRanges.length === 0) return escapeHtml(text)

  const mergedRanges: HighlightRange[] = []
  let current = { ...normalizedRanges[0] }

  for (let index = 1; index < normalizedRanges.length; index += 1) {
    const next = normalizedRanges[index]
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end)
      continue
    }
    mergedRanges.push(current)
    current = { ...next }
  }
  mergedRanges.push(current)

  let result = ''
  let lastEnd = 0

  for (const range of mergedRanges) {
    if (range.start > lastEnd) result += escapeHtml(text.slice(lastEnd, range.start))
    result += `<span class="${escapeHtml(className)}">${escapeHtml(text.slice(range.start, range.end))}</span>`
    lastEnd = range.end
  }

  if (lastEnd < textLength) result += escapeHtml(text.slice(lastEnd))

  return result
}
