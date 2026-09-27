// @vitest-environment jsdom

import type { SupportedLanguage } from '~/modules/lang/language-preferences'
import type * as LangModule from '~/modules/lang'
import type { VueWrapper } from '@vue/test-utils'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { BOOT_LANGUAGE_PREFERENCE, SUPPORTED_LANGUAGES } from '~/modules/lang/language-preferences'

// 页面在 onMounted 里建了 Audio、失败时还会往 window 上挂重试监听；上一个用例残留的页面会把
// 下一次用例的状态搅乱。
enableAutoUnmount(afterEach)

/**
 * jsdom 没有音频设备，`Audio.play()/pause()` 只会往控制台吐一整段 not-implemented 堆栈，盖住真正
 * 的失败。播放成功即满足组件预期：它不会挂 window 重试监听，也就没有跨用例的残留。
 */
class SilentAudio {
  volume = 0
  preload = ''
  currentTime = 0
  async play(): Promise<void> {}
  pause(): void {}
}

/** main 报上来的系统语言。这里的场景就是：系统是英文，产品默认是简体中文。 */
const SYSTEM_LANGUAGE: SupportedLanguage = 'en-US'

/** 当前窗口正在显示的语言。首启时窗口还没被设置纠正过来，正是系统语言。 */
const currentLanguage = ref<SupportedLanguage>(SYSTEM_LANGUAGE)

const mocks = vi.hoisted(() => ({
  step: vi.fn(),
  setFollowSystemLanguage: vi.fn(),
  /** true 时把窗口语言也改掉，真件就是这么做的，免得"重复切一次"的假象混进断言。 */
  switchLanguage: vi.fn(async (lang: SupportedLanguage) => {
    currentLanguage.value = lang
  }),
  getSystemLanguage: vi.fn(() => SYSTEM_LANGUAGE),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  /**
   * readLanguagePreference() 的答案：已经选过语言的用户，设置里存着 en-US + 跟随系统。首启用例
   * 把它设成"跟产品默认语言不一样"，这样"首启答产品默认语言"才不是一句空话。
   */
  storedPreference: {
    locale: 'en-US',
    followSystem: true,
    source: 'settings',
    shouldUseLegacySnapshot: false,
    shouldClearLegacySnapshot: false
  },
  appSetting: {
    beginner: { init: false },
    lang: { locale: 'en-US', followSystem: true }
  }
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: ['size', 'variant', 'type'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }
}))

// 不声明 emits：父级的 @click 落到根元素上，语言列表项才点得动。
vi.mock('@talex-touch/tuffex/card', () => ({
  TxCard: {
    name: 'TxCard',
    template: '<div><slot /></div>'
  }
}))

vi.mock('vue-i18n', () => ({
  // 回显 key，用例由此读出渲染了哪条文案（本目录 Done.test.ts 同款手法）。
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key
  })
}))

vi.mock('~/assets/lotties/hello.json', () => ({ default: {} }))
vi.mock('~/components/icon/lotties/LottieFrame.vue', () => ({
  default: { template: '<div />' }
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: mocks.appSetting
}))

// 切换预演失败时组件唯一的出口就是这行日志，用例据此确认它没有把失败咽掉。
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: mocks.loggerError, warn: mocks.loggerWarn })
}))

vi.mock('~/modules/lang', async (importOriginal) => {
  // 产品默认语言与语言清单必须来自真实模块：将来有人改 BOOT_LANGUAGE_PREFERENCE，这里的首启用例
  // 就得跟着红；语言名也只从这份真数据里取，用例不写死中文。
  const preferences = await importOriginal<typeof LangModule>()
  return {
    BOOT_LANGUAGE_PREFERENCE: preferences.BOOT_LANGUAGE_PREFERENCE,
    SUPPORTED_LANGUAGES: preferences.SUPPORTED_LANGUAGES,
    readLanguagePreference: () => mocks.storedPreference,
    useLanguage: () => ({
      currentLanguage,
      switchLanguage: mocks.switchLanguage,
      setFollowSystemLanguage: mocks.setFollowSystemLanguage,
      getSystemLanguage: mocks.getSystemLanguage
    })
  }
})

