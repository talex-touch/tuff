// @vitest-environment jsdom
import type { TuffContainerLayout, TuffItem, TuffSection } from '@talex-touch/utils'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentPublicInstance } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from '../../modules/lang/en-US.json'
import zhCN from '../../modules/lang/zh-CN.json'
import BoxGrid from './BoxGrid.vue'

const platform = vi.hoisted(() => ({ isMac: true }))

vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({
    platform: platform.isMac ? 'darwin' : 'win32',
    isMac: platform.isMac,
    isWindows: !platform.isMac,
    isLinux: false
  })
}))

// BoxGrid places rows and tiles and hands them their quick keys; drawing them is not its job. The
// stand-ins echo what they were handed.
vi.mock('./BoxItem.vue', () => ({
  default: {
    name: 'BoxItem',
    props: ['item', 'active', 'render', 'quickKey'],
    template: '<div class="row-stub" :data-item-id="item.id" :data-quick-key="quickKey" />'
  }
}))

vi.mock('./BoxGridItem.vue', () => ({
  default: {
    name: 'BoxGridItem',
    props: ['item', 'active', 'render', 'quickKey', 'compact'],
    template: '<div class="tile-stub" :data-item-id="item.id" :data-quick-key="quickKey" />'
  }
}))

/** The real bundles, so a key the guidance renders has to exist in both locales. */
const i18nByLocale = {
  'en-US': createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUS },
    missingWarn: false,
    fallbackWarn: false
  }),
  'zh-CN': createI18n({
    legacy: false,
    locale: 'zh-CN',
    messages: { 'zh-CN': zhCN },
    missingWarn: false,
    fallbackWarn: false
  })
}

type RegisterItem = (el: Element | ComponentPublicInstance | null, index: number) => void

const PROPOSED_IDS = ['calculator', 'notes', 'safari']

function item(id: string): TuffItem {
  return {
    id,
    kind: 'app',
    source: { type: 'application', id: 'app-provider', name: 'Applications' },
    render: { mode: 'default', basic: { title: id } }
  } as TuffItem
}

function section(
  id: string,
  itemIds: string[],
  layout: TuffSection['layout'],
  title = `$i18n:coreBox.sections.${id}`
): TuffSection {
  return { id, title, layout, itemIds }
}

const proposed = section('proposed', PROPOSED_IDS, 'list')

/** The recommendation layout's shape: one row of at most six columns, 12px apart. */
function gridLayout(sections: TuffSection[] | undefined, columns = 6): TuffContainerLayout {
  return { mode: 'grid', grid: { columns, gap: 12, itemSize: 'medium' }, sections }
}

interface MountOptions {
  items?: TuffItem[]
  layout?: TuffContainerLayout
  compact?: boolean
  availableWidth?: number
  locale?: keyof typeof i18nByLocale
  registerItem?: RegisterItem
}

function mountGrid(options: MountOptions = {}): VueWrapper {
  return mount(BoxGrid, {
    global: { plugins: [i18nByLocale[options.locale ?? 'en-US']] },
    props: {
      items: options.items ?? PROPOSED_IDS.map(item),
      layout: options.layout ?? gridLayout([proposed]),
      focus: 0,
      compact: options.compact,
      availableWidth: options.availableWidth,
      registerItem: options.registerItem
    }
  })
}

function inlineStyle(wrapper: Pick<DOMWrapper<Element>, 'attributes'>): string {
  return (wrapper.attributes('style') ?? '').replace(/\s+/g, '')
}

afterEach(() => {
  platform.isMac = true
})

