// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import type { Ref } from 'vue'
import { TxStatusHint } from '@talex-touch/tuffex/status-hint'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, nextTick, shallowRef } from 'vue'
import {
  clearCoreBoxFooterFeedback,
  COREBOX_FOOTER_FEEDBACK_MS,
  showCoreBoxFooterFeedback,
  useCoreBoxFooterFeedback
} from '~/modules/box/meta-actions/footer-feedback'
import CoreBoxFooter from './CoreBoxFooter.vue'

const monitor = vi.hoisted(() => ({
  indexProgress: undefined as unknown as Ref<{ stage: string; progress?: number } | null>
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: unknown) => (typeof fallback === 'string' ? fallback : key)
  })
}))

vi.mock('~/composables/useFileIndexMonitor', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  monitor.indexProgress = ref(null)
  return {
    useFileIndexMonitor: () => ({
      onProgressUpdate: () => () => {},
      indexProgress: monitor.indexProgress
    })
  }
})

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ isMac: computed(() => true) })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: { template: '<span class="tx-icon-stub" />' }
}))

const item = {
  id: 'com.apple.Safari',
  kind: 'app',
  source: { type: 'application', id: 'app-provider', name: 'Applications' },
  render: { mode: 'default', basic: { title: 'Safari' } }
} as TuffItem

/** A plugin result hiding every hint: the footer parks below the results for it. */
const hintlessItem = {
  id: 'translate',
  kind: 'feature',
  source: { type: 'plugin', id: 'plugin-features', name: 'Translate' },
  render: { mode: 'default', basic: { title: 'Translate' } },
  meta: {
    pluginName: 'touch-translation',
    footerHints: {
      primary: { visible: false },
      secondary: { visible: false },
      quickSelect: { visible: false }
    }
  }
} as unknown as TuffItem

/** A plugin widget declares no hint to show, so the footer parks for it too. */
const widgetItem = {
  id: 'weather',
  kind: 'feature',
  source: { type: 'plugin', id: 'plugin-features', name: 'Weather' },
  render: { mode: 'custom', custom: { type: 'vue', content: 'weather::card' } },
  meta: { pluginName: 'touch-weather' }
} as unknown as TuffItem

/**
 * The text a screen reader reads. While the hint animates, the morph engine draws the message
 * twice, as a hidden copy plus aria-hidden segments, so `.text()` would read it twice.
 */
function accessibleText(wrapper: { element: Node }): string {
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return ''
    return Array.from(node.childNodes, read).join('')
  }
  return read(wrapper.element).trim()
}

/** The hint's replay class: none for the first message, then `a` and `b` in turn. */
function replayClasses(wrapper: { classes: () => string[] }): string[] {
  return wrapper.classes().filter((name) => name.startsWith('is-pulse'))
}

