import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  COMPAT_MAP,
  COMPAT_REGISTRY,
  PHASE_1_READY_IDS,
  getCompatEntry,
  getCompatSummary,
} from '../src/compat-registry'

const here = dirname(fileURLToPath(import.meta.url))
const tuffexSrcRoot = resolve(here, '../../tuffex/packages/components/src')

function extractExportedModules(filePath: string, prefix: string): string[] {
  const source = readFileSync(filePath, 'utf-8')
  const re = new RegExp(`export \\* from ['"]${prefix.replaceAll('.', '\\.')}([^/]+)/index['"]`, 'g')
  return Array.from(source.matchAll(re), m => m[1]!)
}

const EXPECTED_PHASE_1_TIER_A = [
  'button', 'badge', 'tag', 'avatar', 'spinner', 'divider', 'alert', 'card',
  'kbd', 'progress', 'progress-bar', 'skeleton', 'switch', 'status-badge',
  'status-hint', 'dot-indicator', 'empty', 'stat-card',
] as const

const EXPECTED_PHASE_1_TIER_B = [
  'input', 'textarea', 'checkbox', 'radio', 'slider', 'tabs', 'collapse',
  'tooltip', 'popover', 'dialog', 'drawer', 'select',
] as const

const EXPECTED_PHASE_1_TIER_C = [
  'stream-text', 'markdown-view',
] as const

const EXPECTED_PHASE_1 = [
  ...EXPECTED_PHASE_1_TIER_A,
  ...EXPECTED_PHASE_1_TIER_B,
  ...EXPECTED_PHASE_1_TIER_C,
]

describe('compat-registry Single Source of Truth', () => {
  const componentIds = extractExportedModules(resolve(tuffexSrcRoot, 'components.ts'), './')
  const baseIds = new Set(extractExportedModules(resolve(tuffexSrcRoot, 'base/index.ts'), '../'))
  const proIds = new Set(extractExportedModules(resolve(tuffexSrcRoot, 'pro/index.ts'), '../'))
  const aiIds = new Set(extractExportedModules(resolve(tuffexSrcRoot, 'ai/index.ts'), '../'))

  it('covers every single module exported by packages/tuffex/packages/components/src/components.ts with zero drift', () => {
    expect(componentIds).toHaveLength(193)
    expect(COMPAT_REGISTRY).toHaveLength(componentIds.length)
    expect(COMPAT_MAP.size).toBe(componentIds.length)

    const registryIds = COMPAT_REGISTRY.map(entry => entry.id)
    const missing = componentIds.filter(id => !COMPAT_MAP.has(id))
    const extra = registryIds.filter(id => !componentIds.includes(id))

    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('matches TuffEx base/pro/ai suite taxonomy exactly', () => {
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

  it('marks the exact 32 Phase-1 modules as react:ready and wc:ready with correct tiers and metadata', () => {
    expect(EXPECTED_PHASE_1).toHaveLength(32)
    expect(PHASE_1_READY_IDS).toHaveLength(32)
    expect([...PHASE_1_READY_IDS].sort()).toEqual([...EXPECTED_PHASE_1].sort())

    for (const id of EXPECTED_PHASE_1_TIER_A) {
      const entry = getCompatEntry(id)
      expect(entry?.tier, `tier A for ${id}`).toBe('A')
      expect(entry?.react).toBe('ready')
      expect(entry?.wc).toBe('ready')
      expect(entry?.wcTag).toBe(`tx-${id}`)
      expect(entry?.reactExports?.length).toBeGreaterThan(0)
    }

    for (const id of EXPECTED_PHASE_1_TIER_B) {
      const entry = getCompatEntry(id)
      expect(entry?.tier, `tier B for ${id}`).toBe('B')
      expect(entry?.react).toBe('ready')
      expect(entry?.wc).toBe('ready')
      expect(entry?.wcTag).toBe(`tx-${id}`)
      expect(entry?.reactExports?.length).toBeGreaterThan(0)
    }

    for (const id of EXPECTED_PHASE_1_TIER_C) {
      const entry = getCompatEntry(id)
      expect(entry?.tier, `tier C for ${id}`).toBe('C')
      expect(entry?.react).toBe('ready')
      expect(entry?.wc).toBe('ready')
      expect(entry?.wcTag).toBe(`tx-${id}`)
      expect(entry?.reactExports?.length).toBeGreaterThan(0)
    }

    expect(getCompatEntry('stream-text')?.reactExports).toEqual(['TxStreamText', 'TxStreamCaret'])
  })

  it('marks Tier D scoped-slot/provide-inject modules as react:planned and wc:unsupported with reasons', () => {
    const requiredTierD = [
      'data-table',
      'virtual-list',
      'form',
      'tree',
      'cascader',
      'command-palette',
      'conversation-stream',
      'motion-form',
    ]
    for (const id of requiredTierD) {
      const entry = getCompatEntry(id)
      expect(entry, `missing Tier D entry ${id}`).toBeDefined()
      expect(entry?.tier).toBe('D')
      expect(entry?.react).toBe('planned')
      expect(entry?.wc).toBe('unsupported')
      expect(entry?.notes?.trim().length).toBeGreaterThan(10)
    }

    const summary = getCompatSummary()
    expect(summary.total).toBe(193)
    expect(summary.vueReady).toBe(193)
    expect(summary.reactReady).toBe(32)
    expect(summary.wcReady).toBe(32)
    expect(summary.wcUnsupported).toBe(summary.byTier.D)
  })
})
