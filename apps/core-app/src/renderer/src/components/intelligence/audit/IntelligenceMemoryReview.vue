<script lang="ts" setup>
import { TxButton } from '@talex-touch/tuffex/button'
import {
  createIntelligenceClient,
  type EvaluateMemoryResult,
  type MemoryItem,
  type MemoryUpsertInput
} from '@talex-touch/tuff-intelligence'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

type MemoryType = MemoryItem['type']
type MemoryScope = MemoryItem['scope']

const { t } = useI18n()
const aiClient = createIntelligenceClient(useTuffTransport())

const memoryTypes: MemoryType[] = ['preference', 'project', 'task', 'knowledge', 'temporary']
const memoryScopes: MemoryScope[] = ['session', 'project', 'workspace', 'global']

const candidateContent = ref('')
const selectedType = ref<MemoryType>('temporary')
const selectedScope = ref<MemoryScope>('session')
const evaluationResult = ref<EvaluateMemoryResult | null>(null)
const evaluatedContent = ref('')
const savedMemory = ref<MemoryItem | null>(null)
const errorMessage = ref('')
const evaluating = ref(false)
const saving = ref(false)
const memories = ref<MemoryItem[]>([])
const loadingMemories = ref(false)
const deletingMemoryId = ref<string | null>(null)
const togglingMemoryId = ref<string | null>(null)

const normalizedContent = computed(() => candidateContent.value.trim())
const contentChangedAfterEvaluation = computed(
  () => Boolean(evaluationResult.value) && normalizedContent.value !== evaluatedContent.value
)
const canEvaluate = computed(() => Boolean(normalizedContent.value) && !evaluating.value)
const canSave = computed(
  () =>
    evaluationResult.value?.status === 'suggested' &&
    Boolean(evaluationResult.value.candidate) &&
    !contentChangedAfterEvaluation.value &&
    !saving.value
)

const statusClass = computed(() => evaluationResult.value?.status ?? 'idle')

function memoryTypeLabel(type: MemoryType): string {
  return t(`intelligence.memoryReview.types.${type}`)
}

function memoryScopeLabel(scope: MemoryScope): string {
  return t(`intelligence.memoryReview.scopes.${scope}`)
}

function memoryStatusLabel(status: EvaluateMemoryResult['status']): string {
  return t(`intelligence.memoryReview.status.${status}`)
}

function memoryReasonLabel(reason: string): string {
  const knownReasons = new Set([
    'empty_content',
    'user_opt_out',
    'secret_detected',
    'sensitive_content',
    'explicit_memory_candidate'
  ])
  return knownReasons.has(reason) ? t(`intelligence.memoryReview.reasons.${reason}`) : reason
}

function clearResult() {
  evaluationResult.value = null
  evaluatedContent.value = ''
  savedMemory.value = null
  errorMessage.value = ''
}

async function loadMemories() {
  loadingMemories.value = true
  try {
    const result = await aiClient.contextListMemories({ includeDisabled: true, limit: 20 })
    memories.value = result.memories
  } catch {
    errorMessage.value = t('intelligence.memoryReview.loadFailed')
    toast.error(errorMessage.value)
  } finally {
    loadingMemories.value = false
  }
}

async function handleEvaluate() {
  if (!normalizedContent.value) {
    errorMessage.value = t('intelligence.memoryReview.contentRequired')
    return
  }

  evaluating.value = true
  errorMessage.value = ''
  savedMemory.value = null
  try {
    const content = normalizedContent.value
    evaluationResult.value = await aiClient.contextEvaluateMemory({
      content,
      type: selectedType.value,
      scope: selectedScope.value
    })
    evaluatedContent.value = content
  } catch {
    errorMessage.value = t('intelligence.memoryReview.evaluateFailed')
    toast.error(errorMessage.value)
  } finally {
    evaluating.value = false
  }
}

