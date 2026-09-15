import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nav = readFileSync(new URL('./AdminNav.vue', import.meta.url), 'utf8')

/**
 * This file used to pin the opposite policy: Provider Registry was folded into
 * an Intelligence tab and asserted *not* to be its own entry. The console has
 * since made the rail its only navigation surface, so those assertions were
 * describing the bug rather than the contract, and the routing/label behaviour
 * they meant to protect is covered executably in `AdminNav.routing.test.ts`.
 *
 * What is left here is the one thing that test cannot see: credits never came
 * back as a navigable destination. `/admin/credits` is a redirect stub into
 * users, and a menu entry for it would send readers to a page that immediately
 * forwards somewhere else.
 */
describe('adminNav credit navigation', () => {
  it('does not expose standalone credit navigation items', () => {
    expect(nav).not.toContain('dashboard.sections.menu.credits')
    expect(nav).not.toContain('dashboard.sections.menu.adminCredits')
    expect(nav).not.toContain("'adminCredits': '/admin/credits'")
    expect(nav).not.toContain("credits: '/admin/credits'")
  })
})
