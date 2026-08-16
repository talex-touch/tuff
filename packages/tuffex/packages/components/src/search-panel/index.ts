import type { SearchPanelEmits, SearchPanelItem, SearchPanelProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSearchPanel from './src/TxSearchPanel.vue'

/**
 * TxSearchPanel — inline command search: field, live results and empty state in
 * one card. Unlike `TxCommandPalette` it is not modal — no overlay, no focus
 * trap — so it can sit inside a page, a sidebar or a popover.
 *
 * @example
 * ```ts
 * import { TxSearchPanel } from '@talex-touch/tuffex'
 *
 * // <TxSearchPanel v-model="query" :items="items" @select="run" />
 * ```
 *
 * @public
 */
const SearchPanel = withInstall(TxSearchPanel)

export { SearchPanel, TxSearchPanel }
export type { SearchPanelEmits, SearchPanelItem, SearchPanelProps }
export type TxSearchPanelInstance = InstanceType<typeof TxSearchPanel>

export default SearchPanel
