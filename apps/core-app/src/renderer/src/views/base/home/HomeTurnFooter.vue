<script lang="ts" name="HomeTurnFooter" setup>
import type { SpeakState } from './composables/useReadAloud'
import { TxMessageActions } from '@talex-touch/tuffex/message-actions'
import { useI18n } from 'vue-i18n'
import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import {
  calculateTokenSpeed,
  formatMetricLatency,
  metricCacheLabel,
  metricCacheTitle,
  metricLatencyTitle,
  metricTokensTitle
} from './composables/useTurnMetrics'

/**
 * A settled turn's footer: the actions and the run metrics. It surfaces out of a blur once the
 * answer settles; the latest reply keeps it on show, older ones reveal on hover. The hover rule
 * reads the row it sits in (`.HomePage-Message`), so the footer opens with its message.
 */
defineProps<{
  message: ConversationMessage
  /** Resting footers take no room until the row is hovered or focused. */
  resting: boolean
  /** The latest turn, and nothing is streaming: it can be regenerated. */
  regenerable: boolean
  speakState: SpeakState
  /** A branch can be forked from this turn. */
  branchable: boolean
  branching: boolean
  showMetrics: boolean
}>()

const emit = defineEmits<{
  (event: 'regenerate'): void
  (event: 'speak'): void
  (event: 'branch'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="HomeTurnFooter" :class="{ 'is-resting': resting }">
    <div class="HomeTurnFooter-Row">
      <TxMessageActions
        class="HomeTurnFooter-Actions"
        :copy-text="message.content"
        :regenerable="regenerable"
        :speakable="!!message.content"
        :speak-state="speakState"
        :copy-label="t('home.copy')"
        :copied-label="t('home.copied')"
        :regenerate-label="t('home.regenerate')"
        :speak-label="t('home.speak')"
        :stop-speak-label="t('home.speakStop')"
        @regenerate="emit('regenerate')"
        @speak="emit('speak')"
      >
        <button
          v-if="branchable"
          class="tx-message-actions__btn"
          type="button"
          :disabled="branching"
          :title="t('home.workspace.fork.fromHere')"
          :aria-label="t('home.workspace.fork.fromHere')"
          @click="emit('branch')"
        >
          <span class="i-ri-git-branch-line" aria-hidden="true" />
        </button>
      </TxMessageActions>

      <!-- 运行指标徽标栏：耗时、Tokens及生成速度、模型、调度器 -->
      <div
        v-if="
          showMetrics &&
          (message.meta?.latencyMs || message.meta?.model || message.meta?.totalTokens)
        "
        class="HomeTurnFooter-Metrics"
      >
        <!-- 耗时 (Latency) -->
        <span
          v-if="message.meta?.latencyMs"
          class="HomeTurnFooter-Tag"
          :title="metricLatencyTitle(message)"
        >
          <span class="i-ri-time-line" aria-hidden="true" />
          <span>{{ formatMetricLatency(message.meta.latencyMs) }}</span>
        </span>

        <!-- Tokens 与 速度 (Tokens & Speed) -->
        <span
          v-if="message.meta?.totalTokens"
          class="HomeTurnFooter-Tag"
          :title="metricTokensTitle(message)"
        >
          <span class="i-ri-database-2-line" aria-hidden="true" />
          <span>{{ message.meta.totalTokens }} tokens</span>
          <span v-if="calculateTokenSpeed(message)" class="HomeTurnFooter-Speed"
            >({{ calculateTokenSpeed(message) }} t/s)</span
          >
        </span>

        <!-- 缓存读取 (Cache read) -->
        <span
          v-if="message.meta?.cacheReadTokens"
          class="HomeTurnFooter-Tag"
          :title="metricCacheTitle(message, t)"
        >
          <span class="i-ri-stack-line" aria-hidden="true" />
          <span>{{ metricCacheLabel(message, t) }}</span>
        </span>

        <!-- 模型 (Model) -->
        <span
          v-if="message.meta?.model"
          class="HomeTurnFooter-Tag"
          :title="t('home.workspace.activity.metrics.model')"
        >
          <span class="i-ri-sparkling-line" aria-hidden="true" />
          <span>{{ message.meta.model }}</span>
        </span>

        <!-- 调度器 (Coordinator) -->
        <span class="HomeTurnFooter-Tag" :title="t('home.workspace.activity.metrics.coordinator')">
          <span class="i-ri-robot-2-line" aria-hidden="true" />
          <span>{{ message.meta?.coordinator || 'Tuff Coordinator' }}</span>
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
.HomeTurnFooter {
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
.HomeTurnFooter:not(.is-resting),
.HomePage-Message:hover .HomeTurnFooter,
.HomeTurnFooter:focus-within {
  grid-template-rows: 1fr;
  opacity: 1;
  pointer-events: auto;
}

.HomeTurnFooter-Row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 0;
  overflow: hidden;
  padding-top: 4px;
}

.HomeTurnFooter-Actions {
  margin-top: 0;
}

.HomeTurnFooter-Metrics {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.HomeTurnFooter-Tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-muted);
  font-size: 11px;
  font-family: var(--shell-font-mono, monospace);
  line-height: 1.2;
  user-select: none;
  transition: color 0.15s ease;

  &:hover {
    color: var(--shell-text);
  }
}

.HomeTurnFooter-Speed {
  color: var(--shell-primary);
  font-weight: 500;
  margin-left: 2px;
}
</style>
