import type { TuffItem, TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import { TuffInputType } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import zhCN from '../../../../../renderer/src/modules/lang/zh-CN.json'
import {
  COMMON_SETTING_DESTINATION_IDS,
  getAppDestination
} from '../../../../../shared/app-destinations'
import { AppDestinationProvider } from './app-destination-provider'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  getAppDestinationNavigationService: vi.fn(),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

vi.mock('../../../app-destination/app-destination-navigation', () => ({
  getAppDestinationNavigationService: mocks.getAppDestinationNavigationService
}))
vi.mock('@talex-touch/utils/common/logger', () => ({
  getLogger: mocks.getLogger
}))
vi.mock('electron', () => ({
  app: { getLocale: vi.fn(() => 'zh-CN') }
}))

async function createProvider(): Promise<AppDestinationProvider> {
  const provider = new AppDestinationProvider()
  await provider.onLoad({ touchApp: {} } as never)
  return provider
}

async function search(provider: AppDestinationProvider, text: string): Promise<TuffSearchResult> {
  return provider.onSearch({ text } as TuffQuery, new AbortController().signal)
}

function onlyItem(result: TuffSearchResult): TuffItem {
  expect(result.items).toHaveLength(1)
  return result.items[0]!
}

function actionIds(item: TuffItem): string[] {
  return (item.actions ?? []).map((action) => action.id)
}

/**
 * The provider is the only entry point that turns text into a destination, and the shape it emits
 * is what CoreBox, the action panel and the recommendation rebuild all consume. The regressions
 * worth pinning are the ones the catalog cannot see: a second row for one query, app-only reveal
 * affordances leaking back in, a remote icon returning, or a grouped action escaping the
 * allowlist into an arbitrary route.
 */
describe('appDestinationProvider search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppDestinationNavigationService.mockReturnValue({ open: mocks.open })
  })

  it('registers as a fast text-only system provider under the renamed id', async () => {
    const provider = await createProvider()

    expect(provider.id).toBe('app-destination-provider')
    expect(provider.type).toBe('system')
    expect(provider.priority).toBe('fast')
    expect(provider.supportedInputTypes).toEqual([TuffInputType.Text])
  })

  it.each([
    ['主窗口', 'main-window'],
    ['首页', 'app-destination:home'],
    ['设置', 'app-destination:settings-overview'],
    ['外观', 'app-destination:settings-appearance'],
    ['模型渠道', 'app-destination:settings-channels'],
    ['语音设置', 'app-destination:settings-voice'],
    ['网络设置', 'app-destination:settings-network'],
    ['检查更新', 'app-destination:settings-update'],
    ['settings', 'app-destination:settings-overview'],
    ['shezhi', 'app-destination:settings-overview'],
    ['sz', 'app-destination:settings-overview'],
    ['network', 'app-destination:settings-network'],
    ['wangluo', 'app-destination:settings-network'],
    ['wl', 'app-destination:settings-network']
  ] as const)('returns exactly one stable item for %s', async (query, expectedItemId) => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, query))

    expect(item.id).toBe(expectedItemId)
    expect(item.kind).toBe('command')
    expect(item.meta?.extension?.destinationId).toBe(
      expectedItemId === 'main-window'
        ? 'main-window'
        : expectedItemId.slice('app-destination:'.length)
    )
  })

  it('uses the offline catalog icon class instead of a remote asset', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '设置'))

    expect(item.render.basic?.icon).toEqual({
      type: 'class',
      value: getAppDestination('settings-overview').icon
    })
  })

  it('returns no item for bare or ambiguous queries', async () => {
    const provider = await createProvider()

    for (const query of ['打开', 'open', 'show', 'window', '窗口', 'AI', 'unknown']) {
      expect((await search(provider, query)).items).toEqual([])
    }
  })

  it('highlights the configured title range for a matching alias', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '主窗口'))
    const ranges = item.meta?.extension?.matchResult as Array<{ start: number; end: number }>

    expect(ranges).toHaveLength(1)
    expect(item.render.basic?.title?.slice(ranges[0]!.start, ranges[0]!.end)).toBe('主窗口')
  })

  it('keeps the metadata search tokens bounded to the alias list', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '设置'))
    const tokens = item.meta?.extension?.searchTokens as string[]

    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens.length).toBeLessThanOrEqual(16)
    expect(tokens).toEqual(expect.arrayContaining(['设置', 'settings']))
  })

  it('carries the pinyin aliases into the metadata search tokens', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '首页'))
    const tokens = item.meta?.extension?.searchTokens as string[]

    expect(tokens).toEqual(expect.arrayContaining(['shouye', 'sy', 'zhuye', 'zy']))
  })

  it('presents the localized Tuff Settings title instead of the generic overview label', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '设置'))

    expect(item.render.basic?.title).toBe(zhCN.corebox.destinations.settingsTitle)
    expect(item.render.basic?.title).not.toBe(zhCN.settingsNav.category.overview)
  })

  it('groups the common settings as secondary actions on the Settings item', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '设置'))
    const actions = item.actions ?? []

    expect(actions[0]).toMatchObject({
      id: 'open-destination:settings-overview',
      type: 'execute',
      primary: true
    })
    expect(actions.slice(1).map((action) => action.id)).toEqual(
      COMMON_SETTING_DESTINATION_IDS.map((id) => `open-destination:${id}`)
    )
    expect(actions.slice(1).every((action) => action.type === 'execute' && !action.primary)).toBe(
      true
    )
    // The action panel renders the secondary actions as one section, so each one carries the
    // localized section label — a missing group splits the panel into eight unnamed rows.
    const groups = actions.slice(1).map((action) => ('group' in action ? action.group : undefined))
    expect(groups).toEqual(
      Array.from({ length: COMMON_SETTING_DESTINATION_IDS.length }, () => '常用设置')
    )
  })

  it('keeps the direct category as the primary action and excludes it from the group', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '网络设置'))

    expect(actionIds(item)[0]).toBe('open-destination:settings-network')
    expect(actionIds(item)).toEqual([
      'open-destination:settings-network',
      ...COMMON_SETTING_DESTINATION_IDS.filter((id) => id !== 'settings-network').map(
        (id) => `open-destination:${id}`
      )
    ])
  })

  it('exposes no grouped settings actions on a non-settings destination', async () => {
    const provider = await createProvider()
    const item = onlyItem(await search(provider, '首页'))

    expect(actionIds(item)).toEqual(['open-destination:home'])
  })
})

