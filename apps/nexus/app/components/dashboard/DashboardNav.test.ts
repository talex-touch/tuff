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

  it('uses the Lab module as the single Intelligence sidebar entry', () => {
    expect(nav).toContain("label: t('dashboard.sections.menu.intelligence', '实验场')")
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

  it('does not expose standalone credit navigation items', () => {
    const workspaceItemsStart = nav.indexOf('const workspaceMenuItems = computed')
    const workspaceItemsEnd = nav.indexOf('const accountMenuItems = computed')
    const workspaceItems = nav.slice(workspaceItemsStart, workspaceItemsEnd)

    expect(workspaceItems).not.toContain("id: 'credits'")
    expect(nav).not.toContain('dashboard.sections.menu.credits')
    expect(nav).not.toContain('dashboard.sections.menu.adminCredits')
    expect(nav).not.toContain("'adminCredits': '/dashboard/admin/credits'")
    expect(nav).not.toContain("route.path.startsWith('/dashboard/credits')")
    expect(nav).not.toContain("route.path.startsWith('/dashboard/admin/credits')")
  })
})
