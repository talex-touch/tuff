import type { App, InjectionKey } from 'vue'
import { getCurrentInstance, inject, onScopeDispose, provide } from 'vue'

/**
 * Semantic role of an anchored overlay. The role — not the component — decides
 * how long it waits, whether it may open at all, and what it displaces.
 *
 * - `hint`   transient, non-interactive, hover/focus driven (tooltip)
 * - `menu`   interactive, dismissible, may nest (popover, dropdown, select)
 * - `dialog` interactive and committing (anchored confirm surfaces)
 */
export type AnchorDelayLayer = 'hint' | 'menu' | 'dialog'

export interface AnchorDelayLayerPolicy {
  /** Wait before opening on a cold group. */
  openDelay: number
  /**
   * Wait before closing. This exists to forgive the pointer *travelling* from
   * the trigger into the panel — nothing else. Preemption bypasses it precisely
   * because, once the pointer has landed on another anchor, there is no travel
   * left to forgive.
   */
  closeDelay: number
  /**
   * How long the group stays warm after its last anchor closes. While warm,
   * openDelay is 0, so sweeping across a row of triggers does not stutter.
   */
  skipDelay: number
}

export interface AnchorDelayPolicy {
  layers: Record<AnchorDelayLayer, AnchorDelayLayerPolicy>
  /** Opening a layer immediately closes every open anchor in these layers. */
  preempts: Record<AnchorDelayLayer, AnchorDelayLayer[]>
  /** A layer refuses to open while any anchor in these layers is open. */
  suppress: Record<AnchorDelayLayer, AnchorDelayLayer[]>
}

/**
 * Seeded from the values the components already shipped, so moving them onto
 * this service is field-for-field behaviour preserving:
 * TxTooltip was 200/120, TxPopover was 120/100. `skipDelay` is the only new
 * number, and it only ever *removes* waiting.
 */
export const ANCHOR_DELAY_PRESETS: AnchorDelayPolicy = {
  layers: {
    hint: { openDelay: 200, closeDelay: 120, skipDelay: 300 },
    menu: { openDelay: 120, closeDelay: 100, skipDelay: 0 },
    dialog: { openDelay: 0, closeDelay: 0, skipDelay: 0 },
  },
  preempts: {
    // `hint` preempting `hint` is the whole point: two tooltips must never be
    // on screen together, and the second one must not wait out the first one's
    // closeDelay.
    hint: ['hint'],
    menu: ['hint', 'menu'],
    // Stacking dialogs is DialogManager's job, not this service's.
    dialog: ['hint', 'menu'],
  },
  suppress: {
    // Once a menu is up the user has committed; a hint appearing over it is
    // noise, and it fights the panel for the same space.
    hint: ['menu', 'dialog'],
    menu: [],
    dialog: [],
  },
}

export interface AnchorDelayNode {
  readonly id: symbol
  readonly layer: AnchorDelayLayer
  readonly parent: AnchorDelayNode | null
}

export interface AnchorDelayRegistration {
  layer: AnchorDelayLayer
  /**
   * The anchor this one is rendered inside, from provide/inject.
   *
   * It must come from the component tree, never from the DOM: panels teleport to
   * `body`, so DOM containment is already severed by the time anything could ask.
   */
  parent?: AnchorDelayNode | null
  /** Applied when the service decides this anchor opens. */
  onOpen: () => void
  /** Applied when the service decides this anchor closes. */
  onClose: () => void
  /** Per-anchor override, read at scheduling time. `undefined` uses the preset. */
  openDelay?: () => number | undefined
  /** Per-anchor override, read at scheduling time. `undefined` uses the preset. */
  closeDelay?: () => number | undefined
}

export interface AnchorDelayHandle {
  readonly node: AnchorDelayNode
  /** Open after the resolved delay — 0 while the group is warm. */
  requestOpen: () => void
  /** Close after the resolved delay. */
  requestClose: () => void
  /** Open with no delay, for click and focus triggers. */
  openNow: () => void
  /** Close with no delay, for Escape, outside click, and unmount. */
  closeNow: () => void
  /** Drop pending timers without changing the open state. */
  cancel: () => void
  isOpen: () => boolean
  dispose: () => void
}

export interface AnchorDelayService {
  register: (registration: AnchorDelayRegistration) => AnchorDelayHandle
  configure: (patch: PartialAnchorDelayPolicy) => void
  getPolicy: () => AnchorDelayPolicy
  /** Open anchors, registration order. Exposed for tests and debugging. */
  openNodes: () => AnchorDelayNode[]
  /** Test-only: drops every registration and timer. */
  reset: () => void
}

export type PartialAnchorDelayPolicy = {
  layers?: Partial<Record<AnchorDelayLayer, Partial<AnchorDelayLayerPolicy>>>
  preempts?: Partial<Record<AnchorDelayLayer, AnchorDelayLayer[]>>
  suppress?: Partial<Record<AnchorDelayLayer, AnchorDelayLayer[]>>
}

