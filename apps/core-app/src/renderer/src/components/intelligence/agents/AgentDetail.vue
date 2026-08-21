<script lang="ts" name="AgentDetail" setup>
import type { AgentDescriptor, AgentTask } from '@talex-touch/utils'
import { TuffProgress } from '@talex-touch/tuffex/progress'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { TxTag } from '@talex-touch/tuffex/tag'
import { useAgentsSdk } from '@talex-touch/utils/renderer'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'

const props = defineProps<{
  agent: AgentDescriptor
}>()

const { t } = useI18n()
const agentsSdk = useAgentsSdk()
const agentDetailLog = createRendererLogger('AgentDetail')

const taskInput = ref('')
const executing = ref(false)
const canceling = ref(false)
const taskResult = ref<unknown>(null)
const taskError = ref<string | null>(null)
const currentTaskId = ref<string | null>(null)
const taskProgress = ref(0)
const taskStep = ref('')

const STATUS_POLL_INTERVAL_MS = 1500
let taskStatusPollTimer: ReturnType<typeof setInterval> | null = null

function stopTaskStatusPolling() {
  if (taskStatusPollTimer) {
    clearInterval(taskStatusPollTimer)
    taskStatusPollTimer = null
  }
}

function finalizeTaskByPolledStatus(status: string) {
  const normalized = status.toLowerCase()

  if (normalized === 'completed') {
    taskProgress.value = Math.max(taskProgress.value, 100)
    taskStep.value = t('intelligence.agents.task_completed')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()

    if (!taskResult.value) {
      toast.info(t('intelligence.agents.task_completed_no_result'))
    }
    return
  }

  if (normalized === 'failed') {
    taskError.value = t('intelligence.agents.task_failed')
    taskStep.value = t('intelligence.agents.task_failed')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    toast.error(taskError.value)
    return
  }

  if (normalized === 'cancelled') {
    taskError.value = t('intelligence.agents.task_cancelled')
    taskStep.value = t('intelligence.agents.task_cancelled')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    toast.warning(taskError.value)
  }
}

async function pollTaskStatus() {
  const taskId = currentTaskId.value
  if (!taskId || !executing.value) {
    stopTaskStatusPolling()
    return
  }

  try {
    const statusResult = await agentsSdk.getTaskStatus(taskId)
    finalizeTaskByPolledStatus(statusResult?.status || '')
  } catch {
    // Keep retrying during execution; transient query failure should not interrupt UI state.
  }
}

function startTaskStatusPolling() {
  if (taskStatusPollTimer) {
    return
  }

  taskStatusPollTimer = setInterval(() => {
    void pollTaskStatus()
  }, STATUS_POLL_INTERVAL_MS)

  void pollTaskStatus()
}

function isCurrentTask(taskId?: string, agentId?: string): boolean {
  return Boolean(taskId) && taskId === currentTaskId.value && agentId === props.agent.id
}

const taskListeners = [
  agentsSdk.onTaskStarted((payload) => {
    if (!isCurrentTask(payload.taskId, payload.agentId)) {
      return
    }
    canceling.value = false
    taskStep.value = t('intelligence.agents.task_running')
  }),
  agentsSdk.onTaskProgress((payload) => {
    if (!isCurrentTask(payload.taskId, payload.agentId)) {
      return
    }
    taskProgress.value = Math.max(0, Math.min(100, Math.round(payload.progress || 0)))
    taskStep.value = payload.step || t('intelligence.agents.task_running')
  }),
  agentsSdk.onTaskCompleted((payload) => {
    if (!isCurrentTask(payload.taskId, payload.result?.agentId)) {
      return
    }

    taskResult.value = payload.result
    taskError.value = payload.result?.success
      ? null
      : payload.result?.error || t('intelligence.agents.task_failed')
    taskProgress.value = 100
    taskStep.value = t('intelligence.agents.task_completed')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()

    if (payload.result?.success) {
      toast.success(t('intelligence.agents.task_success'))
    } else {
      toast.error(taskError.value || t('intelligence.agents.task_failed'))
    }
  }),
  agentsSdk.onTaskFailed((payload) => {
    if (!isCurrentTask(payload.taskId, props.agent.id)) {
      return
    }

    taskError.value = payload.error || t('intelligence.agents.task_failed')
    taskStep.value = t('intelligence.agents.task_failed')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    toast.error(taskError.value)
  }),
  agentsSdk.onTaskCancelled((payload) => {
    if (!isCurrentTask(payload.taskId, props.agent.id)) {
      return
    }

    taskError.value = t('intelligence.agents.task_cancelled')
    taskStep.value = t('intelligence.agents.task_cancelled')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    toast.warning(taskError.value)
  })
]

