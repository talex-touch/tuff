import type { Component, ComponentInternalInstance, ComponentOptions, VNode } from 'vue'
import type { PropCoerceKind, PropSchema } from './coerce'
import {
  computed,
  defineComponent,
  defineCustomElement,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  ref,
  useHost,
  watch,
} from 'vue'
import { coercePropsBySchema, coercePropValue } from './coerce'
import { dispatchHostEvent, toVueListenerProp } from './events'
import { getTuffexShadowStyles } from './styles'

export interface DefineTxElementOptions {
  /** Override the canonical `tx-*` custom element tag name. */
  tagName?: string
  /**
   * Use Shadow DOM instead of Light DOM.
   * Defaults to `false` so global `--tx-*` design tokens, `.dark` / high-contrast
   * themes, and TuffEx BEM styles work seamlessly without FOUC or selector breaks.
   */
  shadowRoot?: boolean
  /** Additional CSS text strings to inject when `shadowRoot: true`. */
  styles?: string[]
  /** Optional CustomElementRegistry (defaults to `globalThis.customElements`). */
  registry?: CustomElementRegistry
}

export interface TxCustomElementConstructor extends CustomElementConstructor {
  readonly def?: ComponentOptions
}

export interface ModelSyncConfig {
  /** Inner Vue component prop name (e.g. `'modelValue'` or `'visible'`). */
  prop: string
  /** Inner Vue component update event name (e.g. `'update:modelValue'` or `'update:visible'`). */
  event: string
  /** Optional alias prop accepted on the WC host (e.g. `'modelValue'` aliasing `'visible'`). */
  aliasProp?: string
  /** Additional DOM event names to emit alongside the primary update event. */
  extraDomEvents?: string[]
  /** Whether to mirror internal updates back onto the host element property. Defaults to `true`. */
  reflectToHost?: boolean
}

export interface TxWrapperConfig {
  /** Custom element tag name, e.g. `'tx-button'`. */
  tag: string
  /** Wrapped TuffEx Vue component. */
  component: Component
  /** Prop coercion schema matching the wrapped component's truthful props. */
  props: PropSchema
  /** Vue event names emitted by the wrapped component that should re-dispatch as bubbling, composed CustomEvents. */
  emits?: string[]
  /** Slot names supported by the wrapped component (`'default'`, `'header'`, etc.). */
  slots?: string[]
  /** Controlled + uncontrolled two-way model binding configuration. */
  model?: ModelSyncConfig
  /**
   * Native DOM event names to stop at the inner component root so the host
   * dispatches a single clean CustomEvent instead of firing both native + custom.
   */
  suppressNativeEvents?: string[]
  /** Method / property names exposed by the inner component to forward onto the custom element host. */
  exposeMethods?: string[]
  /** Promote `provide()` keys from the wrapped child component onto the CE root instance for nested custom elements. */
  promoteProvides?: boolean
  /**
   * Use imperative Light DOM slot outlets (`display:contents` ref containers) instead of
   * `<slot>` tags so slots rendered inside child `<Teleport>` / `<Transition>` / `v-if`
   * subtrees (e.g. Dialog, Drawer, Tooltip, Popover) project reliably on every open/close cycle.
   */
  teleportSlots?: boolean
  /** Optional transform hook to adjust props before passing them to the wrapped component. */
  transformProps?: (
    coerced: Record<string, unknown>,
    ctx: { host: HTMLElement | null },
  ) => Record<string, unknown>
}

interface VueElementInternals extends HTMLElement {
  _slots?: Record<string, Node[]>
  _props?: Record<string, unknown>
}

/**
 * Determine whether the host element actually has user-supplied content for a given slot name.
 * Checking this before passing slot functions preserves wrapped components' fallback content
 * (e.g. `TxTag`'s `label`, `TxBadge`'s `value`, `TxAvatar`'s `name`, `TxCard`'s optional header/footer).
 */
export function hasHostSlotContent(host: HTMLElement | null, slotName: string): boolean {
  if (!host)
    return false

  const internal = host as VueElementInternals
  // Light DOM mode (`shadowRoot: false`): Vue 3.5 populates `host._slots` before mount.
  if (internal._slots) {
    const nodes = internal._slots[slotName]
    if (!nodes || nodes.length === 0)
      return false
    if (slotName === 'default')
      return nodes.some(isMeaningfulSlotNode)
    return true
  }

  // Shadow DOM mode (`shadowRoot: true`): inspect host's direct childNodes.
  const childNodes = Array.from(host.childNodes)
  if (slotName === 'default') {
    return childNodes.some((node) => {
      if (node.nodeType === 1 && (node as Element).getAttribute('slot'))
        return false
      return isMeaningfulSlotNode(node)
    })
  }

  return childNodes.some(
    node => node.nodeType === 1 && (node as Element).getAttribute('slot') === slotName,
  )
}