const LAYERS: AnchorDelayLayer[] = ['hint', 'menu', 'dialog']

function clonePolicy(policy: AnchorDelayPolicy): AnchorDelayPolicy {
  return {
    layers: {
      hint: { ...policy.layers.hint },
      menu: { ...policy.layers.menu },
      dialog: { ...policy.layers.dialog },
    },
    preempts: {
      hint: [...policy.preempts.hint],
      menu: [...policy.preempts.menu],
      dialog: [...policy.preempts.dialog],
    },
    suppress: {
      hint: [...policy.suppress.hint],
      menu: [...policy.suppress.menu],
      dialog: [...policy.suppress.dialog],
    },
  }
}

interface AnchorEntry {
  node: AnchorDelayNode
  registration: AnchorDelayRegistration
  open: boolean
  timer: ReturnType<typeof setTimeout> | null
}

function isDescendantOf(node: AnchorDelayNode, maybeAncestor: AnchorDelayNode): boolean {
  let cursor: AnchorDelayNode | null = node.parent
  while (cursor) {
    if (cursor === maybeAncestor)
      return true
    cursor = cursor.parent
  }
  return false
}

/**
 * Builds a service with its own registry.
 *
 * The registry holds which overlays are open, which is per-request state. A Node
 * SSR process instantiates this module once and shares it across every request,
 * so a module-level registry would let one request's open menu suppress another
 * request's tooltip. Same reasoning as createZIndexAllocator.
 */
export function createAnchorDelayService(
  initialPolicy: AnchorDelayPolicy = ANCHOR_DELAY_PRESETS,
): AnchorDelayService {
  let policy = clonePolicy(initialPolicy)
  const entries = new Set<AnchorEntry>()
  const warmUntil: Record<AnchorDelayLayer, number> = { hint: 0, menu: 0, dialog: 0 }

  function clearTimer(entry: AnchorEntry) {
    if (entry.timer != null) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
  }

  /**
   * Always defers, including at delay 0.
   *
   * Scheduling stays uniformly asynchronous so that "warm, so open with no
   * delay" and "cold, so wait" differ only in *how long*, never in whether the
   * caller's own statement has finished running. A synchronous fast path at 0
   * would let a warm anchor open in the middle of the handler that requested it
   * and displace its sibling a tick early.
   *
   * Deliberately no `hasWindow()` guard: `setTimeout` is universal, and the
   * request paths are pointer-driven, so nothing schedules during SSR anyway.
   * Guarding here only made every delay collapse to zero under a node test env.
   */
  function schedule(entry: AnchorEntry, delay: number, run: () => void) {
    clearTimer(entry)
    entry.timer = setTimeout(() => {
      entry.timer = null
      run()
    }, Math.max(0, delay))
  }

  function isLayerOpen(layer: AnchorDelayLayer): boolean {
    for (const entry of entries) {
      if (entry.open && entry.node.layer === layer)
        return true
    }
    return false
  }

  function isWarm(layer: AnchorDelayLayer): boolean {
    return isLayerOpen(layer) || Date.now() < warmUntil[layer]
  }

  /**
   * Ancestor-aware, exactly like preemption.
   *
   * Without the exemption a tooltip rendered *inside* an open menu is blocked by
   * the very menu carrying it — the panel is that hint's context, not something
   * competing with it. This is subtle enough that both of its first tests passed
   * vacuously: the hint never opened, so "the panel stayed open" was trivially
   * true. They now assert the hint opens.
   */
  function isSuppressed(entry: AnchorEntry): boolean {
    const blockers = policy.suppress[entry.node.layer]
    if (!blockers.length)
      return false

    for (const other of entries) {
      if (other === entry || !other.open)
        continue
      if (!blockers.includes(other.node.layer))
        continue
      if (isDescendantOf(entry.node, other.node))
        continue
      return true
    }

    return false
  }

  function applyClose(entry: AnchorEntry) {
    clearTimer(entry)
    if (!entry.open)
      return
    entry.open = false
    warmUntil[entry.node.layer] = Date.now() + policy.layers[entry.node.layer].skipDelay
    entry.registration.onClose()
  }

  function preemptFor(entry: AnchorEntry) {
    const displaced = policy.preempts[entry.node.layer]
    if (!displaced.length)
      return

    for (const other of [...entries]) {
      if (other === entry || !other.open)
        continue
      // Never close upwards. Without this a submenu closes its parent, and a
      // hint rendered inside a panel closes the panel carrying it.
      if (isDescendantOf(entry.node, other.node))
        continue
      if (!displaced.includes(other.node.layer))
        continue
      applyClose(other)
    }
  }

  function applyOpen(entry: AnchorEntry) {
    clearTimer(entry)
    if (entry.open)
      return
    if (isSuppressed(entry))
      return

    preemptFor(entry)
    entry.open = true
    entry.registration.onOpen()
  }

  function resolveOpenDelay(entry: AnchorEntry): number {
    if (isWarm(entry.node.layer))
      return 0
    const override = entry.registration.openDelay?.()
    const value = override ?? policy.layers[entry.node.layer].openDelay
    return Math.max(0, value)
  }

  function resolveCloseDelay(entry: AnchorEntry): number {
    const override = entry.registration.closeDelay?.()
    const value = override ?? policy.layers[entry.node.layer].closeDelay
    return Math.max(0, value)
  }

  function register(registration: AnchorDelayRegistration): AnchorDelayHandle {
    const node: AnchorDelayNode = {
      id: Symbol('tx-anchor'),
      layer: registration.layer,
      parent: registration.parent ?? null,
    }
    const entry: AnchorEntry = { node, registration, open: false, timer: null }
    entries.add(entry)

    return {
      node,
      requestOpen: () => {
        // Checked up front as well as at fire time: a suppressed anchor should
        // not even hold a pending timer that could land after the blocker goes.
        if (isSuppressed(entry)) {
          clearTimer(entry)
          return
        }
        schedule(entry, resolveOpenDelay(entry), () => applyOpen(entry))
      },
      requestClose: () => {
        schedule(entry, resolveCloseDelay(entry), () => applyClose(entry))
      },
      openNow: () => applyOpen(entry),
      closeNow: () => applyClose(entry),
      cancel: () => clearTimer(entry),
      isOpen: () => entry.open,
      dispose: () => {
        clearTimer(entry)
        entries.delete(entry)
      },
    }
  }

  function configure(patch: PartialAnchorDelayPolicy) {
    const next = clonePolicy(policy)
    for (const layer of LAYERS) {
      const layerPatch = patch.layers?.[layer]
      if (layerPatch)
        next.layers[layer] = { ...next.layers[layer], ...layerPatch }
      const preemptPatch = patch.preempts?.[layer]
      if (preemptPatch)
        next.preempts[layer] = [...preemptPatch]
      const suppressPatch = patch.suppress?.[layer]
      if (suppressPatch)
        next.suppress[layer] = [...suppressPatch]
    }
    policy = next
  }

  return {
    register,
    configure,
    getPolicy: () => clonePolicy(policy),
    openNodes: () => [...entries].filter(entry => entry.open).map(entry => entry.node),
    reset: () => {
      for (const entry of entries)
        clearTimer(entry)
      entries.clear()
      for (const layer of LAYERS)
        warmUntil[layer] = 0
      policy = clonePolicy(initialPolicy)
    },
  }
}

