import type { PreviewAbility, PreviewSdk } from '@talex-touch/utils/core-box/preview'
import { PreviewAbilityRegistry, createPreviewSdk } from '@talex-touch/utils/core-box/preview'
import { createLogger } from '../../../../utils/logger'

const previewRegistryLog = createLogger('PreviewProvider').child('Registry')

export { PreviewAbilityRegistry }

export const previewAbilityRegistry = new PreviewAbilityRegistry({
  onAbilityError(error, ability) {
    previewRegistryLog.error('Ability failed', {
      meta: {
        abilityId: ability.id
      },
      error
    })
  }
})

export const previewSdk: PreviewSdk = createPreviewSdk({
  onAbilityError(error, ability) {
    previewRegistryLog.error('Ability failed', {
      meta: {
        abilityId: ability.id
      },
      error
    })
  }
})

export function registerPreviewAbility(ability: PreviewAbility): void {
  const existing = previewAbilityRegistry.list().some((item) => item.id === ability.id)
  if (existing) {
    previewRegistryLog.warn('Ability already registered', {
      meta: {
        abilityId: ability.id
      }
    })
    return
  }

  previewAbilityRegistry.register(ability)
  previewSdk.register(ability)
}
