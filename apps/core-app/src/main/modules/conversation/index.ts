/**
 * Home conversation persistence.
 *
 * Host-only: these channels read and write the user's whole chat history, which no plugin has a
 * reason to reach. `assertHostOwned` is the same guard the intelligence control plane uses.
 */

import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { ConversationEvents } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { getLogger } from '@talex-touch/utils/common/logger'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  saveConversation
} from './conversation-store'

export * from './conversation-store'

const conversationLog = getLogger('conversation')

function assertHostOwned(context: HandlerContext): void {
  const pluginId = context?.plugin?.name
  if (pluginId) {
    throw new Error(`[Conversation] Plugin '${pluginId}' cannot access conversation history`)
  }
}

export class ConversationModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('Conversation')

  private disposers: Array<() => void> = []

  constructor() {
    super(ConversationModule.key, { create: false })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'ConversationModule.onInit')
    const transport = runtime.transport

    this.disposers.push(
      transport.on(ConversationEvents.list, async (payload, context) => {
        assertHostOwned(context)
        return listConversations(payload?.limit)
      }),
      transport.on(ConversationEvents.get, async (payload, context) => {
        assertHostOwned(context)
        return getConversation(payload.id)
      }),
      transport.on(ConversationEvents.save, async (payload, context) => {
        assertHostOwned(context)
        return saveConversation(payload)
      }),
      transport.on(ConversationEvents.remove, async (payload, context) => {
        assertHostOwned(context)
        return deleteConversation(payload.id)
      }),
      transport.on(ConversationEvents.rename, async (payload, context) => {
        assertHostOwned(context)
        return renameConversation(payload.id, payload.title)
      })
    )

    conversationLog.info('Conversation channels registered')
  }

  onDestroy(): MaybePromise<void> {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }
}

export const conversationModule = new ConversationModule()
