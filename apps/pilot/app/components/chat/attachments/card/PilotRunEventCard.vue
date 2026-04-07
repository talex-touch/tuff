<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import ShimmerText from '~/components/other/ShimmerText.vue'

const props = defineProps<{
  block: IInnerItemMeta
}>()
const slots = useSlots()

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
const cardType = computed(() => normalizeText(payload.value.cardType).toLowerCase())
const isIntentCard = computed(() => cardType.value === 'intent')
const isRoutingCard = computed(() => cardType.value === 'routing')
const isWebsearchCard = computed(() => cardType.value === 'websearch')

const cardTypeLabel = computed(() => {
  const type = cardType.value
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
const isRunning = computed(() => normalizeText(payload.value.status).toLowerCase() === 'running')

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
  const type = cardType.value
  const row = detail.value

  if (type === 'intent') {
    return rows
  }

  if (type === 'routing') {
    rows.push(
      { label: '请求模型', value: normalizeText(row.modelId) || '-' },
      { label: '实际模型', value: normalizeText(row.providerModel) || '-' },
      { label: '场景', value: normalizeText(row.scene) || '-' },
      { label: '路由组合', value: normalizeText(row.routeComboId) || '-' },
      { label: '渠道', value: normalizeText(row.channelId) || '-' },
      { label: '传输协议', value: normalizeText(row.transport) || '-' },
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
const intentReasonText = computed(() => normalizeText(detail.value.reason))
const websearchReasonText = computed(() => (
  isWebsearchCard.value ? normalizeWebsearchReason(detail.value.reason) : ''
))
const shouldHideLegacyWebsearchCard = computed(() => {
  if (!isWebsearchCard.value) {
    return false
  }
  const rawReason = normalizeText(detail.value.reason).toLowerCase()
  return rawReason === 'intent_not_required' || websearchReasonText.value === '意图判定无需联网'
})
const shouldHideRuntimeCard = computed(() => isRoutingCard.value || shouldHideLegacyWebsearchCard.value)
const displayTitle = computed(() => (
  isIntentCard.value
    ? 'Analyse intent'
    : (payload.value.title || cardTypeLabel.value)
))
const displaySummary = computed(() => (
  isIntentCard.value
    ? ''
    : (isWebsearchCard.value && websearchReasonText.value && summaryText.value === websearchReasonText.value
        ? ''
        : summaryText.value)
))
const hasExtraSlot = computed(() => Boolean(slots.extra))
const hasIntentExtra = computed(() => (
  hasExtraSlot.value || intentReasonText.value.length > 0
))
const manualExpanded = ref<boolean | null>(null)
const defaultExpanded = computed(() => {
  const status = normalizeText(payload.value.status).toLowerCase()
  if (isIntentCard.value) {
    return false
  }
  if (status === 'failed') {
    return true
  }
  return cardType.value === 'thinking'
})
const expanded = computed(() => manualExpanded.value ?? defaultExpanded.value)
const canToggleDetails = computed(() => {
  if (isIntentCard.value) {
    return hasIntentExtra.value
  }
  return detailRows.value.length > 0 || (cardType.value === 'thinking' && thinkingText.value.length > 0) || hasExtraSlot.value
})
const showTags = computed(() => !isIntentCard.value && !isWebsearchCard.value)
const showExtraContent = computed(() => {
  if (!expanded.value) {
    return false
  }
  if (isIntentCard.value) {
    return hasIntentExtra.value
  }
  return hasExtraSlot.value
})
const showDetails = computed(() => expanded.value && !isIntentCard.value && detailRows.value.length > 0)
const showThinking = computed(() => expanded.value && cardType.value === 'thinking' && thinkingText.value.length > 0)
const showFooter = computed(() => expanded.value && !isIntentCard.value)
const showIntentShimmer = computed(() => (
  isIntentCard.value && normalizeText(payload.value.status).toLowerCase() === 'running'
))
const showTitleShimmer = computed(() => (
  showIntentShimmer.value || (isWebsearchCard.value && isRunning.value)
))
const showSummaryShimmer = computed(() => (
  isWebsearchCard.value && isRunning.value && displaySummary.value.length > 0
))
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
  <div v-if="!shouldHideRuntimeCard" class="PilotRunEventCard" :class="statusClass">
    <header class="PilotRunEventCard-Header">
      <div class="left">
        <span class="title">
          <ShimmerText v-if="showTitleShimmer" :text="displayTitle" :active="true" />
          <template v-else>
            {{ displayTitle }}
          </template>
        </span>
      </div>
      <div class="right">
        <button
          v-if="canToggleDetails"
          type="button"
          class="toggle"
          :aria-expanded="expanded ? 'true' : 'false'"
          @click="toggleExpanded"
        >
          <i class="i-carbon-chevron-right" :class="{ expanded }" />
        </button>
        <span v-if="showTags" class="card-type">{{ cardTypeLabel }}</span>
        <span v-if="showTags" class="status">{{ statusText }}</span>
      </div>
    </header>

    <p v-if="displaySummary" class="summary">
      <ShimmerText v-if="showSummaryShimmer" :text="displaySummary" :active="true" />
      <template v-else>
        {{ displaySummary }}
      </template>
    </p>

    <Transition name="pilot-expand">
      <section v-if="showExtraContent" class="extra">
        <slot name="extra" :payload="payload.value" :detail="detail.value">
          <p v-if="isIntentCard && intentReasonText" class="extra-text">
            {{ intentReasonText }}
          </p>
        </slot>
      </section>
    </Transition>

    <Transition name="pilot-expand">
      <dl v-if="showDetails" class="details">
        <template v-for="(item, index) in detailRows" :key="`${item.label}-${index}`">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </template>
      </dl>
    </Transition>

    <Transition name="pilot-expand">
      <pre v-if="showThinking" class="thinking">{{ thinkingText }}</pre>
    </Transition>

    <Transition name="pilot-expand">
      <footer v-if="showFooter" class="PilotRunEventCard-Footer">
        <span>seq: {{ seqText }}</span>
        <span v-if="turnIdText">turn: {{ turnIdText }}</span>
        <span v-if="sessionIdText">session: {{ sessionIdText }}</span>
        <span v-if="eventTypeText">event: {{ eventTypeText }}</span>
      </footer>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.PilotRunEventCard {
  width: fit-content;
  max-width: min(720px, 86vw);
  min-width: 0;
  border-radius: 0;
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: flex-start;
}

.PilotRunEventCard-Header {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  flex-wrap: nowrap;

  .left {
    display: flex;
    align-items: center;
    gap: 0;
    min-width: 0;

    .title {
      display: inline-flex;
      align-items: center;
      font-weight: 400;
      line-height: 1.2;
      white-space: nowrap;
      font-size: 0.94em;
      color: color-mix(in srgb, var(--el-text-color-primary) 72%, transparent);
    }
  }

  .right {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 12px;
    flex-shrink: 0;
  }
}

.toggle {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--el-text-color-secondary) 72%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;

  i {
    font-size: 11px;
    opacity: 0.72;
    transition: transform 0.2s ease;
  }

  i.expanded {
    transform: rotate(90deg);
  }
}

.card-type,
.status {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--el-border-color) 70%, transparent);
  font-weight: 400;
}

.summary {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
}

.extra {
  margin: 0;
  border: 0;
  padding: 0;
  background: transparent;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
  font-weight: 400;
}

.extra-text {
  margin: 0;
  white-space: pre-wrap;
  font-weight: 400;
}

.details {
  margin: 0;
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 6px 10px;
  font-size: 12px;

  dt {
    color: var(--el-text-color-secondary);
    font-weight: 400;
  }

  dd {
    margin: 0;
    word-break: break-word;
    font-weight: 400;
  }
}

.thinking {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  border: 0;
  padding: 0;
  background: transparent;
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
  font-weight: 400;
}

.PilotRunEventCard.is-running {
  border-color: transparent;
}

.PilotRunEventCard.is-completed {
  border-color: transparent;
}

.PilotRunEventCard.is-skipped {
  border-color: transparent;
}

.PilotRunEventCard.is-failed {
  border-color: transparent;
}

.pilot-expand-enter-active,
.pilot-expand-leave-active {
  overflow: hidden;
  transition:
    max-height 0.2s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.pilot-expand-enter-from,
.pilot-expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.pilot-expand-enter-to,
.pilot-expand-leave-from {
  max-height: 420px;
  opacity: 1;
  transform: translateY(0);
}
</style>
