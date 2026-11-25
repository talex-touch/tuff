import type { AutoUpdateOptions, ComputePositionReturn, Middleware, MiddlewareData, Placement, ReferenceElement, Strategy } from '@floating-ui/dom'
import type { ComputedRef, MaybeRefOrGetter, Ref } from '@vue/reactivity'
import {
  arrow,
  autoUpdate,

  computePosition,

  flip,

  offset,

  shift,
  size,

} from '@floating-ui/dom'
import {
  computed,

  effectScope,

  readonly,

  shallowRef,
  toValue,
} from '@vue/reactivity'
import { watchSignal } from '../reactivity'

export {
  arrow,
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
}

export type {
  AutoUpdateOptions,
  ComputePositionReturn,
  Middleware,
  MiddlewareData,
  Placement,
  ReferenceElement,
  Strategy,
}

export interface FloatingControllerOptions {
  /** Initial / reactive placement. @default 'bottom-start' */
  placement?: MaybeRefOrGetter<Placement | undefined>
  /** Positioning strategy. @default 'fixed' */
  strategy?: MaybeRefOrGetter<Strategy | undefined>
  /** Main-axis offset in px when `middleware` is not explicitly overridden. @default 8 */
  offset?: MaybeRefOrGetter<number | undefined>
  /** Enable default `flip` middleware when `middleware` is not provided. @default true */
  flip?: MaybeRefOrGetter<boolean | undefined>
  /** Enable default `shift` middleware when `middleware` is not provided. @default true */
  shift?: MaybeRefOrGetter<boolean | undefined>
  /** Viewport padding for default flip/shift middleware. @default 8 */
  padding?: number
  /** Custom middleware list. When provided, overrides default offset/flip/shift. */
  middleware?: MaybeRefOrGetter<Array<Middleware | null | undefined | false> | undefined>
  /** Use CSS `transform: translate(...)` instead of `top`/`left`. @default false */
  transform?: MaybeRefOrGetter<boolean | undefined>
  /** Auto-update floating position while mounted & open. @default true */
  autoUpdate?: boolean | AutoUpdateOptions
  /** Optional open signal; when false, autoUpdate pauses until open becomes true. @default true */
  open?: MaybeRefOrGetter<boolean | undefined>
  /** Optional callback after each successful position calculation. */
  onPosition?: (result: ComputePositionReturn) => void
}

export interface FloatingController {
  x: Readonly<Ref<number>>
  y: Readonly<Ref<number>>
  placement: Readonly<Ref<Placement>>
  strategy: Readonly<Ref<Strategy>>
  middlewareData: Readonly<Ref<MiddlewareData>>
  isPositioned: Readonly<Ref<boolean>>
  floatingStyles: ComputedRef<Record<string, string>>
  mount: (reference: ReferenceElement | null, floating: HTMLElement | null) => void
  setReference: (reference: ReferenceElement | null) => void
  setFloating: (floating: HTMLElement | null) => void
  update: () => Promise<ComputePositionReturn | null>
  unmount: () => void
  destroy: () => void
}

/**
 * Framework-agnostic floating positioning controller powered by `@floating-ui/dom`
 * and `@vue/reactivity`. Shared by Vue, React, and Web Component overlays.
 */
