import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const panel = readFileSync(new URL('./IntelligenceAdminPanel.vue', import.meta.url), 'utf8')

describe('IntelligenceAdminPanel service channel consolidation', () => {
  it('embeds Service Channels as an Intelligence tab without navigating away', () => {
    expect(panel).toContain('name="serviceChannels"')
    expect(panel).toContain('<LazyDashboardProviderRegistryAdminPanel />')
    expect(panel).toContain('function openServiceChannels()')
    expect(panel).toContain("activeTab.value = 'serviceChannels'")
    expect(panel).not.toContain("navigateTo('/dashboard/admin/provider-registry')")
  })

  it('mounts Provider Registry only when the Service Channels tab is active', () => {
    expect(panel).toContain('v-if="activeTab === \'serviceChannels\'"')
  })

  it('keeps Intelligence startup scoped to overview data', () => {
    expect(panel).toContain('onMounted(() => {\n  ensureOverviewLoaded()\n})')
    expect(panel).toContain('function ensureProviderAdminLoaded()')
    expect(panel).toContain('function ensureAuditsLoaded()')
  })
})
