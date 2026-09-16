// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
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

function rowNames(wrapper: ReturnType<typeof mountAppList>): string[] {
  return wrapper.findAll('li.AppList-Row .AppList-Name').map((name) => name.text())
}

function countText(wrapper: ReturnType<typeof mountAppList>): string {
  return wrapper.get('.AppList-Info > span').text()
}

async function selectView(
  wrapper: ReturnType<typeof mountAppList>,
  view: AppListView
): Promise<void> {
  const option = wrapper
    .findAll('button.AppList-ViewOption')
    .find((button) => button.text().includes(`appList.view.${view}`))

  if (!option) throw new Error(`View option ${view} is not rendered`)
  await option.trigger('click')
}

describe('AppList semantics', () => {
  it('selects app items with keyboard activation', async () => {
    const items: AppListItem[] = [
      { id: '/Applications/Calculator.app', name: 'Calculator' },
      { id: '/Applications/Terminal.app', name: 'Terminal' }
    ]
    const wrapper = mountAppList(items)
    const row = wrapper.get('li.AppList-Row')

    expect(row.attributes('role')).toBe('button')
    expect(row.attributes('tabindex')).toBe('0')
    expect(row.attributes('aria-selected')).toBe('false')

    await row.trigger('keydown.enter')

    expect(wrapper.emitted('select')?.at(-1)).toEqual(['/Applications/Calculator.app'])
  })

  it('deselects when the selected row is activated again', async () => {
    const wrapper = mountAppList(
      [{ id: '/Applications/Calculator.app', name: 'Calculator' }],
      '/Applications/Calculator.app'
    )

    await wrapper.get('li.AppList-Row').trigger('click')

    expect(wrapper.emitted('select')?.at(-1)).toEqual([null])
  })

  /**
   * A disabled entry is still indexed — it is only excluded from recall — so it stays in the
   * list where it can be found and re-enabled, rather than disappearing.
   */
  it('keeps recall-disabled entries visible and marks them', () => {
    const wrapper = mountAppList([
      { id: '/Applications/Hidden.app', name: 'Hidden', disabled: true }
    ])

    const row = wrapper.get('li.AppList-Row')
    expect(row.classes()).toContain('is-disabled')
    expect(row.text()).toContain('settings.settingFileIndex.appIndexManagerEntryDisabled')
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
    expect(wrapper.get('.AppList-Empty').text()).toBe('appList.filteredOnDevice')
  })
})
