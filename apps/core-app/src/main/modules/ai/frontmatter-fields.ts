/**
 * Top-level fields of a Markdown file's `---` fenced header, read leniently.
 *
 * Skill, agent, command and rule files carry a YAML header, but hand-written ones are often not
 * valid YAML — an unquoted colon in a description is enough — so a strict parse would lose the
 * metadata of exactly the files people write by hand. This reads the subset those headers use:
 *
 * - `key: value` at the header's top level;
 * - a value in quotes, `"…"` or `'…'`;
 * - a value that continues on the indented lines below its key;
 * - the block scalars `>` and `|`, with their chomping (`+`/`-`) and indentation indicators.
 *
 * Everything indented under a key belongs to that key, so nothing indented is ever read as a key of
 * its own. An unfenced or unterminated header is not an error: it just has no fields.
 *
 * Before this, the readers went line by line and took `description: >` at its word: 25 skills on
 * one machine (2026-10-03) showed ">" as their description on the skills page.
 */

export interface FrontmatterField {
  /** As written; a caller compares case-insensitively where its format allows it. */
  key: string
  /** The value on the key's own line, trimmed; empty when the value starts below, or is absent. */
  inline: string
  /** The lines indented under the key, blank lines among them included, as written. */
  continuation: readonly string[]
}

/** `key:` and whatever follows it on the line. */
const KEY_LINE = /^([\w-]+)\s*:\s*(.*)$/

/** A block scalar header: `>` or `|`, an optional chomping and indentation indicator, a comment. */
const BLOCK_SCALAR = /^[>|](?:[1-9]?[+-]?|[+-][1-9])?\s*(?:#.*)?$/

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

/** The header's lines, between the opening `---` and the next line that starts with `---`. */
function headerLines(content: string): string[] | null {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('\n---', 3)
  if (end < 0) return null
  return content.slice(3, end).split(/\r?\n/)
}

/** True for a value written as a block scalar (`>`, `|-`, `>+2`, …). */
export function isBlockScalar(inline: string): boolean {
  return BLOCK_SCALAR.test(inline)
}

/**
 * Every top-level field of the header, in order, each with the indented lines below it. The top
 * level is the indentation of the header's shallowest line, so a header indented as a whole still
 * reads.
 */
export function frontmatterFields(content: string): FrontmatterField[] {
  const lines = headerLines(content)
  if (!lines) return []
  const indents = lines.filter((line) => line.trim()).map(indentOf)
  if (indents.length === 0) return []
  const keyIndent = Math.min(...indents)

  const fields: FrontmatterField[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (!line.trim() || indentOf(line) !== keyIndent) continue
    const continuation: string[] = []
    let next = index + 1
    while (next < lines.length && (!lines[next]!.trim() || indentOf(lines[next]!) > keyIndent)) {
      continuation.push(lines[next]!)
      next += 1
    }
    index = next - 1
    const match = KEY_LINE.exec(line.trim())
    if (match) fields.push({ key: match[1]!, inline: match[2]!.trim(), continuation })
  }
  return fields
}

/** Drops a value's enclosing quotes; a lone stray quote at either end is dropped, as it always was. */
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replace(/''/g, "'")
  return value.replace(/^["']|["']$/g, '')
}

/**
 * A field's value as one line of text, for a name or a description: a block scalar's lines (`>`
 * folded or `|` literal alike) or a value continued on indented lines, joined with their whitespace
 * collapsed, and its quotes removed. Empty when the key has no value.
 */
export function frontmatterText(field: FrontmatterField): string {
  const block = isBlockScalar(field.inline)
  const text = (block ? field.continuation : [field.inline, ...field.continuation])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return block ? text : unquote(text)
}
