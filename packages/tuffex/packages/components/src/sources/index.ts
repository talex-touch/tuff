import { withInstall } from '../../../utils/withInstall'
import TxSources from './src/TxSources.vue'

const Sources = withInstall(TxSources)

export { Sources, TxSources }
// `AiSourceItem` / `AiSourcesPart` live in ai-elements — the single parts home.
export type TxSourcesInstance = InstanceType<typeof TxSources>

export default Sources
