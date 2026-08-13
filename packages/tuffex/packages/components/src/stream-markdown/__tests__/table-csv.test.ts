// @vitest-environment jsdom
import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { hardenHtmlExtension } from '../src/harden-html'
import { escapeCsvField, tableToCsv } from '../src/table-csv'

const LABELS = {
  blockedImage: 'blocked',
  loadOnce: 'once',
  allowSession: 'session',
  copyTable: 'Copy CSV',
}

function tableFrom(markdown: string): HTMLTableElement {
  const html = new Marked({ gfm: true, breaks: true })
    .use(hardenHtmlExtension(() => ({ blockRemoteImages: false, labels: LABELS })))
    .parse(markdown) as string
  const host = document.createElement('div')
  host.innerHTML = html
  return host.querySelector('table')!
}

describe('escapeCsvField', () => {
  it('leaves an ordinary field bare', () => {
    // Quoting everything is valid CSV but unreadable raw, and these tables are
    // small enough that people do read them raw.
    expect(escapeCsvField('plain')).toBe('plain')
  })

  it.each([
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['line\nbreak', '"line\nbreak"'],
  ])('quotes %j', (input, expected) => {
    expect(escapeCsvField(input)).toBe(expected)
  })
})

describe('tableToCsv', () => {
  it('emits the header row and the body rows', () => {
    const csv = tableToCsv(tableFrom('| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |'))
    expect(csv).toBe('a,b\r\n1,2\r\n3,4')
  })

  it('uses CRLF, which is what RFC 4180 says and Excel expects', () => {
    expect(tableToCsv(tableFrom('| a |\n| --- |\n| 1 |'))).toContain('\r\n')
  })

  it('quotes a cell containing a comma so the columns survive the round trip', () => {
    // The failure that silently corrupts a spreadsheet: one cell splitting into
    // two columns and shifting every later cell in the row.
    const csv = tableToCsv(tableFrom('| name | note |\n| --- | --- |\n| x | a, b |'))
    expect(csv).toBe('name,note\r\nx,"a, b"')
  })

  it('takes the displayed text, not the markup', () => {
    const csv = tableToCsv(tableFrom('| a |\n| --- |\n| **bold** `code` |'))
    expect(csv).toBe('a\r\nbold code')
  })

  it('collapses whitespace so a wrapped cell does not become a multi-line field', () => {
    const table = tableFrom('| a |\n| --- |\n| x |')
    table.rows[1]!.cells[0]!.textContent = '  spaced\n   out  '
    expect(tableToCsv(table)).toBe('a\r\nspaced out')
  })

  it('handles a header-only table', () => {
    expect(tableToCsv(tableFrom('| a | b |\n| --- | --- |'))).toBe('a,b')
  })
})

describe('table chrome', () => {
  function html(markdown: string): string {
    return new Marked({ gfm: true, breaks: true })
      .use(hardenHtmlExtension(() => ({ blockRemoteImages: false, labels: LABELS })))
      .parse(markdown) as string
  }

  it('wraps the table in its own scroll container', () => {
    // The wrapper scrolls, not the table: a scrollable table would leave the
    // sticky header resolving against the transcript scroller.
    const out = html('| a |\n| --- |\n| 1 |')
    expect(out).toContain('tx-stream-md__table-scroll')
    expect(out).toContain('<table><thead>')
  })

  it('offers the copy affordance with the host wording', () => {
    expect(html('| a |\n| --- |\n| 1 |')).toContain('data-tx-table-copy')
    expect(html('| a |\n| --- |\n| 1 |')).toContain('Copy CSV')
  })

  it('omits tbody for a header-only table rather than emitting an empty one', () => {
    expect(html('| a |\n| --- |')).not.toContain('<tbody></tbody>')
  })
})
