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

/**
 * The retention switch lives in app storage, and it is the thing that decides whether the main
 * process writes a recognition record at all. Faked with an empty store — the real one is filled
 * by the main process, and its default carries no `historyEnabled` at all — so a test can put the
 * page in front of either state of the switch instead of asserting whatever the last test left.
 */
const appSettingMock = vi.hoisted(() => ({
  appSetting: { voiceInput: {} as { historyEnabled?: boolean } }
}))

vi.mock('~/modules/storage/app-storage', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('~/modules/storage/app-storage')
  return { ...actual, appSetting: appSettingMock.appSetting }
})

import VoiceInsights from './VoiceInsights.vue'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `undefined` is a state of the switch, not a typo: the preference is added by a migration, so a
 * profile that has never seen the settings page carries no `historyEnabled` at all.
 */
function setHistoryRetention(historyEnabled: boolean | undefined): void {
  appSettingMock.appSetting.voiceInput = { historyEnabled }
}

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

async function mountPage(props: Record<string, unknown> = {}) {
  const wrapper = mount(VoiceInsights, {
    props,
    global: {
      stubs: {
        // A real `<button>`, because `disabled` is part of what is being asserted: a control is
        // only unclickable — to a user and to `trigger` alike — when it is an actual form element
        // carrying the attribute. The label rides the slot, so the slot is rendered as well.
        TxButton: {
          props: ['variant', 'type', 'size', 'loading', 'disabled'],
          inheritAttrs: true,
          template: '<button :disabled="disabled"><slot /></button>'
        },
        TxBottomDialog: true,
        TxSkeleton: true,
        // Not stubbed away: the cards' classes and data attributes fall through to its root, and
        // half these assertions find elements by them. `shadow` is echoed because its effect is
        // pure CSS — jsdom would let a shadow creep back with every test still green.
        TxCard: {
          props: ['shadow'],
          inheritAttrs: true,
          template: '<div :data-shadow="shadow"><slot /></div>'
        },
        // Both slots rendered inline so the menu's contents are inspectable without driving a
        // real popover open; what is being checked is which items exist, not how they appear.
        TxPopover: {
          template: '<div><slot name="reference" /><div class="stub-menu"><slot /></div></div>'
        },
        // Contents rendered inline and `visible` echoed: what matters is which section is in
        // which drawer and whether it is open, not the panel's own animation.
        TxDrawer: {
          props: ['visible', 'title'],
          inheritAttrs: true,
          template: '<div :data-open="String(visible)" :data-title="title"><slot /></div>'
        },
        // Contents rendered inline and `modelValue` echoed. Its real behaviour is a FLIP
        // animation against a source rect, which jsdom has no geometry for; what a test can
        // check is whether the second click asked for it and whether dismissing it is heard.
        FlipDialog: {
          name: 'FlipDialog',
          props: ['modelValue', 'headerTitle'],
          emits: ['update:modelValue', 'closed'],
          inheritAttrs: true,
          template: '<div :data-open="String(modelValue)" :data-title="headerTitle"><slot /></div>'
        },
        TxPagination: {
          props: ['currentPage', 'pageSize', 'total'],
          emits: ['update:currentPage'],
          inheritAttrs: true,
          // Clickable so a test can move off page one and check what reopening does.
          template:
            '<nav :data-page="currentPage" :data-total="total" @click="$emit(\'update:currentPage\', currentPage + 1)" />'
        }
      }
    }
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
    // The retention switch is put in place by the tests that read it, so it is put back here:
    // otherwise the file would depend on which of them ran last.
    setHistoryRetention(undefined)
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
   * The whole header is one row, and the content owns it.
   *
   * It was split across two owners — the shell drew a title, this drew a row of buttons under it —
   * and the seam between them kept reappearing as a band of blank. A heading, the date counting
   * started, three actions and a status alert is more than a shell title row was built to hold, so
   * it all lives here now.
   */
  it('puts the heading, the boundary line and every action in one header row', async () => {
    const wrapper = await mountPage({ eyebrow: '语音输入' })

    const header = wrapper.find('.VoiceInsights-Hero')
    expect(header.exists()).toBe(true)
    // The nav label *is* the heading. Exactly one, here and on the page.
    expect(wrapper.findAll('h1')).toHaveLength(1)
    expect(header.find('h1').text()).toBe('语音输入')
    // The start date bounds the chart, not the page, so it is not up here.
    expect(header.find('.VoiceInsights-Boundary').exists()).toBe(false)

    // A jump to the log, and the menu. Nothing else earns a place in a title row — refresh
    // least of all, on a page that reloads itself after everything it offers.
    for (const action of ['records-jump', 'more']) {
      expect(header.find(`[data-testid="voice-insights-${action}"]`).exists()).toBe(true)
    }
    expect(header.find('[data-testid="voice-insights-refresh"]').exists()).toBe(false)
    // And the group header that used to carry the clear button is gone entirely.
    expect(wrapper.find('.VoiceInsights-SectionHeader').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * Every card is tuffex's, and none of them casts a shadow — the page is a stack of surfaces on
   * one plane, not a pile of floating tiles. The prop is echoed by the stub because its effect is
   * CSS, which a jsdom test cannot otherwise see.
   */
  it('draws every card flat', async () => {
    const wrapper = await mountPage()

    const cards = wrapper.findAll('[data-shadow]')
    expect(cards.length).toBeGreaterThanOrEqual(4)
    expect(cards.every((card) => card.attributes('data-shadow') === 'none')).toBe(true)

    wrapper.unmount()
  })

  /**
   * Clearing every number on the page cannot be undone, and it used to sit one stray click from
   * the refresh button. Opening a menu first is the whole safeguard, so the destructive item has
   * to be behind the dots and separated from the two that are reversible.
   */
  it('keeps share, settings and delete behind the dots', async () => {
    const wrapper = await mountPage()

    const menu = wrapper.find('.VoiceInsights-Menu')
    expect(menu.exists()).toBe(true)

    const items = menu.findAll('button')
    expect(items.map((item) => item.attributes('data-testid'))).toEqual([
      'voice-insights-share',
      'voice-insights-settings',
      'voice-insights-clear'
    ])
    expect(menu.find('[data-testid="voice-insights-clear"]').classes()).toContain('is-danger')
    expect(menu.find('[role="separator"]').exists()).toBe(true)

    // Not in the row itself: that is the point of moving them.
    const header = wrapper.find('.VoiceInsights-Hero > .VoiceInsights-HeroActions > *')
    expect(header.attributes('data-testid')).not.toBe('voice-insights-clear')

    wrapper.unmount()
  })

  /**
   * A year of charts is what the page is for. The log and the settings are two more screens'
   * worth of content underneath it that most visits scroll straight past, so both are drawers:
   * they cost nothing until asked for, and closing one puts the reader back where they were.
   */
  it('keeps the log in a drawer that starts closed', async () => {
    const wrapper = await mountPage()

    const drawer = wrapper.find('[data-testid="voice-insights-records"]')
    expect(drawer.exists()).toBe(true)
    expect(drawer.attributes('data-open')).toBe('false')
    // The table is inside it, not loose on the page.
    expect(wrapper.find('[data-testid="voice-insights-records-table"]').exists()).toBe(true)
    expect(drawer.find('[data-testid="voice-insights-records-table"]').exists()).toBe(true)

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    expect(wrapper.find('[data-testid="voice-insights-records"]').attributes('data-open')).toBe(
      'true'
    )

    wrapper.unmount()
  })

  /** Settings belong to the page, so opening them is a request this component makes, not an act. */
  it('asks the page to open settings rather than scrolling to them', async () => {
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="voice-insights-settings"]').trigger('click')
    expect(wrapper.emitted('open-settings')).toHaveLength(1)

    wrapper.unmount()
  })

  /**
   * A wall of a hundred transcripts has no top and no bottom. Paging gives it both, and keeps the
   * drawer from growing a scrollbar that fights the page's.
   */
  async function mountManyRecords() {
    transportSendMock.mockReset()
    transportSendMock.mockImplementation(async (event: { toEventName: () => string }) => {
      if (event?.toEventName?.() === voiceApiEvents.getInsights.toEventName()) {
        return { ok: true, result: summary() }
      }
      if (event?.toEventName?.() === voiceApiEvents.getRecognitionRecords.toEventName()) {
        return {
          ok: true,
          result: Array.from({ length: 30 }, (_, index) => ({
            id: `record-${index}`,
            capturedAt: Date.UTC(2026, 8, 8, 12, index),
            source: 'microphone',
            status: 'success',
            text: `记录 ${index}`
          }))
        }
      }
      return { ok: true }
    })
    return mountPage()
  }

  /**
   * The same page with a log that holds nothing — which is the state the retention hint exists
   * for, and the state the entry to the log used to be greyed out in.
   */
  async function mountEmptyLog() {
    transportSendMock.mockReset()
    transportSendMock.mockImplementation(async (event: { toEventName: () => string }) => {
      if (event?.toEventName?.() === voiceApiEvents.getInsights.toEventName()) {
        return { ok: true, result: summary() }
      }
      if (event?.toEventName?.() === voiceApiEvents.getRecognitionRecords.toEventName()) {
        return { ok: true, result: [] }
      }
      return { ok: true }
    })
    return mountPage()
  }

  it('pages the log', async () => {
    const wrapper = await mountManyRecords()

    expect(wrapper.findAll('.tx-data-table__row')).toHaveLength(12)
    const pager = wrapper.find('[data-testid="voice-insights-records-pagination"]')
    expect(pager.exists()).toBe(true)
    expect(pager.attributes('data-total')).toBe('30')
    expect(pager.attributes('data-page')).toBe('1')

    wrapper.unmount()
  })

  /**
   * Reopening on page 4 of a log last read yesterday is a state nobody asked to be remembered —
   * and the top of the list is where the newest entries are, which is why anyone opens it.
   */
  it('reopens the log at the first page', async () => {
    const wrapper = await mountManyRecords()

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    await wrapper.find('[data-testid="voice-insights-records-pagination"]').trigger('click')
    expect(
      wrapper.find('[data-testid="voice-insights-records-pagination"]').attributes('data-page')
    ).toBe('2')

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    expect(
      wrapper.find('[data-testid="voice-insights-records-pagination"]').attributes('data-page')
    ).toBe('1')

    wrapper.unmount()
  })

  /**
   * An empty log has two causes and only one of them is the reader's to fix. Records are written
   * by the main process only while the retention switch is on, so a drawer with the switch off is
   * empty because nothing is being kept — not because nothing has been dictated. The drawer says
   * which of the two it is looking at, and points at the switch.
   *
   * The entry to that drawer has to stay reachable in exactly that state. It was disabled whenever
   * `records.length === 0`, which greyed out the one screen that explains the emptiness from the
   * page that shows it — so both halves are asserted here: the entry is live, and the drawer it
   * opens carries the explanation.
   */
  it('keeps the log reachable and explains an empty log when retention is off', async () => {
    setHistoryRetention(false)
    const wrapper = await mountEmptyLog()

    const jump = wrapper.find('[data-testid="voice-insights-records-jump"]')
    // An unbound `disabled` leaves the attribute off the control entirely; the pre-change binding
    // put it there whenever the log was empty, and a disabled entry is one nobody can open.
    expect(jump.attributes('disabled')).toBeUndefined()

    await jump.trigger('click')
    expect(wrapper.find('[data-testid="voice-insights-records"]').attributes('data-open')).toBe(
      'true'
    )

    const hint = wrapper.find('[data-testid="voice-insights-records-retention"]')
    expect(hint.exists()).toBe(true)
    // The i18n mock hands back keys, so these are the keys the locale files must supply rather
    // than a restatement of the copy.
    expect(hint.text()).toContain('voiceInsights.records.retentionOff')
    expect(hint.find('[data-testid="voice-insights-records-retention-action"]').text()).toContain(
      'voiceInsights.records.retentionAction'
    )

    wrapper.unmount()
  })

  /**
   * The switch resolves on `=== true`, not on `!== false`. `historyEnabled` is added by a storage
   * migration, so a profile that has never run it carries no such key at all — and reading that as
   * "on" would hide the explanation from exactly the readers who have never seen the settings page
   * that turns retention on in the first place.
   */
  it('treats a profile with no retention preference as retention off', async () => {
    setHistoryRetention(undefined)
    const wrapper = await mountEmptyLog()

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    expect(wrapper.find('[data-testid="voice-insights-records-retention"]').exists()).toBe(true)

    wrapper.unmount()
  })

  /**
   * The other cause of an empty log, and the one with nothing to fix: retention is on, so a log
   * with no rows means nobody has dictated yet. A hint there would send the reader to a switch
   * that is already where it should be — and the drawer would be volunteering a settings trip the
   * page never hears about.
   */
  it('stays quiet about retention when the switch is already on', async () => {
    setHistoryRetention(true)
    const wrapper = await mountEmptyLog()

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    expect(wrapper.find('[data-testid="voice-insights-records"]').attributes('data-open')).toBe(
      'true'
    )

    expect(wrapper.find('[data-testid="voice-insights-records-retention"]').exists()).toBe(false)
    expect(wrapper.emitted('open-settings')).toBeUndefined()

    wrapper.unmount()
  })

  /**
   * The switch itself is not in this drawer and must not be: the drawer asks the page to open
   * settings, and closes behind the request. Leaving it open would stack a settings panel under a
   * drawer that has nothing left to say.
   */
  it('asks the page for settings from the retention hint and closes the log', async () => {
    setHistoryRetention(false)
    const wrapper = await mountEmptyLog()

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    await wrapper.find('[data-testid="voice-insights-records-retention-action"]').trigger('click')

    expect(wrapper.emitted('open-settings')).toHaveLength(1)
    expect(wrapper.find('[data-testid="voice-insights-records"]').attributes('data-open')).toBe(
      'false'
    )

    wrapper.unmount()
  })

  /**
   * The hint is a diagnosis of an *empty* log, not a note about the switch. Thirty records with
   * retention off is a log that is being kept and simply is not empty, and a drawer full of rows
   * needs no explanation of why rows are missing — this is the case that keeps the hint from
   * turning into permanent furniture.
   */
  it('offers no retention hint beside a log that has records', async () => {
    setHistoryRetention(false)
    const wrapper = await mountManyRecords()

    expect(wrapper.findAll('.tx-data-table__row')).toHaveLength(12)

    await wrapper.find('[data-testid="voice-insights-records-jump"]').trigger('click')
    expect(wrapper.find('[data-testid="voice-insights-records"]').attributes('data-open')).toBe(
      'true'
    )
    expect(wrapper.find('[data-testid="voice-insights-records-retention"]').exists()).toBe(false)

    wrapper.unmount()
  })

  /** Twelve or fewer is one page, and one page needs no pager. */
  it('shows no pager when the log fits on a page', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="voice-insights-records-pagination"]').exists()).toBe(false)

    wrapper.unmount()
  })

  /** No nav label passed, no heading drawn — the sidebar's word is the page's to supply. */
  it('draws no heading when the page does not name one', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('.VoiceInsights-Hero h1').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * The year card carried two headings four words apart, and three streak tiles that all read the
   * same number on a short record. One heading, one line.
   */
  it('gives the year one heading and one streak line', async () => {
    const wrapper = await mountPage()

    const activity = wrapper.find('[data-testid="voice-insights-activity"]')
    expect(activity.findAll('h3')).toHaveLength(1)
    expect(activity.find('.VoiceInsights-StreakLine').text()).toContain(
      'voiceInsights.streak.summary'
    )
    // The date the record starts sits beside the title of the year it bounds.
    expect(activity.find('h3 small').text()).toContain('voiceInsights.boundary')
    expect(activity.find('.VoiceInsights-Streaks').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * Two unrelated things shared the class `VoiceInsights-Weeks`: the 12-week bar card, and the
   * grid of week columns inside the year calendar. Each picked up the other's rules — the card
   * got a grid whose column count only the calendar defines, the calendar got the card's
   * background, radius and shadow. Nothing about it read as a typo.
   *
   * jsdom computes no CSS, so what this pins is the collision itself: one class, one owner.
   */
  it('does not let the week card and the calendar grid share a class', async () => {
    const wrapper = await mountPage()

    const card = wrapper.find('[data-testid="voice-insights-weeks"]')
    expect(card.exists()).toBe(true)
    expect(card.classes()).toContain('VoiceInsights-Weeks')

    const heatmap = wrapper.find('[data-testid="voice-insights-heatmap"]')
    expect(heatmap.find('.VoiceInsights-HeatWeeks').exists()).toBe(true)
    expect(heatmap.find('.VoiceInsights-Weeks').exists()).toBe(false)

    wrapper.unmount()
  })

  /**
   * The card is labelled 说了多少字, so a 字 unit beside the figure says it twice. Its siblings
   * keep theirs — 字/分钟 is not in their label.
   */
  it('drops the unit from the card whose label already carries it', async () => {
    const wrapper = await mountPage()

    const cards = wrapper.findAll('.VoiceInsights-Metric')
    // Direct children only: the morph renders its own span inside the <strong>, and a descendant
    // selector counts that as the unit — the same trap that once made the figure invisible.
    const characters = cards.find((card) => card.attributes('data-metric') === 'characters')!
    expect(characters.find('.VoiceInsights-MetricValue > span').exists()).toBe(false)

    const rate = cards.find((card) => card.attributes('data-metric') === 'rate')!
    expect(rate.find('.VoiceInsights-MetricValue > span').text()).toContain(
      'voiceInsights.units.charactersPerMinute'
    )

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
  /**
   * The log reads as a table: the transcript is a column, not something behind a disclosure
   * triangle. The first click opens the record under the table; a second on the same row takes it
   * full size, and dismissing that returns the table to bare rows.
   */
  it('lists records in a table, opens the picked row, then flips it out on a second click', async () => {
    const wrapper = await mountPage()

    expect(transportSendMock).toHaveBeenCalledWith(voiceApiEvents.getInsights, undefined)
    expect(transportSendMock).toHaveBeenCalledWith(voiceApiEvents.getRecognitionRecords, undefined)

    const row = wrapper.find('.tx-data-table__row')
    expect(row.exists()).toBe(true)
    // Readable without opening anything.
    expect(row.text()).toContain('Final words.')
    expect(row.text()).toContain('paraformer-realtime-v2')
    expect(row.find('[data-status="success"]').exists()).toBe(true)

    // Closed until asked for: the audio element is what makes a row cost anything.
    expect(wrapper.find('[data-testid="voice-insights-record-details"]').exists()).toBe(false)
    const dialog = wrapper.find('[data-testid="voice-insights-record-dialog"]')
    expect(dialog.attributes('data-open')).toBe('false')

    await row.trigger('click')
    const details = wrapper.find('[data-testid="voice-insights-record-details"]')
    expect(details.exists()).toBe(true)
    expect(details.find('audio').attributes('src')).toBe('tfile://voice/record-1.wav')
    expect(details.text()).toContain('um raw words')
    expect(details.text()).toContain('Bailian workspace')
    // Still inline at this point — the dialog is the next click, not this one.
    expect(
      wrapper.find('[data-testid="voice-insights-record-dialog"]').attributes('data-open')
    ).toBe('false')
    await row.trigger('click')
    expect(
      wrapper.find('[data-testid="voice-insights-record-dialog"]').attributes('data-open')
    ).toBe('true')
    // The inline panel stands down: one `<audio>` per record, not two.
    expect(wrapper.find('[data-testid="voice-insights-record-details"]').exists()).toBe(false)

    wrapper.unmount()
  })

  /** Dismissing the dialog is the end of the cycle: the row it came from collapses with it. */
  it('collapses the row when the dialog is dismissed', async () => {
    const wrapper = await mountPage()

    const row = wrapper.find('.tx-data-table__row')
    await row.trigger('click')
    await row.trigger('click')
    expect(
      wrapper.find('[data-testid="voice-insights-record-dialog"]').attributes('data-open')
    ).toBe('true')

    await wrapper.findComponent({ name: 'FlipDialog' }).vm.$emit('closed')
    await flushPromises()

    expect(wrapper.find('[data-testid="voice-insights-record-details"]').exists()).toBe(false)

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

  it('withholds only the week bars on day one', async () => {
    mockDays(1)
    const wrapper = await mountPage()

    const state = blocks(wrapper)
    expect(state.metrics).toBe(3)
    // Not rendered, not greyed, and not explained: a chart with nothing in it says less than no
    // chart, and a line apologising for its absence is one more thing to read.
    expect(state.weeks).toBe(false)
    expect(state.note.exists()).toBe(false)

    // The year stays from the first day — an empty grid is a true picture of an empty record,
    // and it is the one chart that explains its own blank cells.
    expect(state.activity).toBe(true)
    expect(state.report).toBe(true)

    wrapper.unmount()
  })

  it('adds the week bars once there are weeks to compare', async () => {
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
