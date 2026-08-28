import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('./reviews.vue', import.meta.url), 'utf8')

describe('review moderation failure recovery', () => {
  // A failed approve/reject used to render `actionError` as a `v-else-if` in the
  // same chain as the list, so one 500 replaced all 20 cards with the error text.
  // Nothing cleared the flag afterwards, so Refresh re-fetched successfully and
  // still rendered the error: the page was a dead end until a full reload.
  it('keeps the pending list mounted when an action fails', () => {
    expect(page).toContain('<div v-if="actionError"')
    expect(page).not.toContain('v-else-if="actionError"')
  })

  it('clears the action error when the list reloads, so Refresh recovers', () => {
    expect(page).toContain('pendingError.value = null\n  actionError.value = null')
  })

  // The error branch replaces the list, so a "Load more" underneath it appends
  // rows nobody can see.
  it('does not strand the load-more control under a load error', () => {
    expect(page).toContain('v-if="hasMore && !pendingError"')
  })
})
