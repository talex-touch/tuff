import { withInstall } from '../../../utils/withInstall'
import TxMatrixLoader from './src/TxMatrixLoader.vue'

const MatrixLoader = withInstall(TxMatrixLoader)

export { MatrixLoader, TxMatrixLoader }
export {
  MATRIX_LOADER_ERAS,
  MATRIX_LOADER_SHAPES,
  MATRIX_LOADER_STATES,
} from './src/types'
export type {
  MatrixLoaderEra,
  MatrixLoaderLabels,
  MatrixLoaderProps,
  MatrixLoaderShape,
  MatrixLoaderSize,
  MatrixLoaderState,
  MatrixLoaderTheme,
} from './src/types'
export type TxMatrixLoaderInstance = InstanceType<typeof TxMatrixLoader>

export default MatrixLoader
