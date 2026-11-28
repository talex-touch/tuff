/**
 * Closes self-closing PascalCase component tags in raw HTML before rehype-raw re-parses it.
 */

interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
}

const SELF_CLOSING_COMPONENT_TAG = /<([A-Z][\w-]*)(?=[\s/])((?:[^>"']|"[^"]*"|'[^']*')*?)\s*\/>/g
const RAW_TEXT_SPAN = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea)\b[\s\S]*?(?:<\/\1\s*>|$)/gi
const NAME_SPLITTERS = new Set(['-', '_', '/', '.'])

function kebabCaseTagName(name: string): string {
  const parts: string[] = []
  let buffer = ''
  let previousUpper: boolean | undefined
  let started = false

  for (const char of name) {
    if (NAME_SPLITTERS.has(char)) {
      parts.push(buffer)
      buffer = ''
      previousUpper = undefined
      continue
    }

    const isUpper = /\d/.test(char) ? undefined : char !== char.toLowerCase()
    if (started) {
      if (previousUpper === false && isUpper === true) {
        parts.push(buffer)
        buffer = char
        previousUpper = isUpper
        continue
      }
      if (previousUpper === true && isUpper === false && buffer.length > 1) {
        parts.push(buffer.slice(0, -1))
        buffer = buffer.slice(-1) + char
        previousUpper = isUpper
        continue
      }
    }

    buffer += char
    previousUpper = isUpper
    started = true
  }

  parts.push(buffer)
  return parts.map(part => part.toLowerCase()).join('-')
}

function closeTags(segment: string, segmentStart: number): string {
  return segment.replace(
    SELF_CLOSING_COMPONENT_TAG,
    (_tag, name: string, attributes: string, offset: number) => {
      const tagName = segmentStart + offset === 0 ? kebabCaseTagName(name) : name
      return `<${tagName}${attributes}></${tagName}>`
    },
  )
}

export function closeSelfClosingComponentTags(html: string): string {
  if (!html.includes('/>'))
    return html

  let result = ''
  let cursor = 0
  for (const span of html.matchAll(RAW_TEXT_SPAN)) {
    result += closeTags(html.slice(cursor, span.index), cursor) + span[0]
    cursor = span.index + span[0].length
  }
  return result + closeTags(html.slice(cursor), cursor)
}

function closeInTree(node: MdNode) {
  if (node.type === 'html' && typeof node.value === 'string')
    node.value = closeSelfClosingComponentTags(node.value)

  for (const child of node.children ?? [])
    closeInTree(child)
}

export function remarkCloseComponentTags(_options?: { revision?: string }) {
  return (tree: MdNode) => {
    closeInTree(tree)
  }
}

export default remarkCloseComponentTags
