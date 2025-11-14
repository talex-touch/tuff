import type { PreviewAbilityRegistry } from '../preview-registry'
import { BasicExpressionAbility } from './basic-expression-ability'

export function registerDefaultPreviewAbilities(registry: PreviewAbilityRegistry): void {
  registry.register(new BasicExpressionAbility())
}
