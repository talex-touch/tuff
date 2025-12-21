import type { App } from 'vue'
import TuffCheckbox from './src/TxCheckbox.vue'

TuffCheckbox.install = (app: App) => {
  app.component(TuffCheckbox.name || 'TuffCheckbox', TuffCheckbox)
}

export { TuffCheckbox }
export { TuffCheckbox as TxCheckbox }
export default TuffCheckbox
