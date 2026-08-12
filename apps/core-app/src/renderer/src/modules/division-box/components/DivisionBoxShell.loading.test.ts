// @vitest-environment jsdom

/**
 * `isLoading` was set true on mount and only cleared when getState resolved with an active state.
 * The `.catch()` only logged, so a rejected or non-success response left the shell in its loading
 * state permanently (#829).
 *
 * The issue's suggested fix — "clear isLoading in the catch and in the non-success branch" — is
 * **not sufficient on its own**, which is what the second test pins: `showLoadingIndicator` is also
 * true while `currentState` is `prepare` or `attach`, and the session starts at `prepare`. Clearing
 * only the flag leaves the same overlay up, now reading 'Preparing...' forever.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(() => vi.fn())
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: mocks.send, on: mocks.on })
}))

vi.mock('~/utils/dev-log', () => ({ devLog: vi.fn() }))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock('../store/division-box', () => ({
  useDivisionBoxStore: () => ({
    togglePin: vi.fn(),
    close: vi.fn(),
    updatePosition: vi.fn(),
    updateSize: vi.fn()
  })
}))

// Names match what the SFC destructures; a wrong one surfaces as `undefined.value` inside a
// computed rather than as a missing mock.
vi.mock('../composables/useDrag', () => ({
  useDrag: () => ({
    isDragging: ref(false),
    position: ref({ x: 0, y: 0 }),
    showDockHint: ref(false),
    dockHintPosition: ref(null),
    startDrag: vi.fn()
  })
}))

vi.mock('../composables/useResize', () => ({
  useResize: () => ({
    isResizing: ref(false),
    dimensions: ref({ width: 400, height: 300 }),
    startResize: vi.fn()
  })
}))

import DivisionBoxShell from './DivisionBoxShell.vue'

function mountShell() {
  return mount(DivisionBoxShell, {
    props: { sessionId: 'session-1', title: 'Demo' },
    global: {
      stubs: {
        DivisionBoxHeader: { template: '<div class="header-stub" />' },
        DockHint: true
      }
    }
  })
}

describe('DivisionBoxShell does not hang on the loading overlay', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.on.mockClear()
  })

  it('getState 被拒绝时,遮罩消失并给出失败徽章', async () => {
    mocks.send.mockRejectedValue(new Error('session torn down'))
    const wrapper = mountShell()
    await flushPromises()

    expect(wrapper.find('.loading-indicator').exists()).toBe(false)
    expect(wrapper.find('.state-badge.state-failed').exists()).toBe(true)
  })

  // The exact half the issue's suggested fix would have missed.
  it('仅清 isLoading 不够:currentState 必须离开 prepare,否则遮罩照旧', async () => {
    mocks.send.mockRejectedValue(new Error('session torn down'))
    const wrapper = mountShell()
    await flushPromises()

    expect(wrapper.text()).not.toContain('Preparing...')
  })

  it('响应非 success 时同样是终态,而不是继续等一个不会来的事件', async () => {
    mocks.send.mockResolvedValue({ success: false })
    const wrapper = mountShell()
    await flushPromises()

    expect(wrapper.find('.loading-indicator').exists()).toBe(false)
    expect(wrapper.find('.state-badge.state-failed').exists()).toBe(true)
  })

  it('成功且 active 时既无遮罩也无徽章(否则上面几条会掩盖"永远失败")', async () => {
    mocks.send.mockResolvedValue({ success: true, data: { state: 'active' } })
    const wrapper = mountShell()
    await flushPromises()

    expect(wrapper.find('.loading-indicator').exists()).toBe(false)
    expect(wrapper.find('.state-badge').exists()).toBe(false)
  })

  it('成功但仍在 prepare 时,遮罩要留着 —— 那是真正还在加载', async () => {
    mocks.send.mockResolvedValue({ success: true, data: { state: 'prepare' } })
    const wrapper = mountShell()
    await flushPromises()

    expect(wrapper.find('.loading-indicator').exists()).toBe(true)
  })
})
