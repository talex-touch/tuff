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
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { ConversationReviewEvents } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import { fileReviewService } from './file-review-service'
import { ConversationWorkspaceRunner } from './workspace-runner'
import { getLogger } from '@talex-touch/utils/common/logger'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  saveConversation,
  registerConversationMutationFence,
  subscribeConversationMutations
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
  private runner: ConversationWorkspaceRunner | undefined

  constructor() {
    super(ConversationModule.key, { create: false })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const runtime = resolveMainRuntime(ctx, 'ConversationModule.onInit')
    const transport = runtime.transport
    const runner = new ConversationWorkspaceRunner({
      onChanged: (state) => transport.broadcast(AgentWorkspaceEvents.changed, state),
      onMessageUpdate: (update) => transport.broadcast(AgentWorkspaceEvents.messageUpdate, update)
    })
    this.runner = runner
    this.disposers.push(
      registerConversationMutationFence({
        write: (id, operation) => runner.writeFence(id, operation),
        remove: (id, operation) => runner.deleteFence(id, operation)
      })
    )
    this.disposers.push(
      fileReviewService.initialize({
        authorizeRollback: (authority) => runner.authorizeRollback(authority),
        onChanged: (notification) =>
          transport.broadcast(ConversationReviewEvents.changed, notification)
      })
    )

    this.disposers.push(
      transport.on(AgentWorkspaceEvents.get, (payload, context) => {
        assertHostOwned(context)
        return runner.service.get(payload.conversationId)
      }),
      transport.on(AgentWorkspaceEvents.configure, (payload, context) => {
        assertHostOwned(context)
        return runner.service.configure(payload.conversationId, payload.settings)
      }),
      transport.on(AgentWorkspaceEvents.submit, (payload, context) => {
        assertHostOwned(context)
        return runner.submit(payload)
      }),
      transport.on(AgentWorkspaceEvents.pause, (payload, context) => {
        assertHostOwned(context)
        return runner.pause(payload.conversationId)
      }),
      transport.on(AgentWorkspaceEvents.resume, (payload, context) => {
        assertHostOwned(context)
        return runner.resume(payload.conversationId)
      }),
      transport.on(AgentWorkspaceEvents.removeQueued, (payload, context) => {
        assertHostOwned(context)
        return runner.service.removeQueued(payload.conversationId, payload.queueId)
      }),
      transport.on(AgentWorkspaceEvents.reorderQueued, (payload, context) => {
        assertHostOwned(context)
        return runner.service.reorderQueued(
          payload.conversationId,
          payload.queueId,
          payload.direction
        )
      }),
      transport.on(AgentWorkspaceEvents.promoteQueued, (payload, context) => {
        assertHostOwned(context)
        return runner.service.promoteQueued(payload.conversationId, payload.queueId)
      }),
      transport.on(AgentWorkspaceEvents.fork, (payload, context) => {
        assertHostOwned(context)
        return runner.service.fork(payload)
      }),
      transport.on(AgentWorkspaceEvents.approveRun, (payload, context) => {
        assertHostOwned(context)
        return runner.decideRun(payload, true)
      }),
      transport.on(AgentWorkspaceEvents.rejectRun, (payload, context) => {
        assertHostOwned(context)
        return runner.decideRun(payload, false)
      }),
      transport.on(ConversationReviewEvents.list, (payload, context) => {
        assertHostOwned(context)
        return fileReviewService.list(payload.conversationId)
      }),
      transport.on(ConversationReviewEvents.get, (payload, context) => {
        assertHostOwned(context)
        return fileReviewService.get(payload.conversationId, payload.reviewId)
      }),
      transport.on(ConversationReviewEvents.rollback, (payload, context) => {
        assertHostOwned(context)
        return runner.rollback(payload.conversationId, payload.reviewId)
      })
    )

    this.disposers.push(
      subscribeConversationMutations((mutation) => {
        transport.broadcast(ConversationEvents.changed, mutation)
      })
    )
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

  async onDestroy(): Promise<void> {
    await this.runner?.close()
    this.runner = undefined
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }
}

export const conversationModule = new ConversationModule()
