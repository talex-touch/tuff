import type { Ref } from 'vue'
import type { AgentToolsMode } from '~/modules/conversation/useAgentTools'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useAgentTools } from '~/modules/conversation/useAgentTools'
import { toGatewayApproval } from '~/modules/conversation/workspace-activity'
import { appSetting } from '~/modules/storage/app-storage'
import { createRollbackSync } from '~/utils/rollback-sync'
import { homeLog } from './home-log'

export interface UseHomeAgentToolsOptions {
  isHomeRoute: Ref<boolean>
  conversationId: Ref<string | null>
}

/**
 * Coordinates Home's agent-tools mode, Main confirmation-surface visibility, rollback-safe mode
 * sync, remembered-approval reset, and gateway approval projection for the active conversation.
 */
export function useHomeAgentTools(options: UseHomeAgentToolsOptions) {
  const { t } = useI18n()

  const autoContext = computed(() => appSetting.tools?.autoContext !== false)
  const agentTools = useAgentTools()

  watch(options.isHomeRoute, (visible) => agentTools.setSurfaceVisible(visible), {
    immediate: true
  })

  const agentToolsMode = computed<AgentToolsMode>({
    get: () => {
      const tools = appSetting.tools
      return tools?.agentToolsMode ?? (tools?.agentTools === true ? 'review' : 'off')
    },
    set: (mode) => {
      const tools = appSetting.tools
      if (!tools) return
      tools.agentToolsMode = mode
      tools.agentTools = mode !== 'off'
    }
  })

  const syncAgentToolsMode = createRollbackSync<AgentToolsMode>({
    sync: async (mode) => {
      await agentTools.setMode(mode)
    },
    rollback: (previous) => {
      const tools = appSetting.tools
      if (!tools) return
      tools.agentToolsMode = previous
      tools.agentTools = previous !== 'off'
      toast.error(t('home.error.agentToolsSync'))
    },
    onError: (error) => homeLog.error('Failed to sync agent tools mode with main', error)
  })

  watch(
    agentToolsMode,
    (mode, previous) => {
      if (mode === 'off' && previous === undefined) return
      void syncAgentToolsMode(mode, previous ?? 'off')
    },
    { immediate: true }
  )

  async function resetRememberedApprovals(): Promise<void> {
    try {
      await agentTools.resetApprovals()
      toast.success(t('home.permissionResetDone'))
    } catch (error) {
      homeLog.warn('Failed to reset remembered approvals', String(error))
      toast.error(t('home.permissionResetFailed'))
    }
  }

  const gatewayApprovals = computed(() =>
    [agentTools.pending.value, ...agentTools.queued.value]
      .filter((request) => request !== null)
      .map((request) => toGatewayApproval(request, options.conversationId.value))
  )

  const pendingGatewayOrigin = computed(() => gatewayApprovals.value[0]?.origin)

  return {
    autoContext,
    agentTools,
    agentToolsMode,
    resetRememberedApprovals,
    gatewayApprovals,
    pendingGatewayOrigin
  }
}
