import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useStickToBottom } from '../src/use-stick-to-bottom'

interface FakeElement {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  scrollTo: (options: { top: number, behavior?: string }) => void
}

function makeElement(overrides: Partial<FakeElement> = {}) {
  const el: FakeElement = {
    scrollTop: 0,
    scrollHeight: 1000,
    clientHeight: 400,
    scrollTo(options) {
      el.scrollTop = options.top
    },
    ...overrides,
  }
  return el
}

function setup(overrides: Partial<FakeElement> = {}) {
  const el = makeElement(overrides)
  const elementRef = ref<HTMLElement | null>(el as unknown as HTMLElement)
  const stick = useStickToBottom(elementRef, { threshold: 80 })
  return { el, stick }
}

function wheelUp(): WheelEvent {
  return { deltaY: -40 } as WheelEvent
}

describe('useStickToBottom', () => {
  it('starts following and keeps following near the bottom', () => {
    const { el, stick } = setup()
    el.scrollTop = 560 // 1000 - 560 - 400 = 40 < 80
    stick.handleScroll()
    expect(stick.atBottom.value).toBe(true)
    expect(stick.following.value).toBe(true)
  })

  it('stops following when the user scrolls away', () => {
    const { el, stick } = setup()
    el.scrollTop = 200
    stick.handleScroll()
    expect(stick.atBottom.value).toBe(false)
    expect(stick.following.value).toBe(false)

    // Content growth must not yank them back.
    el.scrollHeight = 2000
    stick.followIfSticking()
    expect(el.scrollTop).toBe(200)
  })

  it('breaks follow on upward wheel input even while at the bottom', () => {
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()
    expect(stick.following.value).toBe(true)

    stick.handleWheel(wheelUp())
    expect(stick.following.value).toBe(false)

    el.scrollHeight = 3000
    stick.followIfSticking()
    expect(el.scrollTop).toBe(600)
  })

  it('follows growth while sticking', () => {
    const { el, stick } = setup()
    el.scrollTop = 600
    stick.handleScroll()

    el.scrollHeight = 1500
    stick.followIfSticking()
    expect(el.scrollTop).toBe(1500)
    expect(stick.atBottom.value).toBe(true)
  })

  it('does not treat smooth-scroll intermediate events as the user walking away', () => {
    const { el, stick } = setup({
      // A smooth scroll that only gets 10% of the way per call.
      scrollTo(options: { top: number }) {
        el.scrollTop += (options.top - el.scrollTop) * 0.1
      },
    })
    el.scrollTop = 0
    stick.scrollToBottom('smooth')

    // Intermediate scroll events far from the bottom keep `following` intact.
    stick.handleScroll()
    expect(stick.following.value).toBe(true)

    // Arrival releases the guard; a later user scroll away breaks follow again.
    el.scrollTop = 950
    stick.handleScroll()
    el.scrollTop = 100
    stick.handleScroll()
    expect(stick.following.value).toBe(false)
  })

  it('scrollToBottom restores following from a detached position', () => {
    const { el, stick } = setup()
    el.scrollTop = 100
    stick.handleScroll()
    expect(stick.following.value).toBe(false)

    stick.scrollToBottom()
    expect(el.scrollTop).toBe(1000)
    expect(stick.following.value).toBe(true)
    expect(stick.atBottom.value).toBe(true)
  })

  it('tolerates a missing element', () => {
    const elementRef = ref<HTMLElement | null>(null)
    const stick = useStickToBottom(elementRef)
    expect(() => {
      stick.handleScroll()
      stick.scrollToBottom()
      stick.followIfSticking()
    }).not.toThrow()
    expect(stick.atBottom.value).toBe(true)
  })
})
