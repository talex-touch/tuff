// @vitest-environment jsdom
import { nextTick, reactive } from 'vue'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

const i18nMock = vi.hoisted(() => ({
  instance: { global: { locale: { value: 'zh-CN' } } },
  loadLocaleMessages: vi.fn(async () => undefined),
  setI18nLanguage: vi.fn()
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting }))
vi.mock('@talex-touch/utils/renderer/storage', () => ({
  appSettings: { whenHydrated: async () => undefined }
}))
vi.mock('./i18n', () => ({
  getGlobalI18nInstance: () => i18nMock.instance,
  loadLocaleMessages: i18nMock.loadLocaleMessages,
  setI18nLanguage: i18nMock.setI18nLanguage
}))

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
