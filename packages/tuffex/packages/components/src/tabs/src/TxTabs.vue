<script lang="ts">
import type { PropType } from 'vue'
import { Comment, Fragment, computed, defineComponent, h, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { JellyBounds, JellyIndicatorFrame, JellyRect } from '../../../../utils/use-jelly-indicator'
import type { TabsAnimation, TabsProps } from './types'
import { timeScaleSpring } from '../../../../utils/animation/jelly'
import { useJellyIndicator } from '../../../../utils/use-jelly-indicator'
import { springSteps } from '../../liquid/src/spring'
import TxAutoSizer from '../../auto-sizer/src/TxAutoSizer.vue'
import TxTabHeader from './TxTabHeader.vue'
import TxTabItem from './TxTabItem.vue'

const qualifiedName = ['TxTabItem', 'TxTabItemGroup', 'TxTabHeader']

/** `line` thickness and `dot` diameter, px. */
const LINE_SIZE = 2
const DOT_SIZE = 6
/** The shortest `line`, px: a one-letter label would otherwise get a speck. */
const LINE_MIN_LENGTH = 16
/** How far the `dot` sits in from the nav's outer edge, px. */
const DOT_INSET = 4

/**
 * `indicatorMotion` once named a CSS keyframe; it now names a variation of the
 * glide material (`useJellyIndicator({ material: 'glide' })`): the pointer's
 * two ends ride springs, the trailing one `1 − lag / 2` as fast, so it
 * lengthens a little and gathers again — it never squashes or scales. Each
 * spring is played on the `animation.indicator.durationMs` clock (350ms = as
 * written here).
 */
const MOTION_GLIDE: Record<NonNullable<TabsProps['indicatorMotion']>, { stiffness: number, damping: number, lag: number }> = {
  // The default: a hair under critical damping, a short stretch.
  stretch: { stiffness: 420, damping: 38, lag: 0.45 },
  // Softer damping: one small overshoot.
  spring: { stiffness: 420, damping: 24, lag: 0.3 },
  // A longer stretch.
  warp: { stiffness: 420, damping: 38, lag: 0.7 },
  // Both ends together: a rigid slide.
  glide: { stiffness: 380, damping: 38, lag: 0 },
  // Quicker and damped harder.
  snap: { stiffness: 720, damping: 50, lag: 0.25 },
}

function getVNodeComponentName(vnode: any): string {
  const type = vnode?.type
  return type && typeof type === 'object' && 'name' in type
    ? String(type.name ?? '')
    : ''
}

function normalizeTabSlotNodes(nodes: any[]): any[] {
  const normalized: any[] = []

  function visit(node: any) {
    if (!node || node.type === Comment)
      return

    if (node.type === Fragment) {
      const children = Array.isArray(node.children) ? node.children : []
      children.forEach(visit)
      return
    }

    const name = getVNodeComponentName(node)
    if (qualifiedName.includes(name))
      normalized.push(node)
  }

  nodes.forEach(visit)
  return normalized
}

function getDefaultChildren(vnode: any): any[] {
  const children = vnode?.children
  return children && typeof children === 'object' && 'default' in children && typeof children.default === 'function'
    ? normalizeTabSlotNodes(children.default?.() ?? [])
    : []
}

function resolveTabNavSlots(vnode: any): Record<string, () => any> | undefined {
  const children = vnode?.children
  if (!children || typeof children !== 'object')
    return undefined

  const navSlots: Record<string, () => any> = {}
  if (typeof children.icon === 'function')
    navSlots.icon = children.icon
  if (typeof children.name === 'function')
    navSlots.name = children.name

  return Object.keys(navSlots).length > 0 ? navSlots : undefined
}

export default defineComponent({
  name: 'TxTabs',
  props: {
    modelValue: String,
    defaultValue: String,
    placement: { type: String as PropType<TabsProps['placement']>, default: 'left' },
    offset: { type: Number, default: 0 },
    navMinWidth: { type: Number, default: 220 },
    navMaxWidth: { type: Number, default: 320 },
    contentPadding: { type: Number, default: 12 },
    contentScrollable: { type: Boolean, default: true },
    borderless: { type: Boolean, default: false },
    autoHeight: { type: Boolean, default: false },
    autoWidth: { type: Boolean, default: false },
    showIndicator: { type: Boolean, default: true },
    indicatorVariant: { type: String as PropType<TabsProps['indicatorVariant']>, default: 'line' },
    indicatorMotion: { type: String as PropType<TabsProps['indicatorMotion']>, default: 'stretch' },
    indicatorMotionStrength: { type: Number, default: 1 },
    autoHeightDurationMs: { type: Number, default: 250 },
    autoHeightEasing: { type: String, default: 'ease' },
    animation: { type: Object as PropType<TabsAnimation>, default: undefined },
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { slots, emit, expose }) {
    const activeName = ref('')
    const slotWrapper = ref<any>()
    const autoSizerRef = ref<any>()
    const indicatorRevealed = ref(false)

    const placement = computed(() => {
      const v = props.placement
      return (v === 'left' || v === 'right' || v === 'top' || v === 'bottom') ? v : 'left'
    })

    const isVertical = computed(() => placement.value === 'left' || placement.value === 'right')

    const indicatorVariant = computed(() => {
      const v = props.indicatorVariant
      if (v === 'line' || v === 'pill' || v === 'block' || v === 'dot' || v === 'outline')
        return v
      return 'line'
    })

    const indicatorMotion = computed(() => {
      const v = props.indicatorMotion
      if (v === 'stretch' || v === 'warp' || v === 'glide' || v === 'snap' || v === 'spring')
        return v
      return 'stretch'
    })

    const indicatorMotionStrength = computed(() => {
      return typeof props.indicatorMotionStrength === 'number'
        ? Math.max(0, props.indicatorMotionStrength)
        : 1
    })

    function getNodeName(vnode: any): string {
      return vnode?.props?.name ?? ''
    }

    function setActive(vnode: any) {
      const name = getNodeName(vnode)
      activeName.value = name
      emit('update:modelValue', name)
      emit('change', name)
    }

    const animationSize = computed(() => {
      const raw = props.animation?.size
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          durationMs: props.autoHeightDurationMs,
          easing: props.autoHeightEasing,
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : props.autoHeightDurationMs,
          easing: typeof raw.easing === 'string' ? raw.easing : props.autoHeightEasing,
        }
      }
      return {
        enabled: !!(props.autoHeight || props.autoWidth),
        durationMs: props.autoHeightDurationMs,
        easing: props.autoHeightEasing,
      }
    })

    const animationIndicator = computed(() => {
      const raw = props.animation?.indicator
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          durationMs: 350,
          easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 350,
          easing: typeof raw.easing === 'string' ? raw.easing : 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }
      }
      return {
        enabled: true,
        durationMs: 350,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }
    })

    const animationNav = computed(() => {
      const raw = props.animation?.nav
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          durationMs: 220,
          easing: 'ease',
        }
      }
      if (raw && typeof raw === 'object') {
        return {
          enabled: raw.enabled !== false,
          durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : 220,
          easing: typeof raw.easing === 'string' ? raw.easing : 'ease',
        }
      }
      return {
        enabled: true,
        durationMs: 220,
        easing: 'ease',
      }
    })

    const animationContent = computed(() => {
      const raw = props.animation?.content
      if (typeof raw === 'boolean') {
        return {
          enabled: raw,
          type: raw ? 'zoom' : 'none',
          durationMs: 180,
          easing: 'ease',
        }
      }
      if (raw && typeof raw === 'object') {
        const type = raw.type === 'fade' || raw.type === 'slide' || raw.type === 'zoom' || raw.type === 'blur' || raw.type === 'scale' || raw.type === 'none'
          ? raw.type
          : 'zoom'
        return {
          enabled: raw.enabled !== false && type !== 'none',
          type,
          durationMs: typeof raw.durationMs === 'number'
            ? raw.durationMs
            : typeof raw.durationRatio === 'number'
              ? Math.max(0, animationIndicator.value.durationMs * raw.durationRatio)
              : 180,
          easing: typeof raw.easing === 'string' ? raw.easing : 'ease',
        }
      }
      return {
        enabled: true,
        type: 'zoom',
        durationMs: 180,
        easing: 'ease',
      }
    })

    const widthAnimEnabled = computed(() => {
      return animationSize.value.enabled && !!props.autoWidth
    })

    const heightAnimEnabled = computed(() => {
      return animationSize.value.enabled && (!!props.autoHeight || !props.contentScrollable)
    })

    const contentScrollable = computed(() => {
      return props.contentScrollable && !heightAnimEnabled.value
    })

    const sizeAnimEnabled = computed(() => {
      return widthAnimEnabled.value || heightAnimEnabled.value
    })

    async function runAutoHeight(action: () => void) {
      if (!sizeAnimEnabled.value) {
        action()
        return
      }

      const api = autoSizerRef.value
      if (api?.flip) {
        await api.flip(async () => {
          action()
        })
        return
      }

      action()
      api?.refresh?.()
    }

    async function exposedFlip(action: () => void | Promise<void>) {
      const api = autoSizerRef.value
      if (api?.flip)
        return api.flip(action)
      return action()
    }

    async function exposedAction(fn: any, optionsOrDetect?: any) {
      const api = autoSizerRef.value
      if (api?.action)
        return api.action(fn, optionsOrDetect)
      await fn(undefined)
      return { changedKeys: [] as string[] }
    }

    expose({
      refresh: () => autoSizerRef.value?.refresh?.(),
      flip: exposedFlip,
      action: exposedAction,
      // TxAutoSizer exposes `size` as a Ref, which Vue's expose proxy unwraps via
      // proxyRefs. Reading `.value` here would double-unwrap and always return undefined.
      size: () => autoSizerRef.value?.size,
    })

    const tabNodeCache = ref<any[]>([])

    function findByName(name: string): any {
      return tabNodeCache.value.find(node => node?.props?.name === name)
    }

    const pointerElRef = ref<HTMLElement | null>(null)
    const pointerInnerElRef = ref<HTMLElement | null>(null)
    const navElRef = ref<HTMLElement | null>(null)
    const navInnerElRef = ref<HTMLElement | null>(null)

    const contentRootElRef = ref<HTMLElement | null>(null)

    let layoutResizeObserver: ResizeObserver | null = null
    let layoutResizeRaf: number | null = null

    onBeforeUnmount(() => {
      if (layoutResizeRaf != null)
        cancelAnimationFrame(layoutResizeRaf)
      layoutResizeRaf = null

      if (layoutResizeObserver) {
        layoutResizeObserver.disconnect()
        layoutResizeObserver = null
      }
    })

    const isBoxIndicator = computed(() => {
      const v = indicatorVariant.value
      return v === 'pill' || v === 'block' || v === 'outline'
    })

    // The motion picks the springs (`MOTION_GLIDE`), the duration plays them
    // faster or slower, and the strength scales the stretch.
    const motionGlide = computed(() => {
      const tuning = MOTION_GLIDE[indicatorMotion.value]
      return {
        ...timeScaleSpring(tuning, animationIndicator.value.durationMs, 350),
        lag: tuning.lag * indicatorMotionStrength.value,
      }
    })

    // Written straight onto the element, never through a vnode `style`: the
    // render function re-evaluates every tab slot, so it must not run per frame.
    function paintPointer(frame: JellyIndicatorFrame) {
      const el = pointerElRef.value
      if (!el)
        return
      const { x, y, width, height } = frame.rect
      el.style.opacity = frame.visible && indicatorRevealed.value ? '1' : '0'
      el.style.width = `${width}px`
      el.style.height = `${height}px`
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${frame.scaleX.toFixed(3)}, ${frame.scaleY.toFixed(3)})`

      // Compared against the element, not a cached flag: the pointer DOM is
      // rebuilt when `showIndicator` flips or top/bottom swap the nav and
      // panel, and a fresh inner would otherwise keep its glow through a trip.
      const inner = pointerInnerElRef.value
      if (inner && inner.classList.contains('is-moving') !== frame.moving)
        inner.classList.toggle('is-moving', frame.moving)
    }

    // Walls for the spring's overshoot along the travel axis; measured with
    // each target in `applyPointerFor`.
    let pointerBounds: JellyBounds | null = null

    const pointer = useJellyIndicator({
      axis: () => (isVertical.value ? 'y' : 'x'),
      material: 'glide',
      integrate: springSteps,
      glide: () => motionGlide.value,
      bounds: () => pointerBounds,
      onFrame: paintPointer,
    })

    function getActiveTabElement(): HTMLElement | null {
      return navInnerElRef.value?.querySelector('.tx-tab-item.is-active') as HTMLElement | null
    }

    function syncPointerToActive(options: { reveal?: boolean, animate?: boolean } = {}) {
      const el = getActiveTabElement()
      applyPointerFor(el, options)
    }

    function scheduleLayoutRefresh() {
      if (!sizeAnimEnabled.value && !props.showIndicator)
        return

      const run = () => {
        layoutResizeRaf = null
        if (sizeAnimEnabled.value)
          void autoSizerRef.value?.refresh?.()
        void nextTick(() => syncPointerToActive({ reveal: false, animate: false }))
      }

      if (layoutResizeRaf != null)
        return

      if (typeof requestAnimationFrame === 'undefined') {
        run()
        return
      }

      layoutResizeRaf = requestAnimationFrame(run)
    }

    watch(
      () => [contentRootElRef.value, navInnerElRef.value, sizeAnimEnabled.value, props.showIndicator] as const,
      () => {
        if (layoutResizeObserver) {
          layoutResizeObserver.disconnect()
          layoutResizeObserver = null
        }

        if (!sizeAnimEnabled.value && !props.showIndicator)
          return
        if (typeof ResizeObserver === 'undefined')
          return

        const targets = [contentRootElRef.value, navInnerElRef.value].filter(Boolean) as HTMLElement[]
        if (!targets.length)
          return

        layoutResizeObserver = new ResizeObserver(scheduleLayoutRefresh)
        for (const target of targets)
          layoutResizeObserver.observe(target)

        scheduleLayoutRefresh()
      },
      { immediate: true, flush: 'post' },
    )

    function readItemBox(el: HTMLElement) {
      const cs = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
      return {
        top: Number.parseFloat(cs?.paddingTop ?? '') || 0,
        right: Number.parseFloat(cs?.paddingRight ?? '') || 0,
        bottom: Number.parseFloat(cs?.paddingBottom ?? '') || 0,
        left: Number.parseFloat(cs?.paddingLeft ?? '') || 0,
        radius: cs?.borderRadius ?? '',
      }
    }

    /**
     * Measure the active tab and hand the variant's target box to the engine.
     * Travel is the shared indicator engine's (its glide material); this only
     * knows where each variant sits.
     */
    function applyPointerFor(vnodeOrEl: any, options: { reveal?: boolean, animate?: boolean } = {}) {
      const pointerEl = pointerElRef.value
      const nodeEl = (vnodeOrEl?.el ?? vnodeOrEl) as HTMLElement | undefined
      const navInnerEl = navInnerElRef.value
      if (!props.showIndicator || !pointerEl || !nodeEl || !navInnerEl)
        return

      const nodeRect = nodeEl.getBoundingClientRect()
      const navInnerRect = navInnerEl.getBoundingClientRect()

      if (options.reveal) {
        indicatorRevealed.value = true
      }
      else if (!indicatorRevealed.value && nodeRect.width > 0 && nodeRect.height > 0) {
        // Reveal on the first real measurement, not on the first click: a
        // TxTabs whose active tab comes from `v-model` or `activation` would
        // otherwise hold its indicator at opacity 0 until someone clicked.
        indicatorRevealed.value = true
      }

      if (nodeRect.width <= 0 || nodeRect.height <= 0) {
        // Nothing laid out yet (a hidden panel, jsdom): keep the pointer out of
        // the engine until a real box exists, so it never travels from zero.
        pointer.moveTo(null)
        pointerEl.style.opacity = '0'
        return
      }

      // Rects are visual pixels while the translate is in the nav's own space;
      // an ancestor transform (a dialog scaling in) scales only the former.
      // Same normalisation as `useIndicatorBox`, down to the border offset:
      // the pointer is placed from the tablist's padding box.
      const ratio = navInnerEl.offsetWidth > 0 ? navInnerRect.width / navInnerEl.offsetWidth : 1
      const scale = Number.isFinite(ratio) && ratio > 0 ? ratio : 1

      const left = (nodeRect.left - navInnerRect.left) / scale - navInnerEl.clientLeft + navInnerEl.scrollLeft
      const top = (nodeRect.top - navInnerRect.top) / scale - navInnerEl.clientTop + navInnerEl.scrollTop
      const width = nodeRect.width / scale
      const height = nodeRect.height / scale
      const navWidth = navInnerEl.clientWidth
      const navHeight = navInnerEl.clientHeight
      const item = readItemBox(nodeEl)
      const variant = indicatorVariant.value

      let rect: JellyRect
      if (isBoxIndicator.value) {
        // Behind the whole item, with the item's own corners (hosts restyle them).
        rect = { x: left, y: top, width, height }
        pointerEl.style.borderRadius = item.radius
      }
      else if (variant === 'dot') {
        rect = isVertical.value
          ? { x: placement.value === 'right' ? navWidth - DOT_SIZE - DOT_INSET : DOT_INSET, y: top + (height - DOT_SIZE) / 2, width: DOT_SIZE, height: DOT_SIZE }
          : { x: left + (width - DOT_SIZE) / 2, y: placement.value === 'bottom' ? DOT_INSET : navHeight - DOT_SIZE - DOT_INSET, width: DOT_SIZE, height: DOT_SIZE }
        pointerEl.style.borderRadius = ''
      }
      else {
        // Under the label, icon to text, resting on the nav/content divider:
        // nav-inner fills the bar's height, so its far edge is the divider. A
        // one-letter label still gets a line long enough to read as one.
        const offset = props.offset || 0
        const span = (start: number, size: number, padStart: number, padEnd: number) => {
          const length = Math.min(size, Math.max(size - padStart - padEnd, LINE_MIN_LENGTH))
          const from = start + padStart + (size - padStart - padEnd - length) / 2
          return { from: from + offset, length }
        }
        if (isVertical.value) {
          const { from, length } = span(top, height, item.top, item.bottom)
          rect = { x: placement.value === 'right' ? navWidth - LINE_SIZE : 0, y: from, width: LINE_SIZE, height: length }
        }
        else {
          const { from, length } = span(left, width, item.left, item.right)
          rect = { x: from, y: placement.value === 'bottom' ? 0 : navHeight - LINE_SIZE, width: length, height: LINE_SIZE }
        }
        pointerEl.style.borderRadius = ''
      }

      // The tablist clips its overflow (a vertical one is clipped by the root),
      // so an end overshooting the first or last tab stops at a wall — the
      // scrollable extent — instead of being cut off. A target beyond a wall
      // moves it out.
      const extent = isVertical.value ? navInnerEl.scrollHeight : navInnerEl.scrollWidth
      pointerBounds = extent > 0 ? { start: 0, end: extent } : null

      pointer.moveTo(rect, { animate: !!options.animate && indicatorRevealed.value })
    }

    const idScope = useId() ?? 'tx-tabs'
    const panelDomId = `${idScope}-panel`

    function tabDomId(name: string): string {
      // Names are author-supplied, so encode rather than interpolate raw.
      return `${idScope}-tab-${encodeURIComponent(name)}`
    }

    /**
     * ARIA tablist: arrow keys move between tabs and activate them, wrapping at
     * the ends. Paired with the roving tabindex in TxTabItem, which keeps the
     * whole list to a single tab stop.
     */
    function handleTablistKeydown(event: KeyboardEvent): void {
      const horizontalNext = isVertical.value ? 'ArrowDown' : 'ArrowRight'
      const horizontalPrev = isVertical.value ? 'ArrowUp' : 'ArrowLeft'

      const enabled = tabNodeCache.value.filter(node => !node?.props?.disabled)
      if (!enabled.length)
        return

      const current = enabled.findIndex(node => getNodeName(node) === activeName.value)
      let next = current

      switch (event.key) {
        case horizontalNext:
          next = current < 0 ? 0 : (current + 1) % enabled.length
          break
        case horizontalPrev:
          next = current < 0 ? enabled.length - 1 : (current - 1 + enabled.length) % enabled.length
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = enabled.length - 1
          break
        default:
          return
      }

      event.preventDefault()
      const target = enabled[next]
      if (!target)
        return

      setActive(target)
      void nextTick(() => {
        // The arrow keys move the pointer like a click does. Before, only the
        // content's ResizeObserver happened to drag it along.
        syncPointerToActive({ reveal: true, animate: animationIndicator.value.enabled })
        const name = getNodeName(target)
        const id = tabDomId(name)
        // Match on the id property rather than building a `#id` selector: tab
        // names are author-supplied, and `CSS.escape` is undefined outside a
        // browser (jsdom, SSR), where it threw an unhandled rejection here.
        const tabs = navInnerElRef.value?.querySelectorAll<HTMLElement>('[role="tab"]')
        for (const el of tabs ?? []) {
          if (el.id === id) {
            el.focus()
            break
          }
        }
      })
    }

    function createTab(vnode: any): any {
      const name = getNodeName(vnode)
      const tab = h(TxTabItem, {
        ...vnode.props,
        active: activeName.value === name,
        // Tie each tab to the panel it controls; the panel points back with
        // aria-labelledby so the pair is announced as a real tab relationship.
        id: tabDomId(name),
        'aria-controls': panelDomId,
        onClick: () => {
          if (vnode.props?.disabled)
            return
          const el = slotWrapper.value?.el as HTMLElement | undefined
          if (el) {
            if (animationContent.value.enabled)
              el.classList.remove('tx-tabs-content-enter')
            void runAutoHeight(() => {
              setActive(vnode)
              // Travel once the switch has rendered, not once `runAutoHeight`
              // settles: a size animation holds that for a frame or more, and
              // the new panel's layout refresh would reach the engine first
              // with `animate: false` and land the pointer without a trip.
              void nextTick(() => applyPointerFor(tab, { reveal: true, animate: animationIndicator.value.enabled }))
            }).then(() => {
              nextTick(() => {
                if (animationContent.value.enabled)
                  el.classList.add('tx-tabs-content-enter')
              })
            })
          }
        },
      }, resolveTabNavSlots(vnode))

      return tab
    }

    function renderTabs(): any[] {
      let tabHeader: any = null
      const nodes = normalizeTabSlotNodes(slots.default?.() ?? [])
      const collectTabNodes = () => {
        const collected: any[] = []
        for (const child of nodes) {
          const childName = getVNodeComponentName(child)
          if (childName === 'TxTabItem') {
            collected.push(child)
            continue
          }
          if (childName !== 'TxTabItemGroup')
            continue

          const childNodes = getDefaultChildren(child)
            .filter(node => getVNodeComponentName(node) === 'TxTabItem')
          collected.push(...childNodes)
        }
        return collected
      }

      tabNodeCache.value = collectTabNodes()

      const currentActiveNode = activeName.value ? findByName(activeName.value) : null
      const modelNode = props.modelValue ? findByName(props.modelValue) : null
      if (modelNode) {
        activeName.value = props.modelValue ?? ''
      }
      else if (!props.modelValue && props.defaultValue && !currentActiveNode) {
        const defaultNode = findByName(props.defaultValue)
        if (defaultNode)
          setActive(defaultNode)
      }
      else if (!props.modelValue && !props.defaultValue && !currentActiveNode) {
        const activationNode = tabNodeCache.value.find(node => node?.props?.activation)
        if (activationNode)
          setActive(activationNode)
      }

      const filtered = nodes
        .map((child) => {
          const childName = getVNodeComponentName(child)

          if (childName === 'TxTabHeader') {
            tabHeader = child
            return null
          }
          if (childName === 'TxTabItemGroup') {
            const childNodes = getDefaultChildren(child)
              .filter(node => getVNodeComponentName(node) === 'TxTabItem')
            return h('div', { class: 'tx-tabs__group' }, [
              h('div', { class: 'tx-tabs__group-name' }, child.props?.name),
              childNodes.map(createTab),
            ])
          }
          return createTab(child)
        })
        .filter(Boolean)

      return [filtered, tabHeader, findByName(activeName.value)]
    }

    function renderContent(tabHeader: any, activeNode: any) {
      if (!activeNode) {
        return h('div', { class: 'tx-tabs__empty' }, 'No tab selected')
      }

      const name = getNodeName(activeNode)
      const contentWrapper = h('div', { key: name, class: 'tx-tabs__content-wrapper' }, activeNode.children?.default?.())
      const content = contentScrollable.value
        ? h('div', { key: `scroll-${name}`, class: 'tx-tabs__content-scroll' }, [contentWrapper])
        : contentWrapper

      if (tabHeader) {
        const headerVNode = h(
          TxTabHeader,
          { ...tabHeader.props, node: activeNode },
          tabHeader.children,
        )
        return [headerVNode, content]
      }

      return content
    }

    // A prop-driven switch travels only once the pointer has been revealed. Sent
    // from inside `runAutoHeight`'s action for the same reason as a click.
    function travelAfterSwitch() {
      void nextTick(() => {
        syncPointerToActive({
          reveal: indicatorRevealed.value,
          animate: indicatorRevealed.value && animationIndicator.value.enabled,
        })
      })
    }

    watch(
      () => props.modelValue,
      (val) => {
        if (!val)
          return
        if (activeName.value !== val) {
          void runAutoHeight(() => {
            activeName.value = val
            travelAfterSwitch()
          })
        }
      },
      { immediate: true },
    )

    watch(
      () => props.defaultValue,
      (val) => {
        if (!val || props.modelValue || activeName.value)
          return
        const node = findByName(val)
        if (node) {
          void runAutoHeight(() => {
            setActive(node)
            travelAfterSwitch()
          })
        }
      },
      { immediate: true },
    )

    watch(
      () => [activeName.value, navInnerElRef.value, props.showIndicator] as const,
      () => {
        void nextTick(() => {
          if (indicatorRevealed.value)
            return
          syncPointerToActive({ reveal: false, animate: false })
        })
      },
      { immediate: true, flush: 'post' },
    )

    // A new variant (or placement, or offset) is a new target box for the same
    // tab — nothing in the layout changes, so no observer would re-measure it.
    // It travels like a switch does: a pill gliding into a line is one motion too.
    watch(
      () => [indicatorVariant.value, placement.value, props.offset] as const,
      () => {
        void nextTick(() => {
          syncPointerToActive({
            reveal: false,
            animate: indicatorRevealed.value && animationIndicator.value.enabled,
          })
        })
      },
      { flush: 'post' },
    )

    // Hiding the pointer ends its work: a trip in flight would otherwise keep
    // its frame loop running for an element that is gone, and showing it
    // again is then a first measurement, which lands in place.
    watch(
      () => props.showIndicator,
      (show) => {
        if (!show)
          pointer.moveTo(null)
      },
    )

    return () => {
      const [tabs, tabHeader, activeNode] = renderTabs()

      const navRightSlot = slots['nav-right']?.()

      // `pointerNode`, not `pointer`: that name is the engine in setup scope.
      const pointerNode = props.showIndicator
        ? h(
            'div',
            {
              ref: pointerElRef,
              class: 'tx-tabs__pointer',
            },
            [
              h('div', {
                ref: pointerInnerElRef,
                class: 'tx-tabs__pointer-inner',
              }),
            ],
          )
        : null

      const selectSlot = h(
        'div',
        {
          ref: (el: any) => (contentRootElRef.value = el),
          key: activeName.value,
          class: ['tx-tabs__select-slot', { 'tx-tabs-content-enter': animationContent.value.enabled }],
          // Identify the active panel as a tabpanel so it is announced as the
          // content region controlled by the tablist above.
          role: 'tabpanel',
          id: panelDomId,
          'aria-labelledby': activeName.value ? tabDomId(activeName.value) : undefined,
        },
        renderContent(tabHeader, activeNode),
      )
      slotWrapper.value = selectSlot

      const outerClass = contentScrollable.value
        ? 'tx-tabs__auto-sizer tx-tabs__auto-sizer--fill'
        : 'tx-tabs__auto-sizer overflow-hidden'

      const content = h(
        TxAutoSizer,
        {
          ref: (el: any) => (autoSizerRef.value = el),
          width: widthAnimEnabled.value,
          height: heightAnimEnabled.value,
          durationMs: animationSize.value.durationMs,
          easing: animationSize.value.easing,
          observeTarget: 'both',
          innerClass: contentScrollable.value ? 'tx-tabs__auto-sizer-inner--fill' : undefined,
          outerClass,
        },
        {
          default: () => selectSlot,
        },
      )

      const navStyle = isVertical.value
        ? {
            minWidth: `${props.navMinWidth}px`,
            maxWidth: `${props.navMaxWidth}px`,
          }
        : undefined

      const nav = h(
        'div',
        {
          ref: (el: any) => (navElRef.value = el),
          class: 'tx-tabs__nav',
          style: navStyle,
        },
        [
          h(
            'div',
            {
              class: 'tx-tabs__nav-bar',
            },
            [
              h(
                'div',
                {
                  ref: (el: any) => (navInnerElRef.value = el),
                  class: 'tx-tabs__nav-inner',
                  // Expose tab semantics so screen readers announce the row as a
                  // tablist of tabs rather than an unlabelled group of buttons.
                  role: 'tablist',
                  'aria-orientation': isVertical.value ? 'vertical' : 'horizontal',
                  onKeydown: handleTablistKeydown,
                },
                pointerNode ? [...tabs, pointerNode] : tabs,
              ),
              navRightSlot
                ? h('div', { class: 'tx-tabs__nav-extra' }, navRightSlot)
                : null,
            ],
          ),
        ],
      )

      const main = h(
        'div',
        {
          class: 'tx-tabs__main',
          style: { padding: `${props.contentPadding}px` },
        },
        [content],
      )

      const reverse = placement.value === 'right' || placement.value === 'bottom'
      const children = reverse ? [main, nav] : [nav, main]

      return h(
        'div',
        {
          class: [
            'tx-tabs',
            `tx-tabs--${placement.value}`,
            `tx-tabs--indicator-${indicatorVariant.value}`,
            `tx-tabs--motion-${indicatorMotion.value}`,
            `tx-tabs--content-${animationContent.value.type}`,
            {
              'tx-tabs--auto-height': heightAnimEnabled.value,
              'tx-tabs--auto-width': !!props.autoWidth,
              'tx-tabs--borderless': props.borderless,
              'tx-tabs--indicator-hidden': !props.showIndicator,
              'tx-tabs--indicator-pending': props.showIndicator && !indicatorRevealed.value,
              'tx-tabs--indicator-visible': props.showIndicator && indicatorRevealed.value,
              'tx-tabs--indicator-anim': props.showIndicator && animationIndicator.value.enabled,
              'tx-tabs--nav-anim': animationNav.value.enabled,
              'tx-tabs--content-anim': animationContent.value.enabled,
            },
          ],
          style: {
            '--tx-tabs-indicator-duration': `${animationIndicator.value.durationMs}ms`,
            '--tx-tabs-indicator-easing': animationIndicator.value.easing,
            '--tx-tabs-indicator-strength': `${indicatorMotionStrength.value}`,
            '--tx-tabs-content-duration': `${animationContent.value.durationMs}ms`,
            '--tx-tabs-content-easing': animationContent.value.easing,
            '--tx-tabs-nav-duration': `${animationNav.value.durationMs}ms`,
            '--tx-tabs-nav-easing': animationNav.value.easing,
          } as any,
        },
        children,
      )
    }
  },
})
</script>

