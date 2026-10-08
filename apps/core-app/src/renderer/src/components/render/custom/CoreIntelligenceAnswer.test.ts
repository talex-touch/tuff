// @vitest-environment jsdom
import { AppEvents, CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CoreIntelligenceAnswer from './CoreIntelligenceAnswer.vue'

const transport = vi.hoisted(() => ({ send: vi.fn() }))
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({ useTuffTransport: () => transport }))
vi.mock('vue-sonner', () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key),
    locale: { value: 'en-US' }
  })
}))

/** What the CoreBox AI card receives when main refused the question for the usage limit. */
const REFUSED = {
  requestId: 'req-limit',
  prompt: 'Summarize this',
  status: 'error',
  error:
    '[USAGE_LIMIT_REACHED:text.chat] The usage limit you set is reached (requestsPerDay: 2 / 2); it resets at 2026-10-04 00:00 local time (2026-10-04T07:00:00.000Z).',
  errorCode: 'USAGE_LIMIT_REACHED',
  createdAt: 1
}

function mountAnswer(payload: Record<string, unknown>) {
  return mount(CoreIntelligenceAnswer, {
    props: { item: { id: 'item-1' } as never, payload },
    global: { stubs: { TxAiConversation: true } }
  })
}

beforeEach(() => {
  transport.send.mockReset()
  toastError.mockReset()
  // jsdom has no matchMedia; TuffEx asks it about reduced motion.
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn()
      }) as unknown as MediaQueryList
  )
})

describe('CoreIntelligenceAnswer, refused by the usage limit', () => {
  it('names the limit and opens Audit in the main window, then steps aside', async () => {
    transport.send.mockResolvedValue(true)
    const wrapper = mountAnswer(REFUSED)

    expect(wrapper.text()).toContain('AI usage limit reached')
    // main's English reason stays out of the card: the localized one above already says it.
    expect(wrapper.find('.CoreIntelligence__error small').exists()).toBe(false)
    const button = wrapper.find('[data-testid="core-intelligence-recovery-action"]')
    expect(button.text()).toBe('Open Audit')

    await button.trigger('click')
    await flushPromises()

    expect(transport.send.mock.calls.map(([event]) => event)).toEqual([
      AppEvents.window.openUsageLimits,
      CoreBoxEvents.ui.hide
    ])
    expect(toastError).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('stays put and says so when the main window could not be shown', async () => {
    transport.send.mockResolvedValue(false)
    const wrapper = mountAnswer(REFUSED)

    await wrapper.find('[data-testid="core-intelligence-recovery-action"]').trigger('click')
    await flushPromises()

    expect(transport.send).toHaveBeenCalledExactlyOnceWith(
      AppEvents.window.openUsageLimits,
      undefined
    )
    expect(toastError).toHaveBeenCalledExactlyOnceWith('coreBox.intelligence.openUsageLimitsFailed')
    wrapper.unmount()
  })

  it('offers no way out for a failure that has none here', () => {
    const wrapper = mountAnswer({
      ...REFUSED,
      error: '[NETWORK_FAILURE:text.chat] The provider request failed.',
      errorCode: 'NETWORK_FAILURE'
    })
    expect(wrapper.find('[data-testid="core-intelligence-recovery-action"]').exists()).toBe(false)
    expect(wrapper.find('.CoreIntelligence__error small').text()).toContain('NETWORK_FAILURE')
    wrapper.unmount()
  })
})
