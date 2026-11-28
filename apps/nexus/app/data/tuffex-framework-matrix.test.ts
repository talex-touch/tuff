import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COMPAT_REGISTRY } from '@talex-touch/tuffex-core/compat'
import { describe, expect, it } from 'vitest'
import enLocale from '../../i18n/locales/en'
import zhLocale from '../../i18n/locales/zh'
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
  PHASE_1_TIER_D_IDS,
  READY_COMPONENT_IDS,
  resolveComponentSlugFromPath,
  TUFFEX_FRAMEWORK_MAP,
  TUFFEX_FRAMEWORK_MATRIX,
} from './tuffex-framework-matrix'
import { getFrameworkShowcase, TUFFEX_FRAMEWORK_SHOWCASES } from './tuffex-framework-showcases'

const repoRoot = join(import.meta.dirname, '../../../..')
const componentsIndexPath = join(repoRoot, 'packages/tuffex/packages/components/src/components.ts')
const baseIndexPath = join(repoRoot, 'packages/tuffex/packages/components/src/base/index.ts')
const componentExportPattern = /export\s+\*\s+from\s+['"]\.\/([^/'"]+)\/index['"]/g
const baseExportPattern = /export\s+\*\s+from\s+['"]\.\.\/([^/'"]+)\/index['"]/g

function readExportedComponentSlugs() {
  const source = readFileSync(componentsIndexPath, 'utf8')
  return Array.from(source.matchAll(componentExportPattern), match => match[1]!).sort((a, b) => a.localeCompare(b))
}

function readBaseSuiteSlugs() {
  const source = readFileSync(baseIndexPath, 'utf8')
  return Array.from(source.matchAll(baseExportPattern), match => match[1]!).sort((a, b) => a.localeCompare(b))
}

const BASE_TIER_D_SLUGS = [
  'data-table',
  'form',
  'modal-form',
  'drawer-form',
  'steps-form',
  'tree',
  'tree-select',
  'cascader',
  'transfer',
  'sortable-list',
  'context-menu',
  'dropdown-menu',
  'flat-dropdown',
  'selection-actions',
] as const

