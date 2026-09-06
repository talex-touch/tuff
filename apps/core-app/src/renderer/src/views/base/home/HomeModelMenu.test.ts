// @vitest-environment jsdom
/**
 * The home model menu as a whole: filter strip, search, favourites, hotkeys, empty states and the
 * pill hand-off. TxDropdownMenu is stubbed to a plain in-tree panel so no teleport or entrance
 * animation is involved; the rows, search field, icons and kbd badges are the real primitives.
 * `useModelOptions` keeps module-scope state, so every test re-imports the menu after
 * `resetModules`.
 */
import type { ProviderModelOption } from '~/modules/conversation/useModelOptions'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getProviderModelOptions: vi.fn<() => Promise<ProviderModelOption[]>>(),
  /** Raw target; both the mocked module and the assertions below wrap it with `reactive`. */
  appSettingTarget: {} as Record<string, unknown>,
  isHydrated: vi.fn(() => true),
  whenHydrated: vi.fn<() => Promise<void>>(async () => undefined),
  isMac: true
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    getProviderModelOptions: mocks.getProviderModelOptions
  })
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const { reactive } = await import('vue')
  return {
    appSetting: reactive(mocks.appSettingTarget),
    appSettingStore: {
      isHydrated: mocks.isHydrated,
      whenHydrated: mocks.whenHydrated
    }
  }
})

vi.mock('~/modules/platform/renderer-platform', () => ({
  getCurrentRendererPlatformState: () => ({
    platform: mocks.isMac ? 'darwin' : 'win32',
    isMac: mocks.isMac,
    isWindows: !mocks.isMac,
    isLinux: false
  })
}))

/**
 * Mirrors the Popover stub in tuffex's own dropdown test: the trigger slot always renders, the
 * panel renders in place while `modelValue` is true, and clicking the trigger toggles it.
 */
vi.mock('@talex-touch/tuffex/dropdown-menu', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    TxDropdownMenu: defineComponent({
      name: 'TxDropdownMenu',
      props: {
        modelValue: { type: Boolean, default: false },
        placement: { type: String, default: 'bottom-start' },
        minWidth: { type: Number, default: 220 },
        maxHeight: { type: Number, default: 420 },
        panelRadius: { type: Number, default: 18 },
        panelPadding: { type: Number, default: 8 },
        panelBackground: { type: String, default: 'refraction' },
        initialFocus: { type: String, default: 'first-item' }
      },
      emits: ['update:modelValue'],
      setup(props, { slots, emit }) {
        return () =>
          h('div', { class: 'dropdown-stub' }, [
            h(
              'div',
              {
                class: 'dropdown-stub__trigger',
                onClick: () => emit('update:modelValue', !props.modelValue)
              },
              slots.trigger?.({ open: props.modelValue })
            ),
            props.modelValue
              ? h('div', { class: 'dropdown-stub__panel', role: 'menu' }, slots.default?.())
              : null
          ])
      }
    })
  }
})

/** Vue hands out one proxy per target, so this is the very object the menu writes to. */
const appSetting = reactive(mocks.appSettingTarget)

const PI_ASTRA = { providerId: 'pi-cli', model: 'codex/gpt-6-astra' }
const PI_GROK = { providerId: 'pi-cli', model: 'cpa/grok-4.6' }
const PI_KIMI = { providerId: 'pi-cli', model: 'kimi/k3' }
const LOCAL_QWEN = { providerId: 'ollama', model: 'qwen2.5:3b' }

function providerOptions(): ProviderModelOption[] {
  return [
    {
      providerId: 'ollama',
      providerName: 'Local Model',
      providerType: 'local',
      models: ['qwen2.5:3b'],
      available: true
    },
    {
      providerId: 'pi-cli',
      providerName: 'Pi (local CLI)',
      providerType: 'custom',
      models: ['codex/gpt-6-astra', 'cpa/grok-4.6', 'kimi/k3'],
      available: true
    }
  ]
}

function resetAppSetting(conversation?: Record<string, unknown>): void {
  for (const key of Object.keys(appSetting)) delete appSetting[key]
  if (conversation) appSetting.conversation = conversation
}

