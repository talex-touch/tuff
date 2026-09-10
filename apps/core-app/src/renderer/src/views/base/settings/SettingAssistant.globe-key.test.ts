// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import type { AppSetting } from '@talex-touch/utils'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import type * as VueModule from 'vue'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingAssistant from './SettingAssistant.vue'

type AssistantSettingsFixture = Pick<AppSetting, 'assistant' | 'floatingBall' | 'voiceWake'> & {
  voiceInput?: AppSetting['voiceInput']
}

const appSetting = vi.hoisted(() => {
  const { reactive } = require('vue') as typeof VueModule
  return reactive({} as AssistantSettingsFixture)
})

const mocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send })
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('~/modules/storage/app-storage', () => ({ appSetting }))

function answerGlobeKey(status: { applies: boolean; systemActionActive: boolean }): void {
  mocks.send.mockImplementation(async (event: unknown) => {
    if (event === AssistantEvents.voice.getGlobeKeyStatus) return status
    return true
  })
}

function mountSettingAssistant() {
  return mount(SettingAssistant, {
    props: { mode: 'advanced' },
    global: {
      stubs: {
        TuffGroupBlock: { template: '<section><slot /></section>' },
        TuffBlockSwitch: {
          template: '<label><span>{{ title }}</span></label>',
          props: ['modelValue', 'title']
        },
        // Renders its default slot, unlike the mode suite's stub: the whole point of this row
        // is the control that sits in it.
        TuffBlockSlot: {
          template: '<section><span>{{ title }}</span><slot /></section>',
          props: ['title']
        },
        TxButton: { template: '<button @click="$emit(\'click\', $event)"><slot /></button>' }
      }
    }
  })
}

describe('SettingAssistant Globe key guidance', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    appSetting.assistant = { enabled: false }
    appSetting.floatingBall = {
      enabled: false,
      size: 56,
      opacity: 1,
      edgePadding: 24,
      position: { x: -1, y: -1 }
    }
    appSetting.voiceInput = { enabled: true }
  })

  /**
   * The app cannot take a lone Fn press from macOS — the Globe action is fired below the event
   * tap — so the only thing the page can honestly do is name the preference and offer the trip.
   */
  it('offers the Keyboard settings trip while the system still owns a lone Fn press', async () => {
    answerGlobeKey({ applies: true, systemActionActive: true })
    const wrapper = mountSettingAssistant()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(true)
    await wrapper.get('[data-testid="voice-open-keyboard-settings"]').trigger('click')

    expect(mocks.send).toHaveBeenCalledWith(AssistantEvents.voice.openKeyboardSettings)
    wrapper.unmount()
  })

  it('says nothing once the preference is already Do Nothing', async () => {
    answerGlobeKey({ applies: true, systemActionActive: false })
    const wrapper = mountSettingAssistant()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  /** Windows and Linux have no Globe action to lose the key to, so the row is macOS-only. */
  it('says nothing on a platform where a lone Fn press has no system action', async () => {
    answerGlobeKey({ applies: false, systemActionActive: false })
    const wrapper = mountSettingAssistant()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })

  /** A settings page that cannot reach main knows nothing about the system keyboard. */
  it('stays quiet when the status cannot be read', async () => {
    mocks.send.mockRejectedValue(new Error('transport unavailable'))
    const wrapper = mountSettingAssistant()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[data-testid="voice-globe-key-hint"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
