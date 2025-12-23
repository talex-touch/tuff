import type { App } from 'vue'
import TuffSelect from './src/TxSelect.vue'
import TuffSelectItem from './src/TxSelectItem.vue'

TuffSelect.install = (app: App) => {
  app.component(TuffSelect.name || 'TuffSelect', TuffSelect)
}

TuffSelectItem.install = (app: App) => {
  app.component(TuffSelectItem.name || 'TuffSelectItem', TuffSelectItem)
}

export { TuffSelect, TuffSelectItem }
export { TuffSelect as TxSelect, TuffSelectItem as TxSelectItem }
export default TuffSelect
