import type {
  PluginInstallConfirmRequest,
  PluginInstallConfirmResponse,
  PluginInstallProgressEvent
} from '@talex-touch/utils/plugin'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { computed, reactive } from 'vue'
import { useI18nText } from '~/modules/lang'
import { forTouchTip } from '~/modules/mention/dialog-mention'

interface InstallTaskState extends PluginInstallProgressEvent {
  updatedAt: number
}

const ACTIVE_STAGES: Set<PluginInstallProgressEvent['stage']> = new Set([
  'queued',
  'downloading',
  'verifying',
  'awaiting-confirmation',
  'installing'
])

const tasks = reactive(new Map<string, InstallTaskState>())
const pluginIndex = reactive(new Map<string, string>())
const sourceIndex = reactive(new Map<string, string>())
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Generate a composite key for uniquely identifying a plugin across different sources.
 * Format: `providerId::pluginId` or just `pluginId` if no providerId.
 */
export function getPluginCompositeKey(pluginId: string, providerId?: string): string {
  return providerId ? `${providerId}::${pluginId}` : pluginId
}

let initialized = false
const transportDisposers: Array<() => void> = []

function getTranslator(): (key: string, params?: Record<string, unknown>) => string {
  const { t } = useI18nText()
  return t
}

function scheduleCleanup(taskId: string): void {
  if (cleanupTimers.has(taskId)) {
    clearTimeout(cleanupTimers.get(taskId)!)
  }
  const timer = setTimeout(() => {
    tasks.delete(taskId)
    cleanupTimers.delete(taskId)
  }, 5000)
  cleanupTimers.set(taskId, timer)
}

function updateTask(event: PluginInstallProgressEvent): void {
  const existing = tasks.get(event.taskId)
  const next: InstallTaskState = {
    ...(existing ?? ({ stage: event.stage } as InstallTaskState)),
    ...event,
    updatedAt: Date.now()
  }

  tasks.set(event.taskId, next)

  if (event.pluginId) {
    const compositeKey = getPluginCompositeKey(event.pluginId, event.providerId)
    pluginIndex.set(compositeKey, event.taskId)
  }

  if (event.source) {
    sourceIndex.set(event.source, event.taskId)
  }

  if (!ACTIVE_STAGES.has(event.stage)) {
    scheduleCleanup(event.taskId)
  }
}

async function sendDecision(response: PluginInstallConfirmResponse): Promise<void> {
  try {
    const transport = useTuffTransport()
    const pluginSdk = createPluginSdk(transport)
    await pluginSdk.sendInstallConfirmResponse(response)
  } catch (error) {
    console.error('[InstallManager] Failed to send confirm response:', error)
  }
}

async function handleConfirm(request: PluginInstallConfirmRequest): Promise<void> {
  const t = getTranslator()
  const name = request.pluginName || request.pluginId || request.source || 'plugin'
  const confirmKind = request.kind || 'source'

  let decisionMade = false

  if (confirmKind === 'permissions') {
    const required = request.permissions?.required || []
    const reasons = request.permissions?.reasons || {}
    const permissionLines = required
      .map((permissionId) => {
        const reason = reasons[permissionId]
        return reason ? `- ${permissionId} (${reason})` : `- ${permissionId}`
      })
      .join('\n')

    await forTouchTip(
      t('store.installation.permissionConfirmTitle'),
      t('store.installation.permissionConfirmMessage', {
        name,
        permissions: permissionLines || '- (none)'
      }),
      [
        {
          content: t('store.installation.permissionAllowAlways'),
          type: 'success',
          onClick: async () => {
            decisionMade = true
            await sendDecision({
              taskId: request.taskId,
              decision: 'accept',
              grantMode: 'always'
            })
            return true
          }
        },
        {
          content: t('store.installation.permissionAllowSession'),
          type: 'default',
          onClick: async () => {
            decisionMade = true
            await sendDecision({
              taskId: request.taskId,
              decision: 'accept',
              grantMode: 'session'
            })
            return true
          }
        },
        {
          content: t('store.installation.permissionReject'),
          type: 'warning',
          onClick: async () => {
            decisionMade = true
            await sendDecision({ taskId: request.taskId, decision: 'reject' })
            return true
          }
        }
      ]
    )
  } else {
    await forTouchTip(
      t('store.installation.confirmTitle'),
      t('store.installation.confirmMessage', { name }),
      [
        {
          content: t('store.installation.confirmInstall'),
          type: 'success',
          onClick: async () => {
            decisionMade = true
            await sendDecision({ taskId: request.taskId, decision: 'accept' })
            return true
          }
        },
        {
          content: t('store.installation.confirmReject'),
          type: 'warning',
          onClick: async () => {
            decisionMade = true
            await sendDecision({ taskId: request.taskId, decision: 'reject' })
            return true
          }
        }
      ]
    )
  }

  if (!decisionMade) {
    await sendDecision({ taskId: request.taskId, decision: 'reject' })
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (activeTaskCount.value === 0) return
  const t = getTranslator()
  const message = t('store.installation.beforeExitPrompt')
  event.preventDefault()
  event.returnValue = message
}

function ensureInitialized(): void {
  if (initialized) return

  const transport = useTuffTransport()
  const pluginSdk = createPluginSdk(transport)

  transportDisposers.push(
    pluginSdk.onInstallProgress((event) => {
      updateTask(event as PluginInstallProgressEvent)
    }),
    pluginSdk.onInstallConfirm((request) => {
      void handleConfirm(request as PluginInstallConfirmRequest)
    })
  )

  window.addEventListener('beforeunload', handleBeforeUnload)
  initialized = true
}

const activeTaskCount = computed(() => {
  let count = 0
  tasks.forEach((task) => {
    if (ACTIVE_STAGES.has(task.stage)) count += 1
  })
  return count
})

function getTaskByPluginId(pluginId?: string, providerId?: string) {
  if (!pluginId) return undefined
  const compositeKey = getPluginCompositeKey(pluginId, providerId)
  const taskId = pluginIndex.get(compositeKey)
  return taskId ? tasks.get(taskId) : undefined
}

function getTaskBySource(source?: string) {
  if (!source) return undefined
  const taskId = sourceIndex.get(source)
  return taskId ? tasks.get(taskId) : undefined
}

export function useInstallManager() {
  ensureInitialized()

  return {
    tasks,
    activeTaskCount,
    hasActiveTasks: computed(() => activeTaskCount.value > 0),
    getTaskByPluginId,
    getTaskBySource,
    isActiveStage: (stage?: PluginInstallProgressEvent['stage']) =>
      stage ? ACTIVE_STAGES.has(stage) : false
  }
}
