import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { completeInlineMarkup, trimIncompleteBlockMarker } from '../src/complete-inline-markup'

const marked = new Marked({ gfm: true, breaks: true })

/** What the reader actually sees — the point of the whole exercise. */
function rendered(content: string): string {
  return marked.parse(completeInlineMarkup(content)) as string
}

describe('completeInlineMarkup', () => {
  describe('leaves settled text alone', () => {
    it.each([
      ['**bold**'],
      ['plain text'],
      ['`code`'],
      ['[text](https://x.dev)'],
      ['a *b* c'],
      [''],
    ])('%s', (content) => {
      expect(completeInlineMarkup(content)).toBe(content)
    })
  })

  describe('closes what the stream has not finished', () => {
    it.each([
      ['**bold', '**bold**'],
      ['*italic', '*italic*'],
      ['__bold', '__bold__'],
      ['_em', '_em_'],
      ['~~strike', '~~strike~~'],
      ['`code', '`code`'],
      ['``code', '``code``'],
      ['nested **outer *inner', 'nested **outer *inner***'],
    ])('%s -> %s', (partial, expected) => {
      expect(completeInlineMarkup(partial)).toBe(expected)
    })
  })

  it('stops the asterisks from ever reaching the reader', () => {
    // The regression this function exists for.
    expect(rendered('**bold')).toContain('<strong>bold</strong>')
    expect(rendered('**bold')).not.toContain('**')
  })

  it('renders a half-written inline code span as code, not as a backtick', () => {
    expect(rendered('`npm insta')).toContain('<code>npm insta</code>')
  })

  it('closes a link destination so the text stops showing brackets', () => {
    expect(completeInlineMarkup('[docs](https://x.d')).toBe('[docs](https://x.d)')
    expect(rendered('[docs](https://x.d')).toContain('<a href="https://x.d"')
  })

  it('closes link text that has no destination yet', () => {
    expect(completeInlineMarkup('see [the doc')).toBe('see [the doc]')
  })

  describe('does not rewrite deliberate literals', () => {
    it('leaves balanced arithmetic asterisks alone', () => {
      expect(completeInlineMarkup('2 * 3 * 4')).toBe('2 * 3 * 4')
    })

    it('leaves an escaped delimiter alone', () => {
      expect(completeInlineMarkup('a \\*b')).toBe('a \\*b')
    })

    it('does not close emphasis across a blank line', () => {
      // Emphasis cannot span paragraphs; a stray `*` two paragraphs back is
      // literal, and closing it at the end would style everything between.
      expect(completeInlineMarkup('a *b\n\nc')).toBe('a *b\n\nc')
    })

    it('ignores long runs, which are rules or art rather than emphasis', () => {
      expect(completeInlineMarkup('****')).toBe('****')
    })
  })

  describe('never touches code content', () => {
    it('ignores markup inside a closed fence', () => {
      const content = '```js\nconst a = **b\n```\ntail'
      expect(completeInlineMarkup(content)).toBe(content)
    })

    it('leaves an unterminated fence to the block stream', () => {
      // Closing the emphasis here would end the code block early and push the
      // rest of the stream outside it.
      const content = '```js\nconst a = **b'
      expect(completeInlineMarkup(content)).toBe(content)
    })

    it('ignores asterisks inside inline code', () => {
      expect(completeInlineMarkup('`a * b` c')).toBe('`a * b` c')
    })
  })

  it('keeps the visible text identical to what arrived', () => {
    // The contract: only styling arrives early. If the text itself changed, a
    // reader would see words appear and disappear.
    const text = (html: string): string => html.replace(/<[^>]+>/g, '').trim()
    expect(text(rendered('**bold'))).toBe('bold')
    expect(text(rendered('a `co'))).toBe('a co')
  })

  it('does not treat bullet list markers as unclosed italics or flash lone openers at EOF', () => {
    expect(completeInlineMarkup('* 第一项')).toBe('* 第一项')
    expect(completeInlineMarkup('* 第一项\n* 第二项\n* 第三项')).toBe('* 第一项\n* 第二项\n* 第三项')
    expect(completeInlineMarkup('hello **')).toBe('hello ')
    expect(completeInlineMarkup('hello `')).toBe('hello ')
  })
})

describe('trimIncompleteBlockMarker', () => {
  it('holds back bare unspaced list and heading prefixes until a space or text lands', () => {
    expect(trimIncompleteBlockMarker('Intro\n\n-')).toBe('Intro\n')
    expect(trimIncompleteBlockMarker('- 第一项\n-')).toBe('- 第一项')
    expect(trimIncompleteBlockMarker('Intro\n\n1.')).toBe('Intro\n')
    expect(trimIncompleteBlockMarker('Intro\n\n###')).toBe('Intro\n')
    // Opened markers with trailing space stay intact so the caret waits on the new line.
    expect(trimIncompleteBlockMarker('Intro\n\n## ')).toBe('Intro\n\n## ')
    expect(trimIncompleteBlockMarker('- 第一项\n- ')).toBe('- 第一项\n- ')
  })
})