const TRIGGER = '<button class="pill" type="button">pill</button>'

let wrapper: VueWrapper | null = null

async function mountMenu(): Promise<VueWrapper> {
  const { default: HomeModelMenu } = await import('./HomeModelMenu.vue')
  wrapper = mount(HomeModelMenu, {
    attachTo: document.body,
    slots: { trigger: TRIGGER }
  })
  return wrapper
}

/** Opens through the pill and lets the option load settle, as a user click would. */
async function openMenu(): Promise<VueWrapper> {
  const menu = await mountMenu()
  await menu.find('.pill').trigger('click')
  await flushPromises()
  await nextTick()
  return menu
}

function panel(menu: VueWrapper) {
  return menu.find('.dropdown-stub__panel')
}

function rows(menu: VueWrapper) {
  return menu.findAll('.HomeModelMenu-Row')
}

function rowNames(menu: VueWrapper): string[] {
  return rows(menu).map((row) => row.find('.HomeModelMenu-Name').text())
}

function filters(menu: VueWrapper) {
  return menu.findAll('.HomeModelMenu-Filter')
}

function pressedFilters(menu: VueWrapper): string[] {
  return filters(menu)
    .filter((button) => button.attributes('aria-pressed') === 'true')
    .map((button) => button.attributes('aria-label') ?? '')
}

async function search(menu: VueWrapper, text: string): Promise<void> {
  await menu.find('.HomeModelMenu-Search input').setValue(text)
  await nextTick()
}

beforeEach(() => {
  vi.resetModules()
  mocks.getProviderModelOptions.mockReset()
  mocks.getProviderModelOptions.mockResolvedValue(providerOptions())
  mocks.isHydrated.mockReset()
  mocks.isHydrated.mockReturnValue(true)
  mocks.whenHydrated.mockReset()
  mocks.whenHydrated.mockResolvedValue(undefined)
  mocks.isMac = true
  resetAppSetting({ model: null, favoriteModels: [] })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('panel structure', () => {
  it('renders the strip, the search field, the Auto row and the rows of the first provider', async () => {
    const menu = await openMenu()

    expect(menu.findComponent({ name: 'TxDropdownMenu' }).props('initialFocus')).toBe('none')
    expect(panel(menu).exists()).toBe(true)
    expect(menu.find('.HomeModelMenu-Filters').attributes('role')).toBe('group')
    expect(menu.find('.HomeModelMenu-Filters').attributes('aria-label')).toBe('home.modelProviders')

    const strip = filters(menu)
    expect(strip.map((button) => button.attributes('aria-label'))).toEqual([
      'home.modelFavorites',
      'Local Model',
      'Pi (local CLI)'
    ])
    expect(strip.every((button) => button.attributes('type') === 'button')).toBe(true)
    // Nothing pinned and nothing starred: the first provider is the opening filter.
    expect(pressedFilters(menu)).toEqual(['Local Model'])

    const auto = menu.find('.HomeModelMenu-Auto')
    expect(auto.attributes('role')).toBe('menuitemradio')
    expect(auto.attributes('aria-checked')).toBe('true')
    expect(auto.text()).toBe('home.modelAuto')

    expect(menu.find('.HomeModelMenu-Search input').attributes('placeholder')).toBe(
      'home.modelSearch'
    )
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])
  })

  it('moves focus to the search field once the panel is open', async () => {
    const menu = await openMenu()

    expect(document.activeElement).toBe(menu.find('.HomeModelMenu-Search input').element)
  })

  it('shows the loading line until the options land, holding the Auto row in place', async () => {
    let resolveOptions: (value: ProviderModelOption[]) => void = () => {}
    mocks.getProviderModelOptions.mockReturnValueOnce(
      new Promise<ProviderModelOption[]>((resolve) => {
        resolveOptions = resolve
      })
    )
    const menu = await mountMenu()
    await menu.find('.pill').trigger('click')
    await nextTick()

    expect(menu.find('.HomeModelMenu-Hint').text()).toBe('home.modelLoading')
    expect(menu.find('.HomeModelMenu-Auto').exists()).toBe(true)
    expect(rows(menu)).toHaveLength(0)

    resolveOptions(providerOptions())
    await flushPromises()
    await nextTick()

    expect(menu.find('.HomeModelMenu-Hint').exists()).toBe(false)
    expect(rows(menu)).toHaveLength(1)
  })

  it('says so when no provider offers a model', async () => {
    mocks.getProviderModelOptions.mockResolvedValue([])
    const menu = await openMenu()

    expect(menu.find('.HomeModelMenu-Hint').text()).toBe('home.modelEmpty')
    expect(menu.find('.HomeModelMenu-Auto').attributes('aria-checked')).toBe('true')
    // The strip still has its fixed star slot, so the layout does not depend on the data.
    expect(filters(menu).map((button) => button.attributes('aria-label'))).toEqual([
      'home.modelFavorites'
    ])
  })
})

