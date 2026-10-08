import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref, watch } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { useMotionActivity } from '../../../utils/motion-activity'

/** A real Vue consumer: activity owns a recurring task that moves rendered content. */
const MovingContent = defineComponent({
  props: {
    enabled: { type: Boolean, required: true },
    hostKey: { type: String, required: true },
    label: { type: String, required: true },
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null)
    const position = ref(0)
    const { active } = useMotionActivity(host, () => props.enabled)

    watch(active, (running, _previous, onCleanup) => {
      if (!running)
        return
      let frame: number
      function advance(): void {
        position.value++
        frame = requestAnimationFrame(advance)
      }
      frame = requestAnimationFrame(advance)
      onCleanup(() => cancelAnimationFrame(frame))
    }, { immediate: true, flush: 'post' })

    return () => h('div', { ref: host, key: props.hostKey, 'data-motion-host': '' }, [
      h('span', { style: { transform: `translateX(${position.value}px)` } }, props.label),
      h('output', String(position.value)),
    ])
  },
})

interface ObservedHost {
  queue: (target: Element, intersecting: boolean, ratio: number) => () => void
}

interface MotionPlatform {
  observerFor: (target: Element) => ObservedHost
  intersect: (target: Element, intersecting: boolean, ratio: number) => Promise<void>
  frame: () => Promise<void>
  setReduced: (value: boolean, notify: boolean) => Promise<void>
  setVisibility: (value: DocumentVisibilityState) => Promise<void>
}

function installPlatform(): MotionPlatform {
  const observers: Observer[] = []
  const frames = new Map<number, FrameRequestCallback>()
  const media = new EventTarget()
  let frameId = 0
  let frameTime = 0
  let reduced = false
  let visibility: DocumentVisibilityState = 'visible'

  class Observer {
    readonly targets = new Set<Element>()

    constructor(private readonly callback: IntersectionObserverCallback) {
      observers.push(this)
    }

    observe(target: Element): void {
      this.targets.add(target)
    }

    disconnect(): void {
      this.targets.clear()
    }

    /** Capture before disconnect: browsers can still deliver an already queued entry. */
    queue(target: Element, intersecting: boolean, ratio: number): () => void {
      const entry = { target, isIntersecting: intersecting, intersectionRatio: ratio } as IntersectionObserverEntry
      return () => this.callback([entry], this as unknown as IntersectionObserver)
    }
  }

  const query = {
    get matches() { return reduced },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: media.addEventListener.bind(media),
    removeEventListener: media.removeEventListener.bind(media),
  } as unknown as MediaQueryList

  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++frameId
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(window, 'matchMedia').mockImplementation(() => query)
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)

  return {
    observerFor(target: Element): Observer {
      const observer = observers.findLast(item => item.targets.has(target))
      if (!observer)
        throw new Error('The mounted motion host is not being observed')
      return observer
    },
    async intersect(target: Element, intersecting: boolean, ratio: number): Promise<void> {
      this.observerFor(target).queue(target, intersecting, ratio)()
      await nextTick()
    },
    async frame(): Promise<void> {
      const ready = [...frames.values()]
      frames.clear()
      frameTime += 16
      for (const callback of ready)
        callback(frameTime)
      await nextTick()
    },
    async setReduced(value: boolean, notify: boolean): Promise<void> {
      reduced = value
      if (notify)
        media.dispatchEvent(new Event('change'))
      await nextTick()
    },
    async setVisibility(value: DocumentVisibilityState): Promise<void> {
      visibility = value
      document.dispatchEvent(new Event('visibilitychange'))
      await nextTick()
    },
  }
}

let platform: MotionPlatform

