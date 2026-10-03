// @vitest-environment jsdom
// useDetach reads the footer through useKeyboard, whose app-storage import touches `window`.
import type { TuffItem } from '@talex-touch/utils'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, isProxy, reactive, ref } from 'vue'
import {
  clearCoreBoxFooterFeedback,
  useCoreBoxFooterFeedback
} from '../../meta-actions/footer-feedback'
import { isDetachedDivisionItemMatch, parseDetachedDivisionConfig } from './detached-division'
import {
  buildCoreBoxFlowPayload,
  buildDetachedFeatureConfig,
  resolveCoreBoxFlowActorPluginId,
  useDetach
} from './useDetach'

const transportMock = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(() => () => {})
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => transportMock
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn()
}))

vi.mock('vue-sonner', () => ({ toast: toastMock }))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: unknown) =>
      params && typeof params === 'object' ? `${key}:${Object.values(params).join(',')}` : key
  })
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

function createFeatureItem(overrides: Partial<TuffItem> = {}): TuffItem {
  return {
    id: 'demo-plugin/widget-clock',
    source: {
      type: 'plugin',
      id: 'plugin-features',
      name: 'Plugin Features'
    },
    kind: 'feature',
    render: {
      mode: 'default',
      basic: {
        title: 'Clock Widget',
        subtitle: 'Shows local time',
        icon: {
          type: 'emoji',
          value: 'C'
        }
      }
    },
    meta: {
      pluginName: 'demo-plugin',
      featureId: 'widget-clock',
      interaction: {
        type: 'widget'
      }
    },
    ...overrides
  }
}

describe('buildDetachedFeatureConfig', () => {
  it('uses pluginName for widget DivisionBox plugin identity and persists query in detached url', () => {
    const detached = buildDetachedFeatureConfig(createFeatureItem(), 'time now')

    expect(detached?.isWidget).toBe(true)
    expect(detached?.config.pluginId).toBe('demo-plugin')
    expect(detached?.config.ui).toEqual({ showInput: false, initialInput: '' })
    expect(detached?.config.initialState).toEqual({
      detachedPayload: {
        item: createFeatureItem(),
        query: 'time now'
      }
    })

    const url = new URL(detached?.config.url ?? '')
    expect(url.protocol).toBe('tuff:')
    expect(url.hostname).toBe('detached')
    expect(url.searchParams.get('itemId')).toBe('demo-plugin/widget-clock')
    expect(url.searchParams.get('query')).toBe('time now')
    expect(url.searchParams.get('source')).toBe('demo-plugin')
    expect(url.searchParams.get('providerSource')).toBe('plugin-features')
  })

  it('preserves widget query with special characters and snapshots the detached item payload', () => {
    const item = createFeatureItem()
    const query = 'time zone: Asia/Shanghai + reminders? now & next'
    const detached = buildDetachedFeatureConfig(item, query)

    item.render.basic!.title = 'Mutated Widget'

    const payload = detached?.config.initialState?.detachedPayload as
      | { item?: TuffItem; query?: string }
      | undefined

    expect(payload?.query).toBe(query)
    expect(payload?.item?.render.basic?.title).toBe('Clock Widget')

    const url = new URL(detached?.config.url ?? '')
    expect(url.searchParams.get('query')).toBe(query)
  })

  it('builds webcontent url from the real plugin id instead of plugin-features provider id', () => {
    const detached = buildDetachedFeatureConfig(
      createFeatureItem({
        meta: {
          pluginName: 'demo-plugin',
          featureId: 'panel',
          interaction: {
            type: 'webcontent',
            path: 'panel/index.html'
          }
        }
      }),
      'open panel'
    )

    expect(detached).toEqual({
      isWidget: false,
      config: expect.objectContaining({
        url: 'plugin://demo-plugin/panel/index.html',
        pluginId: 'demo-plugin',
        ui: { showInput: true, initialInput: 'open panel' },
        initialState: undefined
      })
    })
  })

  it('honors explicit hidden input for detached webcontent features', () => {
    const detached = buildDetachedFeatureConfig(
      createFeatureItem({
        meta: {
          pluginName: 'demo-plugin',
          featureId: 'manager',
          interaction: {
            type: 'webcontent',
            path: 'manager/index.html',
            showInput: false
          } as { type: 'webcontent'; path: string; showInput: boolean }
        }
      }),
      'clipboard'
    )

    expect(detached?.config.ui).toEqual({ showInput: false, initialInput: '' })
  })

  it('preserves source content bounds when detaching from CoreBox', () => {
    const detached = buildDetachedFeatureConfig(createFeatureItem(), 'time now', {
      x: 120,
      y: 80,
      width: 720,
      height: 600
    })

    expect(detached?.config.initialBounds).toEqual({
      width: 720,
      height: 544
    })
  })

  it('does not build DivisionBox config for non-plugin search results', () => {
    const detached = buildDetachedFeatureConfig(
      createFeatureItem({
        source: {
          type: 'application',
          id: 'app-provider',
          name: 'Applications'
        },
        kind: 'app',
        meta: undefined
      }),
      'clock'
    )

    expect(detached).toBeNull()
  })
})

