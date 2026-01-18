<script lang="ts" name="AgentDetail" setup>
import type { AgentDescriptor, AgentTask } from '@talex-touch/utils'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AgentsEvents } from '@talex-touch/utils/transport/events'

const props = defineProps<{
  agent: AgentDescriptor
}>()

const { t } = useI18n()
const transport = useTuffTransport()

const taskInput = ref('')
const executing = ref(false)
const taskResult = ref<unknown>(null)

async function executeTask() {
  if (!taskInput.value.trim()) return

  executing.value = true
  taskResult.value = null

  try {
    const task: AgentTask = {
      agentId: props.agent.id,
      type: 'execute',
      input: { query: taskInput.value }
    }

    const result = await transport.send(AgentsEvents.api.executeImmediate, task)
    taskResult.value = result

    if (result?.success) {
      ElMessage.success(t('intelligence.agents.task_success'))
    } else {
      ElMessage.error(result?.error || t('intelligence.agents.task_failed'))
    }
  } catch (err) {
    console.error('Task execution failed:', err)
    ElMessage.error(t('intelligence.agents.task_failed'))
  } finally {
    executing.value = false
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
        <el-button
          type="primary"
          :loading="executing"
          :disabled="!taskInput.trim()"
          @click="executeTask"
        >
          <span class="i-carbon-play mr-1" />
          {{ t('intelligence.agents.execute') }}
        </el-button>
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
const transport = useTuffTransport()
