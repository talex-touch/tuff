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

function normalizeWebsearchReason(value: unknown): string {
  const reason = normalizeText(value)
  if (!reason) {
    return '-'
  }
  if (reason === 'fallback_unsupported_channel' || reason === 'fallback_endpoint_missing') {
    return '当前通道不支持联网检索，已继续离线回答'
  }
  if (reason === 'tool_failed_or_empty_result') {
    return '未获取到可用外部来源，已继续回答'
  }
  if (reason === 'intent_not_required') {
    return '意图判定无需联网'
  }
  if (reason === 'intent_required') {
    return '意图判定需要联网'
  }
  return reason
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
    return rows
  }

  if (type === 'websearch') {
    const sourceCount = Number(row.sourceCount)
    rows.push(
      { label: '决策', value: row.enabled === true ? 'enabled' : 'disabled' },
      { label: '原因', value: normalizeWebsearchReason(row.reason) },
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
const manualExpanded = ref<boolean | null>(null)
const defaultExpanded = computed(() => {
  const status = normalizeText(payload.value.status).toLowerCase()
  const cardType = normalizeText(payload.value.cardType).toLowerCase()
  if (status === 'failed') {
    return true
  }
  return cardType === 'thinking'
})
const expanded = computed(() => manualExpanded.value ?? defaultExpanded.value)
const canToggleDetails = computed(() => {
  return detailRows.value.length > 0 || (normalizeText(payload.value.cardType) === 'thinking' && thinkingText.value.length > 0)
})
function toggleExpanded() {
  manualExpanded.value = !expanded.value
}
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
        <button
          v-if="canToggleDetails"
          type="button"
          class="toggle"
          @click="toggleExpanded"
        >
          {{ expanded ? '收起' : '详情' }}
        </button>
        <span class="card-type">{{ cardTypeLabel }}</span>
        <span class="status">{{ statusText }}</span>
      </div>
    </header>

    <p v-if="summaryText" class="summary">
      {{ summaryText }}
    </p>

    <dl v-if="expanded && detailRows.length > 0" class="details">
      <template v-for="(item, index) in detailRows" :key="`${item.label}-${index}`">
        <dt>{{ item.label }}</dt>
        <dd>{{ item.value }}</dd>
      </template>
    </dl>

    <pre v-if="expanded && payload.cardType === 'thinking' && thinkingText" class="thinking">{{ thinkingText }}</pre>

    <footer v-if="expanded" class="PilotRunEventCard-Footer">
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

.toggle {
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 70%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  cursor: pointer;
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
