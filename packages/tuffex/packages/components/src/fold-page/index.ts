import { withInstall } from '../../../utils/withInstall'
import TxFoldCorner from './src/TxFoldCorner.vue'
import TxFoldPage from './src/TxFoldPage.vue'

withInstall(TxFoldPage)
withInstall(TxFoldCorner)

export { TxFoldCorner, TxFoldPage }
export { TxFoldCorner as FoldCorner, TxFoldPage as FoldPage }
export {
  clipPolygonHalfPlane,
  computeCornerPeelGeometry,
  computeFoldPageLayout,
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
