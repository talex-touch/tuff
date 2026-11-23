import type { Ref } from 'vue'
import type { AgentWorkspaceError } from '~/modules/conversation/useAgentWorkspace'
import { initialReasoningSettingForNewSession } from '@talex-touch/utils/intelligence/model-binding'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { createWorkingConversationTitle } from '~/modules/conversation/conversation-title'
import { provideHomeModelScope } from '~/modules/conversation/home-model-scope'
import { reasoningLevelLabelKey } from '~/modules/conversation/reasoning-effort-display'
import {
  AgentWorkspaceRequestError,
  toAgentWorkspaceError,
  useAgentWorkspace
} from '~/modules/conversation/useAgentWorkspace'
import { useHomeConversation } from '~/modules/conversation/useHomeConversation'
import { useModelOptions } from '~/modules/conversation/useModelOptions'
import { useReasoningEffort } from '~/modules/conversation/useReasoningEffort'
import { createOpeningLeadNote } from '~/modules/home-push/opening'
import { appSetting } from '~/modules/storage/app-storage'
import { describeFailure } from '~/utils/failure-text'
import { modelPillFace } from '../composer/model-pill'
import { homeLog } from './home-log'
import { useHomeAgentTools } from './useHomeAgentTools'

export interface UseHomeWorkspaceSessionOptions {
  browserLanding: () => boolean
  browserActive: () => boolean
  conversationId: Ref<string | null>
  projectId: Ref<string | null>
}

/**
 * Owns Home's active conversation workspace binding: route visibility, model options & reasoning
 * effort defaults, agent-tools surface sync, Main workspace adapter & error reporting, per-thread
 * model scope provision, conversation projection, and composer model pill face.
 */
export function useHomeWorkspaceSession(options: UseHomeWorkspaceSessionOptions) {
  const { t } = useI18n()
  const route = useRoute()

  const {
    resolvedChoice: globalResolvedModel,
    routing: modelRouting,
    ensureLoaded: ensureModelOptionsLoaded
  } = useModelOptions()
  const { setting: reasoningEffortSetting } = useReasoningEffort()
  onMounted(() => {
    void ensureModelOptionsLoaded()
  })

  const isHomeRoute = computed(() =>
    options.browserLanding()
      ? route.path === '/browser' && options.browserActive()
      : route.path === '/home' || route.path.startsWith('/home/c/')
  )

  const {
    autoContext,
    agentTools,
    agentToolsMode,
    resetRememberedApprovals,
    gatewayApprovals,
    pendingGatewayOrigin
  } = useHomeAgentTools({ isHomeRoute, conversationId: options.conversationId })

  function workspaceErrorText(failure: AgentWorkspaceError): string {
    return t(`home.workspace.error.${failure.code === 'unknown' ? 'unknown' : failure.code}`)
  }

  function reportWorkspaceError(failure: AgentWorkspaceError, action: string): void {
    homeLog.warn(`Workspace ${action} rejected`, failure.detail)
    const description = failure.code === 'unknown' ? describeFailure(failure.detail, t, '') : ''
    toast.error(workspaceErrorText(failure), description ? { description } : undefined)
  }

  function reportSubmitError(error: unknown): void {
    const failure =
      error instanceof AgentWorkspaceRequestError ? error.failure : toAgentWorkspaceError(error)
    reportWorkspaceError(failure, 'submit')
  }

  const workspace = useAgentWorkspace({
    conversationId: () => options.conversationId.value,
    projectId: () => options.projectId.value,
    title: createWorkingConversationTitle,
    defaults: () => ({
      providerId: modelRouting.value.providerId,
      model: modelRouting.value.model,
      reasoningEffort:
        appSetting.conversation?.reasoningEffort === undefined
          ? (initialReasoningSettingForNewSession(globalResolvedModel.value?.binding) ??
            reasoningEffortSetting.value)
          : reasoningEffortSetting.value,
      autoContext: autoContext.value
    }),
    leadNote: createOpeningLeadNote(t),
    onError: (failure, action) => reportWorkspaceError(failure, action)
  })

  const modelScope = provideHomeModelScope({
    settings: () => workspace.sessionModel.value,
    configure: (patch) => void workspace.configure(patch)
  })

  const conversation = useHomeConversation({ workspace: () => workspace.adapter })

  const modelPill = computed(() =>
    modelPillFace(modelScope.resolvedChoice.value, t('home.modelName'))
  )
  const composerModel = computed(() => {
    const level = modelScope.pillLevel.value
    return { ...modelPill.value, effort: level ? t(reasoningLevelLabelKey(level)) : undefined }
  })

  return {
    isHomeRoute,
    modelRouting,
    ensureModelOptionsLoaded,
    autoContext,
    agentTools,
    agentToolsMode,
    resetRememberedApprovals,
    gatewayApprovals,
    pendingGatewayOrigin,
    workspaceErrorText,
    reportWorkspaceError,
    reportSubmitError,
    workspace,
    modelScope,
    conversation,
    composerModel
  }
}
