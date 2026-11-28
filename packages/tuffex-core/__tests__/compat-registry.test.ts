import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BASE_READY_IDS,
  COMPAT_MAP,
  COMPAT_REGISTRY,
  getCompatByCategory,
  getCompatEntry,
  getCompatSummary,
  PHASE_1_READY_IDS,
  READY_COMPONENT_IDS,
} from '../src/compat-registry'

const here = dirname(fileURLToPath(import.meta.url))
const tuffexSrcRoot = resolve(here, '../../tuffex/packages/components/src')

function extractExportedModules(filePath: string, prefix: string): string[] {
  const source = readFileSync(filePath, 'utf-8')
  const re = new RegExp(`export \\* from ['"]${prefix.replaceAll('.', '\\.')}([^/]+)/index['"]`, 'g')
  return Array.from(source.matchAll(re), m => m[1]!)
}

const BASE_TIER_D_IDS = [
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

describe('compat-registry Single Source of Truth', () => {
  const componentIds = extractExportedModules(resolve(tuffexSrcRoot, 'components.ts'), './')
  const baseIds = new Set(extractExportedModules(resolve(tuffexSrcRoot, 'base/index.ts'), '../'))
  const proIds = new Set(extractExportedModules(resolve(tuffexSrcRoot, 'pro/index.ts'), '../'))
  const aiIds = new Set(extractExportedModules(resolve(tuffexSrcRoot, 'ai/index.ts'), '../'))

  it('covers every single module exported by packages/tuffex/packages/components/src/components.ts with zero drift', () => {
    expect(componentIds).toHaveLength(198)
    expect(COMPAT_REGISTRY).toHaveLength(componentIds.length)
    expect(COMPAT_MAP.size).toBe(componentIds.length)

    const registryIds = COMPAT_REGISTRY.map(entry => entry.id)
    const missing = componentIds.filter(id => !COMPAT_MAP.has(id))
    const extra = registryIds.filter(id => !componentIds.includes(id))

    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('matches TuffEx base/pro/ai suite taxonomy exactly', () => {
    expect(baseIds.size).toBe(99)
    expect(proIds.size).toBe(62)
    expect(aiIds.size).toBe(37)

    for (const entry of COMPAT_REGISTRY) {
      const expectedCategory = baseIds.has(entry.id)
        ? 'base'
        : proIds.has(entry.id)
          ? 'pro'
          : aiIds.has(entry.id)
            ? 'ai'
            : null
      expect(expectedCategory, `category for ${entry.id}`).not.toBeNull()
      expect(entry.category, `category mismatch for ${entry.id}`).toBe(expectedCategory)
      expect(entry.vue).toBe('ready')
    }
  })

  it('marks all 99/99 Basics Suite modules plus stream-text (100/195 total) as react:ready and wc:ready', () => {
    const baseEntries = getCompatByCategory('base')
    expect(baseEntries).toHaveLength(99)
    expect(BASE_READY_IDS).toHaveLength(99)
    expect(READY_COMPONENT_IDS).toHaveLength(100)
    expect(PHASE_1_READY_IDS).toHaveLength(100)

    const expectedReady = [...baseIds, 'stream-text'].sort()
    expect([...READY_COMPONENT_IDS].sort()).toEqual(expectedReady)

    for (const entry of baseEntries) {
      expect(entry.react, `react ready for ${entry.id}`).toBe('ready')
      expect(entry.wc, `wc ready for ${entry.id}`).toBe('ready')
      expect(entry.wcTag, `wcTag for ${entry.id}`).toBe(`tx-${entry.id}`)
      expect(entry.reactExports?.length, `reactExports for ${entry.id}`).toBeGreaterThan(0)
      for (const sym of entry.reactExports ?? [])
        expect(sym, `symbol format for ${entry.id}`).toMatch(/^Tx[A-Z]/)
    }

    expect(getCompatEntry('stream-text')?.reactExports).toEqual(['TxStreamText', 'TxStreamCaret'])
    expect(getCompatEntry('container')?.reactExports).toEqual(['TxContainer', 'TxHeader', 'TxAside', 'TxMain', 'TxFooter'])
    expect(getCompatEntry('form')?.reactExports).toEqual(['TxForm', 'TxFormItem', 'TxFormRow', 'TxFormErrorSummary'])
    expect(getCompatEntry('group-block')?.reactExports).toEqual(['TxGroupBlock', 'TxBlockLine', 'TxBlockSlot', 'TxBlockSwitch'])
    expect(getCompatEntry('data-table')?.reactExports).toEqual(['TxDataTable'])
  })

  it('documents JSON/property + Light DOM slot notes on all 14 Base Tier D modules and keeps Pro/AI modules unchanged', () => {
    expect(BASE_TIER_D_IDS).toHaveLength(14)
    for (const id of BASE_TIER_D_IDS) {
      const entry = getCompatEntry(id)
      expect(entry, `missing base Tier D entry ${id}`).toBeDefined()
      expect(entry?.category).toBe('base')
      expect(entry?.tier).toBe('D')
      expect(entry?.react).toBe('ready')
      expect(entry?.wc).toBe('ready')
      expect(entry?.wcTag).toBe(`tx-${id}`)
      expect(entry?.notes).toContain('JSON/property-driven')
      expect(entry?.notes).toContain('Light DOM slots')
    }

    const proEntries = getCompatByCategory('pro')
    expect(proEntries).toHaveLength(62)
    for (const entry of proEntries) {
      expect(entry.react).toBe('planned')
      expect(entry.wc).not.toBe('ready')
    }

    const aiNonStream = getCompatByCategory('ai').filter(entry => entry.id !== 'stream-text')
    expect(aiNonStream).toHaveLength(36)
    for (const entry of aiNonStream) {
      expect(entry.react).toBe('planned')
      expect(entry.wc).not.toBe('ready')
    }

    const remainingTierDUnsupported = [
      'virtual-list',
      'command-palette',
      'conversation-stream',
      'motion-form',
    ]
    for (const id of remainingTierDUnsupported) {
      const entry = getCompatEntry(id)
      expect(entry?.tier).toBe('D')
      expect(entry?.react).toBe('planned')
      expect(entry?.wc).toBe('unsupported')
      expect(entry?.notes?.trim().length).toBeGreaterThan(10)
    }

    const summary = getCompatSummary()
    expect(summary.total).toBe(198)
    expect(summary.byCategory).toEqual({ base: 99, pro: 62, ai: 37 })
    expect(summary.vueReady).toBe(198)
    expect(summary.reactReady).toBe(100)
    expect(summary.wcReady).toBe(100)
    expect(summary.wcUnsupported).toBe(summary.byTier.D - BASE_TIER_D_IDS.length)
  })
})
