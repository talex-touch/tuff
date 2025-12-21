import TxLoadingOverlay from './src/TxLoadingOverlay.vue'
import { withInstall } from '../../../utils/withInstall'

export interface LoadingOverlayProps {
  loading?: boolean
  fullscreen?: boolean
  text?: string
  spinnerSize?: number
  background?: string
}

const LoadingOverlay = withInstall(TxLoadingOverlay)

export { LoadingOverlay, TxLoadingOverlay }
export type TxLoadingOverlayInstance = InstanceType<typeof TxLoadingOverlay>

export default LoadingOverlay
