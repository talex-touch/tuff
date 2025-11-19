import { createInternalAiPlugin } from './internal-ai-plugin'
import type { TouchPlugin } from '../../modules/plugin'

export const internalPlugins: (() => TouchPlugin)[] = [
  createInternalAiPlugin
]

export * from './internal-ai-plugin'
