// @vitest-environment jsdom
import type { TuffContainerLayout, TuffItem, TuffSection } from '@talex-touch/utils'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPublicInstance } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from '../../modules/lang/en-US.json'
import zhCN from '../../modules/lang/zh-CN.json'
import BoxGrid from './BoxGrid.vue'

// Row painting belongs to the row suites. These surfaces expose the selection and shortcut
// BoxGrid computes; the tests exercise its section/global-index translation, not the stubs.
vi.mock('./BoxItem.vue', () => ({
  default: {
    name: 'BoxItem',
    props: ['item', 'active', 'render', 'quickKey'],
    template:
      '<button class="row-stub" :data-item-id="item.id" :data-quick-key="quickKey" :data-active="active" />'
  }
}))

vi.mock('./BoxGridItem.vue', () => ({
  default: {
    name: 'BoxGridItem',
    props: ['item', 'active', 'render', 'quickKey', 'compact'],
    template:
      '<button class="tile-stub" :data-item-id="item.id" :data-quick-key="quickKey" :data-active="active" :data-compact="compact" />'
  }
}))

type RegisterItem = (el: Element | ComponentPublicInstance | null, index: number) => void
const wrappers: VueWrapper[] = []

function item(id: string, kind: NonNullable<TuffItem['kind']> = 'app'): TuffItem {
  return {
    id,
    kind,
    source: {
      type: kind === 'file' || kind === 'folder' ? 'file' : 'application',
      id: `${kind}-provider`,
      name: kind
    },
    render: { mode: 'default', basic: { title: id } }
  }
}

function section(id: string, itemIds: string[], layout: TuffSection['layout']): TuffSection {
  return { id, title: `$i18n:coreBox.sections.${id}`, layout, itemIds }
}

function gridLayout(items: TuffItem[]): TuffContainerLayout {
  return {
    mode: 'grid',
    grid: { columns: 5, gap: 12, itemSize: 'medium' },
    sections: [
      section(
        'habitual',
        items.slice(0, 5).map((entry) => entry.id),
        'grid'
      ),
      section(
        'proposed',
        items.slice(5).map((entry) => entry.id),
        'list'
      )
    ]
  }
}

function mountGrid(
  items: TuffItem[],
  {
    locale = 'en-US',
    layout = gridLayout(items),
    focus = 0,
    registerItem
  }: {
    locale?: 'en-US' | 'zh-CN'
    layout?: TuffContainerLayout
    focus?: number
    registerItem?: RegisterItem
  } = {}
) {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { 'en-US': enUS, 'zh-CN': zhCN },
    missingWarn: false,
    fallbackWarn: false
  })
  const wrapper = mount(BoxGrid, {
    global: { plugins: [i18n] },
    props: { items, layout, focus, registerItem }
  })
  wrappers.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

describe('BoxGrid unified recommendation selection', () => {
  it('keeps file and plugin tiles in the first five and preserves quick-key order into the list', () => {
    const items = [
      item('file.pdf', 'file'),
      item('app-a'),
      item('plugin-action', 'feature'),
      item('folder', 'folder'),
      item('app-b'),
      ...Array.from({ length: 7 }, (_, index) => item(`proposed-${index}`))
    ]
    const registered: Array<{ id: string; index: number }> = []
    const wrapper = mountGrid(items, {
      registerItem: (el, index) => {
        if (!el) return
        const element = '$el' in el ? (el.$el as Element) : el
        registered.push({ id: element.getAttribute('data-item-id')!, index })
      }
    })

    expect(wrapper.findAll('.tile-stub').map((tile) => tile.attributes('data-item-id'))).toEqual([
      'file.pdf',
      'app-a',
      'plugin-action',
      'folder',
      'app-b'
    ])
    expect(wrapper.findAll('.row-stub').map((row) => row.attributes('data-item-id'))).toEqual(
      items.slice(5).map((entry) => entry.id)
    )
    expect(wrapper.findAll('button').map((entry) => entry.attributes('data-quick-key'))).toEqual([
      '⌘1',
      '⌘2',
      '⌘3',
      '⌘4',
      '⌘5',
      '⌘6',
      '⌘7',
      '⌘8',
      '⌘9',
      '⌘0',
      '',
      ''
    ])
    expect(registered).toEqual(items.map((entry, index) => ({ id: entry.id, index })))
    expect(wrapper.findAll('button')).toHaveLength(items.length)
  })

  it('selects the actual item under its global index on either side of the grid/list boundary', async () => {
    const items = Array.from({ length: 7 }, (_, index) => item(`item-${index}`))
    const wrapper = mountGrid(items, { focus: 5 })

    expect(
      wrapper.findAll('[data-active="true"]').map((entry) => entry.attributes('data-item-id'))
    ).toEqual(['item-5'])
    await wrapper.findAll('.tile-stub')[4].trigger('click')
    await wrapper.findAll('.row-stub')[0].trigger('click')
    expect(wrapper.emitted('select')).toEqual([
      [4, items[4]],
      [5, items[5]]
    ])

    await wrapper.setProps({ focus: 4 })
    expect(
      wrapper.findAll('[data-active="true"]').map((entry) => entry.attributes('data-item-id'))
    ).toEqual(['item-4'])
  })

  it('keeps keyboard registration and selection intact when preview narrows and compacts the grid', async () => {
    const items = Array.from({ length: 7 }, (_, index) => item(`item-${index}`))
    const wrapper = mountGrid(items, { focus: 3 })

    await wrapper.setProps({ availableWidth: 300, compact: true })
    expect(wrapper.findAll('.tile-stub').map((entry) => entry.attributes('data-item-id'))).toEqual(
      items.slice(0, 5).map((entry) => entry.id)
    )
    expect(
      wrapper.findAll('.tile-stub').every((entry) => entry.attributes('data-compact') === 'true')
    ).toBe(true)
    expect(wrapper.emitted('update:visibleColumns')?.at(-1)).toEqual([4])
    expect(
      wrapper.findAll('[data-active="true"]').map((entry) => entry.attributes('data-item-id'))
    ).toEqual(['item-3'])
    await wrapper.findAll('.row-stub')[1].trigger('click')
    expect(wrapper.emitted('select')?.at(-1)).toEqual([6, items[6]])
  })

  it('renders the unchanged Chinese headings for the real grid and overflow list', () => {
    const wrapper = mountGrid(
      Array.from({ length: 6 }, (_, index) => item(`item-${index}`)),
      {
        locale: 'zh-CN'
      }
    )

    expect(wrapper.findAll('.BoxGridTitle').map((heading) => heading.text())).toEqual([
      '此刻常用',
      '最近案例'
    ])
  })

  it('does not fabricate a habitual region when only a proposed section has rendered items', () => {
    const items = [item('real-result')]
    const wrapper = mountGrid(items, {
      layout: {
        mode: 'grid',
        grid: { columns: 5 },
        sections: [
          section('habitual', ['missing'], 'grid'),
          section('proposed', ['real-result'], 'list')
        ]
      }
    })

    expect(wrapper.findAll('.BoxGridTitle').map((heading) => heading.text())).toEqual([
      enUS.coreBox.sections.proposed
    ])
    expect(
      wrapper
        .findAll('button')
        .map((entry) => [entry.attributes('data-item-id'), entry.attributes('data-quick-key')])
    ).toEqual([['real-result', '⌘1']])
  })
})
