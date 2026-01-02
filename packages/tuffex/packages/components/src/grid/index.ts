import type { App } from 'vue'
import TxGrid from './src/TxGrid.vue'
import TxGridItem from './src/TxGridItem.vue'

TxGrid.install = (app: App) => {
  app.component(TxGrid.name || 'TxGrid', TxGrid)
}

TxGridItem.install = (app: App) => {
  app.component(TxGridItem.name || 'TxGridItem', TxGridItem)
}

export { TxGrid, TxGridItem }
export { TxGrid as Grid, TxGridItem as GridItem }

export default TxGrid