async function handleSave() {
  const result = evaluationResult.value
  if (!canSave.value || !result?.candidate) {
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    const candidate = result.candidate
    const payload: MemoryUpsertInput = {
      type: candidate.type,
      scope: candidate.scope,
      content: evaluatedContent.value,
      summary: candidate.summary,
      tags: candidate.tags,
      confidence: candidate.confidence,
      sourceSessionId: candidate.sourceSessionId,
      sourceTurnId: candidate.sourceTurnId,
      privacyLevel: candidate.privacyLevel,
      ttl: candidate.ttl,
      enabled: true
    }
    savedMemory.value = await aiClient.contextSaveMemory(payload)
    await loadMemories()
    toast.success(t('intelligence.memoryReview.saveSuccess'))
  } catch {
    errorMessage.value = t('intelligence.memoryReview.saveFailed')
    toast.error(errorMessage.value)
  } finally {
    saving.value = false
  }
}

async function handleToggleEnabled(memory: MemoryItem) {
  togglingMemoryId.value = memory.id
  errorMessage.value = ''
  try {
    const enabled = !memory.enabled
    await aiClient.contextSetMemoryEnabled({
      memoryId: memory.id,
      enabled
    })
    memories.value = memories.value.map((item) =>
      item.id === memory.id ? { ...item, enabled } : item
    )
    toast.success(
      enabled
        ? t('intelligence.memoryReview.enableSuccess')
        : t('intelligence.memoryReview.disableSuccess')
    )
  } catch {
    errorMessage.value = t('intelligence.memoryReview.toggleFailed')
    toast.error(errorMessage.value)
  } finally {
    togglingMemoryId.value = null
  }
}

async function handleDelete(memory: MemoryItem) {
  deletingMemoryId.value = memory.id
  errorMessage.value = ''
  try {
    await aiClient.contextDeleteMemory({
      memoryId: memory.id,
      reason: 'user-memory-review-delete'
    })
    memories.value = memories.value.filter((item) => item.id !== memory.id)
    toast.success(t('intelligence.memoryReview.deleteSuccess'))
  } catch {
    errorMessage.value = t('intelligence.memoryReview.deleteFailed')
    toast.error(errorMessage.value)
  } finally {
    deletingMemoryId.value = null
  }
}

onMounted(() => {
  void loadMemories()
})
</script>

