// @vitest-environment jsdom
import type { TuffItem } from '@talex-touch/utils'
import type { Ref } from 'vue'
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

  function mountFooter() {
    return mount(CoreBoxFooter, { props: { display: true, item, resultCount: 1 } })
  }

  it('shows what an action did in place of the item, then gives the item back', async () => {
    const wrapper = mountFooter()
    expect(wrapper.get('.FooterTitle').text()).toBe('Safari')

    showCoreBoxFooterFeedback('已复制')
    await nextTick()

    expect(wrapper.find('.FooterTitle').exists()).toBe(false)
    const feedback = wrapper.get('.FooterFeedback')
    expect(feedback.text()).toBe('已复制')
    expect(feedback.classes()).toContain('is-success')
    expect(feedback.get('.FooterFeedback-Icon').classes()).toContain('i-ri-checkbox-circle-line')
    // CoreBox owns the one announcer, which says it wherever it shows; the footer adds none.
    expect(wrapper.find('[aria-live], [role="status"]').exists()).toBe(false)

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
    expect(feedback.get('.FooterFeedback-Icon').classes()).toContain('i-ri-error-warning-line')

    wrapper.unmount()
  })

  it('lets a newer message replace an older one and restart the clock', () => {
    const feedback = useCoreBoxFooterFeedback()

    showCoreBoxFooterFeedback('已复制')
    const first = feedback.value?.id
    vi.advanceTimersByTime(COREBOX_FOOTER_FEEDBACK_MS - 100)
    showCoreBoxFooterFeedback('已复制')

    // Same words, new event: a keyed element restarts rather than sitting still.
    expect(feedback.value?.id).not.toBe(first)
    vi.advanceTimersByTime(COREBOX_FOOTER_FEEDBACK_MS - 100)
    expect(feedback.value?.message).toBe('已复制')
    vi.advanceTimersByTime(100)
    expect(feedback.value).toBeNull()
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
    expect(host.wrapper.get('.FooterFeedback').text()).toBe('已复制')
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
