import type { Ref } from 'vue'
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Resize dimensions in pixels.
 */
export interface AutoResizeSize {
  width: number
  height: number
}

/**
 * Resize event payload passed to callbacks.
 */
export interface AutoResizeEvent {
  /** Previous measured size (null on first run) */
  prev: AutoResizeSize | null
  /** Current measured size */
  next: AutoResizeSize
  /** Whether the change was triggered by manual refresh() */
  isManual: boolean
}

/**
 * How to round measured values.
 */
export type AutoResizeRounding = 'none' | 'round' | 'floor' | 'ceil'

/**
 * Options for {@link useAutoResize}.
 */
export interface UseAutoResizeOptions {
  /**
   * Sync width from inner -> outer.
   * @default true
   */
  width?: boolean

  /**
   * Sync height from inner -> outer.
   * @default false
   */
  height?: boolean

  /**
   * Apply measured values as `px` inline styles on the outer element.
   * If false, no inline width/height will be written (callbacks still fire).
   * @default true
   */
  applyStyle?: boolean

  /**
   * Which element receives the styles.
   * - "outer": write width/height to outer (common for wrapper animation)
   * - "inner": write width/height to inner (rare but sometimes useful)
   * @default "outer"
   */
  styleTarget?: 'outer' | 'inner'

  /**
   * Rounding strategy for measured sizes.
   * Useful to avoid sub-pixel jitter when animating.
   * @default "ceil"
   */
  rounding?: AutoResizeRounding

  /**
   * Run an initial measurement on mount.
   * @default true
   */
  immediate?: boolean

  /**
   * If true, batches multiple observer triggers into a single DOM write via rAF.
   * Helps avoid layout thrash when content changes rapidly.
   * @default true
   */
  rafBatch?: boolean

  /**
   * Called whenever a resize is detected (after measurement, before applying styles).
   */
  onResize?: (e: AutoResizeEvent) => void

  /**
   * Called right before applying inline styles (if applyStyle = true).
   * You can mutate/override the target style here if you want.
   */
  onBeforeApply?: (e: AutoResizeEvent) => void

  /**
   * Called after applying inline styles (if applyStyle = true).
   */
  onAfterApply?: (e: AutoResizeEvent) => void
}

/**
 * Result returned by {@link useAutoResize}.
 */
export interface UseAutoResizeReturn {
  /**
   * Manually re-measure and (optionally) apply size.
   * Useful after state toggles (e.g. loading -> show spinner),
   * or when content changes but you suspect observer didn't fire (rare).
   */
  refresh: () => Promise<void>

  /**
   * Start observing (automatically called onMounted if enabled = true).
   */
  start: () => void

  /**
   * Stop observing and cancel pending rAF.
   */
  stop: () => void

  /**
   * Enable/disable without unmounting.
   * When disabled, observer is disconnected and no styles are applied.
   */
  setEnabled: (enabled: boolean) => void

  /**
   * Latest measured size (null until first measure).
   */
  size: Ref<AutoResizeSize | null>
}

/**
 * Observe the size of `innerRef` using `ResizeObserver` and synchronize it to `outerRef`.
 *
 * Typical usage:
 * - Buttons: animate width changes when toggling loading spinners.
 * - Tabs/Accordions: animate height changes when switching content.
 *
 * @example Button width animation
 * ```vue
 * <template>
 *   <button ref="outer" class="transition-[width] duration-200 overflow-hidden">
 *     <span ref="inner" class="inline-flex items-center gap-2 whitespace-nowrap">
 *       <Spinner v-if="loading" />
 *       <span>{{ label }}</span>
 *     </span>
 *   </button>
 * </template>
 * <script setup lang="ts">
 * import { ref, watch } from 'vue'
 * import { useAutoResize } from './useAutoResize'
 *
 * const outer = ref<HTMLElement|null>(null)
 * const inner = ref<HTMLElement|null>(null)
 * const loading = ref(false)
 *
 * const { refresh } = useAutoResize(outer, inner, { width: true, height: false })
 * watch(loading, () => void refresh())
 * </script>
 * ```
 *
 * @example Tabs height animation
 * ```vue
 * <template>
 *   <div ref="outer" class="transition-[height] duration-250 overflow-hidden">
 *     <div ref="inner">
 *       <component :is="activeComp" />
 *     </div>
 *   </div>
 * </template>
 * <script setup lang="ts">
 * import { ref, watch } from 'vue'
 * import { useAutoResize } from './useAutoResize'
 *
 * const outer = ref<HTMLElement|null>(null)
 * const inner = ref<HTMLElement|null>(null)
 * const activeKey = ref('a')
 *
 * const { refresh } = useAutoResize(outer, inner, { width: false, height: true })
 * watch(activeKey, () => void refresh())
 * </script>
 * ```
 */