<template>
  <section class="memory-review" aria-labelledby="memory-review-title">
    <div class="memory-review__header">
      <div>
        <h3 id="memory-review-title">{{ t('intelligence.memoryReview.panelTitle') }}</h3>
        <p>{{ t('intelligence.memoryReview.panelDescription') }}</p>
      </div>
      <span class="memory-review__guard">
        <i class="i-carbon-policy" />
        {{ t('intelligence.memoryReview.manualOnly') }}
      </span>
    </div>

    <div class="memory-review__form">
      <label class="memory-review__field memory-review__field--content">
        <span>{{ t('intelligence.memoryReview.contentLabel') }}</span>
        <textarea
          v-model="candidateContent"
          data-testid="memory-review-content"
          :placeholder="t('intelligence.memoryReview.contentPlaceholder')"
          rows="5"
          @input="savedMemory = null"
        />
      </label>

      <div class="memory-review__inline-fields">
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.typeLabel') }}</span>
          <select v-model="selectedType" data-testid="memory-review-type" @change="clearResult">
            <option v-for="type in memoryTypes" :key="type" :value="type">
              {{ memoryTypeLabel(type) }}
            </option>
          </select>
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.scopeLabel') }}</span>
          <select v-model="selectedScope" data-testid="memory-review-scope" @change="clearResult">
            <option v-for="scope in memoryScopes" :key="scope" :value="scope">
              {{ memoryScopeLabel(scope) }}
            </option>
          </select>
        </label>
      </div>

      <div class="memory-review__actions">
        <TxButton
          variant="flat"
          type="primary"
          :loading="evaluating"
          :disabled="!canEvaluate"
          data-testid="memory-review-evaluate"
          @click="handleEvaluate"
        >
          <i class="i-carbon-search-locate" />
          {{ t('intelligence.memoryReview.evaluate') }}
        </TxButton>
        <TxButton
          v-if="evaluationResult?.status === 'suggested'"
          variant="flat"
          type="primary"
          :loading="saving"
          :disabled="!canSave"
          data-testid="memory-review-save"
          @click="handleSave"
        >
          <i class="i-carbon-save" />
          {{ t('intelligence.memoryReview.save') }}
        </TxButton>
        <TxButton
          v-if="evaluationResult"
          variant="flat"
          data-testid="memory-review-ignore"
          @click="clearResult"
        >
          <i class="i-carbon-close" />
          {{ t('intelligence.memoryReview.ignore') }}
        </TxButton>
      </div>
    </div>

    <p v-if="errorMessage" class="memory-review__message memory-review__message--error">
      {{ errorMessage }}
    </p>

    <div
      v-if="evaluationResult"
      class="memory-review__result"
      :class="`memory-review__result--${statusClass}`"
      data-testid="memory-review-result"
    >
      <div class="memory-review__result-line">
        <strong>{{ memoryStatusLabel(evaluationResult.status) }}</strong>
        <span>{{ memoryReasonLabel(evaluationResult.reason) }}</span>
      </div>
      <div v-if="evaluationResult.candidate" class="memory-review__candidate">
        <span
          >{{ t('intelligence.memoryReview.summary') }}:
          {{ evaluationResult.candidate.summary }}</span
        >
        <span>
          {{ t('intelligence.memoryReview.typeLabel') }}:
          {{ memoryTypeLabel(evaluationResult.candidate.type) }}
        </span>
        <span>
          {{ t('intelligence.memoryReview.scopeLabel') }}:
          {{ memoryScopeLabel(evaluationResult.candidate.scope) }}
        </span>
        <span>
          {{ t('intelligence.memoryReview.privacy') }}:
          {{ evaluationResult.candidate.privacyLevel }}
        </span>
        <span>
          {{ t('intelligence.memoryReview.confidence') }}:
          {{ Math.round(evaluationResult.candidate.confidence * 100) }}%
        </span>
        <span v-if="evaluationResult.candidate.tags.length">
          {{ t('intelligence.memoryReview.tags') }}:
          {{ evaluationResult.candidate.tags.join(', ') }}
        </span>
      </div>
      <p v-if="contentChangedAfterEvaluation" class="memory-review__message">
        {{ t('intelligence.memoryReview.contentChanged') }}
      </p>
      <p v-if="evaluationResult.status !== 'suggested'" class="memory-review__message">
        {{ t('intelligence.memoryReview.failClosed') }}
      </p>
    </div>

    <p v-if="savedMemory" class="memory-review__message memory-review__message--success">
      {{ t('intelligence.memoryReview.savedId') }}: {{ savedMemory.id }}
    </p>

    <div class="memory-review__saved" data-testid="memory-review-saved-list">
      <div class="memory-review__saved-header">
        <div>
          <h3>{{ t('intelligence.memoryReview.savedTitle') }}</h3>
          <p>{{ t('intelligence.memoryReview.savedDescription') }}</p>
        </div>
        <TxButton
          variant="flat"
          size="small"
          :loading="loadingMemories"
          data-testid="memory-review-refresh"
          @click="loadMemories"
        >
          <i class="i-carbon-renew" />
          {{ t('common.refresh') }}
        </TxButton>
      </div>

      <div v-if="loadingMemories && memories.length === 0" class="memory-review__empty">
        <i class="i-carbon-circle-dash animate-spin" />
        {{ t('common.loading') }}
      </div>
      <div v-else-if="memories.length === 0" class="memory-review__empty">
        {{ t('intelligence.memoryReview.savedEmpty') }}
      </div>
      <div v-else class="memory-review__saved-list">
        <article
          v-for="memory in memories"
          :key="memory.id"
          class="memory-review__saved-item"
          :class="{ 'memory-review__saved-item--disabled': !memory.enabled }"
        >
          <div class="memory-review__saved-main">
            <strong>
              {{ memory.summary }}
              <span v-if="!memory.enabled" class="memory-review__saved-badge">
                {{ t('intelligence.memoryReview.disabled') }}
              </span>
            </strong>
            <span>
              {{ memoryTypeLabel(memory.type) }} · {{ memoryScopeLabel(memory.scope) }} ·
              {{ t('intelligence.memoryReview.confidence') }}
              {{ Math.round(memory.confidence * 100) }}%
            </span>
            <span v-if="memory.tags.length">
              {{ t('intelligence.memoryReview.tags') }}: {{ memory.tags.join(', ') }}
            </span>
            <span> {{ t('intelligence.memoryReview.usageCount') }}: {{ memory.usageCount }} </span>
          </div>
          <div class="memory-review__saved-actions">
            <TxButton
              variant="flat"
              size="small"
              :loading="togglingMemoryId === memory.id"
              :disabled="togglingMemoryId === memory.id"
              :data-testid="`memory-review-toggle-${memory.id}`"
              @click="handleToggleEnabled(memory)"
            >
              <i :class="memory.enabled ? 'i-carbon-pause' : 'i-carbon-play'" />
              {{
                memory.enabled
                  ? t('intelligence.memoryReview.disable')
                  : t('intelligence.memoryReview.enable')
              }}
            </TxButton>
            <TxButton
              variant="flat"
              type="danger"
              size="small"
              :loading="deletingMemoryId === memory.id"
              :disabled="deletingMemoryId === memory.id"
              :data-testid="`memory-review-delete-${memory.id}`"
              @click="handleDelete(memory)"
            >
              <i class="i-carbon-trash-can" />
              {{ t('intelligence.memoryReview.delete') }}
            </TxButton>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.memory-review {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    h3 {
      margin: 0;
      color: var(--tx-text-color-primary);
      font-size: 15px;
      font-weight: 600;
    }

    p {
      margin: 6px 0 0;
      color: var(--tx-text-color-secondary);
      font-size: 13px;
    }
  }

  &__guard {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    padding: 6px 10px;
    border: 1px solid var(--tx-border-color-lighter);
    border-radius: 6px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__inline-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--tx-text-color-primary);
    font-size: 13px;

    span {
      color: var(--tx-text-color-secondary);
      font-size: 12px;
      font-weight: 500;
    }

    textarea,
    select {
      width: 100%;
      border: 1px solid var(--tx-border-color);
      border-radius: 6px;
      background: var(--tx-fill-color-blank);
      color: var(--tx-text-color-primary);
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;

      &:focus {
        border-color: var(--tx-color-primary);
      }
    }

    textarea {
      min-height: 112px;
      resize: vertical;
      padding: 10px 12px;
      line-height: 1.5;
    }

    select {
      height: 36px;
      padding: 0 10px;
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  &__result {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--tx-border-color-lighter);
    border-radius: 8px;
    background: var(--tx-fill-color-lighter);

    &--suggested {
      border-color: rgba(var(--tx-color-success-rgb), 0.35);
    }

    &--rejected {
      border-color: rgba(var(--tx-color-danger-rgb), 0.35);
    }

    &--needs_review {
      border-color: rgba(var(--tx-color-warning-rgb), 0.35);
    }
  }

  &__result-line {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    color: var(--tx-text-color-primary);
    font-size: 13px;

    span {
      color: var(--tx-text-color-secondary);
    }
  }

  &__candidate {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }

  &__message {
    margin: 0;
    color: var(--tx-text-color-secondary);
    font-size: 12px;

    &--error {
      color: var(--tx-color-danger);
    }

    &--success {
      color: var(--tx-color-success);
    }
  }

  &__saved {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 4px;
  }

  &__saved-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;

    h3 {
      margin: 0;
      color: var(--tx-text-color-primary);
      font-size: 14px;
      font-weight: 600;
    }

    p {
      margin: 4px 0 0;
      color: var(--tx-text-color-secondary);
      font-size: 12px;
    }
  }

  &__empty {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    border: 1px dashed var(--tx-border-color);
    border-radius: 8px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }

  &__saved-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__saved-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--tx-border-color-lighter);
    border-radius: 8px;
    background: var(--tx-fill-color-lighter);

    &--disabled {
      opacity: 0.72;
    }
  }

  &__saved-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;

    strong {
      color: var(--tx-text-color-primary);
      font-size: 13px;
      font-weight: 600;
      overflow-wrap: anywhere;
    }
  }

  &__saved-badge {
    display: inline-flex;
    margin-left: 6px;
    color: var(--tx-text-color-secondary);
    font-size: 11px;
    font-weight: 500;
  }

  &__saved-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
}

@media (max-width: 720px) {
  .memory-review {
    &__header,
    &__saved-header,
    &__saved-item,
    &__inline-fields,
    &__candidate {
      grid-template-columns: 1fr;
    }

    &__header,
    &__saved-header,
    &__saved-item {
      display: grid;
    }
  }
}
</style>
