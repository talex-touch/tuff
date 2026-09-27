// @vitest-environment jsdom
import type * as VoiceDomain from '@talex-touch/utils/transport/sdk/domains/voice'
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

vi.mock('@talex-touch/utils/transport/sdk/domains/voice', async () => {
  // Only the SDK factory is faked; `VOICE_CAPTURE_UNAVAILABLE_CODES` is the real map, because the
  // component switches on the very values main puts on the wire. A hand-copied stub could drift
  // from the host while both sides still agreed with each other.
  const actual = await vi.importActual<typeof VoiceDomain>(
    '@talex-touch/utils/transport/sdk/domains/voice'
  )
  return { ...actual, createVoiceSdk: () => voiceSdk }
})

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
   * A build that cannot capture at all is reported ahead of every ASR reason, with its own
   * sentence and no way out: the channels page cannot bring an absent audio component back, so
   * the button that would walk the reader there is withheld (#322). This is what a package
   * shipped without `tuff_native_audio.node` looked like — a healthy recogniser and a
   * microphone that could never open.
   */
  it.each([
    ['VOICE_ASR_CAPTURE_COMPONENT_MISSING', 'settingSpeechRecognition.capture.componentMissing'],
    [
      'VOICE_ASR_CAPTURE_PLATFORM_UNSUPPORTED',
      'settingSpeechRecognition.capture.platformUnsupported'
    ],
    ['VOICE_ASR_CAPTURE_DISABLED', 'settingSpeechRecognition.capture.disabled']
  ])('reports a %s capture as its own sentence with nothing to open', async (reason, copy) => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: true },
      stt: { ready: true },
      capture: { ready: false, reason }
    })
    const wrapper = await mountStatus()

    const box = alert(wrapper)
    expect(box.text()).toContain('settingSpeechRecognition.capture.title')
    expect(box.text()).toContain(copy)
    // The recogniser is fine, so nothing here may read as an ASR problem.
    expect(box.text()).not.toContain('settingSpeechRecognition.asr.notReady')
    expect(wrapper.find('[data-testid="voice-status-configure"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-status-catalog"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="voice-status-retry"]').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * A device is the one capture failure this page can send the user to fix, so it keeps the
   * button — and it keeps the capture sentence rather than the ASR one.
   */
  it('keeps the Settings button for an input device that is not there', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: true },
      stt: { ready: true },
      capture: { ready: false, reason: 'VOICE_ASR_CAPTURE_DEVICE_UNAVAILABLE' }
    })
    const wrapper = await mountStatus()

    const box = alert(wrapper)
    expect(box.text()).toContain('settingSpeechRecognition.capture.noDevice')
    expect(box.text()).not.toContain('settingSpeechRecognition.capture.componentMissing')

    await wrapper.find('[data-testid="voice-status-configure"]').trigger('click')
    expect(router.push).toHaveBeenCalledWith('/setting/intelligence/capabilities')

    wrapper.unmount()
  })

  /** A capture that reads ready is a working build: presence alone is not a problem. */
  it('says nothing for a build whose capture reads ready', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: true },
      stt: { ready: true },
      capture: { ready: true }
    })
    const wrapper = await mountStatus()

    expect(alert(wrapper).exists()).toBe(false)
    expect(wrapper.html()).toBe('<!--v-if-->')

    wrapper.unmount()
  })

  /**
   * The #322 regression itself: a recogniser that is also unconfigured does not make this an ASR
   * problem. Capture is a fact about this install, and it is what the reader is told.
   */
  it('reports the capture over a recogniser that is not ready either', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: false, reason: 'VOICE_ASR_NOT_CONFIGURED' },
      stt: { ready: true },
      capture: { ready: false, reason: 'VOICE_ASR_CAPTURE_COMPONENT_MISSING' }
    })
    const wrapper = await mountStatus()

    const box = alert(wrapper)
    expect(box.text()).toContain('settingSpeechRecognition.capture.componentMissing')
    expect(box.text()).not.toContain('settingSpeechRecognition.asr.notConfigured')

    wrapper.unmount()
  })

  /**
   * Older hosts send no `capture` at all, and that must not be read as "broken": the page keeps
   * saying what it always said, about the recogniser it can see.
   */
  it('reads an absent capture as an older host rather than as a broken one', async () => {
    voiceSdk.getRecognitionStatus.mockResolvedValue({
      asr: { ready: false, reason: 'VOICE_ASR_NOT_CONFIGURED' },
      stt: { ready: true },
      capture: undefined
    })
    const wrapper = await mountStatus()

    const box = alert(wrapper)
    expect(box.text()).toContain('settingSpeechRecognition.asr.notConfigured')
    expect(box.text()).not.toContain('settingSpeechRecognition.capture.')
    expect(wrapper.find('[data-testid="voice-status-configure"]').exists()).toBe(true)

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

  /**
   * A catalog failure is not a missing binding: the cloud pack lives on this same page, so the
   * action scrolls to the existing catalog controls instead of sending the user to Intelligence.
   */
  it.each([
    {
      reason: 'VOICE_ASR_PACK_NOT_CONFIGURED',
      copy: 'settingSpeechRecognition.reasons.catalogMissing'
    },
    { reason: 'VOICE_ASR_PACK_EXPIRED', copy: 'settingSpeechRecognition.reasons.catalogExpired' },
    {
      reason: 'VOICE_ASR_PACK_SIGNATURE_INVALID',
      copy: 'settingSpeechRecognition.reasons.catalogRejected'
    },
    {
      reason: 'VOICE_ASR_PACK_SCHEMA_INVALID',
      copy: 'settingSpeechRecognition.reasons.catalogRejected'
    },
    {
      reason: 'VOICE_ASR_PACK_UNSUPPORTED',
      copy: 'settingSpeechRecognition.reasons.catalogUnsupported'
    }
  ])(
    'points a $reason failure at the cloud catalog controls with catalog copy',
    async ({ reason, copy }) => {
      const target = document.createElement('div')
      target.setAttribute('data-testid', 'voice-provider-catalog-status')
      const scrollIntoView = vi.fn()
      Object.defineProperty(target, 'scrollIntoView', { value: scrollIntoView, configurable: true })
      document.body.appendChild(target)
      voiceSdk.getRecognitionStatus.mockResolvedValue({
        asr: { ready: false, reason },
        stt: { ready: true }
      })

      const wrapper = await mountStatus()

      const box = alert(wrapper)
      expect(box.text()).toContain(copy)
      expect(box.text()).toContain('settingSpeechRecognition.catalog.recovery')
      expect(box.text()).not.toContain('settingSpeechRecognition.reasons.unavailable')
      expect(wrapper.find('[data-testid="voice-status-configure"]').exists()).toBe(false)

      await wrapper.find('[data-testid="voice-status-catalog"]').trigger('click')
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(router.push).not.toHaveBeenCalled()

      wrapper.unmount()
      target.remove()
    }
  )
})
