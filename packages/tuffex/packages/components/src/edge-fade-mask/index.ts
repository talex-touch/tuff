import type { EdgeFadeMaskAxis, EdgeFadeMaskProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxEdgeFadeMask from './src/TxEdgeFadeMask.vue'

export type { EdgeFadeMaskAxis, EdgeFadeMaskProps }

const EdgeFadeMask = withInstall(TxEdgeFadeMask)

export { EdgeFadeMask, TxEdgeFadeMask }
export type TxEdgeFadeMaskInstance = InstanceType<typeof TxEdgeFadeMask>
/** What `TxEdgeFadeMask` exposes: the element that owns the scroll, and a re-measure. */
export interface TxEdgeFadeMaskExposed {
  viewport: HTMLElement | null
  refresh: () => void
}

export default EdgeFadeMask