describe('appDestinationProvider execution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAppDestinationNavigationService.mockReturnValue({ open: mocks.open })
  })

  async function settingsItem(provider: AppDestinationProvider): Promise<TuffItem> {
    return onlyItem(await search(provider, '设置'))
  }

  it('opens the item destination when no action id is supplied', async () => {
    const provider = await createProvider()
    const item = await settingsItem(provider)

    await provider.onExecute({ item })

    expect(mocks.open).toHaveBeenCalledExactlyOnceWith('settings-overview')
  })

  it('routes a selected grouped action through its destination id', async () => {
    const provider = await createProvider()
    const item = await settingsItem(provider)

    await provider.onExecute({ item, actionId: 'open-destination:settings-voice' })

    expect(mocks.open).toHaveBeenCalledExactlyOnceWith('settings-voice')
  })

  it.each([
    'open-destination:settings-download',
    'open-destination:',
    'show-main-window',
    '../../etc/passwd'
  ])('ignores the forged or unknown action id %s', async (actionId) => {
    const provider = await createProvider()
    const item = await settingsItem(provider)

    await provider.onExecute({ item, actionId })

    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('ignores a forged destination in the item metadata', async () => {
    const provider = await createProvider()
    const item = await settingsItem(provider)
    item.meta = { extension: { destinationId: 'settings-download' } }

    await provider.onExecute({ item })

    expect(mocks.open).not.toHaveBeenCalled()
  })
})

describe('appDestinationProvider recommendation rebuild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rebuilds only exact deterministic destination item ids', async () => {
    const provider = await createProvider()
    const items = await provider.rebuildRecommendationItems([
      'main-window',
      'app-destination:home',
      'home',
      'app-destination:home:extra',
      'main-window-extra',
      'app-destination:settings-download',
      'some-other-provider:main-window'
    ])

    expect(items.map((item) => item.id)).toEqual(['main-window', 'app-destination:home'])
  })
})
