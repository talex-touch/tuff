import type { App } from 'vue'
import TuffFlatButton from './src/TxFlatButton.vue'

TuffFlatButton.install = (app: App) => {
  app.component(TuffFlatButton.name || 'TuffFlatButton', TuffFlatButton)
}

export { TuffFlatButton }
export default TuffFlatButton
