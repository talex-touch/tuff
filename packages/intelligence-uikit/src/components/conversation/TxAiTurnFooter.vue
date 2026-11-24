<script setup lang="ts">
import { computed } from 'vue'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import type { TxAiTurnFooterProps } from '../../types'
import { calculateTokenSpeed, formatMetricLatency, formatTokenCount, metricLatencyTitle, metricModelTitle, metricTokensTitle, splitTurnModelLabel } from '../../utils/turn-metrics'

defineOptions({ name: 'TxAiTurnFooter' })
const props = withDefaults(defineProps<TxAiTurnFooterProps>(), {
  resting: false, regenerable: false, speakState: 'idle', branchable: false,
  branching: false, showMetrics: true, motion: 'fade', labels: () => ({}),
})
const emit = defineEmits<{ copy: [text: string]; regenerate: []; speak: []; branch: [] }>()
const metricMessage = computed(() => ({ meta: props.metrics }))
const footerLabels = computed<Record<string, string>>(() => ({
  copy: 'Copy', copied: 'Copied', regenerate: 'Regenerate', speak: 'Read aloud',
  speakStop: 'Stop reading', branch: 'Branch from here', model: 'Model',
  provider: 'Provider', reasoning: 'Reasoning',
  coordinator: 'Coordinator', cacheTitle: 'Cached input tokens',
  ...props.labels,
}))
const modelDisplayParts = computed(() =>
  splitTurnModelLabel(props.metrics?.modelLabel || props.metrics?.model || ''),
)
const hasMetrics = computed(() => Boolean(
  props.metrics?.latencyMs
  || props.metrics?.totalTokens
  || props.metrics?.cacheReadTokens
  || props.metrics?.model
  || props.metrics?.modelLabel
  || props.metrics?.coordinator
  || footerLabels.value.coordinatorFallback,
))
</script>

