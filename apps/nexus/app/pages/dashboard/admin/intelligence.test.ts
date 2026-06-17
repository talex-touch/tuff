import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('dashboard intelligence admin page contract', () => {
  it('uses the generated lazy admin panel component name', () => {
    const page = readFileSync(new URL('./intelligence.vue', import.meta.url), 'utf8')

    expect(page).toContain('<LazyDashboardIntelligenceAdminPanel />')
    expect(page).not.toContain('LazyDashboardIntelligenceIntelligenceAdminPanel')
  })
})
