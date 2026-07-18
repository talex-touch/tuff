// @vitest-environment jsdom
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type { CoreBoxSearchSessionChunk } from '@talex-touch/utils/transport/events/types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import ApplicationIndex from './ApplicationIndex.vue'

type SearchStreamOptions = {
  onData: (chunk: CoreBoxSearchSessionChunk) => void
  onError?: (error: unknown) => void
  onEnd?: () => void
}

type SearchController = { cancel: ReturnType<typeof vi.fn> }

const state = vi.hoisted(() => ({
  on: vi.fn(),
  send: vi.fn(),
  streams: [] as Array<{
    eventName: string
    payload: unknown
    options: SearchStreamOptions
    controller: SearchController
  }>
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    on: state.on,
    send: state.send,
    stream: async (
      event: { toEventName?: () => string } | string,
      payload: unknown,
      options: SearchStreamOptions
    ) => {
      const controller: SearchController = { cancel: vi.fn() }
      state.streams.push({
        eventName: typeof event === 'string' ? event : event.toEventName?.() || String(event),
        payload,
        options,
        controller
      })
      return controller
    }
  })
}))

function item(id: string, title: string): TuffItem {
  return {
    id,
    kind: 'app',
    source: { id: 'application-provider', type: 'application' },
    render: { mode: 'default', basic: { title } }
  } as TuffItem
}

function result(sessionId: string, items: TuffItem[]): TuffSearchResult {
  return {
    sessionId,
    query: { text: '', inputs: [] },
    duration: 0,
    sources: [],
    items
  }
}

describe('ApplicationIndex search session transport', () => {
  afterEach(() => {
    state.streams.length = 0
    vi.clearAllMocks()
  })

  it('uses a caller-owned typed session stream and cancels only replaced or unmounted controllers', async () => {
    const wrapper = mount(ApplicationIndex, {
      global: {
        stubs: {
          AppConfigure: true,
          ApplicationEmpty: true,
          AppList: {
            name: 'AppList',
            props: ['index', 'list'],
            template: '<div />'
          }
        }
      }
    })
    await flushPromises()

    expect(state.streams).toHaveLength(1)
    expect(state.streams[0]).toMatchObject({
      eventName: CoreBoxEvents.search.session.toEventName(),
      payload: {
        query: { text: '' },
        activations: null,
        surface: 'application-index'
      }
    })
    expect(state.on).not.toHaveBeenCalled()
    expect(state.send).not.toHaveBeenCalled()

    state.streams[0].options.onData({ type: 'session', sessionId: 'application-session-1' })
    state.streams[0].options.onData({
      type: 'snapshot',
      sessionId: 'application-session-1',
      result: result('application-session-1', [item('calculator', 'Calculator')])
    })
    state.streams[0].options.onData({
      type: 'update',
      sessionId: 'application-session-1',
      items: [item('terminal', 'Terminal')]
    })
    await nextTick()

    const list = wrapper.findComponent({ name: 'AppList' })
    expect((list.props('list') as Array<{ name: string }>).map((entry) => entry.name)).toEqual([
      'Calculator',
      'Terminal'
    ])

    list.vm.$emit('search', 'term')
    await flushPromises()

    expect(state.streams).toHaveLength(2)
    expect(state.streams[0].controller.cancel).toHaveBeenCalledTimes(1)
    expect(state.streams[1].controller.cancel).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(state.streams[1].controller.cancel).toHaveBeenCalledTimes(1)
  })
})