function isMeaningfulSlotNode(node: Node): boolean {
  if (node.nodeType === 8) // Comment
    return false
  if (node.nodeType === 3) // Text
    return Boolean(node.textContent && node.textContent.trim().length > 0)
  return true
}

/**
 * Read raw slot nodes from a custom element host (works for both Light DOM and Shadow DOM).
 */
export function getHostSlotNodes(host: HTMLElement | null, slotName = 'default'): Node[] {
  if (!host)
    return []
  const internal = host as VueElementInternals
  if (internal._slots)
    return [...(internal._slots[slotName] ?? [])]

  const childNodes = Array.from(host.childNodes)
  if (slotName === 'default') {
    return childNodes.filter(
      node => !(node.nodeType === 1 && (node as Element).getAttribute('slot')),
    )
  }
  return childNodes.filter(
    node => node.nodeType === 1 && (node as Element).getAttribute('slot') === slotName,
  )
}

/**
 * Copy own `provides` (both string and symbol keys) from a child Vue component instance
 * onto the wrapper CE root instance so nested Vue custom elements inherit them via
 * Vue 3.5's `_inheritParentContext()`.
 */
export function promoteChildProvides(
  wrapperInstance: ComponentInternalInstance | null,
  childInstance: ComponentInternalInstance | null | undefined,
): void {
  if (!wrapperInstance || !childInstance)
    return
  const childProvides = (childInstance as unknown as { provides?: Record<PropertyKey, unknown> }).provides
  const wrapperProvides = (wrapperInstance as unknown as { provides?: Record<PropertyKey, unknown> }).provides
  if (!childProvides || !wrapperProvides || childProvides === wrapperProvides)
    return

  for (const key of Reflect.ownKeys(childProvides)) {
    wrapperProvides[key] = childProvides[key]
  }
}

const NATIVE_ELEMENT_PROP_KEYS = new Set([
  'title',
  'ariaLabel',
  'ariaLabelledby',
  'role',
  'blur',
  'focus',
  'click',
  'hidden',
  'draggable',
  'autofocus',
  'slot',
  'id',
  'dir',
  'lang',
])

const CAMEL_TO_ATTR_RE = /([a-z0-9])([A-Z])/g

function propKeyToAttrName(key: string): string {
  return key.replace(CAMEL_TO_ATTR_RE, '$1-$2').toLowerCase()
}

/**
 * Create a slot VNode for the wrapped component.
 * - For standard Light DOM & Shadow DOM slots, returns a native `<slot>` VNode handled by
 *   Vue 3.5's `VueElement._renderSlots` / native Shadow DOM.
 * - When `teleportSafe` is `true` in Light DOM (`shadowRoot: false`), returns a zero-box
 *   `display:contents` outlet whose `ref` mounts `host._slots[slotName]` cleanly inside any
 *   `<Teleport>` / `<Transition>` / `v-if` subtree without colliding with `_renderSlots`.
 */
export function createSlotVNode(
  host: HTMLElement | null,
  slotName: string,
  teleportSafe = false,
): VNode {
  const isLightDom = Boolean(host && !host.shadowRoot)
  if (teleportSafe && isLightDom && host) {
    return h('span', {
      'class': 'tx-wc-slot-outlet',
      'data-tx-slot': slotName,
      'style': 'display:contents',
      'ref': (el: unknown) => {
        if (!(el instanceof HTMLElement))
          return
        const nodes = (host as VueElementInternals)._slots?.[slotName]
        if (!nodes || nodes.length === 0)
          return
        for (const node of nodes) {
          if (node.parentNode !== el && !node.contains(el))
            el.appendChild(node)
        }
      },
    })
  }

  return h('slot', slotName === 'default' ? undefined : { name: slotName })
}

/**
 * Observe HTML attributes for schema keys that collide with built-in HTMLElement properties
 * (e.g. `title`, `ariaLabel`, `role`, `blur`, `autofocus`) so Vue CE does not overwrite native
 * properties or emit dev warnings while attributes remain fully reactive.
 */