import LanguageSetup from './LanguageSetup.vue'

/** vue-i18n 被换成回显 key 的桩，所以「跟随系统」标渲染出来的"文案"就是它的消息 key。 */
const SYSTEM_TAG_COPY = 'beginner.language.systemTag'

const NEXT = 'beginner.language.next'
const CHANGE_LANGUAGE = 'beginner.language.changeLanguage'
const BACK = 'layout.back'

/** 产品默认语言：首启向导该答的那门语言（名字取自真实 SUPPORTED_LANGUAGES，不在这里写死中文）。 */
const productDefaultLanguage = languageOf(BOOT_LANGUAGE_PREFERENCE.locale)

/** 列表里那门「不是系统语言」的语言：挑它必须让卡片改口、跟随系统标消失。 */
const pickedLanguage = languageOf(
  SUPPORTED_LANGUAGES.find((lang) => lang.key !== SYSTEM_LANGUAGE)!.key
)

function languageOf(key: string) {
  const match = SUPPORTED_LANGUAGES.find((lang) => lang.key === key)
  if (!match) throw new Error(`fixture language is not supported: ${key}`)
  return match
}

function mountLanguageSetup() {
  return mount(LanguageSetup, {
    global: {
      provide: { step: mocks.step }
    }
  })
}

/**
 * 卡片给出的答案：语言名 + 「跟随系统」标（没标就是 null）。列表展开时卡片不在 DOM 里，
 * 于是返回 null —— "卡片该答什么"这条断言就不会在卡片根本没渲染时被误判成通过。
 */
function cardAnswer(wrapper: VueWrapper) {
  const card = wrapper.find('.LanguageSetup-CurrentCard')
  if (!card.exists()) return null

  const tag = card.find('.LanguageSetup-CurrentInfo small')
  return {
    language: card.find('.LanguageSetup-CurrentInfo strong').text(),
    systemTag: tag.exists() ? tag.text() : null
  }
}

/** 按 slot 文案取按钮：这一页有三个 TxButton（下一步／切换语言／返回），只有文案分得清。 */
async function clickButton(wrapper: VueWrapper, copy: string): Promise<void> {
  const match = wrapper.findAllComponents({ name: 'TxButton' }).find((btn) => btn.text() === copy)
  if (!match) throw new Error(`no TxButton rendering "${copy}"`)

  await match.trigger('click')
  await flushPromises()
}

