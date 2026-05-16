import { registerDefaultPreviewAbilities } from './abilities'
import { PreviewProvider } from './preview-provider'
import {
  listPreviewAbilityInventory,
  listPreviewDynamicExecutionInventory
} from './preview-inventory'
import { PreviewAbilityRegistry, previewSdk, registerPreviewAbility } from './preview-registry'

registerDefaultPreviewAbilities({ register: registerPreviewAbility })

export const previewProvider = new PreviewProvider(previewSdk)

export {
  PreviewAbilityRegistry,
  listPreviewAbilityInventory,
  listPreviewDynamicExecutionInventory,
  registerPreviewAbility
}
