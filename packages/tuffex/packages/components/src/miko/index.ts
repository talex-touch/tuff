import type { MikoEmits, MikoLabels, MikoProps, MikoSize, MikoState } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxMiko from './src/TxMiko.vue'

/**
 * TxMiko — Tuff AI 桌面伴侣桌宠，提供 12 种纯 SVG + CSS Keyframes 像素动效状态。
 *
 * @example
 * ```vue
 * <TxMiko state="working" size="md" />
 * ```
 *
 * @public
 */
const Miko = withInstall(TxMiko)

export { MIKO_DEFAULT_LABELS } from './src/types'
export { Miko, TxMiko }
export type { MikoEmits, MikoLabels, MikoProps, MikoSize, MikoState }
export type TxMikoInstance = InstanceType<typeof TxMiko>

export default Miko
