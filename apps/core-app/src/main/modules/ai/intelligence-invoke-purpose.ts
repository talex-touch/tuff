import type { IntelligenceInvokeOptions } from '@talex-touch/tuff-intelligence'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { AgentToolOrigin } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { INTELLIGENCE_HOME_SURFACE } from '@talex-touch/utils/types/intelligence'
import { getConversation } from '../conversation/conversation-store'

/**
 * What a trusted Main call path says an invocation is for.
 *
 * Only `home-chat` exists: a genuine Home conversation turn, which may run the tools the user
 * already enabled for the agent (gateway-scoped to `origin`). Everything else — conversation
 * titles, the Home opening line, voice polishing, plugin completions, capability tests, the Agent
 * worker's model bridge — carries no purpose and is model-only by construction.
 */
export interface HostInvokePurpose {
  kind: 'home-chat'
  origin: AgentToolOrigin
}

/**
 * Module-private key. Symbols do not survive IPC or structured cloning, and no renderer or plugin
 * can name this one, so a purpose can only come from Main code that imports this module; object
 * spread/rest (the SDK's option copies) carry it to the provider.
 */
const HOST_INVOKE_PURPOSE = Symbol('tuff.intelligence.hostInvokePurpose')

type PurposedOptions = IntelligenceInvokeOptions & { [HOST_INVOKE_PURPOSE]?: HostInvokePurpose }

/**
 * A copy of `options` marked as a genuine Home chat turn for `origin`. Call only from a Main path
 * that has itself established the conversation (the workspace runner, or the IntelligenceModule
 * handler after `resolveHomeChatOrigin`) — never from caller-supplied metadata.
 */
export function markHomeChatInvoke<T extends IntelligenceInvokeOptions>(
  options: T,
  origin: AgentToolOrigin
): T {
  const purpose: HostInvokePurpose = {
    kind: 'home-chat',
    origin: {
      conversationId: origin.conversationId,
      ...(origin.turnId ? { turnId: origin.turnId } : {}),
      ...(origin.toolCallId ? { toolCallId: origin.toolCallId } : {})
    }
  }
  return { ...options, [HOST_INVOKE_PURPOSE]: purpose }
}

/** The purpose Main attached, or `undefined` (model-only). */
export function readHostInvokePurpose(
  options: IntelligenceInvokeOptions | undefined
): HostInvokePurpose | undefined {
  return (options as PurposedOptions | undefined)?.[HOST_INVOKE_PURPOSE]
}

const OPAQUE_ID = /^[A-Z0-9-]{1,128}$/i

/**
 * The Home conversation a renderer `invoke`/`stream` call is a turn of, when — and only when — it
 * provably is one: not a plugin sender, the exact Home surface and operation markers, no caller
 * claim, an opaque conversation id that Main's conversation store already holds, and the project
 * the request names being that conversation's own. Anything less is `null` (model-only), never an
 * error: the request still runs, it just gets no tools.
 */
export async function resolveHomeChatOrigin(
  options: IntelligenceInvokeOptions | undefined,
  context: Pick<HandlerContext, 'plugin'>
): Promise<AgentToolOrigin | null> {
  if (context.plugin) return null
  const metadata = options?.metadata
  if (!metadata || typeof metadata !== 'object') return null
  if (metadata.surface !== INTELLIGENCE_HOME_SURFACE) return null
  if (metadata.operation !== INTELLIGENCE_HOME_SURFACE) return null
  if (metadata.caller !== undefined) return null
  const conversationId = metadata.conversationId
  if (typeof conversationId !== 'string' || !OPAQUE_ID.test(conversationId)) return null
  const conversation = await getConversation(conversationId)
  if (!conversation) return null
  const requestedProject = metadata.projectId ?? null
  if ((conversation.projectId ?? null) !== requestedProject) return null
  return { conversationId }
}
