<script lang="ts" setup>
import type {
  EvaluateMemoryInput,
  EvaluateMemoryResult,
  MemoryItem,
  MemoryListStatus,
  MemoryReplacementInput
} from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

type MemoryType = MemoryItem['type']
type MemoryScope = MemoryItem['scope']

const { t } = useI18n()
const aiClient = useIntelligenceSdk()

const memoryTypes: MemoryType[] = ['preference', 'project', 'task', 'knowledge', 'temporary']
const memoryScopes: MemoryScope[] = ['session', 'project', 'workspace', 'global']
const pageSize = 20

const candidateContent = ref('')
const candidateSummary = ref('')
const candidateTags = ref('')
const selectedType = ref<MemoryType>('temporary')
const selectedScope = ref<MemoryScope>('session')
const editingMemory = ref<MemoryItem | null>(null)
const evaluationResult = ref<EvaluateMemoryResult | null>(null)
const evaluatedReplacement = ref<MemoryReplacementInput | null>(null)
const evaluationInvalidated = ref(false)
const savedMemory = ref<MemoryItem | null>(null)
const errorMessage = ref('')
const evaluating = ref(false)
const saving = ref(false)

const memories = ref<MemoryItem[]>([])
const loadingMemories = ref(false)
const deletingMemoryId = ref<string | null>(null)
const togglingMemoryId = ref<string | null>(null)
const searchQuery = ref('')
const filterType = ref<MemoryType | ''>('')
const filterScope = ref<MemoryScope | ''>('')
const filterStatus = ref<MemoryListStatus>('all')
const listOffset = ref(0)
const hasMoreMemories = ref(false)

const normalizedContent = computed(() => candidateContent.value.trim())
const canEvaluate = computed(
  () => Boolean(normalizedContent.value) && !evaluating.value && !saving.value
)
const canSave = computed(
  () =>
    evaluationResult.value?.status === 'suggested' &&
    Boolean(evaluationResult.value.candidate) &&
    Boolean(evaluationResult.value.fingerprint) &&
    Boolean(evaluatedReplacement.value) &&
    !saving.value
)
const statusClass = computed(() => evaluationResult.value?.status ?? 'idle')
const currentPage = computed(() => Math.floor(listOffset.value / pageSize) + 1)

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

function formatTimestamp(value?: number): string {
  if (!value) {
    return t('intelligence.memoryReview.notAvailable')
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(value)
}

function parseTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  )
}

function clearResult() {
  evaluationResult.value = null
  evaluatedReplacement.value = null
  evaluationInvalidated.value = false
  savedMemory.value = null
  errorMessage.value = ''
}

function invalidateEvaluation() {
  if (evaluationResult.value) {
    evaluationInvalidated.value = true
  }
  evaluationResult.value = null
  evaluatedReplacement.value = null
  savedMemory.value = null
  errorMessage.value = ''
}

function resetCandidateEditor() {
  candidateContent.value = ''
  candidateSummary.value = ''
  candidateTags.value = ''
  selectedType.value = 'temporary'
  selectedScope.value = 'session'
  editingMemory.value = null
  evaluationResult.value = null
  evaluatedReplacement.value = null
  evaluationInvalidated.value = false
}

function startEdit(memory: MemoryItem) {
  editingMemory.value = memory
  candidateContent.value = memory.content
  candidateSummary.value = memory.summary
  candidateTags.value = memory.tags.join(', ')
  selectedType.value = memory.type
  selectedScope.value = memory.scope
  evaluationResult.value = null
  evaluatedReplacement.value = null
  evaluationInvalidated.value = false
  savedMemory.value = null
  errorMessage.value = ''
}

function cancelEdit() {
  resetCandidateEditor()
  savedMemory.value = null
  errorMessage.value = ''
}

function buildEvaluationInput(): EvaluateMemoryInput {
  const summary = candidateSummary.value.trim()
  const tags = parseTags(candidateTags.value)
  const memory = editingMemory.value
  return {
    content: normalizedContent.value,
    type: selectedType.value,
    scope: selectedScope.value,
    summary: summary || undefined,
    tags: tags.length > 0 ? tags : undefined,
    confidence: memory?.confidence,
    sourceSessionId: memory?.sourceSessionId,
    sourceTurnId: memory?.sourceTurnId,
    privacyLevel: memory?.privacyLevel,
    ttl: memory?.ttl
  }
}

