import type {
  PluginInstallConfirmRequest,
  PluginInstallConfirmResponse,
  PluginInstallProgressEvent
} from '@talex-touch/utils/plugin'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createNotificationSdk } from '@talex-touch/utils/transport/sdk/domains/notification'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { computed, reactive } from 'vue'
import { useI18nText } from '~/modules/lang'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import {
  PERMISSION_REQUEST_TIMEOUT_MS,
  showPermissionRequestCard
} from '~/modules/permission/permission-request-card'
import { createRendererLogger } from '~/utils/renderer-log'

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
const notifiedTaskStages = new Set<string>()

/**
 * Generate a composite key for uniquely identifying a plugin across different sources.
 * Format: `providerId::pluginId` or just `pluginId` if no providerId.
 */
export function getPluginCompositeKey(pluginId: string, providerId?: string): string {
  return providerId ? `${providerId}::${pluginId}` : pluginId
}

const installManagerLog = createRendererLogger('InstallManager')

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

function shouldUseSystemNotification(): boolean {
  return document.hidden || !document.hasFocus()
}

async function notifyTerminalTask(event: PluginInstallProgressEvent): Promise<void> {
  if (event.stage !== 'completed' && event.stage !== 'failed') return

  const dedupeKey = `${event.taskId}:${event.stage}`
  if (notifiedTaskStages.has(dedupeKey)) return
  notifiedTaskStages.add(dedupeKey)

  if (!shouldUseSystemNotification()) return

  const t = getTranslator()
  const transport = useTuffTransport()
  const notificationSdk = createNotificationSdk(transport)
  const name = event.pluginName || event.pluginId || 'Plugin'
  const isSuccess = event.stage === 'completed'
  const title = isSuccess
    ? t('store.installation.successTitle')
    : t('store.installation.failureTitle')
  const message = isSuccess
    ? t('store.installation.successMessage', { name })
    : t('store.installation.failureMessage', {
        name,
        reason: event.error || event.message || 'INSTALL_FAILED'
      })

  try {
    await notificationSdk.notify({
      channel: 'system',
      level: isSuccess ? 'success' : 'error',
      title,
      message,
      dedupeKey
    })
  } catch (error) {
    installManagerLog.warn('Failed to send install notification', error)
  }
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
    void notifyTerminalTask(event)
    scheduleCleanup(event.taskId)
  }
}

async function sendDecision(response: PluginInstallConfirmResponse): Promise<void> {
  try {
    const transport = useTuffTransport()
    const pluginSdk = createPluginSdk(transport)
    await pluginSdk.sendInstallConfirmResponse(response)
  } catch (error) {
    installManagerLog.error('Failed to send confirm response', error)
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

    const { result } = showPermissionRequestCard({
      title: t('plugin.permissions.startup.title'),
      message: t('plugin.permissions.startup.requestMessage', { name }),
      permissions: required.map((permissionId) => ({
        id: permissionId,
        reason: reasons[permissionId]
      })),
      timeoutText: t('plugin.permissions.startup.timeout', {
        seconds: Math.floor(PERMISSION_REQUEST_TIMEOUT_MS / 1000)
      }),
      timeoutMs: PERMISSION_REQUEST_TIMEOUT_MS,
      actionLabels: {
        deny: t('plugin.permissions.startup.actions.deny'),
        session: t('plugin.permissions.startup.actions.session'),
        always: t('plugin.permissions.startup.actions.always')
      },
      t,
      onDismiss: () => 'deny'
    })

    const decision = await result
    decisionMade = true

    if (decision === 'always') {
      await sendDecision({
        taskId: request.taskId,
        decision: 'accept',
        grantMode: 'always'
      })
    } else if (decision === 'session') {
      await sendDecision({
        taskId: request.taskId,
        decision: 'accept',
        grantMode: 'session'
      })
    } else {
      await sendDecision({ taskId: request.taskId, decision: 'reject' })
    }
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
