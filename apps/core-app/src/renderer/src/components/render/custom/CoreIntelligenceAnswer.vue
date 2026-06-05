<script setup lang="ts">
import type { TuffItem } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { resolveIntelligenceErrorRecovery } from '~/modules/intelligence/ai-error-recovery'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  resolveIntelligenceMetaChips,
  resolveIntelligenceStatusHint,
  type IntelligencePayload
} from './core-intelligence-answer'

const props = defineProps<{
  item: TuffItem
  payload?: Record<string, unknown>
}>()

const { t } = useI18n()
const transport = useTuffTransport()
const coreIntelligenceLog = createRendererLogger('CoreIntelligenceAnswer')
const copyError = ref('')

const aiData = computed<IntelligencePayload>(() => {
  if (props.payload) {
    return props.payload as unknown as IntelligencePayload
  }

  const custom = props.item.render?.custom
  if (custom?.data) {
    return custom.data as unknown as IntelligencePayload
  }

  return {
    requestId: props.item.id ?? `core-intelligence-${Date.now()}`,
    prompt: props.item.render?.basic?.title ?? '',
    status: 'pending',
    createdAt: Date.now()
  }
})

const formattedPrompt = computed(() => aiData.value.prompt || t('coreBox.intelligence.emptyPrompt'))
const hasAnswer = computed(() => aiData.value.status === 'ready' && !!aiData.value.answer?.length)
const isPending = computed(() => aiData.value.status === 'pending')
const hasError = computed(() => aiData.value.status === 'error')

const statusLabel = computed(() => {
  switch (aiData.value.status) {
    case 'pending':
      return t('coreBox.intelligence.pending')
    case 'ready':
      return t('coreBox.intelligence.ready')
    case 'error':
      return t('coreBox.intelligence.error')
    default:
      return t('coreBox.intelligence.unknown')
  }
})

const errorMessage = computed(() => aiData.value.error || t('coreBox.intelligence.genericError'))

const usageLabel = computed(() => {
  const usage = aiData.value.usage
  if (!usage) {
    return ''
  }

  return t('coreBox.intelligence.usage', {
    total: usage.totalTokens ?? 0,
    prompt: usage.promptTokens ?? 0,
    completion: usage.completionTokens ?? 0
  })
})

const answerHtml = computed(() => {
  if (!aiData.value.answer) {
    return ''
  }
  return formatAnswer(aiData.value.answer)
})

const showUsage = computed(() => usageLabel.value.length > 0)
const metaChips = computed(() => resolveIntelligenceMetaChips(aiData.value, t))
const errorRecovery = computed(() => resolveIntelligenceErrorRecovery(aiData.value, t))
const statusHint = computed(() => resolveIntelligenceStatusHint(aiData.value, t))

watch(
  () => [aiData.value.requestId, aiData.value.status],
  () => {
    copyError.value = ''
  }
)

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAnswer(answer: string): string {
  return escapeHtml(answer).replace(/\n/g, '<br />')
}

function copyAnswer(): void {
  if (!aiData.value.answer) {
    return
  }

  copyError.value = ''
  transport
    .send(ClipboardEvents.write, { type: 'text', value: aiData.value.answer })
    .then(() => {
      copyError.value = ''
      toast.success(t('coreBox.intelligence.copySuccess'))
    })
    .catch((error) => {
      coreIntelligenceLog.error('Failed to copy AI answer:', error)
      copyError.value = t('coreBox.intelligence.copyFailedInline')
      toast.error(t('coreBox.intelligence.copyFailed'))
    })
}
</script>

