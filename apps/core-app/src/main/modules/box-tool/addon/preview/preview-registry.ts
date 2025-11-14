import type { PreviewAbilityResult } from '@talex-touch/utils'
import type { PreviewAbility, PreviewAbilityContext } from './preview-ability'

export class PreviewAbilityRegistry {
  private abilities: PreviewAbility[] = []

  register(ability: PreviewAbility): void {
    if (this.abilities.some((item) => item.id === ability.id)) {
      console.warn(`[PreviewAbilityRegistry] Ability '${ability.id}' already registered.`)
      return
    }

    this.abilities.push(ability)
    this.abilities.sort((a, b) => {
      if (a.priority === b.priority) {
        return a.id.localeCompare(b.id)
      }
      return a.priority - b.priority
    })
  }

  list(): PreviewAbility[] {
    return [...this.abilities]
  }

  async resolve(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null> {
    for (const ability of this.abilities) {
      if (!(await ability.canHandle(context.query))) {
        continue
      }

      try {
        const result = await ability.execute(context)
        if (result) {
          return result
        }
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          return null
        }
        console.error(`[PreviewAbilityRegistry] Ability '${ability.id}' failed:`, error)
      }
    }

    return null
  }
}

export const previewAbilityRegistry = new PreviewAbilityRegistry()

export function registerPreviewAbility(ability: PreviewAbility): void {
  previewAbilityRegistry.register(ability)
}
