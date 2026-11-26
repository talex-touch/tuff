import type { Placement, Strategy } from '@floating-ui/dom'
import { autoUpdate, computePosition, flip, offset as offsetMw, shift, size as sizeMw } from '@floating-ui/dom'
import { shallowRef } from '@vue/reactivity'
import { useCallback, useEffect, useRef } from 'react'
import { useSignal } from './useReactivity'

export type FloatingPlacement = Placement

export interface FloatingState {
  x: number
  y: number
  placement: Placement
  side: 'top' | 'right' | 'bottom' | 'left'
  strategy: Strategy
  positioned: boolean
}

export interface UseFloatingOptions {
  open: boolean
  placement?: Placement
  offset?: number
  strategy?: Strategy
  matchReferenceWidth?: boolean
}

function placementSide(p: Placement): 'top' | 'right' | 'bottom' | 'left' {
  const s = p.split('-')[0]
  if (s === 'top' || s === 'right' || s === 'bottom' || s === 'left')
    return s
  return 'bottom'
}

/**
 * Positioning hook backed by `@floating-ui/dom` and a `@vue/reactivity` `shallowRef`
 * bridged into React via `useSignal`.
 */
export function useFloatingPosition(
  referenceRef: React.RefObject<HTMLElement | null>,
  floatingRef: React.RefObject<HTMLElement | null>,
  options: UseFloatingOptions,
) {
  const {
    open,
    placement = 'bottom',
    offset = 8,
    strategy = 'fixed',
    matchReferenceWidth = false,
  } = options

  const stateSignalRef = useRef(
    shallowRef<FloatingState>({
      x: 0,
      y: 0,
      placement,
      side: placementSide(placement),
      strategy,
      positioned: false,
    }),
  )

  const update = useCallback(async () => {
    const reference = referenceRef.current
    const floating = floatingRef.current
    if (!reference || !floating)
      return

    const middleware = [
      offsetMw(offset),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
    ]

    if (matchReferenceWidth) {
      middleware.push(
        sizeMw({
          apply({ rects, elements }) {
            if (rects.reference.width > 0)
              elements.floating.style.minWidth = `${rects.reference.width}px`
          },
        }),
      )
    }

    const pos = await computePosition(reference, floating, {
      placement,
      strategy,
      middleware,
    })

    stateSignalRef.current.value = {
      x: pos.x,
      y: pos.y,
      placement: pos.placement,
      side: placementSide(pos.placement),
      strategy: pos.strategy,
      positioned: true,
    }
  }, [referenceRef, floatingRef, placement, offset, strategy, matchReferenceWidth])

  useEffect(() => {
    if (!open)
      return
    const reference = referenceRef.current
    const floating = floatingRef.current
    if (!reference || !floating)
      return

    void update()
    const cleanup = autoUpdate(reference, floating, () => {
      void update()
    })
    return cleanup
  }, [open, referenceRef, floatingRef, update])

  const state = useSignal(stateSignalRef.current)
  return { ...state, update }
}
