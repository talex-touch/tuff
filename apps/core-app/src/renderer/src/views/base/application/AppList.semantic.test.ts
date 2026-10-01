// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AppList, { type AppListItem, type AppListView } from './AppList.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

function mountAppList(items: AppListItem[], selectedId: string | null = null) {
  return mount(AppList, {
    props: {
      items,
      selectedId
    },
    global: {
      stubs: {
        TxScroll: { template: '<div><slot /></div>' },
        TxButton: { template: '<button><slot /></button>' },
        TxSkeleton: { template: '<span />' },
        PluginIcon: { template: '<span />' },
        // Renders both slots, so the picker can be driven without a floating layer in jsdom.
        TxPopover: { template: '<div><slot name="reference" /><slot /></div>' }
      }
    }
  })
}

/**
 * A row is the TxCardItem root, which is a `div` nested inside the semantic `li` — so the row
 * selector deliberately has no element qualifier.
 */
function rows(wrapper: VueWrapper) {
  return wrapper.findAll('.AppList-Row')
}

function rowNames(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.AppList-Row .AppList-Name').map((name) => name.text())
}

function countText(wrapper: VueWrapper): string {
  return wrapper.get('.AppList-Info > span').text()
}

async function selectView(wrapper: VueWrapper, view: AppListView): Promise<void> {
  const option = wrapper
    .findAll('button.AppList-ViewOption')
    .find((button) => button.text().includes(`appList.view.${view}`))

  if (!option) throw new Error(`View option ${view} is not rendered`)
  await option.trigger('click')
}

describe('AppList semantics', () => {
  it('activates app rows from the keyboard through the shared card primitive', async () => {
    const items: AppListItem[] = [
      { id: '/Applications/Calculator.app', name: 'Calculator' },
      { id: '/Applications/Terminal.app', name: 'Terminal' }
    ]
    const wrapper = mountAppList(items)
    const row = rows(wrapper)[0]

    expect(row.attributes('role')).toBe('button')
    expect(row.attributes('tabindex')).toBe('0')
    expect(row.attributes('aria-pressed')).toBe('false')

    await row.trigger('keydown.enter')

    expect(wrapper.emitted('select')?.at(-1)).toEqual(['/Applications/Calculator.app'])
  })

  it('activates on Space as well, so the row is not Enter-only', async () => {
    const wrapper = mountAppList([{ id: '/Applications/Calculator.app', name: 'Calculator' }])

    await rows(wrapper)[0].trigger('keydown.space')

    expect(wrapper.emitted('select')?.at(-1)).toEqual(['/Applications/Calculator.app'])
  })

  it('deselects when the selected row is activated again', async () => {
    const wrapper = mountAppList(
      [{ id: '/Applications/Calculator.app', name: 'Calculator' }],
      '/Applications/Calculator.app'
    )

    await rows(wrapper)[0].trigger('click')

    expect(wrapper.emitted('select')?.at(-1)).toEqual([null])
  })

  /**
   * A disabled entry is still indexed — it is only excluded from recall — so it stays in the list
   * where it can be found and re-enabled, rather than disappearing. It must therefore remain
   * selectable: the mark is a label, not an interaction ban.
   */
  it('keeps recall-disabled entries visible, marked, and still selectable', async () => {
    const wrapper = mountAppList([
      { id: '/Applications/Hidden.app', name: 'Hidden', disabled: true }
    ])

    const row = rows(wrapper)[0]
    expect(row.classes()).toContain('is-disabled')
    expect(row.text()).toContain('settings.settingFileIndex.appIndexManagerEntryDisabled')

    await row.trigger('click')

    expect(wrapper.emitted('select')?.at(-1)).toEqual(['/Applications/Hidden.app'])
  })

  it('shows the full indexed path, truncated visually but intact for the pointer and reader', () => {
    const fullPath = '/Applications/Utilities/Disk Utility.app'
    const wrapper = mountAppList([{ id: fullPath, name: 'Disk Utility', path: fullPath }])

    const path = wrapper.get('.AppList-Row .AppList-Path')
    expect(path.attributes('title')).toBe(fullPath)
    expect(path.attributes('aria-label')).toBe(fullPath)
    // The two halves are a visual truncation of ONE string; together they are the real path.
    expect(path.find('.AppList-PathStart').text() + path.find('.AppList-PathEnd').text()).toBe(
      fullPath
    )
  })
})

describe('AppList views', () => {
  const items: AppListItem[] = [
    { id: '/Zebra.app', name: 'Zebra', executeCount: 0 },
    { id: '/Alpha.app', name: 'Alpha', executeCount: 7, hasShortcut: true },
    { id: '/Middle.app', name: 'Middle', executeCount: 3, hasAliases: true }
  ]

  it('opens on the dictionary view, which orders every entry by name', () => {
    const wrapper = mountAppList(items)

    expect(rowNames(wrapper)).toEqual(['Alpha', 'Middle', 'Zebra'])
    expect(countText(wrapper)).toBe('appList.appsOnDevice')
  })

  it('orders by launch count in the frequency view, breaking ties by name', async () => {
    const wrapper = mountAppList([
      ...items,
      { id: '/Beta.app', name: 'Beta', executeCount: 7 },
      { id: '/Never.app', name: 'Never', executeCount: 0 }
    ])

    await selectView(wrapper, 'frequency')

    // Equal counts fall back to name, so the order cannot reshuffle between reads.
    expect(rowNames(wrapper)).toEqual(['Alpha', 'Beta', 'Middle', 'Never', 'Zebra'])
  })

  it('narrows to entries with a configured shortcut', async () => {
    const wrapper = mountAppList(items)

    await selectView(wrapper, 'shortcut')

    expect(rowNames(wrapper)).toEqual(['Alpha'])
    expect(countText(wrapper)).toBe('appList.filteredOnDevice')
    // The narrowed view is what the picker reports as chosen.
    const active = wrapper
      .findAll('button.AppList-ViewOption')
      .filter((button) => button.attributes('aria-checked') === 'true')
    expect(active).toHaveLength(1)
    expect(active[0].text()).toContain('appList.view.shortcut')
  })

  it('narrows to entries with saved keywords', async () => {
    const wrapper = mountAppList(items)

    await selectView(wrapper, 'alias')

    expect(rowNames(wrapper)).toEqual(['Middle'])
    expect(countText(wrapper)).toBe('appList.filteredOnDevice')
  })

  /**
   * A filter that matched nothing says so. Claiming the device has no applications would be false:
   * the entries are there, the view is simply narrower than the list.
   */
  it('reports an empty result as a narrowed list, not an empty index', async () => {
    const wrapper = mountAppList([{ id: '/Alpha.app', name: 'Alpha' }])

    await selectView(wrapper, 'shortcut')

    expect(rowNames(wrapper)).toEqual([])
    expect(wrapper.get('.AppList-Empty').text()).toBe('appList.emptyFiltered')
  })
})
