import { describe, expect, it } from 'vitest'
import { filterContentComponentsTemplate, isMdcContentComponent } from './nexus-content-components'

describe('nexus-content-components', () => {
  it('keeps MDC content/docs/global/manifest components while excluding non-MDC app components', () => {
    const manifest = new Set(['CustomManifestWidget'])

    expect(isMdcContentComponent({
      pascalName: 'TuffDemoWrapper',
      filePath: '/repo/apps/nexus/app/components/content/TuffDemoWrapper.vue',
    }, manifest)).toBe(true)

    expect(isMdcContentComponent({
      pascalName: 'DocsComponentsGallery',
      filePath: '/repo/apps/nexus/app/components/docs/DocsComponentsGallery.vue',
    }, manifest)).toBe(true)

    expect(isMdcContentComponent({
      pascalName: 'GlobalBanner',
      filePath: '/repo/apps/nexus/app/components/global/GlobalBanner.vue',
      global: true,
    }, manifest)).toBe(true)

    expect(isMdcContentComponent({
      pascalName: 'CustomManifestWidget',
      filePath: '/repo/apps/nexus/app/components/dashboard/CustomManifestWidget.vue',
    }, manifest)).toBe(true)

    expect(isMdcContentComponent({
      pascalName: 'AdminUsersTable',
      filePath: '/repo/apps/nexus/app/components/admin/AdminUsersTable.vue',
    }, manifest)).toBe(false)

    expect(isMdcContentComponent({
      pascalName: 'DashboardOverviewCard',
      filePath: '/repo/apps/nexus/app/components/dashboard/DashboardOverviewCard.vue',
    }, manifest)).toBe(false)

    expect(isMdcContentComponent({
      pascalName: 'TxButton',
      filePath: '@talex-touch/tuffex/button',
    }, manifest)).toBe(false)
  })

  it('filters content/components.ts in dev without mutating app.components for page auto-imports', () => {
    const seenInTemplate: string[][] = []
    const originalComponents = [
      { pascalName: 'TuffDemoWrapper', filePath: '/repo/apps/nexus/app/components/content/TuffDemoWrapper.vue' },
      { pascalName: 'DocsComponentsGallery', filePath: '/repo/apps/nexus/app/components/docs/DocsComponentsGallery.vue' },
      { pascalName: 'AdminSubscriptionsPanel', filePath: '/repo/apps/nexus/app/components/admin/AdminSubscriptionsPanel.vue' },
      { pascalName: 'DashboardMetricsPanel', filePath: '/repo/apps/nexus/app/components/dashboard/DashboardMetricsPanel.vue' },
      { pascalName: 'AssetsUploadForm', filePath: '/repo/apps/nexus/app/components/assets/AssetsUploadForm.vue' },
      { pascalName: 'AuthSignInCard', filePath: '/repo/apps/nexus/app/components/auth/AuthSignInCard.vue' },
      { pascalName: 'UpdatesAllView', filePath: '/repo/apps/nexus/app/components/updates/UpdatesAllView.vue' },
      { pascalName: 'SearchModal', filePath: '/repo/apps/nexus/app/components/search/SearchModal.vue' },
      { pascalName: 'TxButton', filePath: '@talex-touch/tuffex/button' },
    ]

    const template = {
      filename: 'content/components.ts',
      getContents: (ctx: { app: { components: Array<{ pascalName?: string }> } }) => {
        seenInTemplate.push(ctx.app.components.map(c => c.pascalName ?? ''))
        return ''
      },
    }

    filterContentComponentsTemplate({ templates: [template] })
    // Calling the hook repeatedly (e.g. HMR template updates) must stay idempotent.
    filterContentComponentsTemplate({ templates: [template] })

    template.getContents({
      app: { components: originalComponents },
      nuxt: { options: { dev: true } },
      options: { manifest: { components: ['TxAlert'] } },
    })

    expect(seenInTemplate[0]).toEqual(['TuffDemoWrapper', 'DocsComponentsGallery'])
    // Original app.components array must remain completely untouched for Nuxt page auto-imports.
    expect(originalComponents).toHaveLength(9)
  })

  it('passes through untouched in production builds', () => {
    const seen: string[][] = []
    const components = [
      { pascalName: 'AdminSubscriptionsPanel', filePath: '/repo/apps/nexus/app/components/admin/AdminSubscriptionsPanel.vue' },
    ]
    const template = {
      filename: 'content/components.ts',
      getContents: (ctx: { app: { components: Array<{ pascalName?: string }> } }) => {
        seen.push(ctx.app.components.map(c => c.pascalName ?? ''))
        return ''
      },
    }

    filterContentComponentsTemplate({ templates: [template] })
    template.getContents({
      app: { components },
      nuxt: { options: { dev: false } },
      options: { manifest: { components: [] } },
    })

    expect(seen[0]).toEqual(['AdminSubscriptionsPanel'])
  })
})
