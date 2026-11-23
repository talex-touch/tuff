import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { registerPulseInstance } from '../src/pulse-driver'
import { getPulseDriverConfig } from '../src/styles'
import TxBorderBeam from '../src/TxBorderBeam.vue'

class ObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): never[] {
    return []
  }
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

function createRafHarness() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const request = vi.fn((cb: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, cb)
    return id
  })
  const cancel = vi.fn((id: number) => {
    callbacks.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', cancel)
  return {
    request,
    cancel,
    pendingCount: () => callbacks.size,
    flush(ts: number) {
      const entries = [...callbacks.entries()]
      callbacks.clear()
      for (const [, cb] of entries) cb(ts)
    },
  }
}

const mountedWrappers: Array<{ unmount: () => void }> = []

function mountTracked(...args: Parameters<typeof mount>) {
  const wrapper = mount(...args)
  mountedWrappers.push(wrapper)
  return wrapper
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', ObserverStub)
  vi.stubGlobal('IntersectionObserver', ObserverStub)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  document.documentElement.removeAttribute('data-low-battery-motion')
  setDocumentHidden(false)
})

afterEach(() => {
  while (mountedWrappers.length > 0) {
    mountedWrappers.pop()?.unmount()
  }
  document.documentElement.removeAttribute('data-low-battery-motion')
  setDocumentHidden(false)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('txBorderBeam', () => {
  it('renders slot content, the bloom layer and the per-instance stylesheet', () => {
    const wrapper = mount(TxBorderBeam, {
      slots: { default: '<div class="content">Card</div>' },
    })

    const beamId = wrapper.attributes('data-beam')
    expect(beamId).toMatch(/^tx-beam-/)
    expect(wrapper.find('.content').text()).toBe('Card')
    expect(wrapper.find('[data-beam-bloom]').exists()).toBe(true)

    const css = wrapper.find('style').text()
    expect(css).toContain(`[data-beam="${beamId}"]`)
    expect(css).toContain(`beam-fade-in-${beamId}`)
  })

  it('is active by default and stays inactive when mounted with active=false', async () => {
    const active = mount(TxBorderBeam)
    expect(active.attributes('data-active')).toBe('')

    const inactive = mount(TxBorderBeam, { props: { active: false } })
    expect(inactive.attributes('data-active')).toBeUndefined()

    await inactive.setProps({ active: true })
    expect(inactive.attributes('data-active')).toBe('')
  })

  it('fades out on deactivation and emits deactivate when the fade ends', async () => {
    const wrapper = mount(TxBorderBeam)
    const beamId = wrapper.attributes('data-beam')

    await wrapper.setProps({ active: false })
    expect(wrapper.attributes('data-fading')).toBe('')

    await wrapper.trigger('animationend', { animationName: `beam-fade-out-${beamId}` })
    await nextTick()
    expect(wrapper.attributes('data-fading')).toBeUndefined()
    expect(wrapper.attributes('data-active')).toBeUndefined()
    expect(wrapper.emitted('deactivate')).toHaveLength(1)
  })

  it('applies duration, explicit radius and clamped strength to the generated CSS', () => {
    const wrapper = mount(TxBorderBeam, {
      props: { size: 'line', duration: 5, borderRadius: 24, strength: 2 },
    })

    const css = wrapper.find('style').text()
    expect(css).toContain('5s')
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--beam-strength')).toBe('1')
  })

  it('pauses pulse rAF loop on blur, hidden, low-battery-motion and resumes cleanly', async () => {
    const raf = createRafHarness()
    const wrapper = mountTracked(TxBorderBeam, {
      props: { size: 'pulse-outside' },
    })
    await nextTick()

    expect(wrapper.attributes('data-paused')).toBeUndefined()
    expect(raf.pendingCount()).toBe(1)

    // Blur window -> immediately cancels rAF and sets data-paused without emitting deactivate
    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBe('')
    expect(raf.pendingCount()).toBe(0)
    expect(wrapper.emitted('deactivate')).toBeUndefined()

    // Focus window -> resumes rAF and clears data-paused
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBeUndefined()
    expect(raf.pendingCount()).toBe(1)

    // Hide document -> cancels rAF and sets data-paused
    setDocumentHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBe('')
    expect(raf.pendingCount()).toBe(0)

    // Show document -> resumes rAF
    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBeUndefined()
    expect(raf.pendingCount()).toBe(1)

    // Low-battery motion attribute -> pauses rAF via MutationObserver
    document.documentElement.setAttribute('data-low-battery-motion', '1')
    await nextTick()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBe('')
    expect(raf.pendingCount()).toBe(0)

    // Remove low-battery attribute -> resumes rAF
    document.documentElement.removeAttribute('data-low-battery-motion')
    await nextTick()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBeUndefined()
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
    expect(raf.pendingCount()).toBe(0)
  })

  it('starts paused when mounted unfocused or with low-battery-motion set', async () => {
    const raf = createRafHarness()
    const focusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    const wrapper = mountTracked(TxBorderBeam, {
      props: { size: 'pulse-outside' },
    })
    await nextTick()

    expect(wrapper.attributes('data-paused')).toBe('')
    expect(raf.pendingCount()).toBe(0)

    focusSpy.mockReturnValue(true)
    window.dispatchEvent(new Event('focus'))
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBeUndefined()
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
    expect(raf.pendingCount()).toBe(0)
  })

  it('pauses on KeepAlive deactivation and resumes on activation', async () => {
    const raf = createRafHarness()
    const visible = ref(true)

    const Host = defineComponent({
      setup() {
        return () =>
          h(KeepAlive, null, {
            default: () =>
              visible.value
                ? h(TxBorderBeam, { size: 'pulse-outside', key: 'beam' })
                : null,
          })
      },
    })

    const wrapper = mountTracked(Host)
    await nextTick()
    expect(raf.pendingCount()).toBe(1)

    visible.value = false
    await nextTick()
    expect(raf.pendingCount()).toBe(0)

    visible.value = true
    await nextTick()
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
    expect(raf.pendingCount()).toBe(0)
  })

  it('pauses when prefers-reduced-motion matches', async () => {
    const raf = createRafHarness()
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const mq = {
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => listeners.add(cb),
      removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => listeners.delete(cb),
    }
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      if (query === '(prefers-reduced-motion: reduce)') {
        return mq as unknown as MediaQueryList
      }
      return {
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as MediaQueryList
    })

    const wrapper = mountTracked(TxBorderBeam, {
      props: { size: 'pulse-outside' },
    })
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBe('')
    expect(raf.pendingCount()).toBe(0)

    mq.matches = false
    for (const cb of listeners) cb({ matches: false } as MediaQueryListEvent)
    await nextTick()
    expect(wrapper.attributes('data-paused')).toBeUndefined()
    expect(raf.pendingCount()).toBe(1)

    wrapper.unmount()
    expect(raf.pendingCount()).toBe(0)
  })

  it('pulse-driver cancels rAF directly on blur, hidden, and low-battery', async () => {
    const raf = createRafHarness()
    const el = document.createElement('div')
    const config = getPulseDriverConfig('pulse-outside', 'dark', 2.3, false, 'direct-test')!
    const unregister = registerPulseInstance(el, config)

    expect(raf.pendingCount()).toBe(1)
    raf.flush(100)
    expect(el.style.getPropertyValue('--beam-hue-direct-test')).not.toBe('')

    window.dispatchEvent(new Event('blur'))
    expect(raf.pendingCount()).toBe(0)

    window.dispatchEvent(new Event('focus'))
    expect(raf.pendingCount()).toBe(1)

    document.documentElement.setAttribute('data-low-battery-motion', '1')
    await Promise.resolve()
    expect(raf.pendingCount()).toBe(0)

    document.documentElement.removeAttribute('data-low-battery-motion')
    await Promise.resolve()
    expect(raf.pendingCount()).toBe(1)

    unregister()
    expect(raf.pendingCount()).toBe(0)
  })
})
