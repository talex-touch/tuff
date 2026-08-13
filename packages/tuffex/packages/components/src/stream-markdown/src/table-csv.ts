/**
 * Serialises a rendered markdown table to CSV.
 *
 * Reads the DOM rather than the markdown source because by the time the reader
 * clicks, the source is a cached string several layers away — and the DOM is
 * what they are actually looking at, which is what they expect to get.
 */

/**
 * Quotes a field per RFC 4180.
 *
 * Only when it has to: quoting everything is valid CSV but makes the result
 * unreadable in a diff or a text editor, and these tables are usually small
 * enough to be read raw.
 */
export function escapeCsvField(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value)
  if (!needsQuotes) return value
  return `"${value.replace(/"/g, '""')}"`
}

/** Cell text as displayed: collapsed whitespace, no markup. */
function cellText(cell: Element): string {
  return (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function tableToCsv(table: HTMLTableElement): string {
  const rows: string[] = []
  for (const row of Array.from(table.rows)) {
    const cells = Array.from(row.cells).map((cell) => escapeCsvField(cellText(cell)))
    rows.push(cells.join(','))
  }
  // CRLF is what RFC 4180 specifies and what Excel expects; every other
  // consumer accepts it.
  return rows.join('\r\n')
}
