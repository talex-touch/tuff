import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nav = readFileSync(new URL('./DashboardNav.vue', import.meta.url), 'utf8')

describe('DashboardNav Intelligence consolidation', () => {
  it('keeps the sidebar sticky and internally scrollable', () => {
    expect(nav).toContain('sticky top-24')
    expect(nav).toContain('max-h-[calc(100vh-6rem)]')
    expect(nav).toContain('self-start')
    expect(nav).toContain('overflow-y-auto')
  })

  it('keeps provider registry routed through the Intelligence navigation section', () => {
    expect(nav).toContain("'provider-registry': '/dashboard/admin/provider-registry'")
    expect(nav).toContain("if (route.path.startsWith('/dashboard/admin/provider-registry'))\n    return 'intelligence'")
  })

  it('does not expose Provider Registry as a separate admin menu item', () => {
    const adminItemsStart = nav.indexOf('const adminMenuItems = computed')
    const adminItemsEnd = nav.indexOf('const activeSection = computed')
    const adminItems = nav.slice(adminItemsStart, adminItemsEnd)

    expect(adminItems).not.toContain("id: 'provider-registry'")
    expect(adminItems).not.toContain("dashboard.sections.menu.providerRegistry")
  })
})