export function useNativeAttrProps(
  host: HTMLElement | null,
  schema: PropSchema,
): { nativeValues: Record<string, unknown>, cleanup: () => void } {
  const nativeEntries = Object.entries(schema).filter(([key]) => NATIVE_ELEMENT_PROP_KEYS.has(key))
  const state = ref<Record<string, unknown>>({})

  if (!host || nativeEntries.length === 0) {
    return {
      get nativeValues() {
        return state.value
      },
      cleanup: () => {},
    }
  }

  const attrToKey = new Map<string, [string, PropCoerceKind]>()
  for (const [key, kind] of nativeEntries) {
    attrToKey.set(propKeyToAttrName(key), [key, kind])
  }

  const readAll = () => {
    const next: Record<string, unknown> = {}
    for (const [attrName, [key, kind]] of attrToKey.entries()) {
      if (host.hasAttribute(attrName)) {
        const coerced = coercePropValue(kind, host.getAttribute(attrName))
        if (coerced !== undefined)
          next[key] = coerced
      }
    }
    state.value = next
  }

  readAll()

  let observer: MutationObserver | null = null
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(() => readAll())
    observer.observe(host, {
      attributes: true,
      attributeFilter: Array.from(attrToKey.keys()),
    })
  }

  return {
    get nativeValues() {
      return state.value
    },
    cleanup: () => {
      observer?.disconnect()
      observer = null
    },
  }
}

/**
 * Build Vue prop declarations with no implicit Vue Boolean/Number casting so our
 * explicit schema coercer handles `attr="false"`, `attr=""`, JSON, and defaults accurately.
 * Excludes keys that collide with built-in HTMLElement properties (handled via `useNativeAttrProps`).
 */
export function buildRawVueProps(schema: PropSchema): Record<string, { default: undefined }> {
  const defs: Record<string, { default: undefined }> = {}
  for (const key of Object.keys(schema)) {
    if (NATIVE_ELEMENT_PROP_KEYS.has(key))
      continue
    defs[key] = { default: undefined }
  }
  return defs
}

export function createTxWrapperComponent(config: TxWrapperConfig): ComponentOptions {
  const propSchema: PropSchema = { ...config.props }
  if (config.model?.aliasProp && !(config.model.aliasProp in propSchema)) {
    propSchema[config.model.aliasProp] = (propSchema[config.model.prop] ?? 'any') as PropCoerceKind
  }

  return defineComponent({
    name: `Wc_${config.tag}`,
    props: buildRawVueProps(propSchema),
    setup(rawProps, { expose }) {
      const host = useHost()
      const wrapperInstance = getCurrentInstance()
      const innerRef = ref<Record<string, unknown> | null>(null)
      const suppressedCleanup: Array<() => void> = []
      const nativeAttrs = useNativeAttrProps(host, propSchema)

      const coercedProps = computed(() => {
        const base = {
          ...nativeAttrs.nativeValues,
          ...coercePropsBySchema(rawProps as Record<string, unknown>, propSchema),
        }
        return config.transformProps ? config.transformProps(base, { host }) : base
      })

      // Controlled + uncontrolled two-way model state
      const modelConfig = config.model
      const hasLocalModel = ref(false)
      const localModel = ref<unknown>(undefined)

      if (modelConfig) {
        watch(
          () => {
            const primary = coercedProps.value[modelConfig.prop]
            if (primary !== undefined)
              return primary
            if (modelConfig.aliasProp)
              return coercedProps.value[modelConfig.aliasProp]
            return undefined
          },
          (next) => {
            if (next !== undefined) {
              hasLocalModel.value = true
              localModel.value = next
            }
          },
          { immediate: true },
        )
      }

      function syncHostModel(nextValue: unknown): void {
        if (!modelConfig)
          return
        hasLocalModel.value = true
        localModel.value = nextValue
        if (modelConfig.reflectToHost !== false && host) {
          const hostObj = host as unknown as Record<string, unknown>
          if (hostObj[modelConfig.prop] !== nextValue)
            hostObj[modelConfig.prop] = nextValue
        }
      }

      // Build Vue event listeners for the inner component
      const eventListeners: Record<string, (...args: unknown[]) => void> = {}
      const declaredEmits = new Set(config.emits ?? [])
      if (modelConfig)
        declaredEmits.add(modelConfig.event)

      for (const emitName of declaredEmits) {
        const listenerKey = toVueListenerProp(emitName)
        eventListeners[listenerKey] = (...args: unknown[]) => {
          const payload = args.length <= 1 ? args[0] : args

          // Prevent duplicate native DOM click bubbling when inner click emits MouseEvent
          if (emitName === 'click' && typeof Event !== 'undefined' && args[0] instanceof Event) {
            args[0].stopPropagation()
          }

          if (modelConfig && emitName === modelConfig.event) {
            syncHostModel(args[0])
            dispatchHostEvent(host, emitName, args[0])
            for (const extra of modelConfig.extraDomEvents ?? [])
              dispatchHostEvent(host, extra, args[0])
            return
          }

          dispatchHostEvent(host, emitName, payload)
        }
      }

      // Forward exposed methods/refs from inner TuffEx component onto the custom element host
      if (config.exposeMethods?.length) {
        const exposedObj: Record<string, unknown> = {}
        for (const methodName of config.exposeMethods) {
          exposedObj[methodName] = (...args: unknown[]) => {
            const target = innerRef.value?.[methodName]
            if (typeof target === 'function')
              return (target as (...a: unknown[]) => unknown)(...args)
            return target
          }
        }
        expose(exposedObj)
      }

      function attachNativeSuppressors(el: unknown): void {
        while (suppressedCleanup.length)
          suppressedCleanup.pop()?.()
        if (!config.suppressNativeEvents?.length || !(el instanceof EventTarget))
          return
        for (const nativeEvent of config.suppressNativeEvents) {
          const handler = (event: Event) => {
            if (!(event instanceof CustomEvent))
              event.stopPropagation()
          }
          el.addEventListener(nativeEvent, handler)
          suppressedCleanup.push(() => el.removeEventListener(nativeEvent, handler))
        }
      }

      onBeforeUnmount(() => {
        nativeAttrs.cleanup()
        while (suppressedCleanup.length)
          suppressedCleanup.pop()?.()
      })

      return () => {
        const forwardedProps: Record<string, unknown> = { ...coercedProps.value }
        if (modelConfig) {
          if (modelConfig.aliasProp)
            delete forwardedProps[modelConfig.aliasProp]
          if (hasLocalModel.value)
            forwardedProps[modelConfig.prop] = localModel.value
        }

        const vnodeProps: Record<string, unknown> = {
          ...forwardedProps,
          ...eventListeners,
          ref: innerRef,
          onVnodeBeforeMount: (vnode: VNode) => {
            if (config.promoteProvides)
              promoteChildProvides(wrapperInstance, vnode.component)
          },
          onVnodeMounted: (vnode: VNode) => {
            if (config.promoteProvides)
              promoteChildProvides(wrapperInstance, vnode.component)
            attachNativeSuppressors(vnode.el)
          },
          onVnodeUpdated: (vnode: VNode) => {
            if (config.promoteProvides)
              promoteChildProvides(wrapperInstance, vnode.component)
            attachNativeSuppressors(vnode.el)
          },
        }

        const slotMap: Record<string, () => VNode> = {}
        for (const slotName of config.slots ?? []) {
          if (hasHostSlotContent(host, slotName)) {
            slotMap[slotName] = () => createSlotVNode(host, slotName, Boolean(config.teleportSlots))
          }
        }

        return h(
          config.component,
          vnodeProps,
          Object.keys(slotMap).length > 0 ? slotMap : undefined,
        )
      }
    },
  })
}

