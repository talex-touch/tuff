<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  block: IInnerItemMeta
}>()

function parseJsonRecord(value: string | undefined): Record<string, any> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {}
  }
  catch {
    return {}
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

const payload = computed(() => parseJsonRecord(props.block.data))
const detail = computed(() => {
  const row = payload.value.detail
  return row && typeof row === 'object' && !Array.isArray(row)
    ? row as Record<string, unknown>
    : {}
})

const cardTypeLabel = computed(() => {
  const type = normalizeText(payload.value.cardType)
  if (type === 'intent') {
    return 'Intent'
  }
  if (type === 'routing') {
    return 'Routing'
  }
  if (type === 'memory') {
    return 'Memory'
  }
  if (type === 'websearch') {
    return 'Websearch'
  }
  if (type === 'thinking') {
    return 'Thinking'
  }
  return type || 'Runtime'
})

const statusText = computed(() => {
  const status = normalizeText(payload.value.status).toLowerCase()
  if (status === 'running') {
    return '进行中'
  }
  if (status === 'completed') {
    return '已完成'
  }
  if (status === 'skipped') {
    return '已跳过'
  }
  if (status === 'failed') {
    return '失败'
  }
  return status || '未知'
})

const statusClass = computed(() => {
  const status = normalizeText(payload.value.status).toLowerCase()
  if (status === 'completed') {
    return 'is-completed'
  }
  if (status === 'running') {
    return 'is-running'
  }
  if (status === 'skipped') {
    return 'is-skipped'
  }
  if (status === 'failed') {
    return 'is-failed'
  }
  return 'is-unknown'
})

const detailRows = computed(() => {
  const rows: Array<{ label: string, value: string }> = []
  const type = normalizeText(payload.value.cardType)
  const row = detail.value

  if (type === 'intent') {
    rows.push(
      { label: '意图', value: normalizeText(row.intentType) || '-' },
      { label: '策略', value: normalizeText(row.strategy) || '-' },
      { label: '原因', value: normalizeText(row.reason) || '-' },
    )
    const confidence = Number(row.confidence)
    rows.push({
      label: '置信度',
      value: Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : '-',
    })
    return rows
  }

  if (type === 'routing') {
    rows.push(
      { label: '请求模型', value: normalizeText(row.modelId) || '-' },
      { label: '实际模型', value: normalizeText(row.providerModel) || '-' },
      { label: 'RouteCombo', value: normalizeText(row.routeComboId) || '-' },
      { label: 'Channel', value: normalizeText(row.channelId) || '-' },
      { label: 'Transport', value: normalizeText(row.transport) || '-' },
    )
    return rows
  }

  if (type === 'memory') {
    const historyCount = Number(row.memoryHistoryMessageCount)
    rows.push(
      { label: 'Memory', value: row.memoryEnabled === true ? 'on' : 'off' },
      { label: '历史条数', value: Number.isFinite(historyCount) ? String(historyCount) : '0' },
    )
    return rows
  }

  if (type === 'websearch') {
    const sourceCount = Number(row.sourceCount)
    rows.push(
      { label: '决策', value: row.enabled === true ? 'enabled' : 'disabled' },
      { label: '原因', value: normalizeText(row.reason) || '-' },
      { label: '来源', value: normalizeText(row.source) || '-' },
      { label: '命中', value: Number.isFinite(sourceCount) ? String(sourceCount) : '0' },
    )
    return rows
  }

  if (type === 'thinking') {
    rows.push({ label: '阶段', value: statusText.value })
    return rows
  }

  return rows
})

const thinkingText = computed(() => normalizeText(payload.value.content))
const summaryText = computed(() => normalizeText(payload.value.summary))
const seqText = computed(() => {
  const seq = Number(payload.value.seq)
  return Number.isFinite(seq) ? String(Math.floor(seq)) : '-'
})
const turnIdText = computed(() => normalizeText(payload.value.turnId))
const sessionIdText = computed(() => normalizeText(payload.value.sessionId))
const eventTypeText = computed(() => normalizeText(payload.value.eventType))
</script>

<template>
  <div class="PilotRunEventCard fake-background" :class="statusClass">
    <header class="PilotRunEventCard-Header">
      <div class="left">
        <i class="i-carbon-flow-stream" />
        <strong>{{ payload.title || cardTypeLabel }}</strong>
      </div>
      <div class="right">
        <span class="card-type">{{ cardTypeLabel }}</span>
        <span class="status">{{ statusText }}</span>
      </div>
    </header>

    <p v-if="summaryText" class="summary">
      {{ summaryText }}
    </p>

    <dl v-if="detailRows.length > 0" class="details">
      <template v-for="(item, index) in detailRows" :key="`${item.label}-${index}`">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value }}</dd>
      </template>
    </dl>

    <pre v-if="payload.cardType === 'thinking' && thinkingText" class="thinking">{{ thinkingText }}</pre>

    <footer class="PilotRunEventCard-Footer">
      <span>seq: {{ seqText }}</span>
      <span v-if="turnIdText">turn: {{ turnIdText }}</span>
      <span v-if="sessionIdText">session: {{ sessionIdText }}</span>
      <span v-if="eventTypeText">event: {{ eventTypeText }}</span>
    </footer>
  </div>
</template>

<style lang="scss" scoped>
.PilotRunEventCard {
  min-width: min(560px, 72vw);
  max-width: min(760px, 86vw);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-bg-color-page) 96%, transparent);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.PilotRunEventCard-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
}

.card-type,
.status {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 70%, transparent);
}

.summary {
  margin: 0;
  font-size: 13px;
}

.details {
  margin: 0;
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 6px 10px;
  font-size: 12px;

  dt {
    color: var(--el-text-color-secondary);
  }

  dd {
    margin: 0;
    word-break: break-word;
  }
}

.thinking {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 70%, transparent);
  padding: 10px;
  background: color-mix(in srgb, var(--el-bg-color) 96%, transparent);
  white-space: pre-wrap;
  font-size: 12px;
  line-height: 1.5;
}

.PilotRunEventCard-Footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.PilotRunEventCard.is-running {
  border-color: color-mix(in srgb, var(--el-color-primary) 36%, var(--el-border-color));
}

.PilotRunEventCard.is-completed {
  border-color: color-mix(in srgb, var(--el-color-success) 34%, var(--el-border-color));
}

.PilotRunEventCard.is-skipped {
  border-color: color-mix(in srgb, var(--el-color-info) 34%, var(--el-border-color));
}

.PilotRunEventCard.is-failed {
  border-color: color-mix(in srgb, var(--el-color-danger) 34%, var(--el-border-color));
}
</style>
