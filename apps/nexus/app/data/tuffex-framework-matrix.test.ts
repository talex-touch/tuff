import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPAT_REGISTRY } from '@talex-touch/tuffex-core/compat'
import { describe, expect, it } from 'vitest'
import {
  buildFrameworkImportSnippet,
  buildFrameworkInstallSnippet,
  DOCS_FRAMEWORK_META,
  formatFrameworkStatusLabel,
  formatTierDescription,
  getComponentFrameworkEntry,
  getComponentFrameworkStatus,
  getFrameworkCoverageSummary,
  isComponentReadyInFramework,
  normalizeDocsFramework,
  PHASE_1_READY_IDS,
  PHASE_1_TIER_A_IDS,
  PHASE_1_TIER_B_IDS,
  PHASE_1_TIER_C_IDS,
  resolveComponentSlugFromPath,
  TUFFEX_FRAMEWORK_MAP,
  TUFFEX_FRAMEWORK_MATRIX,
} from './tuffex-framework-matrix'
import { getFrameworkShowcase, TUFFEX_FRAMEWORK_SHOWCASES } from './tuffex-framework-showcases'
import enLocale from '../../i18n/locales/en'
import zhLocale from '../../i18n/locales/zh'

const repoRoot = join(import.meta.dirname, '../../../..')
const componentsIndexPath = join(repoRoot, 'packages/tuffex/packages/components/src/components.ts')
const componentExportPattern = /export\s+\*\s+from\s+['"]\.\/([^/'"]+)\/index['"]/g

function readExportedComponentSlugs() {
  const source = readFileSync(componentsIndexPath, 'utf8')
  return Array.from(source.matchAll(componentExportPattern), match => match[1]!).sort((a, b) => a.localeCompare(b))
}

