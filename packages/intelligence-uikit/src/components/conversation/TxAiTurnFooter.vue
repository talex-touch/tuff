<script setup lang="ts">
import { computed } from 'vue'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import type { TxAiTurnFooterProps } from '../../types'
import { calculateTokenSpeed, formatMetricLatency, formatTokenCount, metricLatencyTitle, metricTokensTitle } from '../../utils/turn-metrics'

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
  coordinator: 'Coordinator', coordinatorFallback: 'Coordinator', cacheTitle: 'Cached input tokens',
  ...props.labels,
}))
</script>

<template>
  <div class="tx-ai-turn-footer" :class="{ 'is-resting': resting }" :data-motion="motion">
    <div class="tx-ai-turn-footer-Row">
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
        v-if="
          showMetrics &&
            (metrics?.latencyMs || metrics?.model || metrics?.totalTokens)
        "
        class="tx-ai-turn-footer-Metrics"
      >
        <!-- 耗时 (Latency) -->
        <span
          v-if="metrics?.latencyMs"
          class="tx-ai-turn-footer-Tag"
          :title="metricLatencyTitle(metricMessage, footerLabels)"
        >
          <span class="i-ri-time-line" aria-hidden="true" />
          <span>{{ formatMetricLatency(metrics.latencyMs) }}</span>
        </span>

        <!-- Tokens 与 速度 (Tokens & Speed) -->
        <span
          v-if="metrics?.totalTokens"
          class="tx-ai-turn-footer-Tag"
          :title="metricTokensTitle(metricMessage, footerLabels)"
        >
          <span class="i-ri-database-2-line" aria-hidden="true" />
          <span>{{ metrics.totalTokens }} tokens</span>
          <span v-if="calculateTokenSpeed(metricMessage)" class="tx-ai-turn-footer-Speed">({{ calculateTokenSpeed(metricMessage) }} t/s)</span>
        </span>

        <!-- 缓存读取 (Cache read) -->
        <span
          v-if="metrics?.cacheReadTokens"
          class="tx-ai-turn-footer-Tag"
          :title="footerLabels.cacheTitle"
        >
          <span class="i-ri-stack-line" aria-hidden="true" />
          <span>{{ footerLabels.cache ?? `${formatTokenCount(metrics?.cacheReadTokens ?? 0)} cached` }}</span>
        </span>

        <!-- 模型 (Model) -->
        <span
          v-if="metrics?.model"
          class="tx-ai-turn-footer-Tag"
          :title="footerLabels.model"
        >
          <span class="i-ri-sparkling-line" aria-hidden="true" />
          <span>{{ metrics.model }}</span>
        </span>

        <!-- 调度器 (Coordinator) -->
        <span class="tx-ai-turn-footer-Tag" :title="footerLabels.coordinator">
          <span class="i-ri-robot-2-line" aria-hidden="true" />
          <span>{{ metrics?.coordinator || footerLabels.coordinatorFallback }}</span>
        </span>
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
  opacity: 0;
  pointer-events: none;
  transition:
    grid-template-rows 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease;
}

// A turn that just finished stays open for a beat (`is-resting` is what the timer clears);
// hovering or focusing the message opens it at any time.
.tx-ai-turn-footer:not(.is-resting),
:global(.HomePage-Message:hover) .tx-ai-turn-footer,
:global(.tx-ai-turn:hover) .tx-ai-turn-footer,
.tx-ai-turn-footer:focus-within {
  grid-template-rows: 1fr;
  opacity: 1;
  pointer-events: auto;
}

.tx-ai-turn-footer-Row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 0;
  overflow: hidden;
  padding-top: 4px;
}

.tx-ai-turn-footer-Actions {
  margin-top: 0;
}

.tx-ai-turn-footer-Metrics {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.tx-ai-turn-footer-Tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: 11px;
  font-family: var(--shell-font-mono, monospace);
  line-height: 1.2;
  user-select: none;
  transition: color 0.15s ease;

  &:hover {
    color: var(--shell-text, var(--tx-text-color-primary));
  }
}

.tx-ai-turn-footer-Speed {
  color: var(--shell-primary, var(--tx-color-primary));
  font-weight: 500;
  margin-left: 2px;
}
[data-motion='none'] { transition: none; }
@media (prefers-reduced-motion: reduce) { .tx-ai-turn-footer { transition: none; } }
</style>