onBeforeUnmount(() => {
  stopTaskStatusPolling()
  taskListeners.forEach((dispose) => dispose())
})

function createTaskId(): string {
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `quick-${props.agent.id}-${now}-${rand}`
}

async function executeTask() {
  if (!taskInput.value.trim()) return

  const taskId = createTaskId()

  stopTaskStatusPolling()
  executing.value = true
  currentTaskId.value = taskId
  taskResult.value = null
  taskError.value = null
  taskProgress.value = 0
  canceling.value = false
  taskStep.value = t('intelligence.agents.task_queued')

  try {
    const task: AgentTask = {
      id: taskId,
      agentId: props.agent.id,
      type: 'execute',
      input: { query: taskInput.value }
    }

    const queued = await agentsSdk.execute(task)
    if (!queued?.taskId) {
      throw new Error('Missing task id from execute response')
    }
    if (queued.taskId !== taskId) {
      currentTaskId.value = queued.taskId
    }

    startTaskStatusPolling()
  } catch (err) {
    agentDetailLog.error('Task execution failed:', err)
    taskError.value = err instanceof Error ? err.message : t('intelligence.agents.task_failed')
    taskStep.value = t('intelligence.agents.task_failed')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    toast.error(taskError.value)
  }
}

async function cancelTask() {
  const taskId = currentTaskId.value
  if (!taskId || !executing.value || canceling.value) {
    return
  }

  canceling.value = true

  try {
    const result = await agentsSdk.cancel(taskId)
    if (!result?.success) {
      throw new Error(t('intelligence.agents.cancel_failed'))
    }

    taskStep.value = t('intelligence.agents.task_cancel_requested')
    toast.info(t('intelligence.agents.task_cancel_requested'))
  } catch (err) {
    canceling.value = false
    const message = err instanceof Error ? err.message : t('intelligence.agents.cancel_failed')
    toast.error(message)
  }
}

function getCapabilityIcon(type: string): string {
  const iconMap: Record<string, string> = {
    action: 'i-carbon-play-filled',
    query: 'i-carbon-search',
    workflow: 'i-carbon-flow'
  }
  return iconMap[type] || 'i-carbon-circle-filled'
}
</script>