describe('BoxGrid habitual empty state', () => {
  it('draws one empty slot per visible column on the real grid tracks, hidden from assistive tech', () => {
    const wrapper = mountGrid()
    const region = wrapper.get(`section[aria-label="${enUS.coreBox.sections.habitual}"]`)
    const title = region.get('.BoxGridTitle')
    expect(title.text()).toBe(enUS.coreBox.sections.habitual)
    expect(title.attributes('data-flip-key')).toBe('title:habitual')
    expect(title.attributes('data-flip')).toBe('move')

    // The same box a real grid section renders in, so each slot sits where a tile will land.
    const ghost = region.get('.BoxGridGhost')
    expect(ghost.classes()).toEqual(expect.arrayContaining(['BoxGrid', 'p-4', 'size-medium']))
    expect(ghost.classes()).not.toContain('is-compact')
    expect(inlineStyle(ghost)).toContain('--grid-cols:6')
    expect(inlineStyle(ghost)).toContain('--grid-gap:12px')
    expect(ghost.attributes('aria-hidden')).toBe('true')

    const tiles = ghost.findAll('.BoxGridGhost-Tile')
    expect(tiles).toHaveLength(6)
    for (const tile of tiles) {
      expect(tile.element.tagName).toBe('SPAN')
      expect(tile.attributes('tabindex')).toBeUndefined()
    }
    // Nothing in it can take focus, ride the FLIP or print a quick key.
    expect(
      ghost.findAll('a, button, input, [tabindex], [data-flip-key], [data-flip]')
    ).toHaveLength(0)
    expect(ghost.text()).toBe('')
  })

  it('draws as many slots as the real row has columns: the declared count, capped at what fits', () => {
    // The main process declares no more columns than it has recommendations.
    const declared = mountGrid({ layout: gridLayout([proposed], 3) })
    expect(declared.findAll('.BoxGridGhost-Tile')).toHaveLength(3)
    expect(inlineStyle(declared.get('.BoxGridGhost'))).toContain('--grid-cols:3')

    // 300px leaves 260px for tiles after the side insets: two at the 84px minimum and a 12px gap.
    // The keyboard geometry is told the same count.
    const narrow = mountGrid({ availableWidth: 300 })
    expect(narrow.findAll('.BoxGridGhost-Tile')).toHaveLength(2)
    expect(inlineStyle(narrow.get('.BoxGridGhost'))).toContain('--grid-cols:2')
    expect(narrow.emitted('update:visibleColumns')?.at(-1)).toEqual([2])

    // With the preview pane open the tiles are icon-only (52px minimum): four fit, and the slots
    // take the compact shape.
    const compact = mountGrid({ availableWidth: 300, compact: true })
    expect(compact.findAll('.BoxGridGhost-Tile')).toHaveLength(4)
    expect(compact.get('.BoxGridGhost').classes()).toContain('is-compact')
  })

  it('registers only real rows, so the first proposed row keeps ⌘1', () => {
    const registerItem = vi.fn<RegisterItem>()
    const wrapper = mountGrid({ registerItem })

    const registered = registerItem.mock.calls.filter(([el]) => el !== null)
    expect(registered.map(([, index]) => index)).toEqual([0, 1, 2])
    for (const [el] of registered) {
      expect((el as ComponentPublicInstance).$el.classList.contains('row-stub')).toBe(true)
    }
    expect(wrapper.findAll('.row-stub').map((row) => row.attributes('data-quick-key'))).toEqual([
      '⌘1',
      '⌘2',
      '⌘3'
    ])
  })

  it.each([
    { isMac: true, key: '⌘K' },
    { isMac: false, key: 'Ctrl+K' }
  ])('teaches the action-panel key as $key and names the row it opens', ({ isMac, key }) => {
    platform.isMac = isMac
    const hint = mountGrid().get('.BoxGridHabitualHint')

    expect(hint.attributes('aria-hidden')).toBeUndefined()
    expect(hint.get('.BoxGridHabitualHint-Text').text()).toBe(
      enUS.coreBox.sections.habitualEmptyTitle
    )
    expect(hint.get('.BoxGridHabitualHint-Separator').attributes('aria-hidden')).toBe('true')
    expect(hint.get('.BoxGridHabitualHint-Action kbd').text()).toBe(key)
    // The panel's own label for the row, so the guidance and the menu read the same.
    expect(hint.get('.BoxGridHabitualHint-Action > span').text()).toBe(enUS.corebox.actions.pin)
  })

  it('reads the guidance from the Chinese bundle too', () => {
    const hint = mountGrid({ locale: 'zh-CN' }).get('.BoxGridHabitualHint')

    expect(hint.get('.BoxGridHabitualHint-Text').text()).toBe(
      zhCN.coreBox.sections.habitualEmptyTitle
    )
    expect(hint.get('.BoxGridHabitualHint-Action > span').text()).toBe(zhCN.corebox.actions.pin)
  })

  it('gives way once a habitual tile renders, and the tile takes ⌘1', async () => {
    // A habitual section whose ids match nothing on screen renders nothing: the guidance stays.
    const wrapper = mountGrid({
      layout: gridLayout([section('habitual', ['terminal'], 'grid'), proposed])
    })
    expect(wrapper.find('.BoxGridGhost').exists()).toBe(true)

    await wrapper.setProps({ items: [item('terminal'), ...PROPOSED_IDS.map(item)] })

    expect(wrapper.find('.BoxGridGhost').exists()).toBe(false)
    expect(wrapper.find('.BoxGridHabitualHint').exists()).toBe(false)
    expect(wrapper.findAll('[data-flip-key="title:habitual"]')).toHaveLength(1)
    expect(wrapper.get('.tile-stub').attributes('data-quick-key')).toBe('⌘1')
    expect(wrapper.findAll('.row-stub')[0].attributes('data-quick-key')).toBe('⌘2')
  })

  it.each([
    { name: 'a sectionless grid', layout: gridLayout(undefined) },
    {
      name: 'search sections',
      layout: gridLayout([section('apps', PROPOSED_IDS, 'list', 'Applications')])
    },
    {
      name: 'a habitual row with nothing proposed',
      layout: gridLayout([section('habitual', PROPOSED_IDS, 'grid')])
    },
    {
      name: 'a proposed section with none of its rows on screen',
      layout: gridLayout([section('proposed', ['gone'], 'list')])
    }
  ])('never shows on $name', ({ layout }) => {
    const wrapper = mountGrid({ layout })

    expect(wrapper.find('.BoxGridGhost').exists()).toBe(false)
    expect(wrapper.find('.BoxGridHabitualHint').exists()).toBe(false)
  })
})
