<script setup lang="ts">
import type { TuffItem } from '@talex-touch/utils'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'

interface IntelligencePayload {
  requestId: string
  prompt: string
  status: 'pending' | 'ready' | 'error'
  answer?: string
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  error?: string
  createdAt: number
}

const props = defineProps<{
  item: TuffItem
  payload?: Record<string, any>
}>()

const { t } = useI18n()
const transport = useTuffTransport()

const aiData = computed<IntelligencePayload>(() => {
  if (props.payload) {
    return props.payload as IntelligencePayload
  }

  const custom = props.item.render?.custom
  if (custom?.data) {
    return custom.data as IntelligencePayload
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

const modelLabel = computed(() =>
  aiData.value.model ? t('coreBox.intelligence.model', { model: aiData.value.model }) : ''
)

const answerHtml = computed(() => {
  if (!aiData.value.answer) {
    return ''
  }
  return formatAnswer(aiData.value.answer)
})

const showUsage = computed(() => usageLabel.value.length > 0)
const showModel = computed(() => modelLabel.value.length > 0)

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

  transport
    .send(ClipboardEvents.write, { type: 'text', value: aiData.value.answer })
    .then(() => {
      toast.success(t('coreBox.intelligence.copySuccess'))
    })
    .catch((error) => {
      console.error('[CoreBox] Failed to copy AI answer:', error)
      toast.error(t('coreBox.intelligence.copyFailed'))
    })
}
</script>

<template>
  <div class="CoreIntelligence">
    <header class="CoreIntelligence__header">
      <div class="CoreIntelligence__icon">🤖</div>
      <div class="CoreIntelligence__headings">
        <div class="CoreIntelligence__prompt">
          {{ formattedPrompt }}
        </div>
        <div class="CoreIntelligence__status">
          {{ statusLabel }}
        </div>
      </div>
      <button v-if="hasAnswer" class="CoreIntelligence__action" type="button" @click="copyAnswer">
        {{ t('coreBox.intelligence.copy') }}
      </button>
    </header>

    <div v-if="hasAnswer" class="CoreIntelligence__answer" v-html="answerHtml" />
    <div v-else-if="isPending" class="CoreIntelligence__placeholder">
      {{ t('coreBox.intelligence.thinking') }}
    </div>
    <div v-else-if="hasError" class="CoreIntelligence__error">
      {{ errorMessage }}
    </div>

    <footer class="CoreIntelligence__footer">
      <span v-if="showModel" class="CoreIntelligence__meta">
        {{ modelLabel }}
      </span>
      <span v-if="showUsage" class="CoreIntelligence__meta">
        {{ usageLabel }}
      </span>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.CoreIntelligence {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 18px;
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.08);
}

.CoreIntelligence__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.CoreIntelligence__icon {
  font-size: 24px;
  line-height: 1;
}

.CoreIntelligence__headings {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.CoreIntelligence__prompt {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.CoreIntelligence__status {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.CoreIntelligence__action {
  border: none;
  background: var(--el-color-primary);
  color: #fff;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 0.9;
  }
}

.CoreIntelligence__answer {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  white-space: normal;
  word-break: break-word;
}

.CoreIntelligence__answer :deep(code) {
  font-family: var(--app-font-mono, 'Fira Code', monospace);
}

.CoreIntelligence__placeholder {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.CoreIntelligence__error {
  font-size: 13px;
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-radius: 12px;
  padding: 10px 12px;
}

.CoreIntelligence__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.CoreIntelligence__meta {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--el-fill-color);
}
</style>
