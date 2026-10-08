// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import MetaPanel from './MetaPanel.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@talex-touch/tuffex/icon', () => ({
  TxIcon: { name: 'TxIcon', props: ['icon', 'size'], template: '<span class="tx-icon-stub" />' }
}))

vi.mock('@talex-touch/tuffex/transition', () => ({
  TxTransitionPush: {
    name: 'TxTransitionPush',
    props: ['direction', 'duration', 'easing'],
    template: '<div class="tx-transition-push"><slot /></div>'
  }
}))

const EASING = 'cubic-bezier(0.23, 1, 0.32, 1)'

interface AnimateCall {
  el: HTMLElement
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  animation: { cancel: ReturnType<typeof vi.fn> }
}

let animateCalls: AnimateCall[] = []

beforeEach(() => {
  animateCalls = []
  // jsdom has no Web Animations; record what the panel asks for.
  HTMLElement.prototype.animate = vi.fn(function (
    this: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions
  ) {
    const animation = { cancel: vi.fn() }
    animateCalls.push({ el: this, keyframes, options, animation })
    return animation as unknown as Animation
  }) as unknown as HTMLElement['animate']
  // jsdom has no layout either: the title sits 24px further in while the back button is in the row.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const backInRow = Boolean(this.closest('.MetaPanel-Header')?.querySelector('.MetaPanel-Back'))
    const left = this.classList.contains('MetaPanel-HeaderTitle') ? (backInRow ? 60 : 36) : 0
    return {
      left,
      x: left,
      top: 0,
      y: 0,
      width: 100,
      height: 20,
      right: left + 100,
      bottom: 20
    } as DOMRect
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (HTMLElement.prototype as { animate?: unknown }).animate
})

function mountPanel(options: { canGoBack: boolean; animate?: boolean }) {
  return mount(MetaPanel, {
    props: {
      title: 'BetterDisplay',
      icon: { type: 'class', value: 'i-ri-apps-line' },
      shouldAnimate: () => options.animate ?? true,
      page: options.canGoBack ? 'flow' : 'actions',
      direction: 'forward',
      canGoBack: options.canGoBack
    },
    slots: { default: '<div key="page" class="MetaPanel-Page" />' }
  })
}

function glides(): Array<{
  target: string
  from: unknown
  to: unknown
  options: KeyframeAnimationOptions
}> {
  return animateCalls.map((call) => ({
    target: call.el.classList.contains('MetaPanel-HeaderTitle') ? 'title' : 'icon',
    from: call.keyframes[0]?.translate,
    to: call.keyframes[1]?.translate,
    options: call.options
  }))
}

describe('MetaPanel header glide', () => {
  it('glides the icon and the title over as the back button comes in', async () => {
    const wrapper = mountPanel({ canGoBack: false })

    await wrapper.setProps({ canGoBack: true, page: 'flow' })
    await nextTick()

    expect(glides()).toEqual([
      { target: 'icon', from: '-24px 0', to: '0 0', options: { duration: 220, easing: EASING } },
      { target: 'title', from: '-24px 0', to: '0 0', options: { duration: 220, easing: EASING } }
    ])
  })

  it('glides them back as the back button leaves', async () => {
    const wrapper = mountPanel({ canGoBack: true })

    await wrapper.setProps({ canGoBack: false, page: 'actions' })
    await nextTick()

    expect(glides().map(({ target, from, to }) => ({ target, from, to }))).toEqual([
      { target: 'icon', from: '24px 0', to: '0 0' },
      { target: 'title', from: '24px 0', to: '0 0' }
    ])
  })

  it('lands them in place with the motion gate closed', async () => {
    const wrapper = mountPanel({ canGoBack: false, animate: false })

    await wrapper.setProps({ canGoBack: true, page: 'flow' })
    await nextTick()

    expect(animateCalls).toHaveLength(0)
  })

  it('drops a running glide before the next one starts', async () => {
    const wrapper = mountPanel({ canGoBack: false })
    await wrapper.setProps({ canGoBack: true, page: 'flow' })
    await nextTick()
    const first = animateCalls.slice()

    await wrapper.setProps({ canGoBack: false, page: 'actions' })
    await nextTick()

    expect(first).toHaveLength(2)
    for (const call of first) expect(call.animation.cancel).toHaveBeenCalledTimes(1)
    expect(animateCalls).toHaveLength(4)
  })

  it('passes the same curve to the page push', () => {
    const wrapper = mountPanel({ canGoBack: false })

    expect(wrapper.findComponent({ name: 'TxTransitionPush' }).props()).toMatchObject({
      duration: 220,
      easing: EASING
    })
  })
})
