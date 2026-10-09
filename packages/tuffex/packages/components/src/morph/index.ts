import type { TxMorphEmits, TxMorphProps, TxMorphSpring } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import Component from './src/TxMorph.vue'

/**
 * TxMorph — one shape that carries every state: when its content changes, the
 * old content leaves with a short blur, the new one enters a beat later, and
 * the shape springs its size, radius and fill to fit, without a cut. A change
 * mid-flight retargets the spring and keeps its momentum.
 *
 * Exported under its Tx name only: in the shared barrel `Morph` is already
 * icon-morph's driver type.
 *
 * @example
 * ```ts
 * import { TxMorph } from '@talex-touch/tuffex'
 *
 * // <TxMorph :morph-key="state" :radius="state === 'loading' ? 19 : 12" :fill="fill">
 * //   <Spinner v-if="state === 'loading'" />
 * //   <span v-else>Connect</span>
 * // </TxMorph>
 * ```
 *
 * @public
 */
const TxMorph = withInstall(Component)

export { TxMorph }
export type { TxMorphEmits, TxMorphProps, TxMorphSpring }
export type TxMorphInstance = InstanceType<typeof TxMorph>

export default TxMorph
