import type { App } from 'vue'
import TxCol from './src/TxCol.vue'
import TxContainer from './src/TxContainer.vue'
import TxRow from './src/TxRow.vue'

TxContainer.install = (app: App) => {
  app.component(TxContainer.name || 'TxContainer', TxContainer)
}

TxRow.install = (app: App) => {
  app.component(TxRow.name || 'TxRow', TxRow)
}

TxCol.install = (app: App) => {
  app.component(TxCol.name || 'TxCol', TxCol)
}

export { TxCol, TxContainer, TxRow }
export { TxCol as Col, TxContainer as Container, TxRow as Row }

export default TxContainer
