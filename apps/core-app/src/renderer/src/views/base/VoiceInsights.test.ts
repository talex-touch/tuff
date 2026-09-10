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

/**
 * `recordedFor` is how long counting has been running, which is what decides how much of the
 * page renders — not how much was said. Defaults to 90 days so the existing cases keep the whole
 * layout.
 */
function summary(recordedFor = 90): unknown {
  const today = Date.now()
  const span = Math.max(1, Math.min(recordedFor, 90))
  const days = Array.from({ length: span }, (_, index) => {
    const date = new Date(today - (span - 1 - index) * DAY_MS)
    return {
      date: date.toISOString().slice(0, 10),
      characters: 400 + index * 12,
      durationMs: 60_000,
      sessions: 2
    }
  })
  return {
    startedAt: today - recordedFor * DAY_MS,
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
      if (event?.toEventName?.() === voiceApiEvents.getRecognitionRecords.toEventName()) {
        return {
          ok: true,
          result: [
            {
              id: 'record-1',
              capturedAt: Date.UTC(2026, 8, 8, 12, 30),
              source: 'microphone',
              status: 'success',
              audioUrl: 'tfile://voice/record-1.wav',
              audioBytes: 2048,
              audioDurationMs: 120_000,
              recognitionDurationMs: 1500,
              rawText: ' um raw words ',
              text: 'Final words.',
              providerId: 'provider-bailian',
              model: 'paraformer-realtime-v2',
              channel: 'Bailian workspace',
              totalTokens: 12,
              deliveryMethod: 'native'
            }
          ]
        }
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
   * The number is derived from a typing baseline nobody measured, so the caveat has to stay
   * inside the card — a basis note further down is a note the reader scrolls past.
   *
   * It rides the label rather than the body: it is a caveat about how the number was reached,
   * not a second number, and printing it under the value made the one card carrying a caveat
   * taller than the ones that do not. Hover reaches it in one gesture; the row stops being ragged.
   */
  it('keeps the estimate basis on the label of the card that shows the estimate', async () => {
    const wrapper = await mountPage()

    const hero = wrapper.find('[data-testid="voice-insights-hero-metric"]')
    const basis = hero.find('[data-testid="voice-insights-saved-basis"]')
    expect(basis.exists()).toBe(true)
    // Reachable without the pointer: the caveat is the whole reason the icon is there.
    expect(basis.attributes('aria-label')).toContain('voiceInsights.metrics.savedBasis')
    expect(basis.attributes('tabindex')).toBe('0')

    // Not printed in the body any more — that is what made this card taller than its siblings.
    expect(hero.find('small').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * The header holds actions and nothing else.
   *
   * The headline moved to the page's title row, and the sentence that qualified it is gone: on a
   * page this short, a line explaining what the page is sat between the reader and the numbers it
   * was explaining. Same rule the empty state already follows.
   */
  it('leaves no copy in the header, only the actions', async () => {
    const wrapper = await mountPage()

    const header = wrapper.find('.VoiceInsights-Hero')
    expect(header.exists()).toBe(true)
    expect(header.findAll('p')).toHaveLength(0)
    expect(header.findAll('h1, h2, h3')).toHaveLength(0)
    expect(header.find('[data-testid="voice-insights-refresh"]').exists()).toBe(true)

    wrapper.unmount()
  })

  /**
   * The four figures are the page's whole payload, and they change under the reader when a
   * refresh lands. Morphing them by place value shows which digits moved; swapping the string
   * shows only that something did.
   */
  it('morphs every figure instead of swapping the text', async () => {
    const wrapper = await mountPage()

    const morphs = wrapper.findAllComponents({ name: 'TxTextMorph' })
    expect(morphs).toHaveLength(4)
    for (const morph of morphs) expect(String(morph.props('text'))).not.toBe('')

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
  it('loads host recognition records with aggregates and renders audio, transcript, and metadata', async () => {
    const wrapper = await mountPage()

    expect(transportSendMock).toHaveBeenCalledWith(voiceApiEvents.getInsights, undefined)
    expect(transportSendMock).toHaveBeenCalledWith(voiceApiEvents.getRecognitionRecords, undefined)

    const record = wrapper.find('.VoiceInsights-Record')
    expect(record.exists()).toBe(true)
    expect(record.find('audio').attributes('src')).toBe('tfile://voice/record-1.wav')
    expect(record.text()).toContain('um raw words')
    expect(record.text()).toContain('Final words.')
    expect(record.text()).toContain('paraformer-realtime-v2')
    expect(record.text()).toContain('Bailian workspace')
    expect(record.find('[data-status="success"]').exists()).toBe(true)

    wrapper.unmount()
  })
})

/**
 * The page was laid out for a year of data and shipped showing it on day one: twelve bars with
 * one value between them. That chart was not comparing anything — it just looked broken.
 *
 * Only the week bars are withheld. The year heatmap stays: an empty grid of days is a true
 * picture of a record with nothing in it yet, and it already carries the note explaining that a
 * pale cell before the start date is "not yet counting" rather than "said nothing".
 *
 * The gate is how long counting has been running, not how much was said. Three months of record
 * with two spoken days has eleven genuinely empty weeks, and that emptiness is the finding; one
 * day of record has eleven weeks that never happened, which is the same picture meaning the
 * opposite thing.
 */
describe('VoiceInsights progressive disclosure', () => {
  function mockDays(recordedFor: number): void {
    transportSendMock.mockReset()
    transportSendMock.mockImplementation(async (event: { toEventName: () => string }) => {
      if (event?.toEventName?.() === voiceApiEvents.getInsights.toEventName()) {
        return { ok: true, result: summary(recordedFor) }
      }
      return { ok: true, result: [] }
    })
  }

  function blocks(wrapper: Awaited<ReturnType<typeof mountPage>>) {
    return {
      metrics: wrapper.findAll('.VoiceInsights-Metric').length,
      weeks: wrapper.find('[data-testid="voice-insights-weeks"]').exists(),
      activity: wrapper.find('[data-testid="voice-insights-activity"]').exists(),
      report: wrapper.find('[data-testid="voice-insights-report"]').exists(),
      note: wrapper.find('[data-testid="voice-insights-tier-note"]')
    }
  }

  it('withholds only the week bars on day one, and says when they arrive', async () => {
    mockDays(1)
    const wrapper = await mountPage()

    const state = blocks(wrapper)
    expect(state.metrics).toBe(3)
    expect(state.weeks).toBe(false)
    // Not rendered, not greyed: a chart with nothing in it says less than no chart.
    expect(state.note.text()).toContain('voiceInsights.tiers.weeksPending')

    // The year stays from the first day — an empty grid is a true picture of an empty record,
    // and it is the one chart that explains its own blank cells.
    expect(state.activity).toBe(true)
    expect(state.report).toBe(true)

    wrapper.unmount()
  })

  it('adds the week bars once there are weeks to compare, and drops the note', async () => {
    mockDays(8)
    const wrapper = await mountPage()

    const state = blocks(wrapper)
    expect(state.weeks).toBe(true)
    expect(state.activity).toBe(true)
    expect(state.report).toBe(true)
    expect(state.note.exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * A record that has run for months shows its whole shape even when most of it is empty —
   * that is the chart working, not the chart failing.
   */
  it('keeps the charts for a long but quiet record', async () => {
    transportSendMock.mockReset()
    transportSendMock.mockImplementation(async (event: { toEventName: () => string }) => {
      if (event?.toEventName?.() === voiceApiEvents.getInsights.toEventName()) {
        const quiet = summary(90) as { days: Array<{ characters: number; sessions: number }> }
        for (const day of quiet.days.slice(0, -2)) {
          day.characters = 0
          day.sessions = 0
        }
        return { ok: true, result: quiet }
      }
      return { ok: true, result: [] }
    })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="voice-insights-weeks"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="voice-insights-activity"]').exists()).toBe(true)

    wrapper.unmount()
  })
})
