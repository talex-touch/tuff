// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MetaActionItem from './MetaActionItem.vue'

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: { props: ['icon'], template: '<span class="tx-icon-stub" />' }
}))

const nodeRequire = createRequire(import.meta.url)
const SOURCE = readFileSync(path.join(__dirname, 'MetaActionItem.vue'), 'utf8')

/** The `GLYPH_CLASSES` table, read from the SFC source the way UnoCSS's extractor sees it. */
function glyphClasses(): string[] {
  const table = /const GLYPH_CLASSES[^{]*\{([\s\S]*?)\n\}/.exec(SOURCE)?.[1] ?? ''
  return [...table.matchAll(/'(i-ri-[\w-]+)'/g)].map((match) => match[1]!)
}

describe('MetaActionItem glyphs', () => {
  it('keeps its icon classes in the SFC, where UnoCSS extracts them', () => {
    // Moved into a `.ts` module, these classes would generate no CSS and every row would draw an
    // empty box — the "hollow circle" defect this panel replaced (see uno.config.ts).
    expect(glyphClasses().length).toBeGreaterThanOrEqual(20)
  })

  it('names only glyphs the installed Remix Icon set has', () => {
    const set = JSON.parse(
      readFileSync(nodeRequire.resolve('@iconify-json/ri/icons.json'), 'utf8')
    ) as { icons: Record<string, unknown>; aliases?: Record<string, unknown> }
    const names = new Set([...Object.keys(set.icons), ...Object.keys(set.aliases ?? {})])

    for (const className of glyphClasses()) {
      expect(names.has(className.slice('i-ri-'.length)), className).toBe(true)
    }
  })
})

describe('MetaActionItem row', () => {
  it('is a listbox option with its glyph, label and keys', () => {
    const wrapper = mount(MetaActionItem, {
      props: {
        label: '复制路径',
        glyph: 'copy-path',
        shortcuts: ['⌘⇧C'],
        active: true
      }
    })
    const row = wrapper.get('button')

    expect(row.attributes('role')).toBe('option')
    expect(row.attributes('type')).toBe('button')
    expect(row.attributes('tabindex')).toBe('-1')
    expect(row.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('.MetaActionItem-Glyph').classes()).toContain('i-ri-file-copy-2-line')
    expect(wrapper.get('.MetaActionItem-Label').text()).toBe('复制路径')
    expect(wrapper.findAll('kbd').map((kbd) => kbd.text())).toEqual(['⌘⇧C'])
  })

  it('draws a plugin’s own icon when it has no host glyph', () => {
    const wrapper = mount(MetaActionItem, {
      props: {
        label: 'Share',
        icon: { type: 'class', value: 'i-ri-share-line' },
        shortcuts: [],
        active: false
      }
    })

    expect(wrapper.find('.MetaActionItem-Glyph').exists()).toBe(false)
    expect(wrapper.find('.tx-icon-stub').exists()).toBe(true)
  })

  it('runs on click unless disabled, and reports pointer movement as hover', async () => {
    const enabled = mount(MetaActionItem, {
      props: { label: 'Pin', glyph: 'pin', shortcuts: [], active: false }
    })
    await enabled.get('button').trigger('click')
    await enabled.get('button').trigger('pointermove')
    expect(enabled.emitted('run')).toHaveLength(1)
    expect(enabled.emitted('hover')).toHaveLength(1)

    const disabled = mount(MetaActionItem, {
      props: { label: 'Pin', glyph: 'pin', shortcuts: [], active: false, disabled: true }
    })
    await disabled.get('button').trigger('click')
    expect(disabled.emitted('run')).toBeUndefined()
    expect(disabled.get('button').attributes('aria-disabled')).toBe('true')
  })
})