export function createFloatingController(
  options: FloatingControllerOptions = {},
): FloatingController {
  const scope = effectScope()
  const referenceRef = shallowRef<ReferenceElement | null>(null)
  const floatingRef = shallowRef<HTMLElement | null>(null)

  const initialPlacement = toValue(options.placement) ?? 'bottom-start'
  const initialStrategy = toValue(options.strategy) ?? 'fixed'

  const x = shallowRef(0)
  const y = shallowRef(0)
  const placement = shallowRef<Placement>(initialPlacement)
  const strategy = shallowRef<Strategy>(initialStrategy)
  const middlewareData = shallowRef<MiddlewareData>({})
  const isPositioned = shallowRef(false)

  let cleanupAutoUpdate: (() => void) | null = null
  let destroyed = false
  let updateToken = 0

  function resolveMiddleware(): Middleware[] {
    const custom = toValue(options.middleware)
    if (custom !== undefined)
      return custom.filter((mw): mw is Middleware => Boolean(mw))

    const list: Middleware[] = []
    const dist = toValue(options.offset) ?? 8
    const pad = options.padding ?? 8
    if (dist !== 0)
      list.push(offset(dist))
    if (toValue(options.flip) ?? true)
      list.push(flip({ padding: pad }))
    if (toValue(options.shift) ?? true)
      list.push(shift({ padding: pad }))
    return list
  }

  async function update(): Promise<ComputePositionReturn | null> {
    if (destroyed)
      return null

    const reference = referenceRef.value
    const floating = floatingRef.value
    if (!reference || !floating)
      return null

    const resolvedPlacement = toValue(options.placement) ?? 'bottom-start'
    const resolvedStrategy = toValue(options.strategy) ?? 'fixed'
    const token = ++updateToken

    const result = await computePosition(reference, floating, {
      placement: resolvedPlacement,
      strategy: resolvedStrategy,
      middleware: resolveMiddleware(),
    })

    if (destroyed || token !== updateToken)
      return null

    x.value = result.x
    y.value = result.y
    placement.value = result.placement
    strategy.value = result.strategy
    middlewareData.value = result.middlewareData
    isPositioned.value = true
    options.onPosition?.(result)
    return result
  }

  function stopAutoUpdate(): void {
    cleanupAutoUpdate?.()
    cleanupAutoUpdate = null
  }

  function syncAutoUpdate(): void {
    stopAutoUpdate()
    if (destroyed)
      return

    const reference = referenceRef.value
    const floating = floatingRef.value
    const isOpen = toValue(options.open) ?? true
    if (!reference || !floating || !isOpen) {
      if (!isOpen)
        isPositioned.value = false
      return
    }

    if (options.autoUpdate === false) {
      void update()
      return
    }

    const autoOpts = typeof options.autoUpdate === 'object' ? options.autoUpdate : undefined
    cleanupAutoUpdate = autoUpdate(reference, floating, () => {
      void update()
    }, autoOpts)
  }

  const floatingStyles = scope.run(() => {
    watchSignal(
      () => [
        referenceRef.value,
        floatingRef.value,
        toValue(options.open) ?? true,
        toValue(options.placement),
        toValue(options.strategy),
        toValue(options.offset),
        toValue(options.flip),
        toValue(options.shift),
        toValue(options.middleware),
      ] as const,
      () => {
        syncAutoUpdate()
      },
      {
        equals: (a, b) => {
          if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
            return false
          return a.every((item, idx) => Object.is(item, b[idx]))
        },
      },
    )

    return computed<Record<string, string>>(() => {
      const useTransform = toValue(options.transform) ?? false
      const base: Record<string, string> = {
        position: strategy.value,
        left: '0',
        top: '0',
      }
      if (!isPositioned.value)
        return base

      const roundedX = Math.round(x.value)
      const roundedY = Math.round(y.value)
      if (useTransform) {
        return {
          ...base,
          transform: `translate(${roundedX}px, ${roundedY}px)`,
        }
      }
      return {
        position: strategy.value,
        left: `${roundedX}px`,
        top: `${roundedY}px`,
      }
    })
  })!

  function mount(reference: ReferenceElement | null, floating: HTMLElement | null): void {
    referenceRef.value = reference
    floatingRef.value = floating
    syncAutoUpdate()
  }

  function setReference(reference: ReferenceElement | null): void {
    referenceRef.value = reference
  }

  function setFloating(floating: HTMLElement | null): void {
    floatingRef.value = floating
  }

  function unmount(): void {
    stopAutoUpdate()
    referenceRef.value = null
    floatingRef.value = null
    isPositioned.value = false
  }

  function destroy(): void {
    destroyed = true
    unmount()
    scope.stop()
  }

  return {
    x: readonly(x),
    y: readonly(y),
    placement: readonly(placement),
    strategy: readonly(strategy),
    middlewareData: computed(() => middlewareData.value),
    isPositioned: readonly(isPositioned),
    floatingStyles,
    mount,
    setReference,
    setFloating,
    update,
    unmount,
    destroy,
  }
}
