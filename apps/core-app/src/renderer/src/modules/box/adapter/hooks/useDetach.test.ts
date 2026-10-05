// @vitest-environment jsdom
// useDetach reads the footer through useKeyboard, whose app-storage import touches `window`.
import type { FlowTargetInfo, IProviderActivate, TuffItem } from '@talex-touch/utils'
import type { MetaShowRequest } from '@talex-touch/utils/transport/events/types/meta-overlay'
import { FlowEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, isProxy, reactive, ref } from 'vue'
import {
  clearCoreBoxFooterFeedback,
  useCoreBoxFooterFeedback
} from '../../meta-actions/footer-feedback'
import { estimateFlowTargetsPanelHeight } from '../../meta-actions/meta-flow-page'
import { isDetachedDivisionItemMatch, parseDetachedDivisionConfig } from './detached-division'
import {
  buildCoreBoxFlowPayload,
  buildDetachedFeatureConfig,
  resolveCoreBoxFlowActorPluginId,
  useDetach
} from './useDetach'

const transportListeners = vi.hoisted(() => new Map<string, (payload?: unknown) => void>())

const transportMock = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn((event: { toEventName: () => string }, listener: (payload?: unknown) => void) => {
    transportListeners.set(event.toEventName(), listener)
    return () => {
      transportListeners.delete(event.toEventName())
    }
  })
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

let wrapper: VueWrapper | null = null

/** useDetach in a mounted component, over `results`, in plugin UI mode or not. */
function mountDetach(
  options: {
    results?: TuffItem[]
    uiMode?: boolean
    activations?: IProviderActivate[]
    boxData?: unknown
  } = {}
): ReturnType<typeof useDetach> {
  let detach: ReturnType<typeof useDetach> | undefined
  wrapper = mount(
    defineComponent({
      setup() {
        detach = useDetach({
          searchVal: ref('start writing sprint'),
          res: ref(options.results ?? []),
          boxOptions: { focus: 0, data: options.boxData },
          isUIMode: computed(() => options.uiMode === true),
          activeActivations: computed(() => options.activations),
          deactivateProvider: async () => {}
        })
        return () => null
      }
    })
  )
  return detach!
}

describe('CoreBox Flow dispatch', () => {
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

    // An activation, the box data or the results hand the item out as a Proxy.
    await detach.dispatchFlow(reactive(createFeatureItem()), { targetId: 'quickops.system-info' })

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

  it('dispatches to the picked target with the tokens its confirmation returned', async () => {
    transportMock.send.mockResolvedValue({ success: true })
    const detach = mountDetach()

    await detach.dispatchFlow(createFeatureItem(), {
      targetId: 'quickops.stop-all',
      consentToken: 'consent-token',
      confirmationToken: 'confirm-token'
    })

    expect(dispatchedRequest()).toEqual({
      senderId: 'corebox',
      actorPluginId: 'demo-plugin',
      payload: buildCoreBoxFlowPayload(createFeatureItem(), 'start writing sprint'),
      options: {
        preferredTarget: 'quickops.stop-all',
        skipSelector: true,
        consentToken: 'consent-token',
        confirmationToken: 'confirm-token'
      }
    })
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
  ])('reports $name in the footer, where CoreBox shows outcomes', async (outcome) => {
    transportMock.send.mockImplementation(outcome.reply)
    const detach = mountDetach()

    await detach.dispatchFlow(createFeatureItem(), { targetId: 'quickops.system-info' })

    expect(useCoreBoxFooterFeedback().value).toMatchObject(outcome.feedback)
    // CoreBox mounts no toast host: a toast here would never be seen.
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })
})

