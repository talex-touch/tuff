import { withInstall } from '../../../utils/withInstall'
import TxSuggestionChips from './src/TxSuggestionChips.vue'

const SuggestionChips = withInstall(TxSuggestionChips)

export { SuggestionChips, TxSuggestionChips }
// `AiSuggestion` lives in ai-elements — the single parts home.
export type TxSuggestionChipsInstance = InstanceType<typeof TxSuggestionChips>

export default SuggestionChips
