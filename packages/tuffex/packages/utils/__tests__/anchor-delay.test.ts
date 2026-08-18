import type { AnchorDelayHandle, AnchorDelayNode, AnchorDelayService } from '../anchor-delay'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  ANCHOR_DELAY_PRESETS,
  createAnchorDelayService,
  provideAnchorDelayService,
  TX_ANCHOR_DELAY_KEY,
  useAnchorDelayService,
} from '../anchor-delay'

interface Probe {
  handle: AnchorDelayHandle
  opened: number
  closed: number
}

function attach(
  service: AnchorDelayService,
  layer: 'hint' | 'menu' | 'dialog',
  parent: AnchorDelayNode | null = null,
): Probe {
  const probe = { opened: 0, closed: 0 } as Probe
  probe.handle = service.register({
    layer,
    parent,
    onOpen: () => { probe.opened += 1 },
    onClose: () => { probe.closed += 1 },
  })
  return probe
}

describe('anchor-delay service', () => {
  let service: AnchorDelayService

  beforeEach(() => {
    vi.useFakeTimers()
    service = createAnchorDelayService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('delays', () => {
    it('waits the layer openDelay on a cold group', () => {
      const a = attach(service, 'hint')
      a.handle.requestOpen()

      vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay - 1)
      expect(a.handle.isOpen()).toBe(false)

      vi.advanceTimersByTime(1)
      expect(a.handle.isOpen()).toBe(true)
    })

    it('waits the layer closeDelay before closing', () => {
      const a = attach(service, 'hint')
      a.handle.openNow()
      a.handle.requestClose()

      vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.closeDelay - 1)
      expect(a.handle.isOpen()).toBe(true)

      vi.advanceTimersByTime(1)
      expect(a.handle.isOpen()).toBe(false)
    })

    it('honours a per-anchor delay override', () => {
      const probe = { opened: 0, closed: 0 } as Probe
      probe.handle = service.register({
        layer: 'hint',
        openDelay: () => 1000,
        onOpen: () => { probe.opened += 1 },
        onClose: () => { probe.closed += 1 },
      })

      probe.handle.requestOpen()
      vi.advanceTimersByTime(999)
      expect(probe.handle.isOpen()).toBe(false)
      vi.advanceTimersByTime(1)
      expect(probe.handle.isOpen()).toBe(true)
    })
  })

  describe('preemption', () => {
    // The reason this service exists: moving from one tooltip to the next must
    // not leave both on screen for the first one's closeDelay.
    it('closes a sibling hint immediately, well inside its own closeDelay', () => {
      const a = attach(service, 'hint')
      const b = attach(service, 'hint')

      a.handle.openNow()
      expect(a.handle.isOpen()).toBe(true)

      a.handle.requestClose()
      b.handle.openNow()

      // Not a single tick has passed, so a's closeDelay cannot have elapsed.
      expect(a.handle.isOpen()).toBe(false)
      expect(a.closed).toBe(1)
      expect(b.handle.isOpen()).toBe(true)
      expect(service.openNodes()).toHaveLength(1)
    })

    it('closes an open hint when a menu opens', () => {
      const hint = attach(service, 'hint')
      const menu = attach(service, 'menu')

      hint.handle.openNow()
      menu.handle.openNow()

      expect(hint.handle.isOpen()).toBe(false)
      expect(menu.handle.isOpen()).toBe(true)
    })

    it('leaves a hint alone when another hint only schedules an open', () => {
      const a = attach(service, 'hint')
      const b = attach(service, 'hint')

      a.handle.openNow()
      b.handle.requestOpen()

      // b is warm so it opens on the next tick, not synchronously — but until it
      // actually opens, a must stay up.
      expect(a.handle.isOpen()).toBe(true)
      vi.advanceTimersByTime(0)
      expect(a.handle.isOpen()).toBe(false)
      expect(b.handle.isOpen()).toBe(true)
    })
  })

  describe('ancestor safety', () => {
    it('does not close the parent menu when a nested submenu opens', () => {
      const parent = attach(service, 'menu')
      parent.handle.openNow()

      const child = attach(service, 'menu', parent.handle.node)
      child.handle.openNow()

      expect(parent.handle.isOpen()).toBe(true)
      expect(child.handle.isOpen()).toBe(true)
      expect(service.openNodes()).toHaveLength(2)
    })

    it('does not close the carrying panel when a hint inside it opens', () => {
      const panel = attach(service, 'menu')
      panel.handle.openNow()

      const nested = attach(service, 'hint', panel.handle.node)
      nested.handle.openNow()

      // Asserting the hint OPENED is the load-bearing half. Without it this
      // passes vacuously: suppression would keep the hint shut, and "the panel
      // is still open" would be true for the wrong reason.
      expect(nested.handle.isOpen()).toBe(true)
      expect(panel.handle.isOpen()).toBe(true)
    })

    it('exempts the carrying panel from suppressing its own nested hint', () => {
      const panel = attach(service, 'menu')
      panel.handle.openNow()

      const nested = attach(service, 'hint', panel.handle.node)
      const unrelated = attach(service, 'hint')

      nested.handle.openNow()
      unrelated.handle.openNow()

      // Same layer, same open menu — the only difference is ancestry.
      expect(nested.handle.isOpen()).toBe(true)
      expect(unrelated.handle.isOpen()).toBe(false)
    })

    it('still closes an unrelated menu at the same depth', () => {
      const parent = attach(service, 'menu')
      parent.handle.openNow()

      const cousin = attach(service, 'menu')
      cousin.handle.openNow()

      expect(parent.handle.isOpen()).toBe(false)
      expect(cousin.handle.isOpen()).toBe(true)
    })
  })

  describe('nested chain', () => {
    it('closing a parent cascades to its open descendants, deepest first', () => {
      const order: string[] = []
      const grand = service.register({ layer: 'menu', onOpen: () => {}, onClose: () => order.push('root') })
      const mid = service.register({ layer: 'menu', parent: grand.node, onOpen: () => {}, onClose: () => order.push('mid') })
      const leaf = service.register({ layer: 'menu', parent: mid.node, onOpen: () => {}, onClose: () => order.push('leaf') })

      grand.openNow()
      mid.openNow()
      leaf.openNow()
      grand.closeNow()

      expect(order).toEqual(['leaf', 'mid', 'root'])
      expect(service.openNodes()).toHaveLength(0)
    })

    it('cancelChain drops pending close timers on every ancestor', () => {
      const parent = attach(service, 'menu')
      const child = attach(service, 'menu', parent.handle.node)

      parent.handle.openNow()
      child.handle.openNow()
      // The pointer crossing out of the parent panel scheduled its close…
      parent.handle.requestClose()
      // …then landed in the child panel, proving it never left the chain.
      child.handle.cancelChain()

      vi.advanceTimersByTime(10_000)
      expect(parent.handle.isOpen()).toBe(true)
      expect(child.handle.isOpen()).toBe(true)
    })

    it('requestCloseChain closes hover-closeable ancestors with the leaf', () => {
      const parent = { opened: 0, closed: 0 } as Probe
      parent.handle = service.register({
        layer: 'menu',
        hoverCloseable: () => true,
        onOpen: () => { parent.opened += 1 },
        onClose: () => { parent.closed += 1 },
      })
      const child = attach(service, 'menu', parent.handle.node)

      parent.handle.openNow()
      child.handle.openNow()
      child.handle.requestCloseChain()

      vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.menu.closeDelay)
      expect(child.handle.isOpen()).toBe(false)
      expect(parent.handle.isOpen()).toBe(false)
    })

    it('requestCloseChain skips ancestors that are not hover-closeable', () => {
      // A click-opened menu: it never declared hoverCloseable, so a hover
      // submenu leaving must not schedule its close.
      const parent = attach(service, 'menu')
      const child = attach(service, 'menu', parent.handle.node)

      parent.handle.openNow()
      child.handle.openNow()
      child.handle.requestCloseChain()

      vi.advanceTimersByTime(10_000)
      expect(child.handle.isOpen()).toBe(false)
      expect(parent.handle.isOpen()).toBe(true)
    })

    it('sees an event inside an open descendant panel', () => {
      const parent = attach(service, 'menu')
      const child = attach(service, 'menu', parent.handle.node)
      parent.handle.openNow()
      child.handle.openNow()

      const childEl = {} as HTMLElement
      service.setFloatingEl(child.handle.node, childEl)
      const event = { composedPath: () => [childEl], target: null } as unknown as Event

      expect(service.isEventInsideChain(parent.handle.node, event)).toBe(true)
    })

    it('ignores panels of closed descendants and unrelated anchors', () => {
      // Menu-vs-menu preemption would never let an unrelated menu stay open
      // next to this chain; neuter it — this test is about containment only.
      service.configure({ preempts: { menu: [] } })
      const parent = attach(service, 'menu')
      const child = attach(service, 'menu', parent.handle.node)
      const stranger = attach(service, 'menu')
      parent.handle.openNow()
      child.handle.openNow()
      stranger.handle.openNow()

      const childEl = {} as HTMLElement
      const strangerEl = {} as HTMLElement
      service.setFloatingEl(child.handle.node, childEl)
      service.setFloatingEl(stranger.handle.node, strangerEl)

      const inStranger = { composedPath: () => [strangerEl], target: null } as unknown as Event
      expect(service.isEventInsideChain(parent.handle.node, inStranger)).toBe(false)

      child.handle.closeNow()
      const inChild = { composedPath: () => [childEl], target: null } as unknown as Event
      expect(service.isEventInsideChain(parent.handle.node, inChild)).toBe(false)
    })
  })

  describe('warm group', () => {
    it('opens with no delay while a sibling is still open', () => {
      const a = attach(service, 'hint')
      const b = attach(service, 'hint')

      a.handle.openNow()
      b.handle.requestOpen()

      vi.advanceTimersByTime(0)
      expect(b.handle.isOpen()).toBe(true)
    })

    it('stays warm for skipDelay after the last one closes', () => {
      const a = attach(service, 'hint')
      const b = attach(service, 'hint')

      a.handle.openNow()
      a.handle.closeNow()

      vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.skipDelay - 1)
      b.handle.requestOpen()
      vi.advanceTimersByTime(0)
      expect(b.handle.isOpen()).toBe(true)
    })

    it('goes cold again once skipDelay expires', () => {
      const a = attach(service, 'hint')
      const b = attach(service, 'hint')

      a.handle.openNow()
      a.handle.closeNow()

      vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.skipDelay + 1)
      b.handle.requestOpen()
      vi.advanceTimersByTime(0)
      expect(b.handle.isOpen()).toBe(false)

      vi.advanceTimersByTime(ANCHOR_DELAY_PRESETS.layers.hint.openDelay)
      expect(b.handle.isOpen()).toBe(true)
    })
  })

  describe('cross-layer suppression', () => {
    it('refuses to open a hint while a menu is open', () => {
      const menu = attach(service, 'menu')
      const hint = attach(service, 'hint')

      menu.handle.openNow()
      hint.handle.requestOpen()
      vi.advanceTimersByTime(10_000)

      expect(hint.handle.isOpen()).toBe(false)
      expect(hint.opened).toBe(0)
    })

    it('refuses even an immediate open while a menu is open', () => {
      const menu = attach(service, 'menu')
      const hint = attach(service, 'hint')

      menu.handle.openNow()
      hint.handle.openNow()

      expect(hint.handle.isOpen()).toBe(false)
    })

    it('lets the hint open again once the menu closes', () => {
      const menu = attach(service, 'menu')
      const hint = attach(service, 'hint')

      menu.handle.openNow()
      hint.handle.openNow()
      expect(hint.handle.isOpen()).toBe(false)

      menu.handle.closeNow()
      hint.handle.openNow()
      expect(hint.handle.isOpen()).toBe(true)
    })
  })

  describe('policy', () => {
    it('applies a configure patch without touching unrelated layers', () => {
      service.configure({ layers: { hint: { openDelay: 0 } } })

      const policy = service.getPolicy()
      expect(policy.layers.hint.openDelay).toBe(0)
      expect(policy.layers.hint.closeDelay).toBe(ANCHOR_DELAY_PRESETS.layers.hint.closeDelay)
      expect(policy.layers.menu).toEqual(ANCHOR_DELAY_PRESETS.layers.menu)
    })

    it('does not leak mutations of the returned policy back into the service', () => {
      const policy = service.getPolicy()
      policy.layers.hint.openDelay = 9999
      policy.preempts.hint.push('menu')

      expect(service.getPolicy().layers.hint.openDelay)
        .toBe(ANCHOR_DELAY_PRESETS.layers.hint.openDelay)
      expect(service.getPolicy().preempts.hint).toEqual(['hint'])
    })

    it('does not mutate the shared preset object', () => {
      service.configure({ layers: { hint: { openDelay: 7 } } })
      expect(ANCHOR_DELAY_PRESETS.layers.hint.openDelay).toBe(200)
    })
  })

  describe('lifecycle', () => {
    it('drops pending timers on dispose', () => {
      const a = attach(service, 'hint')
      a.handle.requestOpen()
      a.handle.dispose()

      vi.advanceTimersByTime(10_000)
      expect(a.opened).toBe(0)
    })

    it('stops counting a disposed anchor as open', () => {
      const a = attach(service, 'hint')
      a.handle.openNow()
      a.handle.dispose()

      expect(service.openNodes()).toHaveLength(0)
    })

    it('cancel drops the pending timer but keeps the current state', () => {
      const a = attach(service, 'hint')
      a.handle.openNow()
      a.handle.requestClose()
      a.handle.cancel()

      vi.advanceTimersByTime(10_000)
      expect(a.handle.isOpen()).toBe(true)
    })
  })

  describe('instance scoping', () => {
    it('keeps two services from seeing each other', () => {
      const other = createAnchorDelayService()
      const mine = attach(service, 'menu')
      const theirs = attach(other, 'menu')

      mine.handle.openNow()
      theirs.handle.openNow()

      // A module-level registry would have let one preempt the other, which in
      // an SSR process means one request closing another request's overlay.
      expect(mine.handle.isOpen()).toBe(true)
      expect(theirs.handle.isOpen()).toBe(true)
    })

    it('provides an app-scoped service that setup resolves', async () => {
      const perApp = createAnchorDelayService()
      let resolved: AnchorDelayService | null = null

      const Probe = defineComponent({
        setup() {
          resolved = useAnchorDelayService()
          return () => h('div')
        },
      })

      const app = createSSRApp(Probe)
      provideAnchorDelayService(app, perApp)
      await renderToString(app)

      expect(resolved).toBe(perApp)
    })

    it('falls back to the module-level service outside a component', () => {
      // Not merely non-null: it has to be usable, since components mounted
      // without app.use(Tuffex) rely on it.
      const outside = useAnchorDelayService()
      const probe = attach(outside, 'menu')
      probe.handle.openNow()
      expect(probe.handle.isOpen()).toBe(true)
      probe.handle.dispose()
    })

    it('exposes the injection key for hosts wiring their own service', () => {
      expect(typeof TX_ANCHOR_DELAY_KEY).toBe('symbol')
    })
  })
})
