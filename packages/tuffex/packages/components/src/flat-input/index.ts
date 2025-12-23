import type { App } from 'vue'
import FlatInput from './src/FlatInput.vue'

FlatInput.install = (app: App) => {
  app.component(FlatInput.name || 'FlatInput', FlatInput)
}

export { FlatInput }
export default FlatInput
