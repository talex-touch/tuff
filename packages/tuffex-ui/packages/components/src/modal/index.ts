import { withInstall } from '../../../utils/withInstall'
import TxModalVue from './src/TxModal.vue'
import TModalVue from './src/TModal.vue'

const TxModal = withInstall(TxModalVue)
const TModal = withInstall(TModalVue)

export { TxModal, TModal }
export default TxModal
