export const OPENUI_FENCE_LANG = 'openui'

export interface OpenUIFenceSegment {
  kind: 'markdown' | 'openui'
  text: string
  complete: boolean
}

/** Keeps ordinary Markdown byte-for-byte, including fences in other languages. */
export function splitOpenUIFences(text: string): OpenUIFenceSegment[] {
  const parts: OpenUIFenceSegment[] = []
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []
  let markdown = ''
  let program: string | null = null
  let fence: { character: string, length: number } | null = null
  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n?$/.exec(line)
    if (program !== null) {
      if (match && match[1]![0] === '`' && match[1]!.length >= fence!.length && !match[2]!.trim()) {
        parts.push({ kind: 'openui', text: program, complete: true })
        program = null
        fence = null
      }
      else { program += line }
    }
    else if (fence) {
      markdown += line
      if (match && match[1]![0] === fence.character && match[1]!.length >= fence.length && !match[2]!.trim()) fence = null
    }
    else if (match && match[1]![0] === '`' && match[2]!.trim() === OPENUI_FENCE_LANG) {
      if (markdown) parts.push({ kind: 'markdown', text: markdown, complete: true })
      markdown = ''
      program = ''
      fence = { character: '`', length: match[1]!.length }
    }
    else {
      markdown += line
      if (match) fence = { character: match[1]![0]!, length: match[1]!.length }
    }
  }
  if (program !== null) parts.push({ kind: 'openui', text: program, complete: false })
  else if (markdown) parts.push({ kind: 'markdown', text: markdown, complete: true })
  return parts
}