<style lang="scss" scoped>
.tx-tabs {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  border: 1px solid var(--tx-border-color, #dcdfe6);
  border-radius: 12px;
  overflow: hidden;
  background: var(--tx-bg-color, #fff);
}

.tx-tabs--borderless {
  border: none;
  background: transparent;
}

.tx-tabs--borderless .tx-tabs__nav {
  border: none;
}

.tx-tabs--auto-width {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
}

.tx-tabs--auto-width .tx-tabs__main {
  flex: 0 1 auto;
}

.tx-tabs--auto-width .tx-tabs__auto-sizer,
.tx-tabs--auto-width .tx-tabs__select-slot,
.tx-tabs--auto-width .tx-tabs__content-scroll {
  width: auto;
  max-width: 100%;
}

.tx-tabs__nav {
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--tx-border-color, #dcdfe6);
  box-sizing: border-box;
}

.tx-tabs__nav-bar {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: stretch;
}

.tx-tabs--top .tx-tabs__nav-bar,
.tx-tabs--bottom .tx-tabs__nav-bar {
  flex-direction: row;
  align-items: center;
}

.tx-tabs--left .tx-tabs__nav-bar,
.tx-tabs--right .tx-tabs__nav-bar {
  flex-direction: column;
}

.tx-tabs__nav-extra {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  padding: 0 8px;
}

.tx-tabs--nav-anim .tx-tabs__nav {
  transition:
    min-width var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease),
    max-width var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease),
    width var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease),
    flex-basis var(--tx-tabs-nav-duration, 220ms) var(--tx-tabs-nav-easing, ease);
}

