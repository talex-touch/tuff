import type { App } from 'vue'
import TxContainer from './src/TxContainer.vue'
import TxRow from './src/TxRow.vue'
import TxCol from './src/TxCol.vue'

TxContainer.install = (app: App) => {
  app.component(TxContainer.name || 'TxContainer', TxContainer)
}

TxRow.install = (app: App) => {
  app.component(TxRow.name || 'TxRow', TxRow)
}

TxCol.install = (app: App) => {
  app.component(TxCol.name || 'TxCol', TxCol)
}

export { TxContainer, TxRow, TxCol }
export { TxContainer as Container, TxRow as Row, TxCol as Col }

export default TxContainer
