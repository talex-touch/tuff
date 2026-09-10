// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import type * as VueModule from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingSpeechRecognition from './SettingSpeechRecognition.vue'

const router = vi.hoisted(() => ({ push: vi.fn() }))
const mocks = vi.hoisted(() => ({ send: vi.fn() }))
const settings = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({
    voiceInput: {
      enabled: true,
      historyEnabled: false,
      polishEnabled: true,
      polishStrength: 'structured'
    }
  })
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('vue-router', () => ({
  useRouter: () => router
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: settings
}))

/** Answers the status read, and whatever the disable write is made to report afterwards. */
function answerGlobeKey(
  status: { applies: boolean; systemActionActive: boolean },
  afterDisable = status
): void {
  mocks.send.mockImplementation(async (event: unknown) => {
    if (event === AssistantEvents.voice.getGlobeKeyStatus) return status
    if (event === AssistantEvents.voice.disableGlobeKeyAction) return afterDisable
    return true
  })
}

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
        TuffBlockSelect: {
          name: 'TuffBlockSelect',
          props: ['modelValue', 'title', 'description'],
          emits: ['update:modelValue'],
          template: '<section><span>{{ title }}</span><slot /></section>'
        },
        TuffSelectItem: {
          name: 'TuffSelectItem',
          props: ['value'],
          template: '<option :value="value"><slot /></option>'
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

describe('SettingSpeechRecognition Globe key handover', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settings.voiceInput = {
      enabled: true,
      historyEnabled: false,
      polishEnabled: true,
      polishStrength: 'structured'
    }
  })

  /**
   * The app cannot take a lone Fn press out of the event stream — the Globe action is fired by
   * WindowServer below the tap — but it can write the preference that switches the action off,
   * and that write applies on the spot rather than at the next login.
   */
  it('turns the system action off and retires the row on one click', async () => {
    answerGlobeKey(
      { applies: true, systemActionActive: true },
      { applies: true, systemActionActive: false }
    )
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(true)
    await wrapper.get('[data-testid="voice-disable-globe-key"]').trigger('click')
    await flushPromises()

    expect(mocks.send).toHaveBeenCalledWith(AssistantEvents.voice.disableGlobeKeyAction)
    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  /**
   * The row reflects what the system reports after the write, not the fact that a write happened.
   * A write that does not stick has to leave the manual route reachable.
   */
  it('keeps the row when the write did not change anything', async () => {
    answerGlobeKey(
      { applies: true, systemActionActive: true },
      { applies: true, systemActionActive: true }
    )
    const wrapper = mountSettings()
    await flushPromises()

    await wrapper.get('[data-testid="voice-disable-globe-key"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps System Settings reachable for anyone who wants to see the switch', async () => {
    answerGlobeKey({ applies: true, systemActionActive: true })
    const wrapper = mountSettings()
    await flushPromises()

    await wrapper.get('[data-testid="voice-open-keyboard-settings"]').trigger('click')

    expect(mocks.send).toHaveBeenCalledWith(AssistantEvents.voice.openKeyboardSettings)
    wrapper.unmount()
  })

  it('retires a resolved Globe hint when focus returns from Keyboard settings', async () => {
    let reads = 0
    mocks.send.mockImplementation(async (event: unknown) => {
      if (event === AssistantEvents.voice.getGlobeKeyStatus) {
        reads += 1
        return { applies: true, systemActionActive: reads === 1 }
      }
      return true
    })
    const wrapper = mountSettings()
    await flushPromises()
    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(true)

    window.dispatchEvent(new Event('focus'))
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('suppresses the Globe hint when voice input is disabled', async () => {
    settings.voiceInput.enabled = false
    answerGlobeKey({ applies: true, systemActionActive: true })
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says nothing once the preference is already Do Nothing', async () => {
    answerGlobeKey({ applies: true, systemActionActive: false })
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  /** Windows and Linux have no Globe action to lose the key to, so the row is macOS-only. */
  it('says nothing on a platform where a lone Fn press has no system action', async () => {
    answerGlobeKey({ applies: false, systemActionActive: false })
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  /** A settings page that cannot reach main knows nothing about the system keyboard. */
  it('stays quiet when the status cannot be read', async () => {
    mocks.send.mockRejectedValue(new Error('transport unavailable'))
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