describe('CoreBox footer feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearCoreBoxFooterFeedback()
    monitor.indexProgress.value = null
  })

  afterEach(() => {
    clearCoreBoxFooterFeedback()
    vi.useRealTimers()
  })

  function mountFooter(props: { animated?: boolean } = {}) {
    return mount(CoreBoxFooter, { props: { display: true, item, resultCount: 1, ...props } })
  }

  it('shows what an action did in place of the item, then gives the item back', async () => {
    const wrapper = mountFooter()
    expect(wrapper.get('.FooterTitle').text()).toBe('Safari')

    showCoreBoxFooterFeedback('已复制')
    await nextTick()

    expect(wrapper.find('.FooterTitle').exists()).toBe(false)
    const feedback = wrapper.get('.FooterFeedback')
    expect(accessibleText(feedback)).toBe('已复制')
    expect(feedback.classes()).toContain('is-success')
    expect(feedback.get('.CoreBoxActionFeedback-Icon').classes()).toContain(
      'i-ri-checkbox-circle-line'
    )
    expect(wrapper.getComponent(TxStatusHint).props()).toMatchObject({
      tone: 'success',
      size: 'md'
    })
    // CoreBox owns the one announcer, which says it wherever it shows; the footer adds none.
    expect(wrapper.find('[aria-live]:not([aria-live="off"]), [role="status"]').exists()).toBe(false)

    vi.advanceTimersByTime(COREBOX_FOOTER_FEEDBACK_MS)
    await nextTick()

    expect(wrapper.find('.FooterFeedback').exists()).toBe(false)
    expect(wrapper.get('.FooterTitle').text()).toBe('Safari')

    wrapper.unmount()
  })

  it('marks a failure with the error glyph as well as the words', async () => {
    const wrapper = mountFooter()

    showCoreBoxFooterFeedback('固定失败', 'error')
    await nextTick()

    const feedback = wrapper.get('.FooterFeedback')
    expect(feedback.classes()).toContain('is-error')
    expect(feedback.get('.CoreBoxActionFeedback-Icon').classes()).toContain(
      'i-ri-error-warning-line'
    )
    // The wash and the glyph take the danger hue.
    expect(wrapper.getComponent(TxStatusHint).props('tone')).toBe('danger')

    wrapper.unmount()
  })

  it('lets a newer message replace an older one and restart the clock', () => {
    const feedback = useCoreBoxFooterFeedback()

    showCoreBoxFooterFeedback('已复制')
    const first = feedback.value?.id
    vi.advanceTimersByTime(COREBOX_FOOTER_FEEDBACK_MS - 100)
    showCoreBoxFooterFeedback('已复制')

    // Same words, new event: the new id replays the hint's emphasis rather than sitting still.
    expect(feedback.value?.id).not.toBe(first)
    vi.advanceTimersByTime(COREBOX_FOOTER_FEEDBACK_MS - 100)
    expect(feedback.value?.message).toBe('已复制')
    vi.advanceTimersByTime(100)
    expect(feedback.value).toBeNull()
  })

  it('keeps one hint across messages, so the next words morph out of the last', async () => {
    const wrapper = mountFooter()

    showCoreBoxFooterFeedback('已固定')
    await nextTick()
    const before = wrapper.getComponent(TxStatusHint)
    // By uid: VTU hands out a fresh `vm` proxy on every lookup.
    const uid = before.vm.$.uid
    const element = before.element
    expect(before.props('text')).toBe('已固定')

    showCoreBoxFooterFeedback('已取消固定')
    await nextTick()

    const after = wrapper.getComponent(TxStatusHint)
    expect(after.vm.$.uid).toBe(uid)
    expect(after.element === element, 'the same root element').toBe(true)
    expect(after.props('text')).toBe('已取消固定')
    // Through the morph engine, which changes the words in place.
    expect(after.find('[tx-morph-root]').exists()).toBe(true)
    expect(accessibleText(wrapper.get('.FooterFeedback'))).toBe('已取消固定')

    wrapper.unmount()
  })

  it('replays the emphasis when the same words come again', async () => {
    const wrapper = mountFooter()

    showCoreBoxFooterFeedback('已复制')
    await nextTick()
    // The entrance plays on mount; a replay class there would cut it short.
    expect(replayClasses(wrapper.get('.FooterFeedback'))).toEqual([])

    showCoreBoxFooterFeedback('已复制')
    await nextTick()
    expect(replayClasses(wrapper.get('.FooterFeedback'))).toEqual(['is-pulse-a'])

    showCoreBoxFooterFeedback('已复制')
    await nextTick()
    expect(replayClasses(wrapper.get('.FooterFeedback'))).toEqual(['is-pulse-b'])

    wrapper.unmount()
  })

  it('moves by default, and lands in place when CoreBox’s motion gate is closed', async () => {
    const moving = mountFooter()
    showCoreBoxFooterFeedback('已固定')
    await nextTick()
    expect(moving.get('.FooterFeedback').classes()).toContain('is-animated')
    expect(moving.find('[tx-morph-root]').exists()).toBe(true)
    moving.unmount()
    clearCoreBoxFooterFeedback()

    const still = mountFooter({ animated: false })
    showCoreBoxFooterFeedback('已固定')
    await nextTick()
    const feedback = still.get('.FooterFeedback')
    expect(feedback.classes()).not.toContain('is-animated')
    // Plain text: no morph engine, so the words are drawn once.
    expect(still.find('[tx-morph-root]').exists()).toBe(false)
    expect(feedback.text()).toBe('已固定')

    showCoreBoxFooterFeedback('已固定')
    await nextTick()
    showCoreBoxFooterFeedback('已取消固定')
    await nextTick()
    expect(replayClasses(still.get('.FooterFeedback'))).toEqual([])
    expect(still.find('[tx-morph-root]').exists()).toBe(false)
    expect(still.get('.FooterFeedback').text()).toBe('已取消固定')

    still.unmount()
  })
})

