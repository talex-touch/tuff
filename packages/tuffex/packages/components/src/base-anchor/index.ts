import type { BaseAnchorAnimationOptions, BaseAnchorAnimationType, BaseAnchorClassValue, BaseAnchorPanelCardProps, BaseAnchorPlacement, BaseAnchorProps, BaseAnchorSurfaceMotionAdaptation, BaseAnchorVirtualReference } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBaseAnchor from './src/TxBaseAnchor.vue'

const BaseAnchor = withInstall(TxBaseAnchor)

export { BaseAnchor, TxBaseAnchor }
export type { BaseAnchorAnimationOptions, BaseAnchorAnimationType, BaseAnchorClassValue, BaseAnchorPanelCardProps, BaseAnchorPlacement, BaseAnchorProps, BaseAnchorSurfaceMotionAdaptation, BaseAnchorVirtualReference }
export type TxBaseAnchorInstance = InstanceType<typeof TxBaseAnchor>

export default BaseAnchor