export function useAutoResize(
  outerRef: Ref<HTMLElement | null>,
  innerRef: Ref<HTMLElement | null>,
  options: UseAutoResizeOptions = {},
): UseAutoResizeReturn {
  const opt: Required<UseAutoResizeOptions> = {
    width: options.width ?? true,
    height: options.height ?? false,
    applyStyle: options.applyStyle ?? true,
    styleTarget: options.styleTarget ?? 'outer',
    rounding: options.rounding ?? 'ceil',
    immediate: options.immediate ?? true,
    rafBatch: options.rafBatch ?? true,
    onResize: options.onResize ?? (() => {}),
    onBeforeApply: options.onBeforeApply ?? (() => {}),
    onAfterApply: options.onAfterApply ?? (() => {}),
  }

  const size = ref<AutoResizeSize | null>(null)
  const enabled = ref(true)
  const ro = ref<ResizeObserver | null>(null)
  let rafId: number | null = null
  let pendingManual = false

  const round = (v: number) => {
    switch (opt.rounding) {
      case 'none':
        return v
      case 'round':
        return Math.round(v)
      case 'floor':
        return Math.floor(v)
      case 'ceil':
      default:
        return Math.ceil(v)
    }
  }

  const getTargets = () => {
    const outer = outerRef.value
    const inner = innerRef.value
    const styleEl = opt.styleTarget === 'outer' ? outer : inner
    return { outer, inner, styleEl }
  }

  const apply = (e: AutoResizeEvent, styleEl: HTMLElement) => {
    if (!opt.applyStyle)
      return
    if (opt.width)
      styleEl.style.width = `${e.next.width}px`
    if (opt.height)
      styleEl.style.height = `${e.next.height}px`
  }

  const measureAndSync = async (isManual: boolean) => {
    await nextTick()
    const { inner, styleEl } = getTargets()
    if (!inner || !styleEl)
      return
    if (!enabled.value)
      return

    const rect = inner.getBoundingClientRect()
    const next: AutoResizeSize = {
      width: round(rect.width),
      height: round(rect.height),
    }

    const prev = size.value
    const event: AutoResizeEvent = { prev, next, isManual }

    // always update size ref (even if applyStyle = false)
    size.value = next

    opt.onResize(event)
    opt.onBeforeApply(event)
    apply(event, styleEl)
    opt.onAfterApply(event)
  }

  const schedule = (isManual: boolean) => {
    if (!opt.rafBatch) {
      void measureAndSync(isManual)
      return
    }
    if (rafId != null)
      return
    rafId = requestAnimationFrame(() => {
      rafId = null
      const manual = pendingManual
      pendingManual = false
      void measureAndSync(manual)
    })
  }

  const start = () => {
    if (ro.value)
      return
    const { inner } = getTargets()
    if (!inner)
      return
    ro.value = new ResizeObserver(() => schedule(false))
    ro.value.observe(inner)
  }

  const stop = () => {
    ro.value?.disconnect()
    ro.value = null
    if (rafId != null)
      cancelAnimationFrame(rafId)
    rafId = null
    pendingManual = false
  }

  const setEnabled = (v: boolean) => {
    enabled.value = v
    if (!v)
      stop()
    else start()
  }

  const refresh = async () => {
    pendingManual = true
    schedule(true)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }

  onMounted(async () => {
    if (!enabled.value)
      return
    start()
    if (opt.immediate)
      await measureAndSync(false)
  })

  onBeforeUnmount(() => stop())

  return { refresh, start, stop, setEnabled, size }
}
