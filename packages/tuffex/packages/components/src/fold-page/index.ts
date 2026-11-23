import type { Plugin } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TxFoldCornerSfc from './src/TxFoldCorner.vue'
import TxFoldPageSfc from './src/TxFoldPage.vue'

const TxFoldPage: typeof TxFoldPageSfc & Plugin = withInstall(TxFoldPageSfc)
const TxFoldCorner: typeof TxFoldCornerSfc & Plugin = withInstall(TxFoldCornerSfc)
const FoldPage: typeof TxFoldPageSfc & Plugin = TxFoldPage
const FoldCorner: typeof TxFoldCornerSfc & Plugin = TxFoldCorner

export { FoldCorner, FoldPage, TxFoldCorner, TxFoldPage }
export {
  clipPolygonHalfPlane,
  computeCornerPeelGeometry,
  computeFoldPageLayout,
  normalizeFoldPanelCount,
  projectPointerToPeelProgress,
  resolveCornerTipFromProgress,
} from './src/geometry'
export type {
  CornerPeelGeometry,
  CornerPeelInput,
  FoldPageLayoutInput,
  FoldPageLayoutResult,
  FoldPagePanelLayout,
  Point2D,
} from './src/geometry'
export type {
  FoldCornerEmits,
  FoldCornerLabels,
  FoldCornerPosition,
  FoldCornerProps,
  FoldCornerSlotProps,
  FoldCornerTrigger,
  FoldPageDirection,
  FoldPageEmits,
  FoldPageLabels,
  FoldPagePanel,
  FoldPagePanelSlotProps,
  FoldPageProps,
  FoldPageSize,
  FoldPageStyle,
} from './src/types'
export type TxFoldPageInstance = InstanceType<typeof TxFoldPage>
export type TxFoldCornerInstance = InstanceType<typeof TxFoldCorner>

export default TxFoldPage