async function loadMemories() {
  loadingMemories.value = true
  try {
    const result = await aiClient.contextListMemories({
      query: searchQuery.value.trim() || undefined,
      type: filterType.value || undefined,
      scope: filterScope.value || undefined,
      status: filterStatus.value,
      offset: listOffset.value,
      limit: pageSize
    })
    memories.value = result.memories
    hasMoreMemories.value = result.hasMore ?? false
  } catch {
    errorMessage.value = t('intelligence.memoryReview.loadFailed')
    toast.error(errorMessage.value)
  } finally {
    loadingMemories.value = false
  }
}

function applyFilters() {
  listOffset.value = 0
  void loadMemories()
}

function showPreviousPage() {
  if (listOffset.value === 0 || loadingMemories.value) return
  listOffset.value = Math.max(0, listOffset.value - pageSize)
  void loadMemories()
}

function showNextPage() {
  if (!hasMoreMemories.value || loadingMemories.value) return
  listOffset.value += pageSize
  void loadMemories()
}

async function handleEvaluate() {
  if (!normalizedContent.value) {
    errorMessage.value = t('intelligence.memoryReview.contentRequired')
    return
  }

  evaluating.value = true
  errorMessage.value = ''
  savedMemory.value = null
  evaluationInvalidated.value = false
  try {
    const input = buildEvaluationInput()
    const result = await aiClient.contextEvaluateMemory(input)
    evaluationResult.value = result
    evaluatedReplacement.value = result.candidate
      ? {
          type: result.candidate.type,
          scope: result.candidate.scope,
          content: input.content,
          summary: result.candidate.summary,
          tags: result.candidate.tags,
          confidence: result.candidate.confidence,
          sourceSessionId: result.candidate.sourceSessionId,
          sourceTurnId: result.candidate.sourceTurnId,
          privacyLevel: result.candidate.privacyLevel,
          ttl: result.candidate.ttl,
          enabled: true
        }
      : null
  } catch {
    errorMessage.value = t('intelligence.memoryReview.evaluateFailed')
    toast.error(errorMessage.value)
  } finally {
    evaluating.value = false
  }
}

async function handleSave() {
  const result = evaluationResult.value
  const replacement = evaluatedReplacement.value
  const editing = editingMemory.value
  if (!canSave.value || !result?.fingerprint || !replacement) {
    return
  }

  saving.value = true
  errorMessage.value = ''
  try {
    if (editing) {
      const replaced = await aiClient.contextReplaceMemory({
        memoryId: editing.id,
        expectedUpdatedAt: editing.updatedAt,
        evaluationFingerprint: result.fingerprint,
        replacement
      })
      savedMemory.value = replaced.memory
      toast.success(t('intelligence.memoryReview.replaceSuccess'))
    } else {
      savedMemory.value = await aiClient.contextSaveMemory(replacement)
      toast.success(t('intelligence.memoryReview.saveSuccess'))
    }
    await loadMemories()
    resetCandidateEditor()
  } catch (error) {
    if (editing && String(error).includes('MEMORY_REPLACE_CONFLICT')) {
      errorMessage.value = t('intelligence.memoryReview.replaceConflict')
      await loadMemories()
    } else {
      errorMessage.value = t('intelligence.memoryReview.saveFailed')
    }
    toast.error(errorMessage.value)
  } finally {
    saving.value = false
  }
}

