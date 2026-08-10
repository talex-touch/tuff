import { Marked } from 'marked'
import { describe, expect, it } from 'vitest'
import { completeTable } from '../src/complete-inline-markup'

const marked = new Marked({ gfm: true, breaks: true })

function rendered(content: string): string {
  return marked.parse(completeTable(content)) as string
}

describe('completeTable', () => {
  it('gives a lone header row a delimiter so it renders as a table', () => {
    expect(completeTable('| a | b |')).toBe('| a | b |\n| --- | --- |')
    expect(rendered('| a | b |')).toContain('<th>a</th>')
  })

  it('stops the pipes from ever reaching the reader', () => {
    // The regression: several seconds of `| a | b |` before the table snaps in.
    const html = rendered('| name | size |')
    expect(html).toContain('<table>')
    expect(html).not.toContain('| name |')
  })

  it('splices the delimiter in when a body row arrived first', () => {
    // The stream can outrun the delimiter row entirely.
    expect(completeTable('| a | b |\n| 1 | 2 |')).toBe('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(rendered('| a | b |\n| 1 | 2 |')).toContain('<td>1</td>')
  })

  it('leaves a table that already has its delimiter alone', () => {
    const content = '| a | b |\n| --- | --- |\n| 1 | 2 |'
    expect(completeTable(content)).toBe(content)
  })

  it('leaves an aligned delimiter alone', () => {
    const content = '| a | b |\n|:--- | ---:|'
    expect(completeTable(content)).toBe(content)
  })

  it('matches the header column count', () => {
    expect(completeTable('| a | b | c | d |')).toBe('| a | b | c | d |\n| --- | --- | --- | --- |')
  })

  it('leaves content with no trailing pipe rows alone', () => {
    expect(completeTable('just prose')).toBe('just prose')
    expect(completeTable('')).toBe('')
  })

  it('only touches the trailing run, never a settled table above it', () => {
    const settled = '| a |\n| --- |\n| 1 |\n\nprose\n\n| x | y |'
    expect(completeTable(settled)).toBe(`${settled}\n| --- | --- |`)
  })
})
