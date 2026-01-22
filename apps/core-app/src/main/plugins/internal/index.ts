import type { TouchPlugin } from '../../modules/plugin'
import { createInternalAiPlugin } from './internal-ai-plugin'

export const internalPlugins: (() => TouchPlugin)[] = [createInternalAiPlugin]

export * from './internal-ai-plugin'
