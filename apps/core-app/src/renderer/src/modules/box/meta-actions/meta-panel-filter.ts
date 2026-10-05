/**
 * The filter of the pages drawn on `MetaPanel`: the ⌘K action list (`views/meta/MetaOverlay.vue`)
 * and the Flow targets (`meta-flow-page.ts`). One matcher, so the same query finds rows the same way
 * on both.
 */

/** The filter field's value as `matchesMetaPanelQuery` reads it: trimmed and lower-cased. */
export function normalizeMetaPanelQuery(value: string): string {
  return value.trim().toLowerCase()
}

/** Whether every query character appears in the text in order (`cp` → "Copy Path"). */
function isSubsequence(query: string, text: string): boolean {
  let cursor = 0
  for (const char of query) {
    const found = text.indexOf(char, cursor)
    if (found === -1) return false
    cursor = found + 1
  }
  return true
}

/**
 * Whether a row matches a query from `normalizeMetaPanelQuery`: the query appears in its label or
 * in one of its details, or the query's letters appear in order in the label. Letters in order
 * count in the label only; spread across a description they would match almost any query. An
 * empty query matches every row.
 */
export function matchesMetaPanelQuery(
  query: string,
  label: string,
  details: ReadonlyArray<string | undefined> = []
): boolean {
  if (!query) return true
  const title = label.toLowerCase()
  return (
    title.includes(query) ||
    details.some((detail) => detail?.toLowerCase().includes(query) === true) ||
    isSubsequence(query, title)
  )
}
