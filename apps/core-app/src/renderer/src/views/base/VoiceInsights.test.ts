// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { voiceApiEvents } from '@talex-touch/utils/transport/sdk/domains/voice'

const transportSendMock = vi.hoisted(() => vi.fn())

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: transportSendMock, on: vi.fn(), stream: vi.fn() })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      Object.entries(params ?? {}).reduce(
        (message, [token, value]) => message.replace(`{${token}}`, String(value)),
        key
      ),
    locale: { value: 'en-US' }
  })
}))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import VoiceInsights from './VoiceInsights.vue'

const DAY_MS = 24 * 60 * 60 * 1000

/** 90 days of activity, so the 12-week strip has real weeks behind every bar. */
function summary(): unknown {
  const today = Date.now()
  const days = Array.from({ length: 90 }, (_, index) => {
    const date = new Date(today - (89 - index) * DAY_MS)
    return {
      date: date.toISOString().slice(0, 10),
      characters: 400 + index * 12,
      durationMs: 60_000,
      sessions: 2
    }
  })
  return {
    startedAt: today - 90 * DAY_MS,
    updatedAt: today,
    timezone: 'UTC',
    totalCharacters: 128_540,
    totalDurationMs: 2_760_000,
    sessionCount: 214,
    polishedSessionCount: 176,
    estimatedSavedMs: 11_520_000,
    typingCharactersPerMinute: 40,
    averageCharactersPerMinute: 168,
    activeDays: 28,
    currentStreak: 5,
    longestStreak: 11,
    days
  }
}

async function mountPage() {
  const wrapper = mount(VoiceInsights, {
    global: { stubs: { TxButton: true, TxBottomDialog: true, TxSkeleton: true } }
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('VoiceInsights empty state', () => {
  beforeEach(() => {
    transportSendMock.mockReset()
    transportSendMock.mockImplementation(async () => ({ ok: true, result: null }))
  })

  /**
   * The description restated the title and the privacy sentence is already the page subtitle, so
   * both are gone. Nothing replaces them: three attempts at an ambient character field all read
   * as dirt rather than as sound, and an empty screen beats a decorated one that looks broken.
   */
  it('shows the icon and one line over a waveform, and nothing else', async () => {
    const wrapper = await mountPage()

    const empty = wrapper.find('[data-testid="voice-insights-empty"]')
    expect(empty.exists()).toBe(true)
    expect(empty.findAll('p')).toHaveLength(0)

    // Texture, not a reading: there is no data on this screen, so it is hidden from anything
    // that would try to announce it.
    const wave = empty.find('canvas.VoiceInsights-Wave')
    expect(wave.exists()).toBe(true)
    expect(wave.attributes('aria-hidden')).toBe('true')

    wrapper.unmount()
  })

  /**
   * A loose `requestAnimationFrame` outlives the component that scheduled it, and this one is
   * scheduled by a watcher that does not fire when the whole page goes away.
   *
   * Scope note: this does *not* cover the null-context guard in `drawWave`. jsdom returns null
   * from `getContext('2d')`, but no frame runs before the test ends, so that branch is never
   * executed here — it is defensive code without a guard, and naming this test after it would
   * claim coverage that does not exist.
   */
  it('cancels its animation frame on unmount', async () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')

    const wrapper = await mountPage()
    expect(wrapper.find('canvas.VoiceInsights-Wave').exists()).toBe(true)

    wrapper.unmount()
    expect(cancel).toHaveBeenCalled()

    cancel.mockRestore()
  })
})

describe('VoiceInsights page composition', () => {
  beforeEach(() => {
    transportSendMock.mockReset()
    transportSendMock.mockImplementation(async (event: { toEventName: () => string }) => {
      if (event?.toEventName?.() === voiceApiEvents.getInsights.toEventName()) {
        return { ok: true, result: summary() }
      }
      return { ok: true }
    })
  })

  /**
   * The page has an answer, and the layout says so: time not spent typing is the conclusion,
   * and characters, rate and duration are the working behind it. Four equal cards made the
   * reader pick for themselves, which is the thing this composition exists to stop.
   */
  it('leads with the saved-time estimate and demotes the rest to supporting cards', async () => {
    const wrapper = await mountPage()

    const hero = wrapper.find('[data-testid="voice-insights-hero-metric"]')
    expect(hero.exists()).toBe(true)
    expect(hero.attributes('data-metric')).toBe('saved')

    const supports = wrapper.findAll('.VoiceInsights-Metric')
    expect(supports.map((card) => card.attributes('data-metric'))).toEqual([
      'characters',
      'rate',
      'duration'
    ])
    // The conclusion must not appear twice, or the demotion means nothing.
    expect(supports.some((card) => card.attributes('data-metric') === 'saved')).toBe(false)

    wrapper.unmount()
  })

  /**
   * The number is derived from a typing baseline nobody measured. It is also now the largest
   * thing on the page, which is exactly why the sentence saying so has to live inside the same
   * card — a basis note further down is a note the reader scrolls past on their way somewhere.
   */
  it('keeps the estimate basis inside the card that shows the estimate', async () => {
    const wrapper = await mountPage()

    const hero = wrapper.find('[data-testid="voice-insights-hero-metric"]')
    expect(hero.find('small').text()).toContain('voiceInsights.metrics.savedBasis')

    wrapper.unmount()
  })

  it('draws one bar per week of the last twelve', async () => {
    const wrapper = await mountPage()

    const bars = wrapper.findAll('.VoiceInsights-WeekBars span')
    expect(bars).toHaveLength(12)
    // A silent week still gets a sliver: an empty column and a missing column look the same,
    // and only one of them is true.
    expect(bars.every((bar) => /height: \d+%/.test(bar.attributes('style') ?? ''))).toBe(true)

    wrapper.unmount()
  })
})
