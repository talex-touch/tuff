import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const nav = readFileSync(new URL('./AdminNav.vue', import.meta.url), 'utf8')

describe('adminNav Intelligence consolidation', () => {
  it('uses the Lab module as the single Intelligence entry', () => {
    expect(nav).toContain("label: t('dashboard.sections.menu.intelligence', '实验场')")
  })

  it('keeps provider registry routed through the Intelligence section', () => {
    expect(nav).toContain("'provider-registry': '/admin/provider-registry'")
    expect(nav).toContain("if (route.path.startsWith('/admin/provider-registry'))\n    return 'intelligence'")
  })

  it('does not expose Provider Registry as a separate menu item', () => {
    const itemsStart = nav.indexOf('const menuItems = computed')
    const itemsEnd = nav.indexOf('const isDesktop')
    const items = nav.slice(itemsStart, itemsEnd)

    expect(items).not.toContain("id: 'provider-registry'")
    expect(items).not.toContain('dashboard.sections.menu.providerRegistry')
  })

  it('does not expose standalone credit navigation items', () => {
    expect(nav).not.toContain('dashboard.sections.menu.credits')
    expect(nav).not.toContain('dashboard.sections.menu.adminCredits')
    expect(nav).not.toContain("'adminCredits': '/admin/credits'")
    expect(nav).not.toContain("route.path.startsWith('/admin/credits')")
  })
})
