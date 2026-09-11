// @vitest-environment jsdom
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VoiceRecognitionStatus from './VoiceRecognitionStatus.vue'

const router = vi.hoisted(() => ({ push: vi.fn() }))
const voiceSdk = vi.hoisted(() => ({ getRecognitionStatus: vi.fn() }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    // Keys echo back, except the ones that are deliberately empty in the locale files. An
    // identity mock would render a blank line as a non-blank one and hide the whole rule.
    t: (key: string) => (key === 'settingSpeechRecognition.unavailable.description' ? '' : key)
  })
}))

vi.mock('vue-router', () => ({
  useRouter: () => router
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: vi.fn()
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/voice', () => ({
  createVoiceSdk: () => voiceSdk
}))

async function mountStatus(): Promise<VueWrapper> {
  const wrapper = mount(VoiceRecognitionStatus, {
    global: {
      stubs: {
        TxButton: {
          name: 'TxButton',
          emits: ['click'],
          template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
        }
      }
    }
  })
  await flushPromises()
  return wrapper
}

function alert(wrapper: VueWrapper) {
  return wrapper.find('[data-testid="voice-status-alert"]')
}

describe('VoiceRecognitionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * A working recogniser says nothing at all.
   *
   * A permanent "ready" row is chrome the reader learns to skip — and it is exactly the row a
   * real failure would then appear in. Rendering nothing keeps that position free, which is what
   * makes anything appearing there a problem by definition.
   */
  it('renders nothing while recognition works', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({ asr: { ready: true }, stt: { ready: true } })
    const wrapper = await mountStatus()

    expect(alert(wrapper).exists()).toBe(false)
    expect(wrapper.html()).toBe('<!--v-if-->')

    wrapper.unmount()
  })

  /** No placeholder either: a skeleton here would flash a warning-shaped box on every visit. */
  it('renders nothing while the status is still being read', async () => {
    let settle!: (value: unknown) => void
    voiceSdk.getRecognitionStatus.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      })
    )
    const wrapper = mount(VoiceRecognitionStatus)

    expect(alert(wrapper).exists()).toBe(false)

    settle({ asr: { ready: true }, stt: { ready: true } })
    await flushPromises()
    expect(alert(wrapper).exists()).toBe(false)

    wrapper.unmount()
  })

  it('interrupts with one way out when recognition is not configured', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: false, reason: 'VOICE_ASR_NOT_CONFIGURED' },
      stt: { ready: true }
    })
    const wrapper = await mountStatus()

    const box = alert(wrapper)
    expect(box.exists()).toBe(true)
    expect(box.attributes('role')).toBe('alert')
    expect(box.text()).toContain('settingSpeechRecognition.asr.notConfigured')

    await wrapper.find('[data-testid="voice-status-configure"]').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/capabilities')

    wrapper.unmount()
  })

  /**
   * "We could not ask" and "it is not configured" send the user to different places, so the
   * unreadable case retries here instead of walking them to a Settings screen that may be fine.
   */
  it('offers a retry rather than a trip to Settings when the status cannot be read', async () => {
    voiceSdk.getRecognitionStatus.mockRejectedValue(new Error('transport down'))
    const wrapper = await mountStatus()

    // Title and button only: "could not read the status" needs no second sentence, and one
    // restating the title is what made this pill too long to take in at a glance.
    expect(alert(wrapper).text()).toContain('settingSpeechRecognition.unavailable.title')
    expect(alert(wrapper).find('.VoiceRecognitionStatus-Message').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-status-configure"]').exists()).toBe(false)

    voiceSdk.getRecognitionStatus.mockResolvedValue({ asr: { ready: true }, stt: { ready: true } })
    await wrapper.find('[data-testid="voice-status-retry"]').trigger('click')
    await flushPromises()

    expect(router.push).not.toHaveBeenCalled()
    // Recovered, so it goes back to saying nothing.
    expect(alert(wrapper).exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * Only ASR decides this. File transcription was removed from the page, so an STT binding
   * nobody asked for must not raise an alert over a dictation setup that works.
   */
  it('ignores the STT channel entirely', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: true },
      stt: { ready: false, reason: 'VOICE_STT_NOT_CONFIGURED' }
    })
    const wrapper = await mountStatus()

    expect(alert(wrapper).exists()).toBe(false)

    wrapper.unmount()
  })
})