.tx-tabs__nav-inner {
  position: relative;
  padding: 8px 6px;
  flex: 1;
  min-height: 0;
}

.tx-tabs__group {
  margin-top: 6px;
}

.tx-tabs__group-name {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
  opacity: 0.9;
}

// The pointer's box and transform are written every frame by the shared
// indicator engine (`paintPointer`); CSS only paints it. Nothing here may transition
// transform, width or height, or each frame would be eased a second time.
.tx-tabs__pointer {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
  transform-origin: center;
  will-change: transform, width, height, opacity;
  z-index: 0;
}

// The first appearance fades in where it belongs; travel is the engine's.
.tx-tabs--indicator-anim .tx-tabs__pointer {
  transition: opacity 180ms ease;
}

.tx-tabs__pointer-inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.tx-tabs__nav-inner :deep(.tx-tab-item) {
  position: relative;
  z-index: 1;
}

// One highlight: the pointer. The active item drops the fill it paints for
// itself (and on hover) whenever a pointer is shown.
.tx-tabs:not(.tx-tabs--indicator-hidden) .tx-tabs__nav-inner :deep(.tx-tab-item.is-active) {
  --fake-color: transparent;
}

// `line` and `dot`: a primary mark, with a soft pool of its own colour under it
// once it has landed.
.tx-tabs--indicator-line .tx-tabs__pointer,
.tx-tabs--indicator-dot .tx-tabs__pointer {
  border-radius: 999px;
}

