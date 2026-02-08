<script lang="ts" name="AgentDetail" setup>
import type { AgentDescriptor, AgentTask } from '@talex-touch/utils'
import { useAgentsSdk } from '@talex-touch/utils/renderer/hooks/use-agents-sdk'
import { ElMessage } from 'element-plus'
import { onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  agent: AgentDescriptor
}>()

const { t } = useI18n()
const agentsSdk = useAgentsSdk()

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
      ElMessage.info(t('intelligence.agents.task_completed_no_result'))
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
    ElMessage.error(taskError.value)
    return
  }

  if (normalized === 'cancelled') {
    taskError.value = t('intelligence.agents.task_cancelled')
    taskStep.value = t('intelligence.agents.task_cancelled')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    ElMessage.warning(taskError.value)
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
      ElMessage.success(t('intelligence.agents.task_success'))
    } else {
      ElMessage.error(taskError.value || t('intelligence.agents.task_failed'))
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
    ElMessage.error(taskError.value)
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
    ElMessage.warning(taskError.value)
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
    console.error('Task execution failed:', err)
    taskError.value = err instanceof Error ? err.message : t('intelligence.agents.task_failed')
    taskStep.value = t('intelligence.agents.task_failed')
    executing.value = false
    canceling.value = false
    currentTaskId.value = null
    stopTaskStatusPolling()
    ElMessage.error(taskError.value)
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
    ElMessage.info(t('intelligence.agents.task_cancel_requested'))
  } catch (err) {
    canceling.value = false
    const message = err instanceof Error ? err.message : t('intelligence.agents.cancel_failed')
    ElMessage.error(message)
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
  <div class="agent-detail">
    <!-- Header -->
    <div class="detail-header">
      <div class="header-icon i-carbon-bot" />
      <div class="header-info">
        <h2 class="agent-title">
          {{ agent.name }}
        </h2>
        <p class="agent-version">v{{ agent.version }}</p>
      </div>
      <el-tag v-if="agent.enabled !== false" type="success">
        {{ t('intelligence.agents.active') }}
      </el-tag>
      <el-tag v-else type="info">
        {{ t('intelligence.agents.inactive') }}
      </el-tag>
    </div>

    <!-- Description -->
    <div class="detail-section">
      <h3 class="section-title">
        {{ t('intelligence.agents.description') }}
      </h3>
      <p class="section-content">
        {{ agent.description }}
      </p>
    </div>

    <!-- Capabilities -->
    <div v-if="agent.capabilities?.length" class="detail-section">
      <h3 class="section-title">
        {{ t('intelligence.agents.capabilities') }}
      </h3>
      <div class="capabilities-grid">
        <div v-for="cap in agent.capabilities" :key="cap.id" class="capability-card">
          <div class="cap-header">
            <span :class="getCapabilityIcon(cap.type)" />
            <span class="cap-name">{{ cap.id }}</span>
            <el-tag size="small">
              {{ cap.type }}
            </el-tag>
          </div>
        </div>
      </div>
    </div>

    <!-- Tools -->
    <div v-if="agent.tools?.length" class="detail-section">
      <h3 class="section-title">
        {{ t('intelligence.agents.tools') }}
      </h3>
      <div class="tools-list">
        <el-tag v-for="tool in agent.tools" :key="tool.toolId" size="small" class="tool-tag">
          <span class="i-carbon-tool mr-1" />
          {{ tool.toolId }}
        </el-tag>
      </div>
    </div>

    <!-- Quick Execute -->
    <div class="detail-section">
      <h3 class="section-title">
        {{ t('intelligence.agents.quick_execute') }}
      </h3>
      <div class="execute-form">
        <el-input
          v-model="taskInput"
          :placeholder="t('intelligence.agents.input_placeholder')"
          type="textarea"
          :rows="3"
          :disabled="executing"
        />
        <div class="execute-actions">
          <el-button
            type="primary"
            :loading="executing"
            :disabled="!taskInput.trim() || executing"
            @click="executeTask"
          >
            <span class="i-carbon-play mr-1" />
            {{ t('intelligence.agents.execute') }}
          </el-button>
          <el-button
            v-if="executing && currentTaskId"
            text
            type="warning"
            :loading="canceling"
            :disabled="canceling"
            @click="cancelTask"
          >
            {{ t('intelligence.agents.cancel') }}
          </el-button>
        </div>
      </div>

      <div v-if="executing" class="execute-status">
        <div class="status-line">
          <span>{{ taskStep || t('intelligence.agents.task_running') }}</span>
          <span>{{ taskProgress }}%</span>
        </div>
        <el-progress :percentage="taskProgress" :show-text="false" :stroke-width="8" />
      </div>

      <div v-if="taskError" class="execute-error">
        {{ taskError }}
      </div>

      <!-- Result -->
      <div v-if="taskResult" class="execute-result">
        <h4 class="result-title">
          {{ t('intelligence.agents.result') }}
        </h4>
        <pre class="result-content">{{ JSON.stringify(taskResult, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agent-detail {
  height: 100%;
  overflow: auto;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 1.5rem;
}

.header-icon {
  font-size: 2.5rem;
  color: var(--el-color-primary);
}

.header-info {
  flex: 1;
}

.agent-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: var(--el-text-color-primary);
}

.agent-version {
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  margin: 0.25rem 0 0;
}

.detail-section {
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 0.75rem;
}

.section-content {
  font-size: 0.875rem;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  margin: 0;
}

.capabilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.capability-card {
  padding: 0.75rem;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}

.cap-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  span:first-child {
    color: var(--el-color-primary);
  }
}

.cap-name {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 500;
}

.tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tool-tag {
  display: inline-flex;
  align-items: center;
}

.execute-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.execute-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.execute-status {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--el-fill-color-lighter);
}

.status-line {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--el-text-color-secondary);
  margin-bottom: 0.5rem;
}

.execute-error {
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  color: var(--el-color-danger);
}

.execute-result {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}

.result-title {
  font-size: 0.75rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: var(--el-text-color-secondary);
}

.result-content {
  font-size: 0.75rem;
  font-family: 'SF Mono', Monaco, monospace;
  background: var(--el-bg-color);
  padding: 0.75rem;
  border-radius: 4px;
  overflow: auto;
  max-height: 200px;
  margin: 0;
}
</style>
