// @vitest-environment jsdom
import { nextTick, reactive } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A locale switched in the main window has to reach every other window.
 *
 * Only the main window runs the language UI (`initializeLanguage` + `setupLanguageSync` in
 * MainWindowRuntimeServices). CoreBox boots from `appSetting.lang`, and the storage broadcast does
 * update that object in the CoreBox window — but until `setupLanguageFollow` nothing there applied
 * it, so CoreBox kept whichever language it was opened with.
 */

const appSetting = reactive({
  lang: { locale: 'zh-CN' as string | null, followSystem: false as boolean | null }
})

/**
 * 存储回执。窗口在这次回执落地前，`appSetting.lang` 只是 origin 默认值，不是用户的选择。
 * 本文件的第一个 describe 描述的是「回执早已落地」的窗口，所以默认 `hydrated: true` 且
 * `whenHydrated()` 立即 resolve；启动空窗期的用例会把它切过去。
 */
const storageState = vi.hoisted(() => ({
  hydrated: true,
  whenHydrated: () => Promise.resolve() as Promise<void>
}))

const i18nMock = vi.hoisted(() => ({
  instance: { global: { locale: { value: 'zh-CN' } } },
  loadLocaleMessages: vi.fn(async () => undefined),
  setI18nLanguage: vi.fn()
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting,
  appSettingStore: {
    isHydrated: () => storageState.hydrated,
    whenHydrated: () => storageState.whenHydrated()
  }
}))
vi.mock('@talex-touch/utils/renderer/storage', () => ({
  appSettings: { whenHydrated: () => storageState.whenHydrated() }
}))
vi.mock('./i18n', () => ({
  getGlobalI18nInstance: () => i18nMock.instance,
  loadLocaleMessages: i18nMock.loadLocaleMessages,
  setI18nLanguage: i18nMock.setI18nLanguage
}))

/**
 * 让 Vue 调度器与异步 mock 的微任务全部走完。这是零延迟的队列排空（不是等一个时长）：
 * watch 回调在 nextTick 上跑，applyLanguage 还要 await 一轮 loadLocaleMessages。
 */
