// @vitest-environment jsdom
/**
 * The home model popover as a whole (`home-composer` › 模型弹层): the two columns, 「最近使用」,
 * the search across sources, the keyboard between the columns, the empty and loading states and the
 * effort row. TxPopover is stubbed to a plain in-tree panel so no teleport or entrance animation is
 * involved; the search field, chips, skeletons and icons are the real primitives. `useModelOptions`
 * keeps module-scope state, so every test re-imports the menu after `resetModules`.
 */
import type { ProviderModelOption } from '~/modules/conversation/useModelOptions'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { IntelligenceProviderType } from '@talex-touch/tuff-intelligence'
import { resolveProviderEffectiveModel } from '../../../../../main/modules/ai/model-request-plan'

const mocks = vi.hoisted(() => ({
  getProviderModelOptions: vi.fn<() => Promise<ProviderModelOption[]>>(),
  /** Raw target; both the mocked module and the assertions below wrap it with `reactive`. */
  appSettingTarget: {} as Record<string, unknown>,
  isHydrated: vi.fn(() => true),
  whenHydrated: vi.fn<() => Promise<void>>(async () => undefined),
  push: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push })
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

/** The reference slot always renders and toggles the panel; the panel renders in place while open. */
vi.mock('@talex-touch/tuffex/popover', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    TxPopover: defineComponent({
      name: 'TxPopover',
      props: {
        modelValue: { type: Boolean, default: false },
        placement: { type: String, default: 'bottom-start' }
      },
      emits: ['update:modelValue'],
      setup(props, { slots, emit }) {
        return () =>
          h('div', { class: 'popover-stub', 'data-placement': props.placement }, [
            h(
              'div',
              {
                class: 'popover-stub__reference',
                onClick: () => emit('update:modelValue', !props.modelValue)
              },
              slots.reference?.()
            ),
            props.modelValue
              ? h('div', { class: 'popover-stub__panel', role: 'dialog' }, slots.default?.())
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

function withEffectiveModels(
  option: Omit<ProviderModelOption, 'effectiveModels'>
): ProviderModelOption {
  return {
    ...option,
    effectiveModels: option.models.map((model) =>
      resolveProviderEffectiveModel(
        {
          id: option.providerId,
          name: option.providerName,
          type: option.providerType as IntelligenceProviderType,
          enabled: option.available,
          models: option.models.map((id) => ({ id }))
        },
        model
      )
    )
  }
}

function providerOptions(): ProviderModelOption[] {
  return [
    {
      providerId: 'ollama',
      providerName: 'Local Model',
      providerType: 'local',
      models: ['qwen2.5:3b', 'qwen3.5:4b'],
      available: true
    },
    {
      providerId: 'pi-cli',
      providerName: 'Pi (local CLI)',
      providerType: 'custom',
      models: ['codex/gpt-6-astra', 'codex/gpt-6-luna', 'cpa/grok-4.6', 'kimi/k3'],
      available: true
    }
  ].map(withEffectiveModels)
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
    props: { placement: 'top-end' },
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
  return menu.find('.popover-stub__panel')
}

/** The left column as read: group headings by name, tabs by `label (count)`, the selected one starred. */
function railText(menu: VueWrapper): string[] {
  return menu.findAll('.HomeModelMenu-Tabs > *').flatMap((node) => {
    if (node.classes('HomeModelMenu-RailGroup')) return [`# ${node.text()}`]
    if (!node.classes('HomeModelMenu-RailItem')) return []
    const label = node.find('.HomeModelMenu-RailLabel').text()
    const count = node.find('.HomeModelMenu-RailCount')
    const selected = node.attributes('aria-selected') === 'true' ? '*' : ''
    return [`${selected}${label}${count.exists() ? ` (${count.text()})` : ''}`]
  })
}

function options(menu: VueWrapper) {
  return menu.findAll('[data-home-model-option]')
}

function optionNames(menu: VueWrapper): string[] {
  return options(menu).map((row) => row.find('.HomeModelMenu-OptionLabel').text())
}

function tab(menu: VueWrapper, label: string) {
  const found = menu
    .findAll('[data-home-model-rail-item]')
    .find((item) => item.find('.HomeModelMenu-RailLabel').text() === label)
  if (!found) throw new Error(`no tab ${label}`)
  return found
}

async function search(menu: VueWrapper, text: string): Promise<void> {
  await menu.find('.HomeModelMenu-Search input').setValue(text)
  await nextTick()
}

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
}

beforeEach(() => {
  // jsdom lays nothing out, so it has no scrollIntoView; the menu calls it to keep focus in view.
  Element.prototype.scrollIntoView = vi.fn()
  vi.resetModules()
  mocks.getProviderModelOptions.mockReset()
  mocks.getProviderModelOptions.mockResolvedValue(providerOptions())
  mocks.isHydrated.mockReset()
  mocks.isHydrated.mockReturnValue(true)
  mocks.whenHydrated.mockReset()
  mocks.whenHydrated.mockResolvedValue(undefined)
  mocks.push.mockReset()
  resetAppSetting({ model: null, favoriteModels: [] })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('panel structure', () => {
  it('lays out the search, the settings key, the two columns and the effort row', async () => {
    const menu = await openMenu()

    expect(panel(menu).exists()).toBe(true)
    expect(menu.find('.HomeModelMenu-Search input').exists()).toBe(true)
    expect(menu.find('.HomeModelMenu-Settings').attributes('aria-label')).toBe('home.modelSettings')
    // A service without channels is one entry; a service with channels heads its channels.
    expect(menu.find('.HomeModelMenu-Tabs').attributes('role')).toBe('tablist')
    expect(railText(menu)).toEqual([
      'home.modelRecent',
      '*Local Model (2)',
      '# Pi',
      'codex (2)',
      'cpa (1)',
      'kimi (1)'
    ])
    // The column prints the short name; the title keeps the service's whole name.
    expect(menu.find('.HomeModelMenu-RailGroup').attributes('title')).toBe('Pi (local CLI)')
    expect(tab(menu, 'codex').attributes('title')).toBe('Pi (local CLI) · codex')
    // Nothing pinned and nothing recent: the first source opens.
    expect(menu.find('.HomeModelMenu-List').attributes('role')).toBe('listbox')
    expect(optionNames(menu)).toEqual(['qwen2.5:3b', 'qwen3.5:4b'])
    expect(menu.find('.HomeModelMenu-Foot .HomeModelMenu-EffortChips').exists()).toBe(true)
  })

  it('keeps 「自动选择」 above the tabs as an action, checked while routing is automatic', async () => {
    const menu = await openMenu()

    const auto = menu.find('.HomeModelMenu-Rail > .HomeModelMenu-RailItem')
    expect(auto.text()).toContain('home.modelAuto')
    expect(auto.attributes('role')).toBeUndefined()
    expect(auto.attributes('aria-pressed')).toBe('true')
    expect(auto.find('.HomeModelMenu-RailCheck').exists()).toBe(true)
  })

  it('has no filter strip, no row subtitles, no stars and no chord badges', async () => {
    const menu = await openMenu()

    expect(menu.find('.HomeModelMenu-Filters').exists()).toBe(false)
    expect(menu.find('.tx-card-item__subtitle').exists()).toBe(false)
    expect(menu.find('.HomeModelMenu-Star').exists()).toBe(false)
    expect(menu.find('.tx-kbd').exists()).toBe(false)
  })

  it('moves focus to the search field once the panel is open', async () => {
    const menu = await openMenu()
    expect(document.activeElement).toBe(menu.find('.HomeModelMenu-Search input').element)
  })

  it('shows skeleton rows in both columns until the options land', async () => {
    let resolve: (value: ProviderModelOption[]) => void = () => {}
    mocks.getProviderModelOptions.mockReturnValue(
      new Promise((done) => {
        resolve = done
      })
    )
    const menu = await mountMenu()
    await menu.find('.pill').trigger('click')
    await nextTick()

    expect(menu.findAll('.HomeModelMenu-RailSkeleton')).toHaveLength(4)
    expect(menu.findAll('.HomeModelMenu-RowSkeleton')).toHaveLength(5)
    expect(menu.find('.HomeModelMenu-List').attributes('aria-busy')).toBe('true')
    // Unknown yet whether anything is pinned: 「自动选择」 claims nothing until the list lands.
    const auto = () => menu.find('.HomeModelMenu-Rail > .HomeModelMenu-RailItem')
    expect(auto().attributes('aria-pressed')).toBe('false')
    expect(auto().find('.HomeModelMenu-RailCheck').exists()).toBe(false)

    resolve(providerOptions())
    await flushPromises()
    await nextTick()

    expect(menu.find('.HomeModelMenu-RowSkeleton').exists()).toBe(false)
    expect(optionNames(menu)).toEqual(['qwen2.5:3b', 'qwen3.5:4b'])
    expect(auto().attributes('aria-pressed')).toBe('true')
  })

  it('says so when no provider offers a model, and offers the settings', async () => {
    mocks.getProviderModelOptions.mockResolvedValue([])
    const menu = await openMenu()

    expect(menu.find('.HomeModelMenu-Empty').text()).toContain('home.modelEmpty')
    await menu.find('.HomeModelMenu-Empty .HomeModelMenu-Link').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/setting/intelligence/channels')
  })
})

describe('opening', () => {
  it("opens on the pinned model's source, its row checked", async () => {
    resetAppSetting({ model: { ...PI_GROK }, favoriteModels: [] })
    const menu = await openMenu()

    expect(railText(menu)).toContain('*cpa (1)')
    expect(optionNames(menu)).toEqual(['grok-4.6'])
    const row = options(menu)[0]!
    expect(row.attributes('aria-selected')).toBe('true')
    expect(row.find('.HomeModelMenu-Check').exists()).toBe(true)
    // The id stays one hover away: the row shows the name, the title the whole id.
    expect(row.attributes('title')).toBe('cpa/grok-4.6')
  })

  it('opens on 「最近使用」 under automatic routing once there are recent picks', async () => {
    resetAppSetting({ model: null, favoriteModels: [], recentModels: [{ ...PI_KIMI }] })
    const menu = await openMenu()

    expect(railText(menu)[0]).toBe('*home.modelRecent')
    expect(optionNames(menu)).toEqual(['k3'])
  })

  it('fetches the options again on every open, so a provider registered meanwhile shows up', async () => {
    const menu = await openMenu()
    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(1)
    await menu.find('.pill').trigger('click')
    await nextTick()

    mocks.getProviderModelOptions.mockResolvedValue([
      ...providerOptions(),
      ...[
        {
          providerId: 'openai-default',
          providerName: 'OpenAI',
          providerType: 'openai',
          models: ['gpt-5.5'],
          available: true
        }
      ].map(withEffectiveModels)
    ])
    await menu.find('.pill').trigger('click')
    await flushPromises()
    await nextTick()

    expect(mocks.getProviderModelOptions).toHaveBeenCalledTimes(2)
    expect(railText(menu)).toContain('OpenAI (1)')
  })

  it('keeps the whole service name where two short ones would print the same', async () => {
    mocks.getProviderModelOptions.mockResolvedValue(
      [
        {
          providerId: 'codex-cli',
          providerName: 'Codex (local CLI)',
          providerType: 'custom',
          models: ['gpt-5.5'],
          available: true
        },
        {
          providerId: 'codex-api',
          providerName: 'Codex',
          providerType: 'openai',
          models: ['gpt-5.5'],
          available: true
        },
        {
          providerId: 'claude-cli',
          providerName: 'Claude Code (local CLI)',
          providerType: 'custom',
          models: ['sonnet'],
          available: true
        }
      ].map(withEffectiveModels)
    )
    const menu = await openMenu()

    expect(railText(menu)).toEqual([
      'home.modelRecent',
      '*Codex (local CLI) (1)',
      'Codex (1)',
      'Claude Code (1)'
    ])
  })

  it('starts each opening with an empty query and the pinned source', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const menu = await openMenu()
    await tab(menu, 'kimi').trigger('click')
    await search(menu, 'qwen')

    await menu.find('.pill').trigger('click')
    await nextTick()
    await menu.find('.pill').trigger('click')
    await flushPromises()
    await nextTick()

    expect((menu.find('.HomeModelMenu-Search input').element as HTMLInputElement).value).toBe('')
    expect(railText(menu)).toContain('*codex (2)')
  })

  it('starts both columns at their top again on every opening, then shows the pinned rows', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const menu = await openMenu()
    await menu.find('.pill').trigger('click')
    await nextTick()

    // jsdom lays nothing out, so the order of the calls is the observable: every offset written
    // and every row brought into view, in sequence.
    const calls: string[] = []
    const columnOf = (element: Element) =>
      element.classList.contains('HomeModelMenu-Rail')
        ? 'rail'
        : element.classList.contains('HomeModelMenu-List')
          ? 'list'
          : element.className
    const offset = vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation(function (
      this: Element,
      value: number
    ) {
      calls.push(`${columnOf(this)} scrollTop=${value}`)
    })
    vi.mocked(Element.prototype.scrollIntoView).mockImplementation(function (this: Element) {
      calls.push(`reveal ${this.textContent?.trim()}`)
    })

    await menu.find('.pill').trigger('click')
    await flushPromises()
    await nextTick()
    offset.mockRestore()

    expect(calls).toEqual([
      'rail scrollTop=0',
      'list scrollTop=0',
      expect.stringMatching(/^reveal codex/),
      expect.stringMatching(/^reveal gpt-6-astra/)
    ])
  })
})

describe('recent picks', () => {
  it('records each pick newest first, once, and tags each row with where it comes from', async () => {
    const menu = await openMenu()
    await tab(menu, 'kimi').trigger('click')
    await options(menu)[0]!.trigger('click')
    await nextTick()

    await menu.find('.pill').trigger('click')
    await flushPromises()
    await tab(menu, 'Local Model').trigger('click')
    await options(menu)[0]!.trigger('click')
    await nextTick()

    await menu.find('.pill').trigger('click')
    await flushPromises()
    await tab(menu, 'home.modelRecent').trigger('click')

    expect(optionNames(menu)).toEqual(['qwen2.5:3b', 'k3'])
    expect(menu.findAll('.HomeModelMenu-Tag').map((tag) => tag.text())).toEqual([
      'Local Model',
      'Pi · kimi'
    ])
    expect((appSetting.conversation as Record<string, unknown>).recentModels).toEqual([
      LOCAL_QWEN,
      PI_KIMI
    ])
  })

  it('keeps at most five, moving a repeated pick to the front instead of listing it twice', async () => {
    resetAppSetting({
      model: null,
      favoriteModels: [],
      recentModels: [
        { providerId: 'pi-cli', model: 'codex/gpt-6-luna' },
        { ...PI_GROK },
        { ...PI_KIMI },
        { ...LOCAL_QWEN },
        { providerId: 'ollama', model: 'qwen3.5:4b' }
      ]
    })
    const menu = await openMenu()
    await tab(menu, 'codex').trigger('click')
    await options(menu)
      .find((row) => row.attributes('title') === PI_ASTRA.model)!
      .trigger('click')
    await nextTick()

    expect((appSetting.conversation as Record<string, unknown>).recentModels).toEqual([
      PI_ASTRA,
      { providerId: 'pi-cli', model: 'codex/gpt-6-luna' },
      PI_GROK,
      PI_KIMI,
      LOCAL_QWEN
    ])
  })

  it('hides a recent pick whose provider is not on offer, without forgetting it', async () => {
    const gone = { providerId: 'gone', model: 'old-model' }
    resetAppSetting({ model: null, favoriteModels: [], recentModels: [gone, { ...PI_KIMI }] })
    const menu = await openMenu()

    expect(optionNames(menu)).toEqual(['k3'])
    expect((appSetting.conversation as Record<string, unknown>).recentModels).toEqual([
      gone,
      PI_KIMI
    ])
  })

  it('says how 「最近使用」 fills when it is empty', async () => {
    const menu = await openMenu()
    await tab(menu, 'home.modelRecent').trigger('click')

    expect(options(menu)).toHaveLength(0)
    expect(menu.find('.HomeModelMenu-Hint').text()).toBe('home.modelRecentEmpty')
  })

  it('never records automatic routing', async () => {
    resetAppSetting({ model: { ...PI_GROK }, favoriteModels: [] })
    const menu = await openMenu()
    await menu.find('.HomeModelMenu-Rail > .HomeModelMenu-RailItem').trigger('click')
    await nextTick()

    expect((appSetting.conversation as Record<string, unknown>).model).toBeNull()
    expect((appSetting.conversation as Record<string, unknown>).recentModels).toBeUndefined()
    expect(panel(menu).exists()).toBe(false)
  })
})

describe('search', () => {
  it('searches across every source, grouped under each source, with the left column dimmed', async () => {
    const menu = await openMenu()
    await search(menu, 'g')

    expect(menu.findAll('.HomeModelMenu-GroupHeading').map((h) => h.text())).toEqual([
      'Pi (local CLI) · codex',
      'Pi (local CLI) · cpa'
    ])
    expect(optionNames(menu)).toEqual(['gpt-6-astra', 'gpt-6-luna', 'grok-4.6'])
    const rail = menu.find('.HomeModelMenu-Rail')
    expect(rail.classes()).toContain('is-dimmed')
    expect(rail.attributes('inert')).toBeDefined()
  })

  it('puts the left column back where it was once the query clears', async () => {
    const menu = await openMenu()
    await tab(menu, 'kimi').trigger('click')
    await search(menu, 'qwen')
    expect(optionNames(menu)).toEqual(['qwen2.5:3b', 'qwen3.5:4b'])

    await search(menu, '')

    expect(railText(menu)).toContain('*kimi (1)')
    expect(optionNames(menu)).toEqual(['k3'])
    expect(menu.find('.HomeModelMenu-Rail').attributes('inert')).toBeUndefined()
  })

  it('reports a query with no hit', async () => {
    const menu = await openMenu()
    await search(menu, 'nothing-like-this')

    expect(options(menu)).toHaveLength(0)
    expect(menu.find('.HomeModelMenu-Hint').text()).toBe('home.modelNoResults')
  })
})

describe('choosing', () => {
  it('picks a row by click, closing the menu and returning focus to the pill', async () => {
    const menu = await openMenu()
    await tab(menu, 'cpa').trigger('click')
    await options(menu)[0]!.trigger('click')
    await nextTick()

    expect((appSetting.conversation as Record<string, unknown>).model).toEqual(PI_GROK)
    expect(panel(menu).exists()).toBe(false)
    expect(document.activeElement).toBe(menu.find('.pill').element)
  })

  it('picks automatic routing from 「自动选择」 and closes', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const menu = await openMenu()
    await menu.find('.HomeModelMenu-Rail > .HomeModelMenu-RailItem').trigger('click')
    await nextTick()

    expect((appSetting.conversation as Record<string, unknown>).model).toBeNull()
    expect(panel(menu).exists()).toBe(false)
  })

  it('opens the model settings from the settings key and closes', async () => {
    const menu = await openMenu()
    await menu.find('.HomeModelMenu-Settings').trigger('click')
    await nextTick()

    expect(mocks.push).toHaveBeenCalledWith('/setting/intelligence/channels')
    expect(panel(menu).exists()).toBe(false)
  })

  it('walks the columns from the keyboard: ↓ into the list, ← to the sources, ↓ switches source', async () => {
    resetAppSetting({ model: { ...PI_ASTRA }, favoriteModels: [] })
    const menu = await openMenu()

    key(menu.find('.HomeModelMenu-Search input').element, 'ArrowDown')
    await nextTick()
    expect(document.activeElement).toBe(options(menu)[0]!.element)

    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(options(menu)[1]!.element)

    key(document.activeElement!, 'ArrowLeft')
    expect(document.activeElement).toBe(tab(menu, 'codex').element)

    key(document.activeElement!, 'ArrowDown')
    await nextTick()
    // Selection follows focus in the sources: the list now shows cpa.
    expect(document.activeElement).toBe(tab(menu, 'cpa').element)
    expect(optionNames(menu)).toEqual(['grok-4.6'])

    key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(options(menu)[0]!.element)
  })

  it('gives the selected row the list’s one tab stop', async () => {
    resetAppSetting({
      model: { providerId: 'pi-cli', model: 'codex/gpt-6-luna' },
      favoriteModels: []
    })
    const menu = await openMenu()

    expect(options(menu).map((row) => row.attributes('tabindex'))).toEqual(['-1', '0'])
    expect(
      menu
        .findAll('[data-home-model-rail-item]')
        .filter((tab) => tab.attributes('tabindex') === '0')
    ).toHaveLength(1)
  })

  it('marks Escape as a keyboard close so focus returns to the pill', async () => {
    const menu = await openMenu()

    key(menu.find('.HomeModelMenu-Search input').element, 'Escape')
    // The anchor closes on Escape itself; the stub has no such wiring, so close through the pill.
    await menu.find('.pill').trigger('click')
    await nextTick()

    expect(panel(menu).exists()).toBe(false)
    expect(document.activeElement).toBe(menu.find('.pill').element)
  })
})

describe('reasoning effort row', () => {
  const GPT_55 = { providerId: 'openai-default', model: 'gpt-5.5' }
  const GPT_4O = { providerId: 'openai-default', model: 'gpt-4o' }
  const V4_PRO = { providerId: 'deepseek-default', model: 'deepseek-v4-pro' }

  function withCloudProviders(): void {
    mocks.getProviderModelOptions.mockResolvedValue(
      [
        ...providerOptions(),
        {
          providerId: 'openai-default',
          providerName: 'OpenAI',
          providerType: 'openai',
          models: ['gpt-5.5', 'gpt-4o'],
          available: true
        },
        {
          providerId: 'deepseek-default',
          providerName: 'DeepSeek',
          providerType: 'deepseek',
          models: ['deepseek-v4-pro'],
          available: true
        }
      ].map(withEffectiveModels)
    )
  }

  function effortChips(menu: VueWrapper) {
    return menu.findAll('.HomeModelMenu-EffortChips .tx-bui-filter-chips__chip')
  }

  function note(menu: VueWrapper): string | null {
    const line = menu.find('.HomeModelMenu-EffortNote')
    return line.exists() ? line.text() : null
  }

  it('stores a pick without closing the menu or touching the model', async () => {
    const menu = await openMenu()

    await effortChips(menu)[3]!.trigger('click')
    await nextTick()

    expect(appSetting.conversation).toEqual({
      model: null,
      favoriteModels: [],
      reasoningEffort: 'high'
    })
    expect(panel(menu).exists()).toBe(true)
    // Auto routing: whether it applies depends on the model the turn lands on.
    expect(note(menu)).toBe('home.reasoning.autoRoute')
  })

  it('goes inert with its reason on a pinned route that takes no effort', async () => {
    resetAppSetting({ model: { ...LOCAL_QWEN }, favoriteModels: [], reasoningEffort: 'high' })
    const menu = await openMenu()

    expect(effortChips(menu).every((chip) => chip.attributes('disabled') !== undefined)).toBe(true)
    expect(menu.find('.HomeModelMenu-Effort').classes()).toContain('is-disabled')
    expect(note(menu)).toBe('home.reasoning.unsupportedProvider')
    // The stored choice survives: it simply is not sent to this model.
    expect((appSetting.conversation as Record<string, unknown>).reasoningEffort).toBe('high')
  })

  it('tells a model that takes no effort from a route that takes none', async () => {
    withCloudProviders()
    resetAppSetting({ model: { ...GPT_4O }, favoriteModels: [], reasoningEffort: 'max' })
    const menu = await openMenu()

    expect(note(menu)).toBe('home.reasoning.unsupportedModel')
    expect(effortChips(menu)[0]!.attributes('disabled')).toBeDefined()
  })

  it('stays live on a model that rounds, and says where to', async () => {
    withCloudProviders()
    resetAppSetting({ model: { ...V4_PRO }, favoriteModels: [], reasoningEffort: 'low' })
    const menu = await openMenu()

    expect(effortChips(menu).every((chip) => chip.attributes('disabled') === undefined)).toBe(true)
    expect(note(menu)).toBe('home.reasoning.clamped')
  })

  it('says nothing on a model that takes the level as chosen', async () => {
    withCloudProviders()
    resetAppSetting({ model: { ...GPT_55 }, favoriteModels: [], reasoningEffort: 'high' })
    const menu = await openMenu()

    expect(note(menu)).toBeNull()
    expect(
      effortChips(menu)
        .filter((chip) => chip.attributes('aria-pressed') === 'true')
        .map((chip) => chip.text())
    ).toEqual(['home.reasoning.level.high'])
  })
})