describe('tuffex-framework-matrix', () => {
  it('covers every single exported module in packages/tuffex/packages/components/src/components.ts', () => {
    const exportedSlugs = readExportedComponentSlugs()
    const matrixSlugs = TUFFEX_FRAMEWORK_MATRIX.map(entry => entry.id).sort((a, b) => a.localeCompare(b))

    expect(exportedSlugs).toHaveLength(193)
    expect(matrixSlugs).toEqual(exportedSlugs)
    expect(TUFFEX_FRAMEWORK_MAP.size).toBe(exportedSlugs.length)
  })

  it('locks the exact 32 Phase-1 ready components across Tier A (18), Tier B (12), and Tier C (2)', () => {
    const expectedReady = [
      // Tier A (18)
      'button', 'badge', 'tag', 'avatar', 'spinner', 'divider', 'alert', 'card', 'kbd',
      'progress', 'progress-bar', 'skeleton', 'switch', 'status-badge', 'status-hint',
      'dot-indicator', 'empty', 'stat-card',
      // Tier B (12)
      'input', 'textarea', 'checkbox', 'radio', 'slider', 'tabs', 'collapse',
      'tooltip', 'popover', 'dialog', 'drawer', 'select',
      // Tier C (2)
      'stream-text', 'markdown-view',
    ].sort((a, b) => a.localeCompare(b))

    expect(PHASE_1_TIER_A_IDS).toHaveLength(18)
    expect(PHASE_1_TIER_B_IDS).toHaveLength(12)
    expect(PHASE_1_TIER_C_IDS).toHaveLength(2)
    expect([...PHASE_1_READY_IDS].sort((a, b) => a.localeCompare(b))).toEqual(expectedReady)

    const reactReady = TUFFEX_FRAMEWORK_MATRIX.filter(entry => entry.react === 'ready').map(entry => entry.id).sort()
    const wcReady = TUFFEX_FRAMEWORK_MATRIX.filter(entry => entry.wc === 'ready').map(entry => entry.id).sort()

    expect(reactReady).toEqual(expectedReady)
    expect(wcReady).toEqual(expectedReady)
  })

  it('marks canonical Tier D scoped-slot / form-context modules as WC unsupported and React planned', () => {
    const canonicalTierD = [
      'data-table',
      'virtual-list',
      'form',
      'tree',
      'cascader',
      'command-palette',
      'conversation-stream',
      'motion-form',
    ]

    for (const slug of canonicalTierD) {
      const entry = getComponentFrameworkEntry(slug)
      expect(entry, `${slug} should exist in matrix`).toBeTruthy()
      expect(entry!.tier).toBe('D')
      expect(entry!.vue).toBe('ready')
      expect(entry!.react).toBe('planned')
      expect(entry!.wc).toBe('unsupported')
      expect(entry!.wcTag).toBeUndefined()
      expect(entry!.notes).toBeTruthy()
      expect(entry!.notesZh).toBeTruthy()
    }
  })

  it('ships complete WC tags, React exports, and interactive showcases for all 32 ready components', () => {
    expect(Object.keys(TUFFEX_FRAMEWORK_SHOWCASES)).toHaveLength(32)

    for (const id of PHASE_1_READY_IDS) {
      const entry = getComponentFrameworkEntry(id)
      expect(entry).toBeTruthy()
      expect(entry!.wcTag).toMatch(/^tx-[a-z0-9-]+$/)
      expect(entry!.reactExports.length).toBeGreaterThan(0)
      for (const symbol of entry!.reactExports)
        expect(symbol).toMatch(/^Tx[A-Z]/)

      const showcase = getFrameworkShowcase(id)
      expect(showcase, `showcase missing for ${id}`).toBeTruthy()
      expect(showcase!.wcTag).toMatch(/^tx-[a-z0-9-]+$/)
      expect(showcase!.wcCode('en')).toContain(`<${showcase!.wcTag}`)
      expect(showcase!.wcCode('zh')).toContain(`<${showcase!.wcTag}`)
      expect(showcase!.reactCode('en')).toContain('@talex-touch/tuffex-react')
      expect(showcase!.reactCode('zh')).toContain('@talex-touch/tuffex-react')
      expect(typeof showcase!.mountWc).toBe('function')
      expect(typeof showcase!.renderReact).toBe('function')
    }
  })

  it('computes dynamic coverage summary counters accurately', () => {
    const summary = getFrameworkCoverageSummary()
    expect(summary.total).toBe(193)
    expect(summary.vue.ready).toBe(193)
    expect(summary.vue.percent).toBe(100)
    expect(summary.react.ready).toBe(32)
    expect(summary.wc.ready).toBe(32)
    expect(summary.wc.unsupported).toBeGreaterThanOrEqual(8)
    expect(summary.react.ready + summary.react.planned + summary.react.experimental + summary.react.unsupported).toBe(193)
    expect(summary.wc.ready + summary.wc.planned + summary.wc.experimental + summary.wc.unsupported).toBe(193)
  })

  it('resolves component slugs from localized and unprefixed docs paths while ignoring overview/template pages', () => {
    expect(resolveComponentSlugFromPath('/docs/dev/components/button')).toBe('button')
    expect(resolveComponentSlugFromPath('/zh/docs/dev/components/stream-text')).toBe('stream-text')
    expect(resolveComponentSlugFromPath('/en/docs/dev/components/markdown-view.en.mdc')).toBe('markdown-view')
    expect(resolveComponentSlugFromPath('/docs/dev/components/data-table?framework=wc#api')).toBe('data-table')
    expect(resolveComponentSlugFromPath('/zh/docs/dev/components/index')).toBeNull()
    expect(resolveComponentSlugFromPath('/en/docs/dev/components/base-suite')).toBeNull()
    expect(resolveComponentSlugFromPath('/en/docs/dev/components/template-shell')).toBeNull()
    expect(resolveComponentSlugFromPath('/en/docs/guide/start')).toBeNull()
  })

  it('generates framework-accurate install/import snippets and localized labels', () => {
    const button = getComponentFrameworkEntry('button')!
    expect(buildFrameworkInstallSnippet('vue', 'pnpm')).toBe('pnpm add @talex-touch/tuffex')
    expect(buildFrameworkInstallSnippet('react', 'npm')).toBe('npm install @talex-touch/tuffex-react')
    expect(buildFrameworkInstallSnippet('wc', 'bun')).toBe('bun add @talex-touch/tuffex-wc')

    expect(buildFrameworkImportSnippet(button, 'vue')).toContain("from '@talex-touch/tuffex/button'")
    expect(buildFrameworkImportSnippet(button, 'react')).toContain("import { TxButton } from '@talex-touch/tuffex-react'")
    expect(buildFrameworkImportSnippet(button, 'wc')).toContain("from '@talex-touch/tuffex-wc'")
    expect(buildFrameworkImportSnippet(button, 'wc')).toContain('<tx-button>')

    expect(DOCS_FRAMEWORK_META.vue.packageName).toBe('@talex-touch/tuffex')
    expect(DOCS_FRAMEWORK_META.react.packageName).toBe('@talex-touch/tuffex-react')
    expect(DOCS_FRAMEWORK_META.wc.packageName).toBe('@talex-touch/tuffex-wc')

    expect(formatFrameworkStatusLabel('ready', 'zh')).toBe('已适配')
    expect(formatFrameworkStatusLabel('ready', 'en')).toBe('Ready')
    expect(formatFrameworkStatusLabel('unsupported', 'zh', 'wc')).toBe('暂不适配 WC')
    expect(formatFrameworkStatusLabel('unsupported', 'en', 'wc')).toBe('Vue & React Only')
    expect(formatTierDescription('A', 'en')).toContain('Tier A')
    expect(formatTierDescription('D', 'zh')).toContain('Tier D')

    expect(isComponentReadyInFramework('button', 'react')).toBe(true)
    expect(isComponentReadyInFramework('data-table', 'wc')).toBe(false)
    expect(getComponentFrameworkStatus('data-table', 'wc')).toBe('unsupported')
    expect(normalizeDocsFramework('web-components')).toBe('wc')
    expect(normalizeDocsFramework('tsx')).toBe('react')
    expect(normalizeDocsFramework('unknown')).toBe('vue')
  })

  it('derives all 193 entries directly from @talex-touch/tuffex-core/compat Single Source of Truth', () => {
    expect(TUFFEX_FRAMEWORK_MATRIX).toHaveLength(COMPAT_REGISTRY.length)
    for (const coreEntry of COMPAT_REGISTRY) {
      const nexusEntry = getComponentFrameworkEntry(coreEntry.id)
      expect(nexusEntry, `missing ${coreEntry.id}`).toBeTruthy()
      expect(nexusEntry!.category).toBe(coreEntry.category)
      expect(nexusEntry!.tier).toBe(coreEntry.tier)
      expect(nexusEntry!.vue).toBe(coreEntry.vue)
      expect(nexusEntry!.react).toBe(coreEntry.react)
      expect(nexusEntry!.wc).toBe(coreEntry.wc)
      expect(nexusEntry!.wcTag).toBe(coreEntry.wcTag)
      if (coreEntry.reactExports)
        expect(nexusEntry!.reactExports).toEqual(coreEntry.reactExports)
    }
    expect(getComponentFrameworkEntry('stream-text')?.reactExports).toEqual(['TxStreamText', 'TxStreamCaret'])
  })

  it('keeps docs.framework i18n keys synchronized between en and zh locales', () => {
    const flattenKeys = (obj: Record<string, unknown>, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([key, value]) => {
        const next = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object' && !Array.isArray(value))
          return flattenKeys(value as Record<string, unknown>, next)
        return [next]
      })

    const enKeys = flattenKeys((enLocale as any).docs.framework).sort()
    const zhKeys = flattenKeys((zhLocale as any).docs.framework).sort()
    expect(enKeys.length).toBeGreaterThan(20)
    expect(zhKeys).toEqual(enKeys)
  })
})