.tx-tabs--indicator-line .tx-tabs__pointer-inner,
.tx-tabs--indicator-dot .tx-tabs__pointer-inner {
  background: var(--tx-color-primary, #409eff);
}

.tx-tabs--indicator-line .tx-tabs__pointer-inner::before,
.tx-tabs--indicator-dot .tx-tabs__pointer-inner::before {
  content: '';
  position: absolute;
  inset: -5px -4px;
  border-radius: 999px;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--tx-color-primary, #409eff) 38%, transparent), transparent);
  opacity: 0.45;
  transition: opacity 0.4s ease;
  pointer-events: none;
}

.tx-tabs__pointer-inner.is-moving::before {
  opacity: 0;
  transition-duration: 0.12s;
}

// `pill`: a raised surface behind the item — the same body as TxTabBar's pill
// and TxFlatRadio's thumb. The corners come from the measured item.
.tx-tabs--indicator-pill .tx-tabs__pointer-inner {
  background: var(--tx-surface-raised, var(--tx-bg-color-overlay, #fff));
  box-shadow:
    var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04)),
    inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

// `block`: a tint, not a surface — no shadow.
.tx-tabs--indicator-block .tx-tabs__pointer-inner {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

// `outline`: a ring, inset so it never adds to the box.
.tx-tabs--indicator-outline .tx-tabs__pointer-inner {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, transparent);
}

// A mark or a tint carries the brand colour into the active item's glyph; on a
// neutral raised pill the ink stays neutral.
.tx-tabs--indicator-line:not(.tx-tabs--indicator-hidden) .tx-tabs__nav-inner :deep(.tx-tab-item.is-active),
.tx-tabs--indicator-dot:not(.tx-tabs--indicator-hidden) .tx-tabs__nav-inner :deep(.tx-tab-item.is-active),
.tx-tabs--indicator-block:not(.tx-tabs--indicator-hidden) .tx-tabs__nav-inner :deep(.tx-tab-item.is-active),
.tx-tabs--indicator-outline:not(.tx-tabs--indicator-hidden) .tx-tabs__nav-inner :deep(.tx-tab-item.is-active) {
  --tx-tab-item-icon-ink: var(--tx-color-primary, #409eff);
}

@media (prefers-reduced-motion: reduce) {
  // The same selectors as the rules they cut, so they win on source order. A
  // bare `.tx-tabs__pointer-inner::before` is one class short of the variant
  // rule above and left the glow's fade running.
  .tx-tabs--indicator-anim .tx-tabs__pointer,
  .tx-tabs--indicator-line .tx-tabs__pointer-inner::before,
  .tx-tabs--indicator-dot .tx-tabs__pointer-inner::before {
    transition: none;
  }
}

.tx-tabs--right {
  flex-direction: row-reverse;
}

.tx-tabs--top {
  flex-direction: column;
}

.tx-tabs--bottom {
  flex-direction: column-reverse;
}

.tx-tabs--top .tx-tabs__nav,
.tx-tabs--bottom .tx-tabs__nav {
  flex-direction: row;
  border-right: none;
}

.tx-tabs--top .tx-tabs__nav {
  border-bottom: 1px solid var(--tx-border-color, #dcdfe6);
}

.tx-tabs--bottom .tx-tabs__nav {
  border-top: 1px solid var(--tx-border-color, #dcdfe6);
}

// Fill the bar's height (items stay centred inside): when `nav-right` content
// or a host's `min-height` makes the bar taller, the line indicator still sits
// on the divider rather than floating above it.
.tx-tabs--top .tx-tabs__nav-inner,
.tx-tabs--bottom .tx-tabs__nav-inner {
  display: flex;
  flex-direction: row;
  align-items: center;
  align-self: stretch;
  padding: 6px 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tx-tabs--top .tx-tabs__nav-inner::-webkit-scrollbar,
.tx-tabs--bottom .tx-tabs__nav-inner::-webkit-scrollbar {
  display: none;
}

.tx-tabs__main {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
}

.tx-tabs--top .tx-tabs__main,
.tx-tabs--bottom .tx-tabs__main {
  height: auto;
}

.tx-tabs--auto-height {
  height: auto;
}

.tx-tabs--auto-height .tx-tabs__main {
  height: auto;
}

.tx-tabs__select-slot {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tx-tabs:not(.tx-tabs--auto-width) .tx-tabs__select-slot {
  width: 100%;
}

.tx-tabs--auto-width .tx-tabs__select-slot {
  width: fit-content;
  max-width: 100%;
}

.tx-tabs--auto-height .tx-tabs__select-slot {
  height: auto;
}

.tx-tabs__auto-sizer {
  width: 100%;
}

.tx-tabs--auto-width .tx-tabs__auto-sizer,
.tx-tabs--auto-width .tx-tabs__select-slot,
.tx-tabs--auto-width .tx-tabs__content-scroll {
  width: auto;
  max-width: 100%;
}

.tx-tabs__auto-sizer--fill {
  height: 100%;
}

.tx-tabs__auto-sizer--fill :deep(.tx-tabs__auto-sizer-inner--fill) {
  height: 100%;
  min-height: 0;
}

.tx-tabs__content-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.tx-tabs--auto-height .tx-tabs__content-scroll {
  height: auto;
  flex: 0 0 auto;
}

.tx-tabs__content-wrapper {
  box-sizing: border-box;
  padding: 6px 2px;
  flex: 1;
  min-height: 0;
}

.tx-tabs--auto-height .tx-tabs__content-wrapper {
  flex: 0 0 auto;
}

.tx-tabs__empty {
  padding: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-tabs-content-enter {
  animation-duration: var(--tx-tabs-content-duration, 180ms);
  animation-timing-function: var(--tx-tabs-content-easing, ease);
  animation-fill-mode: both;
}

.tx-tabs--content-fade .tx-tabs-content-enter {
  animation-name: tx-tabs-content-fade;
}

.tx-tabs--content-slide .tx-tabs-content-enter {
  animation-name: tx-tabs-content-slide;
}

.tx-tabs--content-zoom .tx-tabs-content-enter {
  animation-name: tx-tabs-content-zoom;
}

.tx-tabs--content-blur .tx-tabs-content-enter {
  animation-name: tx-tabs-content-blur;
}

.tx-tabs--content-scale .tx-tabs-content-enter {
  animation-name: tx-tabs-content-scale;
}

@keyframes tx-tabs-content-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes tx-tabs-content-slide {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes tx-tabs-content-zoom {
  from {
    opacity: 0.7;
    transform: translateY(6px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes tx-tabs-content-blur {
  from {
    opacity: 0;
    filter: blur(8px);
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}

@keyframes tx-tabs-content-scale {
  from {
    opacity: 0.72;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
