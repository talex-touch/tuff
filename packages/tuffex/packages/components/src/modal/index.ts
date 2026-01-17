import { withInstall } from '../../../utils/withInstall'
import TModalVue from './src/TModal.vue'
import TxModalVue from './src/TxModal.vue'

const TxModal = withInstall(TxModalVue)
const TModal = withInstall(TModalVue)

export { TModal, TxModal }
export default TxModal
