import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 主进程 i18n 在模块加载那一刻就初始化，但那时 app 还没 ready，`app.getLocale()` 只答得出空串
 * ——于是每条主进程文案都回退成英文。渲染进程要几秒后才会 push 自己从设置里读到的 locale。
 *
 * 老板的机器就是这段空窗期的受害者：应用语言是简体中文，主进程却先用英文回答了 CoreBox 的
 * 目的地标题，搜「商店」拿到的是 `Plugin Store`。持久化的选择从第一毫秒就在磁盘上，
 * `adoptPersistedLocale` 让主进程直接采纳它，而不是等渲染进程。
 *
 * 每个用例都经过 `vi.resetModules()` + 动态 import，因为模块尾部自己调了一次 `initI18n()`，
 * 而 `currentLocale` / `persistedLocaleAdopted` 是模块级单例——只有重载模块才能从真实的启动
 * 状态出发（静态 import 做不到这一点）。
 */

const { appMock, readyControl } = vi.hoisted(() => {
  let resolveReady: () => void = () => {}
  const readyControl = {
    /** 每次加载给一个新的 pending ready 信号，由用例决定它何时 resolve。 */
    track: (): Promise<void> => {
      const deferred = Promise.withResolvers<void>()
      resolveReady = deferred.resolve
      return deferred.promise
    },
    settle: (): void => resolveReady()
  }
  return {
    appMock: {
      // 启动早期 `app.getLocale()` 就是空串。
      getLocale: vi.fn(() => ''),
      whenReady: () => readyControl.track()
    },
    readyControl
  }
})

vi.mock('electron', () => ({ app: appMock }))
vi.mock('./logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}))

async function bootMainI18n() {
  vi.resetModules()
  return await import('./i18n-helper')
}

beforeEach(() => {
  appMock.getLocale.mockReturnValue('')
})

describe('adoptPersistedLocale', () => {
  it('answers with the persisted language before the renderer has ever pushed one', async () => {
    const i18n = await bootMainI18n()

    // 启动瞬间：系统语言答不出来 → 主进程先用英文回答，这正是老板看到的那一行。
    expect(i18n.t('router.pluginStore')).toBe('Plugin Store')

    const adopted = i18n.adoptPersistedLocale({ lang: { locale: 'zh-CN', followSystem: false } })

    expect(adopted).toBe(true)
    expect(i18n.getLocale()).toBe('zh-CN')
    expect(i18n.t('router.pluginStore')).toBe('插件市场')
    expect(i18n.t('corebox.destinations.storeSubtitle')).toBe('浏览并安装插件')
  })

  it('leaves the choice to the OS when the setting follows the system', async () => {
    const i18n = await bootMainI18n()
    const before = i18n.getLocale()

    expect(i18n.adoptPersistedLocale({ lang: { locale: 'zh-CN', followSystem: true } })).toBe(false)
    expect(i18n.getLocale()).toBe(before)
  })

  it('does not let the OS locale overwrite the persisted choice once the app is ready', async () => {
    const i18n = await bootMainI18n()

    expect(i18n.adoptPersistedLocale({ lang: { locale: 'zh-CN', followSystem: false } })).toBe(true)

    // app 就绪后 OS 终于能答话，而且它说的是英文；磁盘上的选择必须赢，否则启动窗口期结束后
    // 主进程会自己把自己翻回英文。
    appMock.getLocale.mockReturnValue('en-US')
    readyControl.settle()
    await Promise.resolve()
    await Promise.resolve()

    expect(i18n.getLocale()).toBe('zh-CN')
    expect(i18n.t('router.pluginStore')).toBe('插件市场')
  })

  const rejected: Array<[string, unknown]> = [
    ['no lang section', undefined],
    ['an unsupported locale', { lang: { locale: 'tlh', followSystem: false } }],
    ['a locale that is not a string', { lang: { locale: 42, followSystem: false } }]
  ]

  it.each(rejected)('keeps the current locale for %s', async (_name, setting) => {
    const i18n = await bootMainI18n()
    const before = i18n.getLocale()

    expect(i18n.adoptPersistedLocale(setting)).toBe(false)
    expect(i18n.getLocale()).toBe(before)
  })
})