describe('reopening', () => {
  it('fetches the options again on every open, so a provider registered after the first load shows up', async () => {
    // What the first load saw: only the local provider, as when a CLI is installed after launch.
    mocks.getProviderModelOptions.mockResolvedValueOnce(
      providerOptions().filter((option) => option.providerId === 'ollama')
    )
    const menu = await openMenu()

    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)
    expect(filters(menu).map((button) => button.attributes('aria-label'))).toEqual([
      'home.modelFavorites',
      'Local Model'
    ])
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])

    await menu.find('.pill').trigger('click')
    await nextTick()
    expect(panel(menu).exists()).toBe(false)

    await menu.find('.pill').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(2)
    expect(filters(menu).map((button) => button.attributes('aria-label'))).toEqual([
      'home.modelFavorites',
      'Local Model',
      'Pi (local CLI)'
    ])
    await filters(menu)[2].trigger('click')
    expect(rowNames(menu)).toEqual(['gpt-6-astra', 'grok-4.6', 'k3'])
  })

  it('keeps the rows it already has on screen while the refetch is in flight', async () => {
    const menu = await openMenu()
    await menu.find('.pill').trigger('click')
    await nextTick()

    let resolveOptions: (value: ProviderModelOption[]) => void = () => {}
    mocks.getProviderModelOptions.mockReturnValueOnce(
      new Promise<ProviderModelOption[]>((resolve) => {
        resolveOptions = resolve
      })
    )
    await menu.find('.pill').trigger('click')
    await nextTick()

    // The refetch has started, but this is not a first load: the loading line would blank a list
    // the user is already reading, so the previous rows stand until the new ones land.
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(2)
    expect(menu.find('.HomeModelMenu-Hint').exists()).toBe(false)
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])

    resolveOptions([
      ...providerOptions(),
      {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        models: ['gpt-5'],
        available: true
      }
    ])
    await flushPromises()
    await nextTick()

    expect(filters(menu).map((button) => button.attributes('aria-label'))).toEqual([
      'home.modelFavorites',
      'Local Model',
      'Pi (local CLI)',
      'OpenAI'
    ])
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])
  })
})