beforeEach(() => {
  platform = installPlatform()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// Match neighboring tests: reverse-order after hooks unmount before restoring platform APIs.
enableAutoUnmount(afterEach)

const props = { enabled: true, hostKey: 'first', label: 'Saved report' }

describe('motion activity lifecycle', () => {
  it('does not let queued entries from a replaced host move or freeze the new content', async () => {
    // Otherwise a recycled list row animates offscreen, or freezes when its old row leaves view.
    const wrapper = mount(MovingContent, { props })
    await nextTick()
    const oldHost = wrapper.element
    const oldObserver = platform.observerFor(oldHost)
    const oldEnter = oldObserver.queue(oldHost, true, 1)
    const oldLeave = oldObserver.queue(oldHost, false, 0)
    await platform.intersect(oldHost, true, 1)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('1')

    await wrapper.setProps({ hostKey: 'replacement' })
    const newHost = wrapper.element
    expect(newHost).not.toBe(oldHost)
    oldEnter()
    await nextTick()
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('1')

    await platform.intersect(newHost, true, 1)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('2')
    oldLeave()
    await nextTick()
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('3')
    expect(wrapper.find('span').attributes('style')).toContain('translateX(3px)')
  })

  it('resamples motion preference across KeepAlive and resumes without stale observers or doubled motion', async () => {
    // A cached screen must honor a preference changed elsewhere and must not speed up on each visit.
    const shown = ref(true)
    const Screen = defineComponent({
      setup: () => () => h(KeepAlive, null, {
        default: () => shown.value ? h(MovingContent, props) : null,
      }),
    })
    const wrapper = mount(Screen)
    await nextTick()
    const host = wrapper.find('[data-motion-host]').element
    const obsoleteEnter = platform.observerFor(host).queue(host, true, 1)
    const obsoleteLeave = platform.observerFor(host).queue(host, false, 0)
    await platform.intersect(host, true, 1)
    await platform.frame()
    expect(host.querySelector('output')?.textContent).toBe('1')

    shown.value = false
    await nextTick()
    obsoleteEnter()
    await nextTick()
    await platform.frame()
    expect(host.querySelector('output')?.textContent).toBe('1')
    await platform.setReduced(true, false)

    shown.value = true
    await nextTick()
    await platform.intersect(host, true, 1)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('1')
    expect(wrapper.find('span').text()).toBe('Saved report')

    shown.value = false
    await nextTick()
    await platform.setReduced(false, false)
    shown.value = true
    await nextTick()
    obsoleteEnter()
    await nextTick()
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('1')

    await platform.intersect(host, true, 1)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('2')
    obsoleteLeave()
    await nextTick()
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('3')

    // A further cache round trip should preserve one normal-speed task, not add another.
    shown.value = false
    await nextTick()
    shown.value = true
    await nextTick()
    await platform.intersect(host, true, 1)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('4')
    wrapper.unmount()
    obsoleteEnter()
    await nextTick()
    await platform.frame()
    expect(host.querySelector('output')?.textContent).toBe('4')
  })

  it('suspends consumer motion for every gate and resumes only when all gates permit it', async () => {
    // Hidden/disabled/reduced-motion content must stop moving, but must not remain frozen on return.
    const wrapper = mount(MovingContent, { props })
    await nextTick()
    const host = wrapper.element
    await platform.intersect(host, true, 1)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe('1')

    const gates = [
      { name: 'document hidden', block: () => platform.setVisibility('hidden'), release: () => platform.setVisibility('visible') },
      { name: 'enabled=false', block: () => wrapper.setProps({ enabled: false }), release: () => wrapper.setProps({ enabled: true }) },
      { name: 'reduced motion', block: () => platform.setReduced(true, true), release: () => platform.setReduced(false, true) },
      { name: 'outside viewport', block: () => platform.intersect(host, false, 0), release: () => platform.intersect(host, true, 1) },
      { name: 'zero-area intersection', block: () => platform.intersect(host, true, 0), release: () => platform.intersect(host, true, 1) },
    ]
    let position = 1
    for (const gate of gates) {
      await gate.block()
      await platform.frame()
      expect(wrapper.find('output').text(), gate.name).toBe(String(position))
      expect(wrapper.find('span').text(), gate.name).toBe('Saved report')
      await gate.release()
      await platform.frame()
      expect(wrapper.find('output').text(), `${gate.name} recovery`).toBe(String(++position))
    }

    await platform.setVisibility('hidden')
    await wrapper.setProps({ enabled: false })
    await platform.setReduced(true, true)
    await platform.setVisibility('visible')
    await platform.frame()
    expect(wrapper.find('output').text()).toBe(String(position))
    await wrapper.setProps({ enabled: true })
    await platform.frame()
    expect(wrapper.find('output').text()).toBe(String(position))
    await platform.setReduced(false, true)
    await platform.frame()
    expect(wrapper.find('output').text()).toBe(String(position + 1))
  })

  it('SSR renders readable stationary content without accessing browser capabilities', async () => {
    // An eager browser read breaks the docs server; an active SSR gate can hide readable content.
    const forbidden = new Proxy({}, {
      get(_target, key): never {
        throw new Error(`Browser capability accessed during SSR: ${String(key)}`)
      },
    })
    vi.stubGlobal('window', forbidden)
    vi.stubGlobal('document', forbidden)
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.stubGlobal('requestAnimationFrame', () => { throw new Error('SSR scheduled animation') })

    const html = await renderToString(h(MovingContent, props))
    expect(html).toContain('Saved report')
    expect(html).toContain('transform:translateX(0px)')
    expect(html).toContain('<output>0</output>')
  })
})
