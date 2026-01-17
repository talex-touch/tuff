import type {
  PluginInstallConfirmRequest,
  PluginInstallConfirmResponse,
  PluginInstallProgressEvent
} from '@talex-touch/utils/plugin'
import { computed, reactive } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { forTouchTip } from '~/modules/mention/dialog-mention'

declare global {
  interface Window {
    $i18n?: {
      global?: {
        t?: (key: string, params?: Record<string, unknown>) => string
      }
    }
  }
}

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
let transportDisposers: Array<() => void> = []

function getTranslator(): (key: string, params?: Record<string, unknown>) => string {
  const i18n = window.$i18n
  if (i18n?.global?.t) {
    return i18n.global.t.bind(i18n.global)
  }
  return (key: string, params?: Record<string, unknown>) => {
    if (key === 'market.installation.confirmTitle') {
      return '是否安装插件？'
    }
    if (key === 'market.installation.confirmMessage') {
      return `插件 “${params?.name ?? ''}” 来自非官方来源，确认继续安装？`
    }
    if (key === 'market.installation.confirmInstall') {
      return '继续安装'
    }
    if (key === 'market.installation.confirmReject') {
      return '取消'
    }
    if (key === 'market.installation.beforeExitPrompt') {
      return '仍有插件安装进行中，确认要退出吗？'
    }
    return key
  }
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
    // Index by both composite key (providerId::pluginId) and plain pluginId for backward compatibility
    const compositeKey = getPluginCompositeKey(event.pluginId, event.providerId)
    pluginIndex.set(compositeKey, event.taskId)
    // Also index by plain pluginId as fallback
    if (!pluginIndex.has(event.pluginId)) {
      pluginIndex.set(event.pluginId, event.taskId)
    }
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

  let decisionMade = false

  await forTouchTip(
    t('market.installation.confirmTitle'),
    t('market.installation.confirmMessage', { name }),
    [
      {
        content: t('market.installation.confirmInstall'),
        type: 'success',
        onClick: async () => {
          decisionMade = true
          await sendDecision({ taskId: request.taskId, decision: 'accept' })
          return true
        }
      },
      {
        content: t('market.installation.confirmReject'),
        type: 'warning',
        onClick: async () => {
          decisionMade = true
          await sendDecision({ taskId: request.taskId, decision: 'reject' })
          return true
        }
      }
    ]
  )

  if (!decisionMade) {
    await sendDecision({ taskId: request.taskId, decision: 'reject' })
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (activeTaskCount.value === 0) return
  const t = getTranslator()
  const message = t('market.installation.beforeExitPrompt')
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
  // Try composite key first, then fall back to plain pluginId
  const compositeKey = getPluginCompositeKey(pluginId, providerId)
  const taskId = pluginIndex.get(compositeKey) ?? pluginIndex.get(pluginId)
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