async function clickLanguageOption(wrapper: VueWrapper, name: string): Promise<void> {
  const option = wrapper
    .findAll('.LanguageSetup-OptionCard')
    .find((card) => card.find('.LanguageSetup-OptionInfo').text() === name)
  if (!option) throw new Error(`no language option named "${name}"`)

  await option.trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Audio', SilentAudio)
  // 每个用例都从「没选过语言的首启 + 系统是英文」开始，变的是用例自己那一笔。
  mocks.appSetting.beginner.init = false
  currentLanguage.value = SYSTEM_LANGUAGE
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * 首启向导的语言这一步答的是产品默认语言，而不是把系统语言当成用户已经做出的选择。
 *
 * 旧写法把初值定成「跟随系统」＋系统语言：在英文 macOS 上，用户点一下「下一步」就把 en-US 存成了
 * 自己的语言，界面随即整窗变英文——他其实什么都没选。已经选过语言的用户重开向导时（设置页可以
 * 重开）才该看到自己现在的选择，`beginner.init` 就是这个分水岭。
 */
describe('language step default answer', () => {
  it('answers the product default language on a first run, not the system language', async () => {
    const wrapper = mountLanguageSetup()

    // 系统是 en-US，卡片仍答产品默认语言，并且不挂「跟随系统」标：用户还没选过。
    expect(cardAnswer(wrapper)).toEqual({
      language: productDefaultLanguage.name,
      systemTag: null
    })

    await clickButton(wrapper, NEXT)

    // 不再把「跟随系统」当成用户的选择存下去。
    expect(mocks.setFollowSystemLanguage).toHaveBeenCalledWith(false)
  })

  it('keeps an already chosen language, system tag included, when the guide is reopened', async () => {
    mocks.appSetting.beginner.init = true
    const wrapper = mountLanguageSetup()

    const stored = languageOf(mocks.storedPreference.locale)
    expect(cardAnswer(wrapper)).toEqual({ language: stored.name, systemTag: SYSTEM_TAG_COPY })

    await clickButton(wrapper, NEXT)

    expect(mocks.setFollowSystemLanguage).toHaveBeenCalledWith(true)
  })

  it('answers a language picked from the list and drops the system tag', async () => {
    const wrapper = mountLanguageSetup()

    await clickButton(wrapper, CHANGE_LANGUAGE)
    await clickLanguageOption(wrapper, pickedLanguage.name)

    // 选的语言不是系统语言：跟随系统被关掉，窗口切到新语言。
    expect(mocks.setFollowSystemLanguage).toHaveBeenCalledWith(false)
    expect(mocks.switchLanguage).toHaveBeenCalledWith(pickedLanguage.key)

    await clickButton(wrapper, BACK)
    expect(cardAnswer(wrapper)).toEqual({ language: pickedLanguage.name, systemTag: null })

    // 下一步存的是卡片上这个答案，而不是又回到「跟随系统」。
    await clickButton(wrapper, NEXT)
    expect(mocks.setFollowSystemLanguage).toHaveBeenLastCalledWith(false)
  })

  it('treats back as cancelling the pick, not as choosing follow-system', async () => {
    const wrapper = mountLanguageSetup()

    await clickButton(wrapper, CHANGE_LANGUAGE)
    await clickButton(wrapper, BACK)

    // 旧实现在这里调 setFollowSystemLanguage(true)，顺手把没选过的首启用户改写成了「跟随系统」。
    expect(mocks.setFollowSystemLanguage).not.toHaveBeenCalled()
    expect(cardAnswer(wrapper)).toEqual({
      language: productDefaultLanguage.name,
      systemTag: null
    })
  })
})

/**
 * 这一步并问并答：卡片答的是产品默认语言，页面就得用那门语言显示。首启在英文系统上，若页面还停在
 * 系统语言，屏幕就成了「英文文案 ＋ 中文答案」；所以 mount 时就要把窗口切到卡片上那个答案。
 */
describe('language step previews the answer it is asking about', () => {
  it('switches the window to the answered language before the user touches anything', async () => {
    mountLanguageSetup()
    await flushPromises()

    expect(mocks.switchLanguage).toHaveBeenCalledWith(productDefaultLanguage.key)
  })

  it('leaves the language alone when the answer already is what the window shows', async () => {
    // 已选过语言的用户重开向导：卡片答的就是界面语言，没有要预演的东西。
    mocks.appSetting.beginner.init = true
    mountLanguageSetup()
    await flushPromises()

    expect(mocks.switchLanguage).not.toHaveBeenCalled()
  })

  it('keeps the step usable when the preview switch fails', async () => {
    const failure = new Error('locale bundle missing')
    mocks.switchLanguage.mockRejectedValueOnce(failure)
    const wrapper = mountLanguageSetup()
    await flushPromises()

    // 预演失败只是屏幕还是旧语言，向导本身必须还站得住，而且失败要留痕。
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.any(String), failure)
    expect(cardAnswer(wrapper)).toEqual({
      language: productDefaultLanguage.name,
      systemTag: null
    })

    await clickButton(wrapper, NEXT)
    expect(mocks.setFollowSystemLanguage).toHaveBeenCalledWith(false)
  })
})
