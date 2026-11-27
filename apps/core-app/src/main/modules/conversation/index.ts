/**
 * Home conversation persistence.
 *
 * Host-only: these channels read and write the user's whole chat history, which no plugin has a
 * reason to reach. `assertHostOwned` is the same guard the intelligence control plane uses.
 */

import type { MaybePromise, ModuleInitContext } from '@talex-touch/utils'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { WorkspaceStartupRecoveryResult } from './workspace-runner'
import { ConversationEvents } from '@talex-touch/utils/transport/sdk/domains/conversation'
import { AgentWorkspaceEvents } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { ConversationReviewEvents } from '@talex-touch/utils/transport/sdk/domains/conversation-review'
import { WorkspaceGitEvents } from '@talex-touch/utils/transport/sdk/domains/workspace-git'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { fileReviewService, setFileReviewGatewayProvider } from './file-review-service'
import {
  openWorkspaceFileExternal,
  pickWorkspaceFile,
  readWorkspaceFile
} from './workspace-file-service'
import {
  checkoutWorkspaceGitBranch,
  commitWorkspaceGitChanges,
  deleteWorkspaceGitBranch,
  discardWorkspaceGitFile,
  fetchWorkspaceGit,
  listWorkspaceGitBranches,
  pullWorkspaceGit,
  pushWorkspaceGit,
  readWorkspaceGitCommitFiles,
  readWorkspaceGitDiff,
  readWorkspaceGitLog,
  readWorkspaceGitStatus,
  removeWorkspaceGitRemote,
  renameWorkspaceGitBranch,
  saveWorkspaceGitRemote,
  setWorkspaceGitBranchUpstream,
  stageWorkspaceGitFiles,
  unstageWorkspaceGitFiles
} from './workspace-git-service'
import { toolGatewayModule } from '../tool-gateway'
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
    const handleBeforeModulesUnload = (): void => {
      this.beginShutdown()
    }
    touchEventBus.on(TalexEvents.BEFORE_MODULES_UNLOAD, handleBeforeModulesUnload)
    this.disposers.push(() => {
      touchEventBus.off(TalexEvents.BEFORE_MODULES_UNLOAD, handleBeforeModulesUnload)
    })
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
    setFileReviewGatewayProvider(toolGatewayModule)
    this.disposers.push(() => setFileReviewGatewayProvider(null))

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
        return runner.removeQueued(payload.conversationId, payload.queueId)
      }),
      transport.on(AgentWorkspaceEvents.reorderQueued, (payload, context) => {
        assertHostOwned(context)
        return runner.reorderQueued(payload.conversationId, payload.queueId, payload.direction)
      }),
      transport.on(AgentWorkspaceEvents.promoteQueued, (payload, context) => {
        assertHostOwned(context)
        return runner.promoteQueued(payload.conversationId, payload.queueId)
      }),
      transport.on(AgentWorkspaceEvents.updateQueued, (payload, context) => {
        assertHostOwned(context)
        return runner.updateQueued(payload)
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
      transport.on(AgentWorkspaceEvents.readFile, (payload, context) => {
        assertHostOwned(context)
        return readWorkspaceFile(payload)
      }),
      transport.on(AgentWorkspaceEvents.pickFile, (payload, context) => {
        assertHostOwned(context)
        return pickWorkspaceFile(payload)
      }),
      transport.on(AgentWorkspaceEvents.openFileExternal, (payload, context) => {
        assertHostOwned(context)
        return openWorkspaceFileExternal(payload)
      }),
      transport.on(WorkspaceGitEvents.status, (payload, context) => {
        assertHostOwned(context)
        return readWorkspaceGitStatus(payload)
      }),
      transport.on(WorkspaceGitEvents.diff, (payload, context) => {
        assertHostOwned(context)
        return readWorkspaceGitDiff(payload)
      }),
      transport.on(WorkspaceGitEvents.branches, (payload, context) => {
        assertHostOwned(context)
        return listWorkspaceGitBranches(payload)
      }),
      transport.on(WorkspaceGitEvents.log, (payload, context) => {
        assertHostOwned(context)
        return readWorkspaceGitLog(payload)
      }),
      transport.on(WorkspaceGitEvents.commitFiles, (payload, context) => {
        assertHostOwned(context)
        return readWorkspaceGitCommitFiles(payload)
      }),
      transport.on(WorkspaceGitEvents.stage, (payload, context) => {
        assertHostOwned(context)
        return stageWorkspaceGitFiles(payload)
      }),
      transport.on(WorkspaceGitEvents.unstage, (payload, context) => {
        assertHostOwned(context)
        return unstageWorkspaceGitFiles(payload)
      }),
      transport.on(WorkspaceGitEvents.discard, (payload, context) => {
        assertHostOwned(context)
        return discardWorkspaceGitFile(payload)
      }),
      transport.on(WorkspaceGitEvents.commit, (payload, context) => {
        assertHostOwned(context)
        return commitWorkspaceGitChanges(payload)
      }),
      transport.on(WorkspaceGitEvents.checkout, (payload, context) => {
        assertHostOwned(context)
        return checkoutWorkspaceGitBranch(payload)
      }),
      transport.on(WorkspaceGitEvents.renameBranch, (payload, context) => {
        assertHostOwned(context)
        return renameWorkspaceGitBranch(payload)
      }),
      transport.on(WorkspaceGitEvents.deleteBranch, (payload, context) => {
        assertHostOwned(context)
        return deleteWorkspaceGitBranch(payload)
      }),
      transport.on(WorkspaceGitEvents.setUpstream, (payload, context) => {
        assertHostOwned(context)
        return setWorkspaceGitBranchUpstream(payload)
      }),
      transport.on(WorkspaceGitEvents.saveRemote, (payload, context) => {
        assertHostOwned(context)
        return saveWorkspaceGitRemote(payload)
      }),
      transport.on(WorkspaceGitEvents.removeRemote, (payload, context) => {
        assertHostOwned(context)
        return removeWorkspaceGitRemote(payload)
      }),
      transport.on(WorkspaceGitEvents.fetch, (payload, context) => {
        assertHostOwned(context)
        return fetchWorkspaceGit(payload)
      }),
      transport.on(WorkspaceGitEvents.pull, (payload, context) => {
        assertHostOwned(context)
        return pullWorkspaceGit(payload)
      }),
      transport.on(WorkspaceGitEvents.push, (payload, context) => {
        assertHostOwned(context)
        return pushWorkspaceGit(payload)
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

  beginShutdown(): void {
    this.runner?.beginShutdown()
  }

  async recoverOnStartup(): Promise<WorkspaceStartupRecoveryResult | null> {
    if (!this.runner) return null
    return this.runner.recoverOnStartup()
  }

  async onDestroy(): Promise<void> {
    this.runner?.beginShutdown()
    await this.runner?.close()
    this.runner = undefined
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }
}

export const conversationModule = new ConversationModule()