/**
 * Whether the footer is on screen, read the way CoreBox reads it: through a template ref, so only
 * what the footer exposes counts. CoreBox shows an action's outcome in its header while it is false.
 */
describe('CoreBox footer on screen', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearCoreBoxFooterFeedback()
    monitor.indexProgress.value = null
  })

  afterEach(() => {
    clearCoreBoxFooterFeedback()
    vi.useRealTimers()
  })

  function mountInHost(initial: TuffItem) {
    const footer = shallowRef<{ onScreen?: boolean } | null>(null)
    const shown = shallowRef(initial)
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(CoreBoxFooter, { ref: footer, display: true, item: shown.value, resultCount: 1 })
      })
    )
    return {
      wrapper,
      shown,
      onScreen: () => footer.value?.onScreen,
      slidIn: () => wrapper.get('.CoreBoxFooter').classes().includes('display')
    }
  }

  it('is on screen for an item it shows, and shows an outcome there', async () => {
    const host = mountInHost(item)
    await nextTick()
    expect(host.onScreen()).toBe(true)
    expect(host.slidIn()).toBe(true)

    showCoreBoxFooterFeedback('已复制')
    await nextTick()
    expect(accessibleText(host.wrapper.get('.FooterFeedback'))).toBe('已复制')
    host.wrapper.unmount()
  })

  it.each([
    ['a plugin result hiding every hint', hintlessItem],
    ['a plugin widget', widgetItem]
  ])('parks for %s and leaves an outcome to the header', async (_label, parked) => {
    const host = mountInHost(parked)
    await nextTick()
    expect(host.onScreen()).toBe(false)
    expect(host.slidIn()).toBe(false)

    showCoreBoxFooterFeedback('已复制')
    await nextTick()
    // Not drawn in a footer no one can see, where a screen reader would still find a second copy.
    expect(host.wrapper.find('.FooterFeedback').exists()).toBe(false)
    host.wrapper.unmount()
  })

  it('comes on screen the moment a file index starts building, whatever the item', async () => {
    const host = mountInHost(hintlessItem)
    await nextTick()
    expect(host.onScreen()).toBe(false)

    // Not after the footer's 100ms debounce: the indexing line shows at once.
    monitor.indexProgress.value = { stage: 'scanning', progress: 40 }
    await nextTick()
    expect(host.onScreen()).toBe(true)
    expect(host.slidIn()).toBe(true)
    host.wrapper.unmount()
  })

  it('says it left the screen when it slides out, not before', async () => {
    const host = mountInHost(item)
    await nextTick()
    showCoreBoxFooterFeedback('已复制')

    host.shown.value = hintlessItem
    await nextTick()
    // The slide waits out the footer's 100ms debounce, and the outcome stays with it until then.
    expect(host.onScreen()).toBe(true)
    expect(host.slidIn()).toBe(true)
    expect(host.wrapper.find('.FooterFeedback').exists()).toBe(true)

    vi.advanceTimersByTime(100)
    await nextTick()
    expect(host.onScreen()).toBe(false)
    expect(host.slidIn()).toBe(false)
    expect(host.wrapper.find('.FooterFeedback').exists()).toBe(false)
    host.wrapper.unmount()
  })
})
