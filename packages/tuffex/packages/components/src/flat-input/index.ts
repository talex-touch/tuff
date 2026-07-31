import type { App } from 'vue'
import type { FlatInputEmits, FlatInputProps } from './src/types'
import FlatInput from './src/FlatInput.vue'

// Hand-rolled install is kept intentionally: it registers a second global name
// (`TxFlatInput`) that the shared `withInstall` (single `component.name`) cannot.
FlatInput.install = (app: App) => {
  app.component(FlatInput.name || 'FlatInput', FlatInput)
  app.component('TxFlatInput', FlatInput)
}

export { FlatInput }
export { FlatInput as TxFlatInput }
export type { FlatInputEmits, FlatInputProps }
export type TxFlatInputInstance = InstanceType<typeof FlatInput>
export default FlatInput