<template>
  <TxScroll class="agent-detail">
    <template #header>
      <div class="detail-header">
        <div class="header-icon i-carbon-bot" aria-hidden="true" />
        <div class="header-info">
          <h2 class="agent-title">
            {{ agent.name }}
          </h2>
          <p class="agent-version">v{{ agent.version }}</p>
        </div>
        <TxTag v-if="agent.enabled !== false" type="success">
          {{ t('intelligence.agents.active') }}
        </TxTag>
        <TxTag v-else type="info">
          {{ t('intelligence.agents.inactive') }}
        </TxTag>
      </div>
    </template>

    <div class="agent-detail-body" role="region" :aria-label="t('intelligence.agents.title')">
      <TuffGroupBlock
        :name="t('intelligence.agents.description')"
        :description="t('intelligence.agents.overview_hint')"
        default-icon="i-carbon-document"
        active-icon="i-carbon-document"
        :collapsible="false"
      >
        <TuffBlockSlot
          :title="agent.name"
          :description="agent.description"
          default-icon="i-carbon-information"
          :icon-size="18"
        >
          <TxTag size="sm">v{{ agent.version }}</TxTag>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="agent.capabilities?.length"
        :name="t('intelligence.agents.capabilities')"
        :description="t('intelligence.agents.capabilities_hint')"
        default-icon="i-carbon-capacity"
        active-icon="i-carbon-capacity"
      >
        <TuffBlockSlot
          v-for="cap in agent.capabilities"
          :key="cap.id"
          :title="cap.id"
          :default-icon="getCapabilityIcon(cap.type)"
          :active-icon="getCapabilityIcon(cap.type)"
          :icon-size="18"
        >
          <TxTag size="sm">
            {{ cap.type }}
          </TxTag>
        </TuffBlockSlot>
      </TuffGroupBlock>

      <TuffGroupBlock
        v-if="agent.tools?.length"
        :name="t('intelligence.agents.tools')"
        :description="t('intelligence.agents.tools_hint')"
        default-icon="i-carbon-tool-box"
        active-icon="i-carbon-tool-box"
      >
        <TuffBlockSlot
          v-for="tool in agent.tools"
          :key="tool.toolId"
          :title="tool.toolId"
          default-icon="i-carbon-tool"
          active-icon="i-carbon-tool"
          :icon-size="18"
        />
      </TuffGroupBlock>

      <TuffGroupBlock
        :name="t('intelligence.agents.quick_execute')"
        :description="t('intelligence.agents.quick_execute_hint')"
        default-icon="i-carbon-play"
        active-icon="i-carbon-play"
      >
        <div class="execute-form">
          <TuffInput
            v-model="taskInput"
            :placeholder="t('intelligence.agents.input_placeholder')"
            type="textarea"
            :rows="3"
            :disabled="executing"
          />
          <div class="execute-actions">
            <TxButton
              type="primary"
              :loading="executing"
              :disabled="!taskInput.trim() || executing"
              @click="executeTask"
            >
              <span class="i-carbon-play mr-1" aria-hidden="true" />
              {{ t('intelligence.agents.execute') }}
            </TxButton>
            <TxButton
              v-if="executing && currentTaskId"
              text
              type="warning"
              :loading="canceling"
              :disabled="canceling"
              @click="cancelTask"
            >
              {{ t('intelligence.agents.cancel') }}
            </TxButton>
          </div>
        </div>

        <div v-if="executing" class="execute-status" role="status">
          <div class="status-line">
            <span>{{ taskStep || t('intelligence.agents.task_running') }}</span>
            <span>{{ taskProgress }}%</span>
          </div>
          <TuffProgress :percentage="taskProgress" :show-text="false" :stroke-width="8" />
        </div>

        <div v-if="taskError" class="execute-error" role="alert">
          {{ taskError }}
        </div>

        <div v-if="taskResult" class="execute-result">
          <h4 class="result-title">
            {{ t('intelligence.agents.result') }}
          </h4>
          <pre class="result-content">{{ JSON.stringify(taskResult, null, 2) }}</pre>
        </div>
      </TuffGroupBlock>
    </div>
  </TxScroll>
</template>

<style lang="scss" scoped>
.agent-detail {
  height: 100%;
  min-height: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  -webkit-app-region: drag;
}

.header-icon {
  color: var(--tx-color-primary);
  font-size: 2.5rem;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.agent-title {
  margin: 0;
  color: var(--tx-text-color-primary);
  font-size: 1.25rem;
  font-weight: 600;
}

.agent-version {
  margin: 0.25rem 0 0;
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
}

.agent-detail-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1rem;
}

.execute-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}

.execute-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.execute-status {
  margin: 0 1rem 0.75rem;
}

.status-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
}

.execute-error {
  margin: 0 1rem 0.75rem;
  color: var(--tx-color-danger);
  font-size: 0.8125rem;
}

.execute-result {
  margin: 0 1rem 1rem;
}

.result-title {
  margin: 0 0 0.5rem;
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
  font-weight: 600;
}

.result-content {
  max-height: 200px;
  margin: 0;
  overflow: auto;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--tx-bg-color);
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 0.75rem;
}
</style>
