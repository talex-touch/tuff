import { describe, expect, it } from 'vitest'
import {
  ALL_TUFFEX_ELEMENT_BUNDLES,
  WC_ELEMENTS_MANIFEST,
  WC_ELEMENT_TAGS,
  WC_READY_COMPONENT_IDS,
  defineTxButton,
  registerTuffexElements,
} from '../index'

const LOCKED_32_IDS = [
  // Tier A (18)
  'button',
  'badge',
  'tag',
  'avatar',
  'spinner',
  'divider',
  'alert',
  'card',
  'kbd',
  'progress',
  'progress-bar',
  'skeleton',
  'switch',
  'status-badge',
  'status-hint',
  'dot-indicator',
  'empty',
  'stat-card',
  // Tier B (12)
  'input',
  'textarea',
  'checkbox',
  'radio',
  'slider',
  'tabs',
  'collapse',
  'tooltip',
  'popover',
  'dialog',
  'drawer',
  'select',
  // Tier C (2)
  'stream-text',
  'markdown-view',
] as const

describe('registerTuffexElements & WC_ELEMENTS_MANIFEST', () => {
  it('locks the exact 32 Phase-1 component IDs in WC_ELEMENTS_MANIFEST', () => {
    expect(WC_READY_COMPONENT_IDS).toHaveLength(32)
    expect([...WC_READY_COMPONENT_IDS].sort()).toEqual([...LOCKED_32_IDS].sort())

    for (const id of LOCKED_32_IDS) {
      const entry = WC_ELEMENTS_MANIFEST[id]
      expect(entry).toBeDefined()
      expect(entry.id).toBe(id)
      expect(entry.status).toBe('ready')
      expect(entry.tag).toMatch(/^tx-/)
      expect(entry.sampleHtml).toContain(`<${entry.tag}`)
    }
  })

  it('registers all 36 custom element tags cleanly and idempotently', () => {
    expect(ALL_TUFFEX_ELEMENT_BUNDLES).toHaveLength(36)
    expect(WC_ELEMENT_TAGS).toHaveLength(36)

    const first = registerTuffexElements()
    expect(Object.keys(first)).toHaveLength(36)

    for (const tag of WC_ELEMENT_TAGS) {
      const ctor = customElements.get(tag)
      expect(ctor, `Expected ${tag} to be registered`).toBeDefined()
      expect(first[tag]).toBe(ctor)
    }

    // Re-running registration must be completely idempotent and never throw
    const second = registerTuffexElements()
    expect(Object.keys(second)).toHaveLength(36)
    for (const tag of WC_ELEMENT_TAGS) {
      expect(second[tag]).toBe(first[tag])
    }

    // Individual defineTx* calls are also idempotent
    expect(defineTxButton()).toBe(first['tx-button'])
  })

  it('supports custom tag prefix and include/exclude filters', () => {
    const subset = registerTuffexElements({
      prefix: 'demo',
      include: ['tx-button', 'tx-kbd'],
    })

    expect(Object.keys(subset)).toEqual(['demo-button', 'demo-kbd'])
    expect(customElements.get('demo-button')).toBeDefined()
    expect(customElements.get('demo-kbd')).toBeDefined()
    expect(customElements.get('demo-card')).toBeUndefined()
  })
})
