// @vitest-environment jsdom

/**
 * The destructive "remove source" affordance was a bare `<div>` with only `@click`, in both list
 * branches — no role, tabindex, keydown handler or accessible name. A keyboard user could focus the
 * row's enable switch but never the delete control, so a mis-added source could not be removed
 * without a mouse, and a screen reader read an unlabelled icon (#832).
 *
 * A native `<button>` rather than role/tabindex: nothing interactive is nested inside it, so the
 * element that already means "button" is the right one — Enter/Space and `disabled` come with it.
 *
 * `deleteSource` was already guarded internally (`list.length === 1`, `target.readOnly`), so the
 * `disabled` attribute makes a real guard visible rather than introducing one.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

// The list comes from storage, not a prop, so this is what actually feeds the rows.
const storageMock = vi.hoisted(() => ({ sources: [] as Array<Record<string, unknown>> }))

vi.mock('~/modules/storage/store-sources', () => ({
  storeSourcesStorage: { get: () => storageMock, save: vi.fn() }
}))

import StoreSourceEditor from './StoreSourceEditor.vue'

function mountEditor(sources: Array<Record<string, unknown>>) {
  storageMock.sources = sources
  return mount(StoreSourceEditor, {
    props: { modelValue: true },
    global: {
      stubs: {
        TuffSwitch: true,
        TxScroll: { template: '<div><slot /></div>' },
        TxButton: true,
        TxInput: true,
        TxSelect: true,
        TxSelectItem: true,
        FlipDialog: { template: '<div><slot /></div>' }
      },
      directives: { draggable: {}, sharedElement: {} }
    }
  })
}

function twoSources() {
  return [
    { id: 's1', name: 'Primary', type: 'nexusStore', enabled: true },
    { id: 's2', name: 'Mirror', type: 'repository', enabled: true }
  ]
}

describe('the source delete control is a real button', () => {
  it('是原生 button,而不是只能点的 div', () => {
    const wrapper = mountEditor(twoSources())

    const controls = wrapper.findAll('button.action-btn')
    expect(controls.length).toBeGreaterThan(0)
  })

  it('带有可读名称,读屏不再只看到一个图标', () => {
    const wrapper = mountEditor(twoSources())

    expect(wrapper.get('button.action-btn').attributes('aria-label')).toContain('Primary')
  })

  it('type=button,不会在表单里变成隐式提交', () => {
    const wrapper = mountEditor(twoSources())

    expect(wrapper.get('button.action-btn').attributes('type')).toBe('button')
  })

  it('只剩一个源时按钮真的被禁用,而不仅仅是变灰', () => {
    const wrapper = mountEditor([{ id: 's1', name: 'Only', type: 'nexusStore', enabled: true }])

    expect(wrapper.get('button.action-btn').attributes('disabled')).toBeDefined()
  })

  it('只读源同样被禁用', () => {
    const wrapper = mountEditor([
      { id: 's1', name: 'Primary', type: 'nexusStore', enabled: true },
      { id: 's2', name: 'Builtin', type: 'nexusStore', enabled: true, readOnly: true }
    ])

    const controls = wrapper.findAll('button.action-btn')
    expect(controls[1]?.attributes('disabled')).toBeDefined()
  })

  /**
   * The outdated-sources list carries a second copy of this control, and the issue names both. It
   * cannot be rendered today: `visibleOutdatedSources` is gated on `isAdvancedMode`, which is
   * `computed(() => false)` — a hardcoded flag, so that branch is currently dead markup.
   *
   * A rendered assertion is therefore impossible, and leaving it uncovered means "fix one branch"
   * passes the whole suite. This checks the source instead, deliberately, and says so.
   */
  it('两处删除控件都是 button —— 第二处被 isAdvancedMode 硬编码挡着,只能查源码', () => {
    const source = readFileSync(path.join(__dirname, 'StoreSourceEditor.vue'), 'utf8')
    const controls = source.match(/class="transition-cubic action-btn"/g) ?? []
    const asButton = source.match(/<button\s+type="button"/g) ?? []
    const asDiv = source.match(/<div[^>]*class="transition-cubic action-btn"/g) ?? []

    expect(controls).toHaveLength(2)
    expect(asButton.length).toBeGreaterThanOrEqual(2)
    expect(asDiv).toHaveLength(0)
  })

  it('可删除的源上按钮未被禁用(否则上面两条会掩盖"全都禁用")', () => {
    const wrapper = mountEditor(twoSources())

    expect(wrapper.get('button.action-btn').attributes('disabled')).toBeUndefined()
  })
})