<template>
  <div class="CoreIntelligence" :class="`is-${statusHint.tone}`">
    <header class="CoreIntelligence__header">
      <div class="CoreIntelligence__icon">
        <i class="i-carbon-machine-learning-model" />
      </div>
      <div class="CoreIntelligence__headings">
        <div class="CoreIntelligence__prompt">
          {{ formattedPrompt }}
        </div>
        <div class="CoreIntelligence__statusRow">
          <span class="CoreIntelligence__status">
            {{ statusHint.label || statusLabel }}
          </span>
          <span class="CoreIntelligence__statusDetail">
            {{ statusHint.detail }}
          </span>
        </div>
      </div>
      <TxButton
        v-if="hasAnswer"
        variant="bare"
        native-type="button"
        class="CoreIntelligence__action"
        @click="copyAnswer"
      >
        {{ t('coreBox.intelligence.copy') }}
      </TxButton>
    </header>

    <div v-if="hasAnswer">
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div class="CoreIntelligence__answer" v-html="answerHtml" />
      <div v-if="copyError" class="CoreIntelligence__inlineError">
        {{ copyError }}
      </div>
    </div>
    <div v-else-if="isPending" class="CoreIntelligence__placeholder">
      <span class="CoreIntelligence__spinner i-ri-loader-4-line" />
      <span>{{ t('coreBox.intelligence.thinking') }}</span>
    </div>
    <div v-else-if="hasError" class="CoreIntelligence__error">
      <strong>{{ errorRecovery.title }}</strong>
      <span>{{ errorRecovery.detail }}</span>
      <small v-if="errorRecovery.code !== 'unknown' && errorMessage !== errorRecovery.detail">
        {{ errorMessage }}
      </small>
    </div>

    <footer class="CoreIntelligence__footer">
      <span v-if="showUsage" class="CoreIntelligence__meta">
        {{ usageLabel }}
      </span>
      <span
        v-for="chip in metaChips"
        :key="`${chip.label}:${chip.value}`"
        class="CoreIntelligence__meta"
      >
        {{ chip.label }}: {{ chip.value }}
      </span>
      <span
        v-if="!showUsage && metaChips.length === 0"
        class="CoreIntelligence__meta CoreIntelligence__meta--muted"
      >
        {{ t('coreBox.intelligence.metaPending', 'Provider metadata pending') }}
      </span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.CoreIntelligence {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  background: var(--tx-bg-color);
  border: 1px solid var(--tx-border-color);
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.CoreIntelligence.is-working {
  border-color: color-mix(in srgb, var(--tx-color-primary) 28%, var(--tx-border-color));
}

.CoreIntelligence.is-success {
  border-color: color-mix(in srgb, var(--tx-color-success) 28%, var(--tx-border-color));
}

.CoreIntelligence.is-danger {
  border-color: color-mix(in srgb, var(--tx-color-danger) 34%, var(--tx-border-color));
}

.CoreIntelligence__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.CoreIntelligence__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-color-primary) 18%, transparent);
  border-radius: 8px;
  font-size: 17px;
  line-height: 1;
}

.CoreIntelligence__headings {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.CoreIntelligence__prompt {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
  line-height: 1.35;
  word-break: break-word;
}

.CoreIntelligence__statusRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.CoreIntelligence__status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color);
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.CoreIntelligence__statusDetail {
  min-width: 0;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
  line-height: 1.35;
}

.CoreIntelligence.is-working .CoreIntelligence__status {
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 10%, transparent);
}

.CoreIntelligence.is-success .CoreIntelligence__status {
  color: var(--tx-color-success);
  background: color-mix(in srgb, var(--tx-color-success) 10%, transparent);
}

.CoreIntelligence.is-danger .CoreIntelligence__status {
  color: var(--tx-color-danger);
  background: color-mix(in srgb, var(--tx-color-danger) 10%, transparent);
}

.CoreIntelligence__action {
  border: none;
  background: var(--tx-color-primary);
  color: #fff;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
}

.CoreIntelligence__answer {
  font-size: 14px;
  line-height: 1.6;
  color: var(--tx-text-color-primary);
  white-space: normal;
  word-break: break-word;
}

.CoreIntelligence__answer :deep(code) {
  font-family: var(--app-font-mono, 'Fira Code', monospace);
}

.CoreIntelligence__placeholder {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.CoreIntelligence__spinner {
  color: var(--tx-color-primary);
  animation: CoreIntelligenceSpin 0.9s linear infinite;
}

.CoreIntelligence__error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--tx-color-danger);
  background: var(--tx-color-danger-light-9);
  border-radius: 12px;
  padding: 10px 12px;
}

.CoreIntelligence__error strong {
  font-size: 13px;
  font-weight: 700;
}

.CoreIntelligence__error span {
  color: var(--tx-text-color-primary);
}

.CoreIntelligence__error small {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  word-break: break-word;
}

.CoreIntelligence__inlineError {
  font-size: 12px;
  color: var(--tx-color-danger);
  background: var(--tx-color-danger-light-9);
  border: 1px solid color-mix(in srgb, var(--tx-color-danger) 18%, transparent);
  border-radius: 10px;
  padding: 8px 10px;
}

.CoreIntelligence__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--tx-text-color-secondary);
}

.CoreIntelligence__meta {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--tx-fill-color);
}

.CoreIntelligence__meta--muted {
  color: color-mix(in srgb, var(--tx-text-color-secondary) 72%, transparent);
}

@keyframes CoreIntelligenceSpin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .CoreIntelligence__spinner {
    animation: none;
  }

  .CoreIntelligence__action {
    transition: none;
  }
}
</style>