describe('CoreBox Flow page open', () => {
  const systemInfo: FlowTargetInfo = {
    id: 'system-info',
    fullId: 'quickops.system-info',
    name: 'QuickOps System Info',
    pluginId: 'quickops',
    pluginName: 'QuickOps',
    supportedTypes: ['json'],
    hasFlowHandler: true,
    isEnabled: true
  }
  const airDrop: FlowTargetInfo = {
    id: 'airdrop',
    fullId: 'system-share.airdrop',
    name: 'AirDrop',
    pluginId: 'system-share',
    supportedTypes: ['json'],
    hasFlowHandler: true,
    isEnabled: true
  }

  /** Answers the targets with `targets` (or the `targets` reply itself), and the show. */
  function serve(targets: FlowTargetInfo[] | (() => Promise<unknown>)): void {
    transportMock.send.mockImplementation(async (event: unknown) => {
      if (event === FlowEvents.getTargets) {
        return typeof targets === 'function' ? targets() : { success: true, data: targets }
      }
      if (event === MetaOverlayEvents.ui.show) return { accepted: true }
      throw new Error('unexpected transport event')
    })
  }

  function sentEvents(): unknown[] {
    return transportMock.send.mock.calls.map(([event]) => event)
  }

  function showRequest(): MetaShowRequest {
    const call = transportMock.send.mock.calls.find(
      ([event]) => event === MetaOverlayEvents.ui.show
    )
    expect(call, 'expected the ⌘K card to be asked to open').toBeTruthy()
    return call![1] as MetaShowRequest
  }

  beforeEach(() => {
    transportMock.send.mockReset()
    transportListeners.clear()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.classList.remove('division-box')
    document.querySelectorAll('.CoreBoxFooter-Sticky').forEach((element) => element.remove())
  })

  it('opens the ⌘K card on its Flow page, sized for the targets it fetched first', async () => {
    serve([systemInfo, airDrop])
    const detach = mountDetach()

    // Read off the results, the item is a Proxy; the request must still clone.
    await detach.openFlowPanel(reactive(createFeatureItem()))

    expect(sentEvents()).toEqual([FlowEvents.getTargets, MetaOverlayEvents.ui.show])
    expect(transportMock.send).toHaveBeenNthCalledWith(1, FlowEvents.getTargets, {
      payloadType: 'json'
    })
    const request = showRequest()
    expect(request).toMatchObject({
      page: 'flow',
      anchor: 'corner',
      flowTargets: [systemInfo, airDrop],
      desiredPanelHeight: estimateFlowTargetsPanelHeight([systemInfo, airDrop])
    })
    expect(request.item).toEqual(createFeatureItem())
    expect(isProxy(request.item)).toBe(false)
    expect(() => structuredClone(request)).not.toThrow()
  })

  it('anchors above a displayed footer, and in the corner in plugin UI mode', async () => {
    serve([systemInfo])
    const footer = document.createElement('div')
    footer.className = 'CoreBoxFooter-Sticky display'
    document.body.appendChild(footer)

    await mountDetach().openFlowPanel(createFeatureItem())
    expect(showRequest().anchor).toBe('footer')

    wrapper?.unmount()
    transportMock.send.mockClear()
    await mountDetach({ uiMode: true }).openFlowPanel(createFeatureItem())
    expect(showRequest().anchor).toBe('corner')
  })

  it.each([
    {
      name: 'a refused fetch',
      reply: () => Promise.resolve({ success: false, error: { message: 'x' } })
    },
    { name: 'a failed fetch', reply: () => Promise.reject(new Error('IPC closed')) }
  ])('opens on no targets after $name', async ({ reply }) => {
    serve(reply)

    await mountDetach().openFlowPanel(createFeatureItem())

    expect(showRequest()).toMatchObject({
      page: 'flow',
      flowTargets: [],
      desiredPanelHeight: estimateFlowTargetsPanelHeight([])
    })
  })

  it('asks for nothing in a DivisionBox, which has no ⌘K card of its own', async () => {
    serve([systemInfo])
    document.body.classList.add('division-box')

    await mountDetach().openFlowPanel(createFeatureItem())

    expect(transportMock.send).not.toHaveBeenCalled()
  })

  it('opens from the result list’s ⌘⇧D and from a plugin view’s Flow shortcut', async () => {
    serve([systemInfo])
    const focused = createFeatureItem({ id: 'focused-result' })
    mountDetach({ results: [focused] })

    const picked = createFeatureItem({ id: 'picked-result' })
    window.dispatchEvent(new CustomEvent('corebox:flow-item', { detail: { item: picked } }))
    await vi.waitFor(() => expect(showRequest().item.id).toBe('picked-result'))

    transportMock.send.mockClear()
    transportListeners.get(FlowEvents.triggerTransfer.toEventName())?.()
    await vi.waitFor(() => expect(showRequest().item.id).toBe('focused-result'))
  })

  it('sends the result the key names, not a plugin feature the box data still remembers', async () => {
    serve([systemInfo])
    // A plugin view the user has left: no activation, its feature still in the box data.
    const leftFeature = createFeatureItem({ id: 'left-plugin-feature' })
    const picked = createFeatureItem({ id: 'picked-result' })
    mountDetach({ results: [picked], boxData: { feature: leftFeature } })

    window.dispatchEvent(new CustomEvent('corebox:flow-item', { detail: { item: picked } }))

    await vi.waitFor(() => expect(showRequest().item.id).toBe('picked-result'))
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
