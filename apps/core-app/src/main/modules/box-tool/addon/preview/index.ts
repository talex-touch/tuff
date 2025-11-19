import { registerDefaultPreviewAbilities } from './abilities'
import { PreviewProvider } from './preview-provider'
import { PreviewAbilityRegistry, previewAbilityRegistry, registerPreviewAbility } from './preview-registry'

registerDefaultPreviewAbilities(previewAbilityRegistry)

export const previewProvider = new PreviewProvider(previewAbilityRegistry)

export { PreviewAbilityRegistry, registerPreviewAbility }