describe('rows', () => {
  it('shows the pi model without its source prefix and names the source in the subtitle', async () => {
    const menu = await openMenu()
    await filters(menu)[2].trigger('click')

    const first = rows(menu)[0]
    expect(first.find('.HomeModelMenu-Name').text()).toBe('gpt-6-astra')
    expect(first.find('.HomeModelMenu-Sub').text()).toBe('Pi (local CLI) · codex')
    // Family first: `gpt-6-astra` is OpenAI's, whatever icon the pi provider itself has.
    expect(first.find('.HomeModelMenu-Icon i').classes()).toContain('i-simple-icons-openai')
    expect(first.find('[role="menuitemradio"]').attributes('aria-checked')).toBe('false')
  })

  it('shows a local model whole, colon included, with the provider alone as subtitle', async () => {
    const menu = await openMenu()

    const first = rows(menu)[0]
    expect(first.find('.HomeModelMenu-Name').text()).toBe('qwen2.5:3b')
    expect(first.find('.HomeModelMenu-Sub').text()).toBe('Local Model')
    expect(first.find('.HomeModelMenu-Icon i').classes()).toContain('i-simple-icons-qwen')
  })

  it('draws each row with its model family icon, whatever the provider serves it', async () => {
    const menu = await openMenu()

    // The local provider's own icon is a server; the row says what the model is instead.
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])
    expect(rows(menu)[0].find('.HomeModelMenu-Icon i').classes()).toContain('i-simple-icons-qwen')

    await filters(menu)[2].trigger('click')
    expect(rowNames(menu)).toEqual(['gpt-6-astra', 'grok-4.6', 'k3'])
    const icons = rows(menu).map((row) => row.find('.HomeModelMenu-Icon i').classes())
    // Matched on the name part, so the `codex/` source does not make this a codex family.
    expect(icons[0]).toContain('i-simple-icons-openai')
    // simple-icons has no xAI mark; the X glyph stands in.
    expect(icons[1]).toContain('i-simple-icons-x')
  })

  it('falls back to the provider icon for a model whose name names no family', async () => {
    const menu = await openMenu()
    await filters(menu)[2].trigger('click')

    // `kimi/k3`: the source is Kimi, but the name part `k3` says nothing, so the pi provider's
    // icon stands in — `custom` in this fixture.
    const kimi = rows(menu)[2]
    expect(kimi.find('.HomeModelMenu-Name').text()).toBe('k3')
    expect(kimi.find('.HomeModelMenu-Icon i').classes()).toContain('i-carbon-settings')
    expect(kimi.find('.HomeModelMenu-Icon i').classes()).not.toContain('i-simple-icons-kimi')
  })

  it('keeps the provider icon on the filter strip, where the provider is the subject', async () => {
    const menu = await openMenu()

    // The star filter is a plain span; the provider buttons render a TxIcon each.
    const stripIcons = filters(menu)
      .slice(1)
      .map((button) => button.find('i').classes())
    expect(stripIcons[0]).toContain('i-carbon-bare-metal-server')
    expect(stripIcons[1]).toContain('i-carbon-settings')
  })

  it('badges the first nine rows with the platform chord and no more', async () => {
    mocks.getProviderModelOptions.mockResolvedValue([
      {
        providerId: 'many',
        providerName: 'Many',
        providerType: 'openai',
        models: Array.from({ length: 11 }, (_, index) => `model-${index + 1}`),
        available: true
      }
    ])
    const menu = await openMenu()

    const badges = rows(menu).map((row) => row.find('.HomeModelMenu-Kbd'))
    expect(badges).toHaveLength(11)
    // The badge sits inside the radio, not beside it: the scoped rule that flattens TxKbd's
    // keycap relief keys on `.HomeModelMenu-Item .HomeModelMenu-Kbd` and would silently stop
    // applying if the badge moved out.
    expect(rows(menu)[0].find('.HomeModelMenu-Item .HomeModelMenu-Kbd').exists()).toBe(true)
    expect(badges.slice(0, 9).map((badge) => badge.text())).toEqual([
      '⌘1',
      '⌘2',
      '⌘3',
      '⌘4',
      '⌘5',
      '⌘6',
      '⌘7',
      '⌘8',
      '⌘9'
    ])
    expect(badges.slice(9).every((badge) => !badge.exists())).toBe(true)
  })

  it('spells the chord with Ctrl off a Mac', async () => {
    mocks.isMac = false
    const menu = await openMenu()

    expect(rows(menu)[0].find('.HomeModelMenu-Kbd').text()).toBe('Ctrl+1')
  })

  it('marks the persisted model as checked and opens on its provider', async () => {
    resetAppSetting({ model: { ...PI_GROK }, favoriteModels: [] })
    const menu = await openMenu()

    expect(pressedFilters(menu)).toEqual(['Pi (local CLI)'])
    expect(menu.find('.HomeModelMenu-Auto').attributes('aria-checked')).toBe('false')
    const checked = rows(menu).filter(
      (row) => row.find('[role="menuitemradio"]').attributes('aria-checked') === 'true'
    )
    expect(checked).toHaveLength(1)
    expect(checked[0].classes()).toContain('is-selected')
    expect(checked[0].find('.HomeModelMenu-Name').text()).toBe('grok-4.6')
  })

  it('keeps Auto checked when the persisted model is not on offer, without clearing it', async () => {
    const stale = { providerId: 'pi-cli', model: 'codex/gpt-7-nova' }
    resetAppSetting({ model: { ...stale }, favoriteModels: [] })
    const menu = await openMenu()

    expect(menu.find('.HomeModelMenu-Auto').attributes('aria-checked')).toBe('true')
    expect(rows(menu).some((row) => row.classes().includes('is-selected'))).toBe(false)
    expect(appSetting.conversation).toEqual({ model: stale, favoriteModels: [] })
  })
})

