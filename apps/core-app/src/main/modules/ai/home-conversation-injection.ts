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
import { openUIPrompt } from '@talex-touch/intelligence-uikit/openui-prompt'
import { createLogger } from '../../utils/logger'
import { aiImportedConfigRuntime } from './ai-imported-config-runtime'

const HOME_OPENUI_PROMPT = openUIPrompt()
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
 * Prepends the active skills/rules block and the OpenUI capability prompt to a Home payload.
 *
 * The OpenUI prompt remains useful when no skills are active, so an unconfigured machine still
 * receives the compact renderer contract. Re-read skills per turn rather than cached: enabling a
 * skill has to take effect on the next send, not on the next app start.
 */
export function applyHomeConversationInjection(
  payload: IntelligenceChatPayload,
  options: IntelligenceInvokeOptions | undefined,
  isPluginCaller: boolean
): Promise<IntelligenceChatPayload>
export function applyHomeConversationInjection(
  payload: unknown,
  options: IntelligenceInvokeOptions | undefined,
  isPluginCaller: boolean
): Promise<unknown>
export async function applyHomeConversationInjection(
  payload: unknown,
  options: IntelligenceInvokeOptions | undefined,
  isPluginCaller: boolean
): Promise<unknown> {
  if (!wantsHomeInjection(options, isPluginCaller) || !isChatPayload(payload)) return payload

  const skillsInjection = await aiImportedConfigRuntime.buildHomeInjection()
  const injection = skillsInjection
    ? `${skillsInjection}\n\n${HOME_OPENUI_PROMPT}`
    : HOME_OPENUI_PROMPT

  homeInjectionLog.info(
    `Injected ${injection.length} chars of Home skills/rules and OpenUI context (${HOME_OPENUI_PROMPT.length} OpenUI chars)`
  )
  // Leading, so a system part the caller supplied itself still reads as the more specific
  // instruction. Providers that take a single system prompt (the pi CLI) concatenate the system
  // messages in order, so position here is the position in the final prompt.
  const [first, ...rest] = payload.messages
  if (first?.role === 'system') {
    // Folded into the caller's own leading system message — a Home thread that opens with the
    // assistant's greeting carries one — rather than stacked ahead of it: backends that accept one
    // system prompt (Anthropic behind Tuff Nexus, chat templates that allow a single initial system
    // message) reject a second. Same order, same text a concatenating provider would build.
    return {
      ...payload,
      messages: [{ ...first, content: `${injection}\n\n${first.content}` }, ...rest]
    }
  }
  return {
    ...payload,
    messages: [{ role: 'system' as const, content: injection }, ...payload.messages]
  }
}
