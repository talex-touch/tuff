// @vitest-environment jsdom
import type { TuffItem, TuffSearchResult } from '@talex-touch/utils'
import type { CoreBoxSearchSessionChunk } from '@talex-touch/utils/transport/events/types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import ApplicationIndex from './ApplicationIndex.vue'

// Echoes the key back, which is also what a missing translation does — the path
// `resolveSourceLabel` takes when it must not print the provider id.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

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

function item(id: string, title: string, overrides: Partial<TuffItem> = {}): TuffItem {
  return {
    id,
    kind: 'app',
    source: { id: 'application-provider', type: 'application', name: 'Applications' },
    render: { mode: 'default', basic: { title } },
    ...overrides
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
          AppConfigure: {
            name: 'AppConfigure',
            props: ['data'],
            template: '<div />'
          },
          SettingFileIndexAppIndexManager: true,
          TxScroll: { name: 'TxScroll', template: '<div><slot /></div>' },
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
      result: result('application-session-1', [
        item('calculator', 'Calculator', {
          render: {
            mode: 'default',
            basic: { title: 'Calculator', subtitle: 'Built-in calculator' }
          },
          meta: {
            app: {
              path: '/Applications/Calculator.app',
              bundleId: 'com.example.Calculator',
              identityKind: 'macos-path',
              launchKind: 'path',
              launchTarget: '/Applications/Calculator.app',
              displayPath: '/Applications/Calculator.app'
            },
            extension: { keyWords: ['calculator', '计算器'] },
            keywords: ['calculator']
          }
        })
      ])
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
    list.vm.$emit('select', (list.props('list') as Array<unknown>)[0], 0)
    await nextTick()

    const configure = wrapper.findComponent({ name: 'AppConfigure' })
    const data = configure.props('data') as {
      desc?: string
      details: Array<{ labelKey: string; value: string }>
    }
    expect(data).toMatchObject({
      name: 'Calculator',
      path: '/Applications/Calculator.app',
      details: expect.arrayContaining([
        { labelKey: 'appConfigure.details.bundleId', value: 'com.example.Calculator' },
        { labelKey: 'appConfigure.details.identityKind', value: 'macos-path' },
        { labelKey: 'appConfigure.details.keywords', value: 'calculator, 计算器' }
      ])
    })
    // The provider id is internal; the row must never print it.
    const sourceRow = data.details.find((row) => row.labelKey === 'appConfigure.details.source')
    expect(sourceRow?.value).toBe('Applications')

    list.vm.$emit('search', 'term')
    await flushPromises()

    expect(state.streams).toHaveLength(2)
    expect(state.streams[0].controller.cancel).toHaveBeenCalledTimes(1)
    expect(state.streams[1].controller.cancel).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(state.streams[1].controller.cancel).toHaveBeenCalledTimes(1)
  })

  /**
   * Both halves of this were live defects. The session stream is the one CoreBox uses, so it
   * carries every provider's hits; the page listed `cli.ts` and `候选扫描.txt` beside real apps.
   * And index-projected hits arrive without `source.name`, so the detail row printed the raw
   * `app-provider` id.
   */
  it('lists only application-sourced hits and never prints the provider id', async () => {
    const wrapper = mount(ApplicationIndex, {
      global: {
        stubs: {
          AppConfigure: {
            name: 'AppConfigure',
            props: ['data'],
            template: '<div />'
          },
          SettingFileIndexAppIndexManager: true,
          TxScroll: { name: 'TxScroll', template: '<div><slot /></div>' },
          AppList: {
            name: 'AppList',
            props: ['index', 'list'],
            template: '<div />'
          }
        }
      }
    })
    await flushPromises()

    const fileHit = {
      id: '/Users/demo/cli.ts',
      kind: 'file',
      source: { id: 'file-provider', type: 'file', name: 'Files' },
      render: { mode: 'default', basic: { title: 'cli.ts' } }
    } as unknown as TuffItem
    const appWithoutSourceName = item('ghostty', 'Ghostty', {
      source: { id: 'app-provider', type: 'application' },
      meta: { app: { path: '/Applications/Ghostty.app' } }
    } as Partial<TuffItem>)

    state.streams[0].options.onData({ type: 'session', sessionId: 'application-session-2' })
    state.streams[0].options.onData({
      type: 'snapshot',
      sessionId: 'application-session-2',
      result: result('application-session-2', [appWithoutSourceName, fileHit])
    })
    state.streams[0].options.onData({
      type: 'update',
      sessionId: 'application-session-2',
      items: [
        {
          id: '/Users/demo/notes.md',
          kind: 'file',
          source: { id: 'file-provider', type: 'file', name: 'Files' },
          render: { mode: 'default', basic: { title: 'notes.md' } }
        } as unknown as TuffItem
      ]
    })
    await nextTick()

    const list = wrapper.findComponent({ name: 'AppList' })
    expect((list.props('list') as Array<{ name: string }>).map((entry) => entry.name)).toEqual([
      'Ghostty'
    ])

    list.vm.$emit('select', (list.props('list') as Array<unknown>)[0], 0)
    await nextTick()

    const data = wrapper.findComponent({ name: 'AppConfigure' }).props('data') as {
      desc?: string
      details: Array<{ labelKey: string; value: string }>
    }
    const sourceRow = data.details.find((row) => row.labelKey === 'appConfigure.details.source')
    // With no translation available the fallback is the source type, never the provider id.
    expect(sourceRow?.value).toBe('application')

    wrapper.unmount()
  })

  /**
   * `TuffMeta.app.path` is optional. An application without one has no path to show, so the
   * detail pane must receive `undefined` and let `AppConfigure` hide the row — falling back to
   * `item.id` printed the internal provider identity under a path label.
   */
  it('leaves the detail path unset for an application with no filesystem path', async () => {
    const wrapper = mount(ApplicationIndex, {
      global: {
        stubs: {
          AppConfigure: {
            name: 'AppConfigure',
            props: ['data'],
            template: '<div />'
          },
          SettingFileIndexAppIndexManager: true,
          TxScroll: { name: 'TxScroll', template: '<div><slot /></div>' },
          AppList: {
            name: 'AppList',
            props: ['index', 'list'],
            template: '<div />'
          }
        }
      }
    })
    await flushPromises()

    state.streams[0].options.onData({ type: 'session', sessionId: 'application-session-3' })
    state.streams[0].options.onData({
      type: 'snapshot',
      sessionId: 'application-session-3',
      result: result('application-session-3', [item('pathless-app', 'Pathless App')])
    })
    await nextTick()

    const list = wrapper.findComponent({ name: 'AppList' })
    list.vm.$emit('select', (list.props('list') as Array<unknown>)[0], 0)
    await nextTick()

    const data = wrapper.findComponent({ name: 'AppConfigure' }).props('data') as {
      path?: string
    }
    expect(data.path).toBeUndefined()
    // The provider id is internal; it must never stand in for a missing path.
    expect(data.path).not.toBe('pathless-app')

    wrapper.unmount()
  })
})