export const TX_ANCHOR_DELAY_KEY: InjectionKey<AnchorDelayService>
  = Symbol('tx-anchor-delay')

/**
 * Service for callers with no Vue app in scope: the module-level functions
 * below, tests, and components mounted outside `app.use(Tuffex)`.
 */
const fallbackService = createAnchorDelayService()

/**
 * Gives one app its own service. Vue SSR builds an app per request, so this is
 * what keeps one request's open overlays out of another request's decisions.
 */
export function provideAnchorDelayService(
  app: App,
  service: AnchorDelayService = createAnchorDelayService(),
): AnchorDelayService {
  app.provide(TX_ANCHOR_DELAY_KEY, service)
  return service
}

/**
 * Resolves the app-scoped service, falling back to the module-level one when no
 * app provided it.
 *
 * Call this in `setup` and keep the result: `inject` is only valid there, while
 * scheduling happens later from event handlers.
 */
export function useAnchorDelayService(): AnchorDelayService {
  if (!getCurrentInstance())
    return fallbackService
  return inject(TX_ANCHOR_DELAY_KEY, fallbackService)
}

/** Adjusts the module-level service. Apps using `app.use(Tuffex)` should call
 * `useAnchorDelayService().configure()` instead so the change stays app-scoped. */
export function configureAnchorDelay(patch: PartialAnchorDelayPolicy): void {
  fallbackService.configure(patch)
}

/**
 * Carries the enclosing anchor down the component tree so a nested one can name
 * its parent.
 *
 * Deliberately not derived from the DOM: panels teleport to `body`, so by the
 * time anything could call `closest()` the containment that mattered is gone.
 */
export const TX_ANCHOR_NODE_KEY: InjectionKey<AnchorDelayNode> = Symbol('tx-anchor-node')

export interface UseAnchorDelayOptions extends Omit<AnchorDelayRegistration, 'parent'> {}

/**
 * Registers one component with the app's service, links it to the anchor it is
 * rendered inside, and publishes itself as the parent for anything nested below.
 *
 * Must be called from `setup`: it uses both `inject` and `provide`.
 */
export function useAnchorDelay(options: UseAnchorDelayOptions): AnchorDelayHandle {
  const service = useAnchorDelayService()
  const parent = getCurrentInstance() ? inject(TX_ANCHOR_NODE_KEY, null) : null
  const handle = service.register({ ...options, parent })

  if (getCurrentInstance())
    provide(TX_ANCHOR_NODE_KEY, handle.node)

  onScopeDispose(() => handle.dispose())

  return handle
}
