import type { InjectionKey, ShallowRef } from 'vue'
import type { ObserveEngine } from './observer'
import { inject } from 'vue'

export interface LiquidContext {
  /** Portal target inside the silhouette svg — items append their blobs here. */
  portal: Readonly<ShallowRef<SVGGElement | null>>
  /** Portal target inside the melt-overlay svg (above the content layer). */
  meltPortal: Readonly<ShallowRef<SVGGElement | null>>
  /** The group's liquid fill — default colour of the intruding mix liquid. */
  fill: () => string
  getGroup: () => HTMLDivElement | null
  engine: ObserveEngine
}

export const liquidContextKey: InjectionKey<LiquidContext> = Symbol('tx-liquid-context')

export function useLiquidContext(): LiquidContext {
  const ctx = inject(liquidContextKey, null)
  if (!ctx)
    throw new Error('[tuffex] <TxLiquidItem> must be rendered inside a <TxLiquid> group.')
  return ctx
}
