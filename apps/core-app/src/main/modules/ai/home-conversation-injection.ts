/**
 * Home conversation context injection.
 *
 * The bridge between the imported-config store (skills, rules) and the home chat surface. The
 * orchestrator island reaches the same data through `buildSystemPrompt`; home chat runs a different
 * path (`text.chat` → provider) and gets its own, workspace-free block here.
 */

import type {
  IntelligenceChatPayload,
  IntelligenceInvokeOptions
} from '@talex-touch/utils/types/intelligence'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { createLogger } from '../../utils/logger'
import { aiImportedConfigRuntime } from './ai-imported-config-runtime'

const homeInjectionLog = createLogger('Intelligence').child('HomeInjection')

function isChatPayload(payload: unknown): payload is IntelligenceChatPayload {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    Array.isArray((payload as IntelligenceChatPayload).messages)
  )
}

/**
 * Whether this request should receive the home skills/rules block.
 *
 * Host-only by construction: a plugin can set any metadata it likes, and honouring a forged surface
 * marker would hand it the names and descriptions of every skill the user imported.
 */
function wantsHomeInjection(
  options: IntelligenceInvokeOptions | undefined,
  isPluginCaller: boolean
): boolean {
  if (isPluginCaller) return false
  const metadata = options?.metadata
  if (!metadata || typeof metadata !== 'object') return false
  return metadata.surface === INTELLIGENCE_HOME_SURFACE && metadata.autoContext === true
}

/**
 * Prepends the active skills/rules block to a home conversation payload.
 *
 * Returns the payload untouched for every other caller, and whenever the user has nothing active —
 * so the only cost on an unconfigured machine is one store read. Re-read per turn rather than
 * cached: enabling a skill has to take effect on the next send, not on the next app start.
 */
export async function applyHomeConversationInjection(
  payload: unknown,
  options: IntelligenceInvokeOptions | undefined,
  isPluginCaller: boolean
): Promise<unknown> {
  if (!wantsHomeInjection(options, isPluginCaller) || !isChatPayload(payload)) return payload

  const injection = await aiImportedConfigRuntime.buildHomeInjection()
  if (!injection) return payload

  homeInjectionLog.info(`Injected ${injection.length} chars of imported skills and rules`)
  return {
    ...payload,
    // Leading, so a system part the caller supplied itself still reads as the more specific
    // instruction. Providers that take a single system prompt (the pi CLI) concatenate the system
    // messages in order, so position here is the position in the final prompt.
    messages: [{ role: 'system' as const, content: injection }, ...payload.messages]
  }
}
