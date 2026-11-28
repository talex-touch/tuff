import { describe, expect, it } from 'vitest'
import {
  ALL_TUFFEX_ELEMENT_BUNDLES,
  defineTxButton,
  defineTxDataTable,
  defineTxModal,
  NATIVE_ELEMENT_PROP_KEYS,
  registerTuffexElements,
  WC_ELEMENT_TAGS,
  WC_ELEMENTS_MANIFEST,
  WC_READY_COMPONENT_IDS,
} from '../index'

const LOCKED_100_IDS = [
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
  // Tier C (2: markdown-view is Base Suite, stream-text is AI Suite)
  'stream-text',
  'markdown-view',
  // Base Pack A (35)
  'container',
  'flex',
  'grid',
  'grid-layout',
  'stack',
  'splitter',
  'scroll',
  'group-block',
  'card-item',
  'layout-skeleton',
  'text',
  'icon',
  'icon-chip',
  'cell-link',
  'blank-slate',
  'empty-state',
  'error-state',
  'guide-state',
  'loading-state',
  'no-data',
  'no-selection',
  'offline-state',
  'permission-state',
  'search-empty',
  'breadcrumb',
  'nav-bar',
  'sidebar-nav',
  'tab-bar',
  'pagination',
  'steps',
  'loading-overlay',
  'modal',
  'toast',
  'toast-panel',
  'timeline',
  // Base Pack B (33)
  'number-input',
  'search-input',
  'sensitive-input',
  'tag-input',
  'scrub-field',
  'segmented-slider',
  'rating',
  'filter-chips',
  'flat-radio',
  'flat-select',
  'search-select',
  'cascader',
  'tree',
  'tree-select',
  'date-picker',
  'picker',
  'form',
  'modal-form',
  'drawer-form',
  'steps-form',
  'context-menu',
  'dropdown-menu',
  'flat-dropdown',
  'selection-actions',
  'data-table',
  'descriptions',
  'sortable-list',
  'transfer',
  'file-uploader',
  'image-uploader',
  'image-gallery',
  'image-preview',
  'icon-picker',
] as const

describe('registerTuffexElements & WC_ELEMENTS_MANIFEST (100 modules / 123 tags)', () => {
  it('locks the exact 100 component IDs (99 Base Suite + stream-text) in WC_ELEMENTS_MANIFEST', () => {
    expect(WC_READY_COMPONENT_IDS).toHaveLength(100)
    expect([...WC_READY_COMPONENT_IDS].sort()).toEqual([...LOCKED_100_IDS].sort())

    for (const id of LOCKED_100_IDS) {
      const entry = WC_ELEMENTS_MANIFEST[id]
      expect(entry, `Missing manifest entry for ${id}`).toBeDefined()
      expect(entry.id).toBe(id)
      expect(entry.status).toBe('ready')
      expect(entry.tag).toMatch(/^tx-/)
      expect(entry.sampleHtml).toContain(`<${entry.tag}`)
    }
  })

  it('registers all 123 custom element tags cleanly and idempotently', () => {
    expect(ALL_TUFFEX_ELEMENT_BUNDLES).toHaveLength(123)
    expect(WC_ELEMENT_TAGS).toHaveLength(123)

    const bundleTags = ALL_TUFFEX_ELEMENT_BUNDLES.map(b => b.tag).sort()
    expect(bundleTags).toEqual([...WC_ELEMENT_TAGS].sort())

    const first = registerTuffexElements()
    expect(Object.keys(first)).toHaveLength(123)

    for (const tag of WC_ELEMENT_TAGS) {
      const ctor = customElements.get(tag)
      expect(ctor, `Expected ${tag} to be registered`).toBeDefined()
      expect(first[tag]).toBe(ctor)
    }

    // Re-running registration must be completely idempotent and never throw
    const second = registerTuffexElements()
    expect(Object.keys(second)).toHaveLength(123)
    for (const tag of WC_ELEMENT_TAGS) {
      expect(second[tag]).toBe(first[tag])
    }

    // Individual defineTx* calls are also idempotent
    expect(defineTxButton()).toBe(first['tx-button'])
    expect(defineTxModal()).toBe(first['tx-modal'])
    expect(defineTxDataTable()).toBe(first['tx-data-table'])
  })

  it('guards every single registered bundle against colliding with all HTMLElement.prototype properties', () => {
    expect(NATIVE_ELEMENT_PROP_KEYS.size).toBeGreaterThanOrEqual(323)

    for (const bundle of ALL_TUFFEX_ELEMENT_BUNDLES) {
      const rawProps = Object.keys((bundle.ElementClass.def?.props ?? {}) as Record<string, unknown>)
      for (const propKey of rawProps) {
        expect(
          NATIVE_ELEMENT_PROP_KEYS.has(propKey),
          `${bundle.tag} prop "${propKey}" collides with NATIVE_ELEMENT_PROP_KEYS`,
        ).toBe(false)
        expect(
          propKey in HTMLElement.prototype,
          `${bundle.tag} prop "${propKey}" collides with HTMLElement.prototype`,
        ).toBe(false)
      }
    }
  })

  it('supports custom tag prefix and include/exclude filters', () => {
    const subset = registerTuffexElements({
      prefix: 'demo',
      include: ['tx-button', 'tx-kbd', 'tx-data-table'],
    })

    expect(Object.keys(subset)).toEqual(['demo-button', 'demo-kbd', 'demo-data-table'])
    expect(customElements.get('demo-button')).toBeDefined()
    expect(customElements.get('demo-kbd')).toBeDefined()
    expect(customElements.get('demo-data-table')).toBeDefined()
    expect(customElements.get('demo-card')).toBeUndefined()
  })
})