<template>
  <div class="tx-ai-turn-footer" :class="{ 'is-resting': resting }" :data-motion="motion">
    <div class="tx-ai-turn-footer-Row">
      <div class="tx-ai-turn-footer-Bar">
        <TxMessageActions
          class="tx-ai-turn-footer-Actions"
          :appear="motion !== 'none'"
          :regenerable="regenerable"
          :speakable="!!content"
          :speak-state="speakState"
          :copy-label="footerLabels.copy"
          :copied-label="footerLabels.copied"
          :regenerate-label="footerLabels.regenerate"
          :speak-label="footerLabels.speak"
          :stop-speak-label="footerLabels.speakStop"
          @regenerate="emit('regenerate')"
          @speak="emit('speak')"
        >
          <button v-if="content !== undefined" class="tx-message-actions__btn" type="button" :title="footerLabels.copy" :aria-label="footerLabels.copy" @click="emit('copy', content ?? '')">
            <span class="i-ri-file-copy-line" aria-hidden="true" />
          </button>
          <button
            v-if="branchable"
            class="tx-message-actions__btn"
            type="button"
            :disabled="branching"
            :title="footerLabels.branch"
            :aria-label="footerLabels.branch"
            @click="emit('branch')"
          >
            <span class="i-ri-git-branch-line" aria-hidden="true" />
          </button>
        </TxMessageActions>

        <!-- 运行指标徽标栏：耗时、Tokens及生成速度、模型、调度器 -->
        <div
          v-if="showMetrics && hasMetrics"
          class="tx-ai-turn-footer-Metrics"
        >
          <!-- 耗时 (Latency) -->
          <span
            v-if="metrics?.latencyMs"
            class="tx-ai-turn-footer-Tag"
            :title="metricLatencyTitle(metricMessage, footerLabels)"
          >
            <span class="tx-ai-turn-footer-Icon i-ri-time-line" aria-hidden="true" />
            <span>{{ formatMetricLatency(metrics.latencyMs) }}</span>
          </span>

          <!-- Tokens 与 速度 (Tokens & Speed) -->
          <span
            v-if="metrics?.totalTokens"
            class="tx-ai-turn-footer-Tag"
            :title="metricTokensTitle(metricMessage, footerLabels)"
          >
            <span class="tx-ai-turn-footer-Icon i-ri-database-2-line" aria-hidden="true" />
            <span>{{ metrics.totalTokens }} {{ footerLabels.tokensUnit || 'tokens' }}</span>
            <span v-if="calculateTokenSpeed(metricMessage)" class="tx-ai-turn-footer-Speed">({{ calculateTokenSpeed(metricMessage) }} {{ footerLabels.speedUnit || 't/s' }})</span>
          </span>

          <!-- 缓存读取 (Cache read) -->
          <span
            v-if="metrics?.cacheReadTokens"
            class="tx-ai-turn-footer-Tag"
            :title="footerLabels.cacheTitle"
          >
            <span class="tx-ai-turn-footer-Icon i-ri-stack-line" aria-hidden="true" />
            <span>{{ footerLabels.cache ?? `${formatTokenCount(metrics?.cacheReadTokens ?? 0)} cached` }}</span>
          </span>

          <!-- 模型与推理强度 (Model & Reasoning) -->
          <span
            v-if="metrics?.model || metrics?.modelLabel"
            class="tx-ai-turn-footer-Tag tx-ai-turn-footer-Tag--model"
            :title="metricModelTitle(metricMessage, footerLabels)"
          >
            <span class="tx-ai-turn-footer-Icon i-ri-sparkling-line" aria-hidden="true" />
            <span class="tx-ai-turn-footer-ModelText">
              <span v-if="modelDisplayParts.prefix" class="tx-ai-turn-footer-ModelPrefix">{{ modelDisplayParts.prefix }}</span><span>{{ modelDisplayParts.name }}</span><span v-if="metrics?.reasoning" class="tx-ai-turn-footer-Reasoning"> · {{ metrics.reasoning }}</span>
            </span>
          </span>

          <!-- 调度器 (Coordinator) -->
          <span v-if="metrics?.coordinator || footerLabels.coordinatorFallback" class="tx-ai-turn-footer-Tag" :title="footerLabels.coordinator">
            <span class="tx-ai-turn-footer-Icon i-ri-robot-2-line" aria-hidden="true" />
            <span>{{ metrics?.coordinator || footerLabels.coordinatorFallback }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// The action row takes no space until the message is hovered: a resting thread then reads
// as one block of text instead of text with a gap under every turn. `grid-template-rows:
// 0fr → 1fr` animates to the row's *measured* height, so a footer that wraps onto two lines
// still opens fully — a `max-height` guess would either clip it or leave a gap.
.tx-ai-turn-footer {
  display: grid;
  grid-template-rows: 0fr;
  width: 100%;
  // The parent's flex gap is cancelled while folded; the open row gives it back as padding.
  margin-top: calc(-1 * var(--tx-ai-turn-gap, 0px));
  opacity: 0;
  pointer-events: none;
  transition:
    grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}

// The latest completed turn stays open by default (`resting: false`); earlier turns fold
// cleanly and open on hover or keyboard focus. Keep the ancestor hover as a plain
// descendant selector: `:global(…) .x` makes the scoped compiler drop `.x`, so hover never opens it.
.tx-ai-turn-footer:not(.is-resting),
.HomePage-Message:hover .tx-ai-turn-footer,
.tx-ai-message:hover .tx-ai-turn-footer,
.tx-ai-turn:hover .tx-ai-turn-footer,
.tx-ai-turn-footer:focus-within {
  grid-template-rows: 1fr;
  opacity: 1;
  pointer-events: auto;
}

// The row is the grid item that folds to 0. Padding on it would stay as the folded height,
// so the top space sits on the bar inside it.
.tx-ai-turn-footer-Row {
  min-height: 0;
  overflow: hidden;
}

.tx-ai-turn-footer-Bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px 12px;
  flex-wrap: wrap;
  min-width: 0;
  padding-top: calc(var(--tx-ai-turn-gap, 0px) + 4px);
}

.tx-ai-turn-footer-Actions {
  flex: none;
  margin-top: 0;
}

.tx-ai-turn-footer-Metrics {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px 12px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
}

.tx-ai-turn-footer-Tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: 11px;
  font-family: var(--shell-font-mono, monospace);
  line-height: 1.35;
  user-select: none;

  &:hover {
    color: var(--shell-text, var(--tx-text-color-primary));
  }
}

.tx-ai-turn-footer-Icon {
  flex: none;
}

.tx-ai-turn-footer-Tag--model {
  align-items: flex-start;
  user-select: text;

  .tx-ai-turn-footer-Icon {
    margin-top: 1px;
  }
}

.tx-ai-turn-footer-ModelText {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.tx-ai-turn-footer-ModelPrefix {
  opacity: 0.72;
}

.tx-ai-turn-footer-Reasoning {
  white-space: nowrap;
  color: var(--shell-text-secondary, var(--tx-text-color-regular));
}

.tx-ai-turn-footer-Speed {
  color: var(--shell-primary, var(--tx-color-primary));
  font-weight: 500;
  margin-left: 2px;
}
[data-motion='none'] { transition: none; }
@media (prefers-reduced-motion: reduce) { .tx-ai-turn-footer { transition: none; } }
</style>
