/**
 * Closes self-closing component tags in raw HTML before rehype-raw re-parses it.
 *
 * `<TuffDocSourceLink />` on a line of its own is a raw HTML block. MDC's `html` handler
 * kebab-cases the name and rehype-raw feeds it to parse5, which — like every HTML parser —
 * ignores `/>` on anything that is not a void element. The tag stays open, and every block
 * after it in the same parent becomes its child. The component has no slot, so none of them
 * render: until 2026-09-26, 80 component pages lost their trailing notes, and 24 of them whole
 * sections ("使用场景", "相关组件", "自定义"), that way.
 *
 * Only `html` nodes are rewritten. Fenced and indented code, inline code, MDC `code: |` props
 * and the frontmatter never become `html` nodes, so the examples in them stay as written.
 *
 * The rewrite moves where an element ends and never changes which element a tag becomes:
 *
 * - MDC renames only the tag a raw HTML node starts with, and only the first occurrence of its
 *   name, so a leading `<Name />` becomes `<name-kebab></name-kebab>`. `<Name></Name>` would come
 *   out as `<name-kebab></Name>`; parse5 lowercases that end tag to `name`, it matches nothing,
 *   and the element stays open exactly as before.
 * - Any later tag in the node is never renamed, and parse5 lowercases both halves of
 *   `<Name></Name>` to the same `name`, so it keeps its spelling. Kebab-casing those too was
 *   tried first: `progress-bar.*.mdc` has a demo whose `code: |` block MDC fails to parse, and
 *   its `<TxProgressBar :format="p => …" />` lines turned from inert `<txprogressbar>` elements
 *   into live components that threw `props.format is not a function` and 500ed the page.
 */

interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
}

/**
 * `<Name ... />` where the name starts with an uppercase letter. Attribute values may hold `>`
 * or `/>` inside quotes, and attributes may span lines.
 */
const SELF_CLOSING_COMPONENT_TAG = /<([A-Z][\w-]*)(?=[\s/])((?:[^>"']|"[^"]*"|'[^']*')*?)\s*\/>/g

/** Comments and raw-text elements: what looks like a tag inside them is text. */
const RAW_TEXT_SPAN = /<!--[\s\S]*?(?:-->|$)|<(script|style|textarea)\b[\s\S]*?(?:<\/\1\s*>|$)/gi

const NAME_SPLITTERS = new Set(['-', '_', '/', '.'])

/**
 * scule's `kebabCase`, which MDC's handler uses to rename the tag (`TxAIButton` → `tx-ai-button`,
 * `Tx3DCard` → `tx3d-card`). Ported rather than imported: nexus cannot resolve scule, and any
 * drift would rename the element this plugin closes.
 */
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

/**
 * Rewrites every self-closing PascalCase tag in the value of one raw HTML node to an explicit
 * pair, attributes unchanged: kebab-case if the tag opens the value, as written otherwise.
 * Lowercase tags (`<br />`, `<i class="…" />`), tags that are already paired, comments and
 * `<script>` / `<style>` / `<textarea>` content are left alone.
 */
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

export function remarkCloseComponentTags() {
  return (tree: MdNode) => {
    closeInTree(tree)
  }
}

export default remarkCloseComponentTags