async function flush(): Promise<void> {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

// One module instance for the whole file, as in a real window: the follower is a singleton
// watcher, and a fresh module per test would leave the previous watcher alive on the shared
// setting object.
describe('setupLanguageFollow', () => {
  beforeAll(async () => {
    const { setupLanguageFollow } = await import('./useLanguage')
    setupLanguageFollow()
  })

  beforeEach(async () => {
    appSetting.lang.locale = 'zh-CN'
    appSetting.lang.followSystem = false
    await flush()
    i18nMock.loadLocaleMessages.mockClear()
    i18nMock.setI18nLanguage.mockClear()
  })

  it('applies a locale another window persisted', async () => {
    // What the storage broadcast does in the CoreBox window when settings switch to English.
    appSetting.lang.locale = 'en-US'
    await flush()

    expect(i18nMock.loadLocaleMessages).toHaveBeenCalledWith(i18nMock.instance, 'en-US')
    expect(i18nMock.setI18nLanguage).toHaveBeenCalledWith(i18nMock.instance, 'en-US')
  })

  it('does not write the setting back', async () => {
    // A follower that persisted would echo its own stale `followSystem` over the value the main
    // window just wrote — turning "follow system" off again from a window that never showed it.
    appSetting.lang.followSystem = true
    appSetting.lang.locale = 'en-US'
    await flush()

    expect(appSetting.lang.followSystem).toBe(true)
    expect(appSetting.lang.locale).toBe('en-US')
    expect(i18nMock.setI18nLanguage).toHaveBeenCalledWith(i18nMock.instance, 'en-US')
  })

  it('ignores a value that is not a supported locale', async () => {
    appSetting.lang.locale = 'tlh'
    await flush()

    expect(i18nMock.setI18nLanguage).not.toHaveBeenCalled()
  })

  it('does not re-apply the locale this window already shows', async () => {
    appSetting.lang.followSystem = true
    await flush()

    expect(i18nMock.setI18nLanguage).not.toHaveBeenCalled()
  })
})

/**
 * 启动空窗期：存储回执还没到，`appSetting.lang` 仍是 origin 默认（`followSystem: true`）。
 *
 * 老板的 macOS 是 en_US 而应用语言是简体中文，把那个默认当成用户的选择，就会让窗口先跟随系统
 * 落到英文——「商店」返回 `Plugin Store`，CoreBox 文案也是英文，直到几秒后渲染进程才 push 回来。
 *
 * 每个用例都用全新模块实例（单例 watcher / `initialStateResolved` 只在实例内）、把
 * `navigator.language` 钉成 en-US，并自己控制 `whenHydrated()` 何时 resolve。
 */
describe('language follow before the settings store answers', () => {
  let restoreNavigatorLanguage: (() => void) | undefined

  beforeEach(() => {
    vi.resetModules()
    storageState.hydrated = false
    storageState.whenHydrated = () => Promise.resolve()

    // The boss's machine: the OS is English, the app language is 简体中文.
    Object.defineProperty(navigator, 'language', { configurable: true, value: 'en-US' })
    restoreNavigatorLanguage = () => {
      delete (navigator as { language?: string }).language
    }

    // origin 默认值，与用户真正保存的 `{ locale: 'zh-CN', followSystem: true }` 逐字相同。
    appSetting.lang.locale = 'zh-CN'
    appSetting.lang.followSystem = true

    i18nMock.loadLocaleMessages.mockClear()
    i18nMock.setI18nLanguage.mockClear()
  })

  afterEach(() => {
    restoreNavigatorLanguage?.()
    restoreNavigatorLanguage = undefined
    storageState.hydrated = true
    storageState.whenHydrated = () => Promise.resolve()
  })

  it('boots on the product default, not the OS language, while the settings store is pending', async () => {
    // 重载模块以复刻启动瞬间（见本 describe 上方说明）。
    const { readLanguagePreference } = await import('./useLanguage')

    // 修复前这里会跟随系统（en-US），因为 origin 默认的 `followSystem: true` 被当成了用户选择。
    expect(readLanguagePreference().locale).toBe('zh-CN')
  })

  it('re-resolves onto the stored system language once the reply lands, even when the value is unchanged', async () => {
    // whenHydrated 要由用例自己 resolve，才能复刻「先空窗、后落地」的顺序。
    const hydration = Promise.withResolvers<void>()
    storageState.whenHydrated = () => hydration.promise

    // 静态 import 拿不到「全新模块实例」：setupLanguageFollow 是单例（languageFollowStarted），
    // 而外面那个实例在第一个 describe 里已经启动过，只有重载模块才能重新观察启动瞬间。
    const { setupLanguageFollow } = await import('./useLanguage')
    setupLanguageFollow()

    // 首帧：存储没答，窗口落在产品默认，而不是系统语言。
    await flush()
    expect(i18nMock.setI18nLanguage).not.toHaveBeenCalled()

    // 回执落地：值仍是 `{ locale: 'zh-CN', followSystem: true }`，与首帧完全相同，所以 watch
    // 不会触发；只有 hydrate 后的重算能把这个「跟随系统」的窗口送到系统语言。
    storageState.hydrated = true
    hydration.resolve()
    await flush()

    expect(i18nMock.loadLocaleMessages).toHaveBeenCalledWith(i18nMock.instance, 'en-US')
    expect(i18nMock.setI18nLanguage).toHaveBeenCalledWith(i18nMock.instance, 'en-US')
  })

  it('honours a stored locale that is not the product default once the store is hydrated', async () => {
    // 产品默认只在「还没答案」时兜底；已有答案时必须听存储的。
    storageState.hydrated = true
    appSetting.lang.locale = 'en-US'
    appSetting.lang.followSystem = false

    // 重载模块以复刻启动瞬间（见本 describe 上方说明）。
    const { readLanguagePreference } = await import('./useLanguage')

    expect(readLanguagePreference().locale).toBe('en-US')
  })
})
