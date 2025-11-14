import { PreviewAbilityRegistry, previewAbilityRegistry, registerPreviewAbility } from './preview-registry'
import { registerDefaultPreviewAbilities } from './abilities'
import { PreviewProvider } from './preview-provider'

registerDefaultPreviewAbilities(previewAbilityRegistry)

export const previewProvider = new PreviewProvider(previewAbilityRegistry)

export { PreviewAbilityRegistry, registerPreviewAbility }