describe('filters', () => {
  it('shows only the pressed provider, and exactly one filter is pressed at a time', async () => {
    const menu = await openMenu()

    await filters(menu)[2].trigger('click')
    expect(pressedFilters(menu)).toEqual(['Pi (local CLI)'])
    expect(rowNames(menu)).toEqual(['gpt-6-astra', 'grok-4.6', 'k3'])

    await filters(menu)[1].trigger('click')
    expect(pressedFilters(menu)).toEqual(['Local Model'])
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])
  })

  it('shows only favourites under the star filter, and a hint when there are none', async () => {
    resetAppSetting({ model: null, favoriteModels: [PI_KIMI, LOCAL_QWEN] })
    const menu = await openMenu()

    // Nothing pinned but a favourite resolves: the star filter is the opening one.
    expect(pressedFilters(menu)).toEqual(['home.modelFavorites'])
    expect(rowNames(menu)).toEqual(['qwen2.5:3b', 'k3'])

    await rows(menu)[0].find('.HomeModelMenu-Star').trigger('click')
    await rows(menu)[0].find('.HomeModelMenu-Star').trigger('click')
    await nextTick()

    expect(rows(menu)).toHaveLength(0)
    expect(menu.find('.HomeModelMenu-Hint').text()).toBe('home.modelFavoritesEmpty')
    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [] })
  })

  it('searches across every provider and ignores the strip while a query is typed', async () => {
    const menu = await openMenu()
    expect(pressedFilters(menu)).toEqual(['Local Model'])

    await search(menu, 'GROK')
    expect(rowNames(menu)).toEqual(['grok-4.6'])
    expect(pressedFilters(menu)).toEqual(['Local Model'])

    // Provider name and source are searchable too.
    await search(menu, 'pi (')
    expect(rowNames(menu)).toEqual(['gpt-6-astra', 'grok-4.6', 'k3'])
    await search(menu, 'codex')
    expect(rowNames(menu)).toEqual(['gpt-6-astra'])

    // Clearing it hands the list back to the strip.
    await search(menu, '')
    expect(rowNames(menu)).toEqual(['qwen2.5:3b'])
  })

  it('reports a query with no hit', async () => {
    const menu = await openMenu()

    await search(menu, 'claude')
    expect(rows(menu)).toHaveLength(0)
    expect(menu.find('.HomeModelMenu-Hint').text()).toBe('home.modelNoResults')
    expect(menu.find('.HomeModelMenu-Auto').exists()).toBe(true)
  })

  it("starts each opening with an empty query and the pinned model's provider", async () => {
    const menu = await openMenu()

    await search(menu, 'grok')
    await filters(menu)[0].trigger('click')
    await rows(menu)[0].find('[role="menuitemradio"]').trigger('click')
    await nextTick()
    expect(panel(menu).exists()).toBe(false)
    expect(appSetting.conversation).toEqual({ model: PI_GROK, favoriteModels: [] })

    await menu.find('.pill').trigger('click')
    await flushPromises()
    await nextTick()

    expect(menu.find<HTMLInputElement>('.HomeModelMenu-Search input').element.value).toBe('')
    expect(pressedFilters(menu)).toEqual(['Pi (local CLI)'])
    expect(rowNames(menu)).toEqual(['gpt-6-astra', 'grok-4.6', 'k3'])
  })
})

