import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const panel = readFileSync(new URL('./IntelligenceAdminPanel.vue', import.meta.url), 'utf8')

describe('IntelligenceAdminPanel service channel consolidation', () => {
  it('removes the legacy provider summary tab so Service Channels is the configuration home', () => {
    expect(panel).not.toContain('name="providers"')
    expect(panel).not.toContain("dashboard.sections.intelligence.tabs.providers")
    expect(panel).not.toContain("dashboard.sections.intelligence.providers.modelsTitle")
    expect(panel).not.toContain("dashboard.sections.intelligence.providers.modelsSubtitle")
    expect(panel).toContain('<LazyDashboardProviderRegistryAdminPanel />')
  })

  it('embeds Service Channels as an Intelligence tab without navigating away', () => {
    expect(panel).toContain('name="serviceChannels"')
    expect(panel).toContain('<LazyDashboardProviderRegistryAdminPanel />')
    expect(panel).not.toContain("navigateTo('/dashboard/admin/provider-registry')")
  })

  it('mounts Provider Registry only when the Service Channels tab is active', () => {
    expect(panel).toContain('v-if="activeTab === \'serviceChannels\'"')
  })

  it('keeps Intelligence startup scoped to overview data', () => {
    expect(panel).toContain('onMounted(() => {\n  ensureOverviewLoaded()\n})')
    expect(panel).toContain('function ensureAuditsLoaded()')
  })
})

/** Opening `<section ...>` tag that encloses the first occurrence of `marker`. */
function sectionTagFor(marker: string): string {
  const markerIndex = panel.indexOf(marker)
  expect(markerIndex, `marker not found: ${marker}`).toBeGreaterThan(-1)
  const openIndex = panel.lastIndexOf('<section', markerIndex)
  expect(openIndex, `no enclosing <section> for: ${marker}`).toBeGreaterThan(-1)
  return panel.slice(openIndex, panel.indexOf('>', openIndex) + 1)
}

describe('IntelligenceAdminPanel risk-control gating', () => {
  // server/middleware/feature-gates.ts gates /api/dashboard/intelligence/ip-bans and
  // nothing else under /api/dashboard/intelligence, so only the ban panel may depend
  // on the flag. Overview and usage are plain requireAdmin routes.
  it('gates the IP ban panel on the risk-control flag', () => {
    expect(sectionTagFor('overview.ipBans.title')).toContain('v-if="ipBanFeatureAvailable"')
  })

  it('does not gate ungated overview and usage panels on the ip-ban flag', () => {
    expect(sectionTagFor('overview.title')).not.toContain('ipBanFeatureAvailable')
    expect(sectionTagFor('overview.userUsage.title')).not.toContain('ipBanFeatureAvailable')
  })

  it('never shows the ban form and its "panel is hidden" notice at the same time', () => {
    const banGated = sectionTagFor('overview.ipBans.title').includes('v-if="ipBanFeatureAvailable"')
    const noticeGated = sectionTagFor('overview.ipBans.unavailable').includes('v-if="!ipBanFeatureAvailable"')
    expect(banGated && noticeGated).toBe(true)
  })

  it('seeds availability from the deploy flag instead of assuming enabled', () => {
    expect(panel).toContain('ref(isFeatureFlagEnabled(runtimeConfig.public?.riskControl?.enabled))')
    expect(panel).not.toContain('const ipBanFeatureAvailable = ref(true)')
  })
})

describe('IntelligenceAdminPanel failure states stay distinct from empty states', () => {
  it('does not render zeroed summary cards when overview data is absent', () => {
    expect(panel).toContain('v-else-if="overviewData" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"')
    expect(panel).not.toContain('{{ overviewData?.summary.totalRequests ?? 0 }}')
    expect(panel).not.toContain('overviewData?.summary.sampleSize || 0')
  })

  it('does not claim "no audit records" while an audit load error is showing', () => {
    const emptyIndex = panel.indexOf('dashboard.sections.intelligence.audit.empty')
    const openIndex = panel.lastIndexOf('<div', emptyIndex)
    expect(panel.slice(openIndex, emptyIndex)).toContain('v-else-if="!auditError"')
  })

  it('only claims audit logging is disabled once settings actually loaded', () => {
    expect(panel).toContain('v-if="settingsLoaded && !settings.enableAudit"')
    expect(panel).not.toContain('catch {}')
  })
})

describe('IntelligenceAdminPanel dead UI', () => {
  // `error` was declared, rendered as a dismissible banner, and never assigned, so
  // the panel appeared to have a general error surface that could not fire.
  it('has no unreachable dismissible error banner', () => {
    expect(panel).not.toContain('@click="error = null"')
    expect(panel).not.toContain('const error = ref<string | null>(null)')
  })
})
