import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nav = readFileSync(new URL('./DashboardNav.vue', import.meta.url), 'utf8')

describe('dashboardNav rail', () => {
  it('keeps the sidebar sticky and internally scrollable', () => {
    expect(nav).toContain('sticky top-24')
    expect(nav).toContain('max-h-[calc(100vh-6rem)]')
    expect(nav).toContain('self-start')
    expect(nav).toContain('overflow-y-auto')
  })

  it('does not expose standalone credit navigation items', () => {
    const workspaceItemsStart = nav.indexOf('const workspaceMenuItems = computed')
    const workspaceItemsEnd = nav.indexOf('const accountMenuItems = computed')
    const workspaceItems = nav.slice(workspaceItemsStart, workspaceItemsEnd)

    expect(workspaceItems).not.toContain("id: 'credits'")
    expect(nav).not.toContain('dashboard.sections.menu.credits')
    expect(nav).not.toContain('dashboard.sections.menu.adminCredits')
    expect(nav).not.toContain("route.path.startsWith('/dashboard/credits')")
  })

  it('carries no administrator section any more', () => {
    // The console is its own shell with its own rail. These are the shapes that
    // would bring the second copy back: an admin group, its section heading, or
    // a console href smuggled into the workspace tables.
    expect(nav).not.toContain('adminMenuItems')
    expect(nav).not.toContain('dashboard.sections.menu.adminTitle')
    expect(nav).not.toContain('riskControlEnabled')
    expect(nav).not.toContain('/admin/')
  })
})