export interface TxElementBundle {
  readonly tag: string
  readonly ElementClass: TxCustomElementConstructor
  readonly createClass: (options?: Pick<DefineTxElementOptions, 'shadowRoot' | 'styles'>) => TxCustomElementConstructor
  readonly define: (options?: DefineTxElementOptions) => TxCustomElementConstructor
}

/**
 * Create a TuffEx custom element class + idempotent `define*()` helper powered by
 * Vue 3.5 `defineCustomElement` (`shadowRoot: false` by default, with optional `shadowRoot: true`).
 */
export function createTxCustomElement(
  config: TxWrapperConfig,
): TxElementBundle {
  const wrapperComponent = createTxWrapperComponent(config)
  return createTxCustomElementFromComponent(config.tag, wrapperComponent)
}

export function createTxCustomElementFromComponent(
  defaultTag: string,
  wrapperComponent: ComponentOptions,
): TxElementBundle {
  const createClass = (
    options?: Pick<DefineTxElementOptions, 'shadowRoot' | 'styles'>,
  ): TxCustomElementConstructor => {
    const useShadow = options?.shadowRoot === true
    if (useShadow) {
      return defineCustomElement(wrapperComponent, {
        shadowRoot: true,
        styles: getTuffexShadowStyles(options?.styles),
      }) as unknown as TxCustomElementConstructor
    }
    return defineCustomElement(wrapperComponent, {
      shadowRoot: false,
    }) as unknown as TxCustomElementConstructor
  }

  const ElementClass = createClass({ shadowRoot: false })

  const define = (options?: DefineTxElementOptions): TxCustomElementConstructor => {
    const tagName = options?.tagName ?? defaultTag
    const registry = options?.registry ?? (typeof customElements !== 'undefined' ? customElements : undefined)
    if (!registry)
      return options?.shadowRoot ? createClass(options) : ElementClass

    const existing = registry.get(tagName)
    if (existing)
      return existing as TxCustomElementConstructor

    const ctor = (tagName !== defaultTag || options?.shadowRoot || options?.styles?.length)
      ? createClass(options)
      : ElementClass
    registry.define(tagName, ctor)
    return ctor
  }

  return {
    tag: defaultTag,
    ElementClass,
    createClass,
    define,
  }
}