describe('tuffex-framework-matrix', () => {
  it('covers every single exported module in packages/tuffex/packages/components/src/components.ts', () => {
    const exportedSlugs = readExportedComponentSlugs()
    const matrixSlugs = TUFFEX_FRAMEWORK_MATRIX.map(entry => entry.id).sort((a, b) => a.localeCompare(b))

    expect(exportedSlugs).toHaveLength(195)
    expect(matrixSlugs).toEqual(exportedSlugs)
    expect(TUFFEX_FRAMEWORK_MAP.size).toBe(exportedSlugs.length)
  })

  it('covers 99/99 Basics Suite modules plus stream-text (100/195 total) across React and WC', () => {
    const baseSlugs = readBaseSuiteSlugs()
    expect(baseSlugs).toHaveLength(99)

    const expectedReady = [...baseSlugs, 'stream-text'].sort((a, b) => a.localeCompare(b))
    expect(expectedReady).toHaveLength(100)

    expect(READY_COMPONENT_IDS).toHaveLength(100)
    expect(PHASE_1_READY_IDS).toHaveLength(100)
    expect(
      PHASE_1_TIER_A_IDS.length
      + PHASE_1_TIER_B_IDS.length
      + PHASE_1_TIER_C_IDS.length
      + PHASE_1_TIER_D_IDS.length,
    ).toBe(100)
    expect(PHASE_1_TIER_D_IDS).toHaveLength(14)
    expect([...READY_COMPONENT_IDS].sort((a, b) => a.localeCompare(b))).toEqual(expectedReady)

    const reactReady = TUFFEX_FRAMEWORK_MATRIX.filter(entry => entry.react === 'ready').map(entry => entry.id).sort()
    const wcReady = TUFFEX_FRAMEWORK_MATRIX.filter(entry => entry.wc === 'ready').map(entry => entry.id).sort()
    const baseReactReady = TUFFEX_FRAMEWORK_MATRIX.filter(entry => entry.category === 'base' && entry.react === 'ready')
    const baseWcReady = TUFFEX_FRAMEWORK_MATRIX.filter(entry => entry.category === 'base' && entry.wc === 'ready')

    expect(baseReactReady).toHaveLength(99)
    expect(baseWcReady).toHaveLength(99)
    expect(reactReady).toEqual(expectedReady)
    expect(wcReady).toEqual(expectedReady)
  })

  it('keeps JSON/Light-DOM notes on all 14 Base Tier D modules and marks Pro/AI Tier D modules as WC unsupported', () => {
    for (const slug of BASE_TIER_D_SLUGS) {
      const entry = getComponentFrameworkEntry(slug)
      expect(entry, `${slug} should exist in matrix`).toBeTruthy()
      expect(entry!.category).toBe('base')
      expect(entry!.tier).toBe('D')
      expect(entry!.vue).toBe('ready')
      expect(entry!.react).toBe('ready')
      expect(entry!.wc).toBe('ready')
      expect(entry!.wcTag).toBe(`tx-${slug}`)
      expect(entry!.notes).toContain('JSON/property-driven')
      expect(entry!.notesZh).toBeTruthy()
    }

    const nonBaseTierD = [
      'virtual-list',
      'command-palette',
      'conversation-stream',
      'motion-form',
    ]

    for (const slug of nonBaseTierD) {
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

  it('ships complete WC tags, React exports, and interactive SSR-safe showcases for all 100 ready components', () => {
    expect(Object.keys(TUFFEX_FRAMEWORK_SHOWCASES)).toHaveLength(100)

    const fakeReact = {
      Fragment: Symbol.for('react.fragment'),
      useState: <T>(initial: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void] => [
        typeof initial === 'function' ? (initial as () => T)() : initial,
        () => {},
      ],
      createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => ({
        type,
        props: props ?? null,
        children,
      }),
    }

    for (const id of READY_COMPONENT_IDS) {
      const entry = getComponentFrameworkEntry(id)
      expect(entry).toBeTruthy()
      expect(entry!.wcTag).toMatch(/^tx-[a-z0-9-]+$/)
      expect(entry!.reactExports.length).toBeGreaterThan(0)
      for (const symbol of entry!.reactExports)
        expect(symbol).toMatch(/^Tx[A-Z]/)

      const showcase = getFrameworkShowcase(id)
      expect(showcase, `showcase missing for ${id}`).toBeTruthy()
      expect(showcase!.id).toBe(id)
      expect(showcase!.wcTag).toMatch(/^tx-[a-z0-9-]+$/)
      expect(showcase!.wcCode('en').trim().length).toBeGreaterThan(10)
      expect(showcase!.wcCode('zh').trim().length).toBeGreaterThan(10)
      expect(showcase!.wcCode('en')).toContain(`<${showcase!.wcTag}`)
      expect(showcase!.wcCode('zh')).toContain(`<${showcase!.wcTag}`)
      expect(showcase!.reactCode('en').trim().length).toBeGreaterThan(10)
      expect(showcase!.reactCode('zh').trim().length).toBeGreaterThan(10)
      expect(showcase!.reactCode('en')).toContain('@talex-touch/tuffex-react')
      expect(showcase!.reactCode('zh')).toContain('@talex-touch/tuffex-react')
      expect(showcase!.reactCode('en')).toContain(entry!.reactExports[0]!)
      expect(typeof showcase!.mountWc).toBe('function')
      expect(typeof showcase!.renderReact).toBe('function')

      const mockLib = Object.fromEntries(entry!.reactExports.map(sym => [sym, sym]))
      const renderedEn = showcase!.renderReact(fakeReact, mockLib, 'en') as { type?: unknown }
      const renderedZh = showcase!.renderReact(fakeReact, mockLib, 'zh') as { type?: unknown }
      expect(renderedEn).toBeTruthy()
      expect(renderedZh).toBeTruthy()
      if (typeof renderedEn.type === 'function')
        expect((renderedEn.type as () => unknown)()).toBeTruthy()
      if (typeof renderedZh.type === 'function')
        expect((renderedZh.type as () => unknown)()).toBeTruthy()
    }
  })

  it('computes dynamic coverage summary counters accurately', () => {
    const summary = getFrameworkCoverageSummary()
    expect(summary.total).toBe(195)
    expect(summary.vue.ready).toBe(195)
    expect(summary.vue.percent).toBe(100)
    expect(summary.react.ready).toBe(100)
    expect(summary.wc.ready).toBe(100)
    expect(summary.byCategory.base).toEqual({ total: 99, reactReady: 99, wcReady: 99 })
    expect(summary.byCategory.pro).toEqual({ total: 59, reactReady: 0, wcReady: 0 })
    expect(summary.byCategory.ai).toEqual({ total: 37, reactReady: 1, wcReady: 1 })
    expect(summary.wc.unsupported).toBeGreaterThanOrEqual(8)
    expect(summary.react.ready + summary.react.planned + summary.react.experimental + summary.react.unsupported).toBe(195)
    expect(summary.wc.ready + summary.wc.planned + summary.wc.experimental + summary.wc.unsupported).toBe(195)
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
    expect(isComponentReadyInFramework('data-table', 'react')).toBe(true)
    expect(isComponentReadyInFramework('data-table', 'wc')).toBe(true)
    expect(isComponentReadyInFramework('virtual-list', 'wc')).toBe(false)
    expect(getComponentFrameworkStatus('virtual-list', 'wc')).toBe('unsupported')
    expect(normalizeDocsFramework('web-components')).toBe('wc')
    expect(normalizeDocsFramework('tsx')).toBe('react')
    expect(normalizeDocsFramework('unknown')).toBe('vue')
  })

  it('derives all 195 entries directly from @talex-touch/tuffex-core/compat Single Source of Truth', () => {
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

    const flattenValues = (obj: Record<string, unknown>): string[] =>
      Object.values(obj).flatMap(value =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? flattenValues(value as Record<string, unknown>)
          : [String(value)],
      )

    for (const msg of [...flattenValues((enLocale as any).docs.framework), ...flattenValues((zhLocale as any).docs.framework)]) {
      expect(msg, `HTML angle bracket in vue-i18n message: ${msg}`).not.toMatch(/[<>]/)
    }
  })
})