async function handleToggleEnabled(memory: MemoryItem) {
  if (togglingMemoryId.value) return
  togglingMemoryId.value = memory.id
  errorMessage.value = ''
  try {
    const enabled = !memory.enabled
    const result = await aiClient.contextSetMemoryEnabled({
      memoryId: memory.id,
      enabled
    })
    memories.value = memories.value.map((item) =>
      item.id === memory.id ? { ...item, enabled, updatedAt: result.updatedAt } : item
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
  if (deletingMemoryId.value) return
  deletingMemoryId.value = memory.id
  errorMessage.value = ''
  try {
    await aiClient.contextDeleteMemory({
      memoryId: memory.id,
      reason: 'user-memory-review-delete'
    })
    memories.value = memories.value.filter((item) => item.id !== memory.id)
    if (editingMemory.value?.id === memory.id) {
      resetCandidateEditor()
    }
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
        <h3 id="memory-review-title">
          {{
            editingMemory
              ? t('intelligence.memoryReview.editTitle')
              : t('intelligence.memoryReview.panelTitle')
          }}
        </h3>
        <p>{{ t('intelligence.memoryReview.panelDescription') }}</p>
      </div>
      <span class="memory-review__guard">
        <i class="i-carbon-policy" />
        {{ t('intelligence.memoryReview.manualOnly') }}
      </span>
    </div>

    <div v-if="editingMemory" class="memory-review__editing" data-testid="memory-review-editing">
      <span>{{ t('intelligence.memoryReview.editingId') }}: {{ editingMemory.id }}</span>
      <TxButton
        variant="flat"
        size="small"
        data-testid="memory-review-cancel-edit"
        @click="cancelEdit"
      >
        {{ t('common.cancel') }}
      </TxButton>
    </div>

    <div class="memory-review__form">
      <label class="memory-review__field memory-review__field--content">
        <span>{{ t('intelligence.memoryReview.contentLabel') }}</span>
        <textarea
          v-model="candidateContent"
          data-testid="memory-review-content"
          :placeholder="t('intelligence.memoryReview.contentPlaceholder')"
          rows="5"
          @input="invalidateEvaluation"
        />
      </label>

      <div class="memory-review__inline-fields">
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.summary') }}</span>
          <input
            v-model="candidateSummary"
            data-testid="memory-review-summary"
            :placeholder="t('intelligence.memoryReview.summaryPlaceholder')"
            @input="invalidateEvaluation"
          />
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.tags') }}</span>
          <input
            v-model="candidateTags"
            data-testid="memory-review-tags"
            :placeholder="t('intelligence.memoryReview.tagsPlaceholder')"
            @input="invalidateEvaluation"
          />
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.typeLabel') }}</span>
          <select
            v-model="selectedType"
            data-testid="memory-review-type"
            @change="invalidateEvaluation"
          >
            <option v-for="type in memoryTypes" :key="type" :value="type">
              {{ memoryTypeLabel(type) }}
            </option>
          </select>
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.scopeLabel') }}</span>
          <select
            v-model="selectedScope"
            data-testid="memory-review-scope"
            @change="invalidateEvaluation"
          >
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
          {{
            editingMemory
              ? t('intelligence.memoryReview.replace')
              : t('intelligence.memoryReview.save')
          }}
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
    <p v-if="evaluationInvalidated" class="memory-review__message">
      {{ t('intelligence.memoryReview.evaluationInvalidated') }}
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
        <span
          >{{ t('intelligence.memoryReview.typeLabel') }}:
          {{ memoryTypeLabel(evaluationResult.candidate.type) }}</span
        >
        <span
          >{{ t('intelligence.memoryReview.scopeLabel') }}:
          {{ memoryScopeLabel(evaluationResult.candidate.scope) }}</span
        >
        <span
          >{{ t('intelligence.memoryReview.privacy') }}:
          {{ evaluationResult.candidate.privacyLevel }}</span
        >
        <span
          >{{ t('intelligence.memoryReview.confidence') }}:
          {{ Math.round(evaluationResult.candidate.confidence * 100) }}%</span
        >
        <span v-if="evaluationResult.candidate.tags.length">
          {{ t('intelligence.memoryReview.tags') }}:
          {{ evaluationResult.candidate.tags.join(', ') }}
        </span>
      </div>
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

      <div class="memory-review__filters">
        <label class="memory-review__field memory-review__filter-query">
          <span>{{ t('intelligence.memoryReview.searchLabel') }}</span>
          <input
            v-model="searchQuery"
            data-testid="memory-review-search"
            :placeholder="t('intelligence.memoryReview.searchPlaceholder')"
            @keyup.enter="applyFilters"
          />
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.typeLabel') }}</span>
          <select v-model="filterType" data-testid="memory-review-filter-type">
            <option value="">{{ t('intelligence.memoryReview.filterAll') }}</option>
            <option v-for="type in memoryTypes" :key="type" :value="type">
              {{ memoryTypeLabel(type) }}
            </option>
          </select>
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.scopeLabel') }}</span>
          <select v-model="filterScope" data-testid="memory-review-filter-scope">
            <option value="">{{ t('intelligence.memoryReview.filterAll') }}</option>
            <option v-for="scope in memoryScopes" :key="scope" :value="scope">
              {{ memoryScopeLabel(scope) }}
            </option>
          </select>
        </label>
        <label class="memory-review__field">
          <span>{{ t('intelligence.memoryReview.memoryStatus') }}</span>
          <select v-model="filterStatus" data-testid="memory-review-filter-status">
            <option value="all">{{ t('intelligence.memoryReview.filterAll') }}</option>
            <option value="enabled">{{ t('intelligence.memoryReview.enabled') }}</option>
            <option value="disabled">{{ t('intelligence.memoryReview.disabled') }}</option>
          </select>
        </label>
        <TxButton
          variant="flat"
          size="small"
          data-testid="memory-review-apply-filters"
          @click="applyFilters"
        >
          <i class="i-carbon-filter" />
          {{ t('intelligence.memoryReview.applyFilters') }}
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
            <p class="memory-review__saved-content">
              {{ memory.content }}
            </p>
            <span>
              {{ memoryTypeLabel(memory.type) }} · {{ memoryScopeLabel(memory.scope) }} ·
              {{ t('intelligence.memoryReview.confidence') }}
              {{ Math.round(memory.confidence * 100) }}%
            </span>
            <span v-if="memory.tags.length">
              {{ t('intelligence.memoryReview.tags') }}: {{ memory.tags.join(', ') }}
            </span>
            <dl class="memory-review__audit">
              <div>
                <dt>{{ t('intelligence.memoryReview.sourceSession') }}</dt>
                <dd>{{ memory.sourceSessionId || t('intelligence.memoryReview.notAvailable') }}</dd>
              </div>
              <div>
                <dt>{{ t('intelligence.memoryReview.sourceTurn') }}</dt>
                <dd>{{ memory.sourceTurnId || t('intelligence.memoryReview.notAvailable') }}</dd>
              </div>
              <div>
                <dt>{{ t('intelligence.memoryReview.privacy') }}</dt>
                <dd>{{ memory.privacyLevel }}</dd>
              </div>
              <div>
                <dt>{{ t('intelligence.memoryReview.createdAt') }}</dt>
                <dd>{{ formatTimestamp(memory.createdAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('intelligence.memoryReview.updatedAt') }}</dt>
                <dd>{{ formatTimestamp(memory.updatedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('intelligence.memoryReview.lastUsedAt') }}</dt>
                <dd>{{ formatTimestamp(memory.lastUsedAt) }}</dd>
              </div>
              <div>
                <dt>{{ t('intelligence.memoryReview.usageCount') }}</dt>
                <dd>{{ memory.usageCount }}</dd>
              </div>
              <div v-if="memory.replacesMemoryId">
                <dt>{{ t('intelligence.memoryReview.replacesMemory') }}</dt>
                <dd>{{ memory.replacesMemoryId }}</dd>
              </div>
            </dl>
          </div>
          <div class="memory-review__saved-actions">
            <TxButton
              variant="flat"
              size="small"
              :data-testid="`memory-review-edit-${memory.id}`"
              @click="startEdit(memory)"
            >
              <i class="i-carbon-edit" />
              {{ t('intelligence.memoryReview.edit') }}
            </TxButton>
            <TxButton
              variant="flat"
              size="small"
              :loading="togglingMemoryId === memory.id"
              :disabled="Boolean(togglingMemoryId)"
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
              :disabled="Boolean(deletingMemoryId)"
              :data-testid="`memory-review-delete-${memory.id}`"
              @click="handleDelete(memory)"
            >
              <i class="i-carbon-trash-can" />
              {{ t('intelligence.memoryReview.delete') }}
            </TxButton>
          </div>
        </article>
      </div>

      <div class="memory-review__pagination">
        <TxButton
          variant="flat"
          size="small"
          :disabled="listOffset === 0 || loadingMemories"
          data-testid="memory-review-page-previous"
          @click="showPreviousPage"
        >
          {{ t('intelligence.memoryReview.previous') }}
        </TxButton>
        <span>{{ t('intelligence.memoryReview.page', { page: currentPage }) }}</span>
        <TxButton
          variant="flat"
          size="small"
          :disabled="!hasMoreMemories || loadingMemories"
          data-testid="memory-review-page-next"
          @click="showNextPage"
        >
          {{ t('intelligence.memoryReview.next') }}
        </TxButton>
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

    input,
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

    input,
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

  &__editing {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid var(--tx-color-primary);
    border-radius: 6px;
    color: var(--tx-text-color-primary);
    font-size: 12px;
  }

  &__filters {
    display: grid;
    grid-template-columns: minmax(180px, 2fr) repeat(3, minmax(110px, 1fr)) auto;
    align-items: end;
    gap: 8px;
  }

  &__saved-content {
    margin: 2px 0;
    color: var(--tx-text-color-primary);
    line-height: 1.5;
    white-space: pre-wrap;
  }

  &__audit {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 12px;
    margin: 6px 0 0;

    div {
      min-width: 0;
    }

    dt,
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }

    dt {
      color: var(--tx-text-color-placeholder);
      font-size: 11px;
    }

    dd {
      color: var(--tx-text-color-secondary);
      font-size: 12px;
    }
  }

  &__pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    color: var(--tx-text-color-secondary);
    font-size: 12px;
  }
}

@media (max-width: 720px) {
  .memory-review {
    &__header,
    &__saved-header,
    &__saved-item,
    &__inline-fields,
    &__candidate,
    &__filters,
    &__audit {
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