describe('choosing', () => {
  it('selects the first visible row on ⌘1 and closes, so the pill can update at once', async () => {
    const menu = await openMenu()
    await filters(menu)[2].trigger('click')

    const event = new KeyboardEvent('keydown', {
      key: '1',
      metaKey: true,
      bubbles: true,
      cancelable: true
    })
    menu.find('.HomeModelMenu-Search input').element.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(appSetting.conversation).toEqual({ model: PI_ASTRA, favoriteModels: [] })
    expect(panel(menu).exists()).toBe(false)
    // The refocus is queued from inside the close flush, one tick behind the panel's removal.
    await nextTick()
    expect(document.activeElement).toBe(menu.find('.pill').element)
  })

  it('takes Ctrl+digit off a Mac and leaves ⌘ alone there', async () => {
    mocks.isMac = false
    const menu = await openMenu()

    const meta = new KeyboardEvent('keydown', {
      key: '1',
      metaKey: true,
      bubbles: true,
      cancelable: true
    })
    menu.find('.HomeModelMenu').element.dispatchEvent(meta)
    await nextTick()
    expect(meta.defaultPrevented).toBe(false)
    expect(panel(menu).exists()).toBe(true)
    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [] })

    const ctrl = new KeyboardEvent('keydown', {
      key: '1',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    })
    menu.find('.HomeModelMenu').element.dispatchEvent(ctrl)
    await nextTick()
    expect(ctrl.defaultPrevented).toBe(true)
    expect(appSetting.conversation).toEqual({ model: LOCAL_QWEN, favoriteModels: [] })
    expect(panel(menu).exists()).toBe(false)
  })

  it('does nothing for a digit past the last visible row', async () => {
    const menu = await openMenu()

    const event = new KeyboardEvent('keydown', {
      key: '3',
      metaKey: true,
      bubbles: true,
      cancelable: true
    })
    menu.find('.HomeModelMenu').element.dispatchEvent(event)
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [] })
    expect(panel(menu).exists()).toBe(true)
  })

  it('picks a row by click and Auto by its row, each closing the menu', async () => {
    const menu = await openMenu()

    await rows(menu)[0].find('[role="menuitemradio"]').trigger('click')
    await nextTick()
    expect(appSetting.conversation).toEqual({ model: LOCAL_QWEN, favoriteModels: [] })
    expect(panel(menu).exists()).toBe(false)

    await menu.find('.pill').trigger('click')
    await nextTick()
    expect(menu.find('.HomeModelMenu-Auto').attributes('aria-checked')).toBe('false')

    await menu.find('.HomeModelMenu-Auto').trigger('click')
    await nextTick()
    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [] })
    expect(panel(menu).exists()).toBe(false)
  })

  it('stars a row without selecting it or closing the menu', async () => {
    const menu = await openMenu()
    await filters(menu)[2].trigger('click')

    const star = rows(menu)[1].find('.HomeModelMenu-Star')
    expect(star.attributes('type')).toBe('button')
    expect(star.attributes('aria-pressed')).toBe('false')
    expect(star.attributes('aria-label')).toBe('home.modelFavorite')
    // Never nested in the radio: a control inside a control is not a control.
    expect(rows(menu)[1].find('[role="menuitemradio"] .HomeModelMenu-Star').exists()).toBe(false)

    await star.trigger('click')
    await nextTick()

    expect(appSetting.conversation).toEqual({ model: null, favoriteModels: [PI_GROK] })
    expect(panel(menu).exists()).toBe(true)
    expect(rows(menu)[1].find('.HomeModelMenu-Star').attributes('aria-pressed')).toBe('true')
    expect(rows(menu)[1].find('.HomeModelMenu-Star').attributes('aria-label')).toBe(
      'home.modelUnfavorite'
    )
    expect(rows(menu)[1].find('[role="menuitemradio"]').attributes('aria-checked')).toBe('false')

    // The star filter reflects it at once.
    await filters(menu)[0].trigger('click')
    expect(rowNames(menu)).toEqual(['grok-4.6'])
  })

  it('marks Escape as a keyboard close so focus returns to the pill', async () => {
    const menu = await openMenu()

    menu
      .find('.HomeModelMenu-Search input')
      .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // The anchor closes on Escape itself; the stub has no such wiring, so close through the pill.
    await menu.find('.pill').trigger('click')
    await nextTick()

    expect(panel(menu).exists()).toBe(false)
    expect(document.activeElement).toBe(menu.find('.pill').element)
  })
})
