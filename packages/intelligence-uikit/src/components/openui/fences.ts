export const OPENUI_FENCE_LANG = 'openui'

export interface OpenUIFenceSegment {
  kind: 'markdown' | 'openui'
  text: string
  complete: boolean
}

const LANGUAGE_TAG = /^[\w+#.-]+$/

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
      // A model sometimes glues prose onto the closing fence ("```Then we see…"). That line still
      // ends the program and the prose goes back to Markdown. A lone word ("```ts", or a chunk
      // of "```op" still arriving) reads as an info string, so it stays inside the program.
      const info = match?.[2]!.trim() ?? ''
      if (match && match[1]![0] === '`' && match[1]!.length >= fence!.length && !LANGUAGE_TAG.test(info)) {
        parts.push({ kind: 'openui', text: program, complete: true })
        if (info) markdown = line.slice(line.indexOf(match[1]!) + match[1]!.length)
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
