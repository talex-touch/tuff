import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { looksLikeInlineMath, mathExtension } from '../src/math-extension'

function render(content: string): string {
  return new Marked({ gfm: true, breaks: true }).use(mathExtension()).parse(content) as string
}

/** Strips markup so a test can assert on what the reader ends up reading. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('looksLikeInlineMath', () => {
  it.each([['x^2'], ['E=mc^2'], ['\\frac{a}{b}'], ['a_1']])('accepts %s', (tex) => {
    expect(looksLikeInlineMath(tex)).toBe(true)
  })

  it.each([
    ['', 'empty'],
    [' x ', 'delimiters must hug their content'],
    ['x\ny', 'inline math cannot span lines'],
    ['5', 'a bare number is currency'],
    ['1.50', 'a bare decimal is currency'],
  ])('rejects %j (%s)', (tex) => {
    expect(looksLikeInlineMath(tex)).toBe(false)
  })

  it('rejects a runaway span rather than handing it to KaTeX', () => {
    expect(looksLikeInlineMath('x'.repeat(5000))).toBe(false)
  })
})

describe('math rendering', () => {
  it('renders inline math', () => {
    const html = render('mass is $E=mc^2$ exactly')
    expect(html).toContain('tx-stream-md__math-inline')
    expect(html).toContain('katex')
    expect(html).not.toContain('$E=mc^2$')
  })

  it('renders display math', () => {
    const html = render('$$\n\\int_0^1 x\\,dx\n$$')
    expect(html).toContain('tx-stream-md__math-block')
    expect(html).toContain('katex-display')
  })

  it('never eats prose between two currency amounts', () => {
    // The failure this feature is most likely to cause, and the worst one:
    // the words between the amounts would vanish into a formula.
    const html = render('it costs $5 to $9 per seat')
    expect(text(html)).toBe('it costs $5 to $9 per seat')
    expect(html).not.toContain('katex')
  })

  it('leaves a lone dollar sign alone', () => {
    expect(text(render('costs $5'))).toBe('costs $5')
  })

  it('leaves shell variables alone', () => {
    // `$HOME/bin and $PATH` would otherwise become math spanning the slash.
    const html = render('put it in $HOME/bin and $PATH')
    expect(text(html)).toBe('put it in $HOME/bin and $PATH')
  })

  it('does not treat spaced dollars as delimiters', () => {
    expect(text(render('from $ 5 to $ 9'))).toBe('from $ 5 to $ 9')
  })

  it('leaves dollars inside code alone', () => {
    const html = render('`echo $A and $B`')
    expect(html).toContain('<code>echo $A and $B</code>')
    expect(html).not.toContain('katex')
  })

  it('leaves dollars inside a fence alone', () => {
    const html = render('```sh\necho $A and $B\n```')
    expect(html).not.toContain('katex')
  })

  it('survives malformed tex instead of failing the whole reply', () => {
    // `throwOnError: false` — the surrounding prose must still render.
    const html = render('before $\\frac{$ after')
    expect(text(html)).toContain('before')
    expect(text(html)).toContain('after')
  })

  it('honours a backslash-escaped dollar', () => {
    expect(render('\\$5 and \\$9')).not.toContain('katex')
  })
})
