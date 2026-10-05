import { describe, expect, it } from 'vitest'
import { frontmatterFields, frontmatterText, isBlockScalar } from './frontmatter-fields'

/** The one field named `key`, read as text. */
function text(content: string, key: string): string | undefined {
  const field = frontmatterFields(content).find((candidate) => candidate.key === key)
  return field ? frontmatterText(field) : undefined
}

/**
 * The shape that showed ">" on the skills page: `~/.cc-switch/skills/bggg-creator-image2ppt/SKILL.md`
 * on 2026-10-03, a folded block description over several indented lines.
 */
const FOLDED = [
  '---',
  'name: bggg-creator-image2ppt',
  'description: >',
  '  把图片、截图、海报、PPT 页面截图、HTML 或 SVG 设计稿转换成可编辑 PPTX 的 Codex skill。',
  '  当用户需要 image2ppt、image2pptx、图片转 PPT 时使用。',
  '',
  '  Handles PNG/JPEG: one image per slide.',
  'license: MIT',
  '---',
  '# Body'
].join('\n')

describe('frontmatter fields: block scalars', () => {
  it('reads a folded block description as its text, on one line', () => {
    expect(text(FOLDED, 'description')).toBe(
      '把图片、截图、海报、PPT 页面截图、HTML 或 SVG 设计稿转换成可编辑 PPTX 的 Codex skill。 当用户需要 image2ppt、image2pptx、图片转 PPT 时使用。 Handles PNG/JPEG: one image per slide.'
    )
    // The indented lines belong to `description`: none of them is read as a key, the colon in
    // "Handles PNG/JPEG: …" included, and the key after the block still reads.
    expect(frontmatterFields(FOLDED).map((field) => field.key)).toEqual([
      'name',
      'description',
      'license'
    ])
    expect(text(FOLDED, 'license')).toBe('MIT')
  })

  it.each(['>', '>-', '>+', '|', '|-', '|+', '>2', '|-2', '|2-', '> # folded'])(
    'reads the %s header as a block',
    (header) => {
      const content = `---\ndescription: ${header}\n  first line\n  second line\nname: x\n---\n`
      expect(isBlockScalar(header)).toBe(true)
      expect(text(content, 'description')).toBe('first line second line')
    }
  )

  it('takes a block name the same way', () => {
    expect(text('---\nname: |-\n  Release\n  notes\n---\n', 'name')).toBe('Release notes')
  })

  it('does not take a value starting with > or | as a block when more follows it', () => {
    expect(isBlockScalar('> 5 items')).toBe(false)
    expect(text('---\ndescription: > 5 items\n---\n', 'description')).toBe('> 5 items')
  })
})

describe('frontmatter fields: plain and quoted values', () => {
  it('drops balanced quotes and their escapes', () => {
    const content = [
      '---',
      'name: "Release \\"notes\\""',
      "description: 'It''s quoted'",
      '---'
    ].join('\n')

    expect(text(content, 'name')).toBe('Release "notes"')
    expect(text(content, 'description')).toBe("It's quoted")
  })

  it('reads a quoted or plain value that continues on indented lines', () => {
    const content = [
      '---',
      'description: "a quoted value',
      '  that wraps"',
      'summary: a plain value',
      '  that wraps too',
      '---'
    ].join('\n')

    expect(text(content, 'description')).toBe('a quoted value that wraps')
    expect(text(content, 'summary')).toBe('a plain value that wraps too')
  })

  it('drops a stray quote at either end, as the old readers did', () => {
    expect(text('---\ndescription: "half quoted\n---\n', 'description')).toBe('half quoted')
  })

  it('reads an empty value as empty text', () => {
    expect(text('---\ndescription:\nname: x\n---\n', 'description')).toBe('')
    expect(text('---\ndescription: >\nname: x\n---\n', 'description')).toBe('')
  })

  it('reads keys under a nested key as part of it, never as top-level keys', () => {
    const content = '---\nname: outer\nmetadata:\n  name: inner\n  version: 2\n---\n'

    expect(frontmatterFields(content).map((field) => field.key)).toEqual(['name', 'metadata'])
    expect(text(content, 'name')).toBe('outer')
  })

  it('reads Windows line endings', () => {
    expect(text('---\r\ndescription: >\r\n  one\r\n  two\r\n---\r\n', 'description')).toBe(
      'one two'
    )
  })
})

describe('frontmatter fields: the fence', () => {
  it('has no fields without a header or with one that never closes', () => {
    expect(frontmatterFields('# Just a heading')).toEqual([])
    expect(frontmatterFields('---\nname: Half written\ndescription: >\n  never closed\n')).toEqual(
      []
    )
    expect(frontmatterFields('---\n---\nbody')).toEqual([])
  })
})