describe('CoreBox Flow payload', () => {
  it('preserves the query and uses the real plugin identity instead of plugin-features', () => {
    const item = createFeatureItem({
      meta: {
        pluginName: 'touch-quickops',
        featureId: 'quickops'
      }
    })
    const payload = buildCoreBoxFlowPayload(item, 'start writing sprint')

    expect(payload).toEqual({
      type: 'json',
      data: { item, query: 'start writing sprint' },
      context: {
        sourcePluginId: 'touch-quickops',
        sourceFeatureId: 'quickops'
      }
    })
    expect(resolveCoreBoxFlowActorPluginId(payload)).toBe('touch-quickops')
  })

  it('fails closed when a plugin-features item has no owning plugin identity', () => {
    const payload = buildCoreBoxFlowPayload(
      createFeatureItem({
        meta: { featureId: 'quickops' }
      }),
      'start writing sprint'
    )

    expect(payload.context?.sourcePluginId).toBe('corebox')
    expect(resolveCoreBoxFlowActorPluginId(payload)).toBeUndefined()
  })
})

describe('CoreBox Flow dispatch', () => {
  let wrapper: VueWrapper | null = null

  function mountDetach(): ReturnType<typeof useDetach> {
    let detach: ReturnType<typeof useDetach> | undefined
    wrapper = mount(
      defineComponent({
        setup() {
          detach = useDetach({
            searchVal: ref('start writing sprint'),
            res: ref([]),
            boxOptions: { focus: 0 },
            isUIMode: computed(() => false),
            activeActivations: computed(() => undefined),
            deactivateProvider: async () => {}
          })
          return () => null
        }
      })
    )
    return detach!
  }

  function dispatchedRequest(): { payload: { data: { item: TuffItem; query: string } } } {
    const call = transportMock.send.mock.calls.find(([event]) => event === FlowEvents.dispatch)
    expect(call, 'expected a Flow dispatch').toBeTruthy()
    return call![1] as { payload: { data: { item: TuffItem; query: string } } }
  }

  beforeEach(() => {
    transportMock.send.mockReset()
    toastMock.success.mockClear()
    toastMock.warning.mockClear()
    toastMock.error.mockClear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    clearCoreBoxFooterFeedback()
  })

  it('sends a payload the transport can clone, for an item read off a reactive source', async () => {
    transportMock.send.mockResolvedValue({ success: true })
    const detach = mountDetach()

    // An activation or the box data hands the item out as a Proxy.
    detach.openFlowSelector(reactive(createFeatureItem()))
    await detach.dispatchFlow({ targetId: 'quickops.system-info' })

    const request = dispatchedRequest()
    // What Electron's IPC does with it: a Proxy anywhere fails with "could not be cloned".
    expect(() => structuredClone(request)).not.toThrow()
    const { item } = request.payload.data
    for (const value of [request.payload, request.payload.data, item, item.source, item.render]) {
      expect(isProxy(value)).toBe(false)
    }
    expect(request.payload).toEqual(
      buildCoreBoxFlowPayload(createFeatureItem(), 'start writing sprint')
    )
  })

  it.each([
    {
      name: 'a sent transfer',
      reply: () => Promise.resolve({ success: true }),
      feedback: { tone: 'success', message: 'corebox.flowSent' }
    },
    {
      name: 'a missing permission',
      reply: () =>
        Promise.resolve({
          success: false,
          error: { code: 'PERMISSION_DENIED', permissionId: 'clipboard.read' }
        }),
      feedback: { tone: 'error', message: 'setupPermissions.requiredPermission:clipboard.read' }
    },
    {
      name: 'a refused transfer',
      reply: () => Promise.resolve({ success: false, error: { message: 'No handler' } }),
      feedback: { tone: 'error', message: 'corebox.flowFailed' }
    },
    {
      name: 'a transport failure',
      reply: () => Promise.reject(new Error('IPC closed')),
      feedback: { tone: 'error', message: 'corebox.flowFailed' }
    }
  ])('reports $name in the footer, where CoreBox shows outcomes, and closes', async (outcome) => {
    transportMock.send.mockImplementation(outcome.reply)
    const detach = mountDetach()

    detach.openFlowSelector(createFeatureItem())
    await detach.dispatchFlow({ targetId: 'quickops.system-info' })

    expect(useCoreBoxFooterFeedback().value).toMatchObject(outcome.feedback)
    // CoreBox mounts no toast host: a toast here would never be seen.
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(detach.flowVisible).toBe(false)
  })
})

describe('detached widget fallback filter', () => {
  it('keeps provider source separate from the real plugin id', () => {
    const item = createFeatureItem()
    const config = parseDetachedDivisionConfig(
      'tuff://detached?itemId=demo-plugin%2Fwidget-clock&source=demo-plugin&providerSource=plugin-features'
    )

    expect(config).toEqual({
      itemId: 'demo-plugin/widget-clock',
      sourceId: 'demo-plugin',
      providerSourceId: 'plugin-features',
      query: undefined
    })
    expect(isDetachedDivisionItemMatch(item, config)).toBe(true)
    expect(
      isDetachedDivisionItemMatch(
        createFeatureItem({
          source: {
            type: 'plugin',
            id: 'other-provider',
            name: 'Other Provider'
          }
        }),
        config
      )
    ).toBe(false)
  })

  it('supports old provider-source urls and new plugin-source urls without providerSource', () => {
    const item = createFeatureItem()

    expect(
      isDetachedDivisionItemMatch(
        item,
        parseDetachedDivisionConfig(
          'tuff://detached?itemId=demo-plugin%2Fwidget-clock&source=plugin-features'
        )
      )
    ).toBe(true)
    expect(
      isDetachedDivisionItemMatch(
        item,
        parseDetachedDivisionConfig(
          'tuff://detached?itemId=demo-plugin%2Fwidget-clock&source=demo-plugin'
        )
      )
    ).toBe(true)
  })
})
