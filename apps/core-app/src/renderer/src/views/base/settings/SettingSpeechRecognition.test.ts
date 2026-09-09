// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingSpeechRecognition from './SettingSpeechRecognition.vue'

const router = vi.hoisted(() => ({ push: vi.fn() }))
const settings = vi.hoisted(() => ({ voiceInput: { historyEnabled: false } }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => router
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: settings
}))

function mountSettings(): VueWrapper {
  return mount(SettingSpeechRecognition, {
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSlot: {
          props: ['title', 'description'],
          template: '<section>{{ title }}{{ description }}<slot /></section>'
        },
        TuffBlockSwitch: {
          name: 'TuffBlockSwitch',
          props: ['modelValue', 'title'],
          emits: ['update:modelValue'],
          template: '<section>{{ title }}</section>'
        },
        TxButton: {
          name: 'TxButton',
          props: ['disabled'],
          emits: ['click'],
          template:
            '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
        }
      }
    }
  })
}

describe('SettingSpeechRecognition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settings.voiceInput = { historyEnabled: false }
  })

  /**
   * Three rows used to send the user to Intelligence: AI channels, capability bindings and
   * channel order. They are one screen and one sentence, so they are one row — and the page has
   * exactly two things left that it can actually change.
   */
  it('offers the toggle and exactly one way into Intelligence', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.findComponent({ name: 'TuffBlockSwitch' }).exists()).toBe(true)

    const doors = wrapper.findAllComponents({ name: 'TxButton' })
    expect(doors).toHaveLength(1)

    await doors[0]!.trigger('click')
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/capabilities')

    wrapper.unmount()
  })

  /**
   * Status is not a setting. Reporting it in the same row shape as one is what let "已就绪" and
   * "识别暂不可用。" look equally important while asking for entirely different things; it now
   * lives in `VoiceRecognitionStatus`, above the page's content rather than inside its settings.
   */
  it('reports no status and asks main for none', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const text = wrapper.text()
    expect(text).not.toContain('settingSpeechRecognition.asr.ready')
    expect(text).not.toContain('settingSpeechRecognition.reasons')
    // Nothing on this card depends on readiness, so nothing here should be disabled by it.
    expect(wrapper.findAll('button[disabled]')).toHaveLength(0)

    wrapper.unmount()
  })
})
