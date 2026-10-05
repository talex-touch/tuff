<script lang="ts" setup>
import type {
  EvaluateMemoryInput,
  EvaluateMemoryResult,
  MemoryItem,
  MemoryReplacementInput
} from '@talex-touch/tuff-intelligence'
import type { MemoryScope, MemoryScopeEffect, MemoryType } from './memory-scope'
import type { TxSelectModelValue } from '@talex-touch/tuffex/select'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { TxSelect, TxSelectItem } from '@talex-touch/tuffex/select'
import { TxTextarea } from '@talex-touch/tuffex/textarea'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { computed, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { isMemoryReplaceConflict } from '../../../../../shared/intelligence/memory-errors'
import { useMemoryLabels } from './memory-labels'
import {
  DEFAULT_MEMORY_SCOPE,
  DEFAULT_MEMORY_TYPE,
  MEMORY_SCOPES,
  MEMORY_TYPES,
  memoryScopeEffect
} from './memory-scope'

/**
 * Create a memory, or replace one: form → policy evaluation → explicit save.
 *
 * The evaluation rules are the audit page's memory review, moved here unchanged: editing any
 * field voids the evaluation, only a `suggested` result with a host fingerprint can be saved, and
 * an edit is one atomic `contextReplaceMemory` guarded by the original `updatedAt`, never a save
 * followed by a delete.
 *
 * The list is not this component's any more. A save is reported with `saved` and a lost
 * compare-and-swap with `conflict`; the page reloads, selects, and — when the memory is still
 * there — hands the reloaded copy back through `memory`, which rebases the open draft onto it.
 */
const props = defineProps<{
  /** The memory being replaced; `null` creates a new one. */
  memory: MemoryItem | null
}>()

const emit = defineEmits<{
  saved: [memory: MemoryItem, kind: 'created' | 'replaced']
  conflict: []
  cancel: []
}>()

const { t } = useI18n()
const aiClient = useIntelligenceSdk()
const { typeLabel, scopeLabel, effectLabel } = useMemoryLabels()

const candidateContent = ref('')
const candidateSummary = ref('')
const candidateTags = ref('')
const selectedType = ref<MemoryType>(DEFAULT_MEMORY_TYPE)
const selectedScope = ref<MemoryScope>(DEFAULT_MEMORY_SCOPE)
const editingMemory = ref<MemoryItem | null>(null)
const evaluationResult = ref<EvaluateMemoryResult | null>(null)
/**
 * Shallow on purpose: this object is sent as-is to `contextSaveMemory` / `contextReplaceMemory`,
 * and Electron IPC structured-clones its payload. A deep `ref` hands the SDK a reactive Proxy,
 * which cannot be cloned ("An object could not be cloned"), so no save or replace ever left the
 * renderer (verified 2026-10-03 in a dev instance). It is only ever replaced, never mutated.
 */
const evaluatedReplacement = shallowRef<MemoryReplacementInput | null>(null)
const evaluationInvalidated = ref(false)
const errorMessage = ref('')
const evaluating = ref(false)
const saving = ref(false)

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

/**
 * Each scope says whether a memory saved under it would ever reach a reply. The source session
 * is the edited memory's, which a new memory never has — so for a new one, every scope but
 * `global` reads "not in effect". `label` is what the closed select shows once it is picked; the
 * open list draws the marker as a chip next to the scope name.
 */
const scopeOptions = computed(() =>
  MEMORY_SCOPES.map((scope) => {
    const effect: MemoryScopeEffect = memoryScopeEffect({
      scope,
      sourceSessionId: editingMemory.value?.sourceSessionId
    })
    return {
      scope,
      effect,
      label:
        effect === 'effective'
          ? scopeLabel(scope)
          : t('intelligence.memoryReview.scopeOption', {
              scope: scopeLabel(scope),
              effect: effectLabel(effect)
            })
    }
  })
)

const contentLabelId = useId()

/** Like the native select it replaced: only a different pick counts as an edit. */
function chooseType(value: TxSelectModelValue): void {
  const type = MEMORY_TYPES.find((candidate) => candidate === value)
  if (!type || type === selectedType.value) return
  selectedType.value = type
  invalidateEvaluation()
}

function chooseScope(value: TxSelectModelValue): void {
  const scope = MEMORY_SCOPES.find((candidate) => candidate === value)
  if (!scope || scope === selectedScope.value) return
  selectedScope.value = scope
  invalidateEvaluation()
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
  errorMessage.value = ''
}

function invalidateEvaluation() {
  if (evaluationResult.value) {
    evaluationInvalidated.value = true
  }
  evaluationResult.value = null
  evaluatedReplacement.value = null
  errorMessage.value = ''
}

function resetCandidateEditor() {
  candidateContent.value = ''
  candidateSummary.value = ''
  candidateTags.value = ''
  selectedType.value = DEFAULT_MEMORY_TYPE
  selectedScope.value = DEFAULT_MEMORY_SCOPE
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
  errorMessage.value = ''
}

watch(
  () => props.memory,
  (memory, previous) => {
    if (memory && previous && memory.id === previous.id) {
      // The page reloaded this memory after a replace conflict. Keep the draft, move the
      // compare-and-swap base to the reloaded row, and ask for a fresh evaluation against it;
      // the conflict message stays up to say why.
      editingMemory.value = memory
      evaluationResult.value = null
      evaluatedReplacement.value = null
      evaluationInvalidated.value = false
      return
    }
    if (memory) {
      startEdit(memory)
    } else {
      resetCandidateEditor()
      errorMessage.value = ''
    }
  },
  { immediate: true }
)

/**
 * Optional memory fields come back from the host as `null` once they cross the transport, but the
 * host reads anything other than `undefined` as a value: `createMemoryItem` rejects a `null` TTL as
 * "not a positive duration". Passed through as-is, every save and replace from this form failed
 * (verified 2026-10-03 in a dev instance, for memories without a TTL — all of them). Absent goes
 * back as absent.
 */
function absent<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined
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
    confidence: absent(memory?.confidence),
    sourceSessionId: absent(memory?.sourceSessionId),
    sourceTurnId: absent(memory?.sourceTurnId),
    privacyLevel: absent(memory?.privacyLevel),
    ttl: absent(memory?.ttl)
  }
}

async function handleEvaluate() {
  if (!normalizedContent.value) {
    errorMessage.value = t('intelligence.memoryReview.contentRequired')
    return
  }

  evaluating.value = true
  errorMessage.value = ''
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
          confidence: absent(result.candidate.confidence),
          sourceSessionId: absent(result.candidate.sourceSessionId),
          sourceTurnId: absent(result.candidate.sourceTurnId),
          privacyLevel: absent(result.candidate.privacyLevel),
          ttl: absent(result.candidate.ttl),
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
      toast.success(t('intelligence.memoryReview.replaceSuccess'))
      emit('saved', replaced.memory, 'replaced')
    } else {
      const created = await aiClient.contextSaveMemory(replacement)
      toast.success(t('intelligence.memoryReview.saveSuccess'))
      emit('saved', created, 'created')
    }
    resetCandidateEditor()
  } catch (error) {
    if (editing && isMemoryReplaceConflict(error)) {
      errorMessage.value = t('intelligence.memoryReview.replaceConflict')
      emit('conflict')
    } else {
      errorMessage.value = t('intelligence.memoryReview.saveFailed')
    }
    toast.error(errorMessage.value)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <TxScroll class="memory-editor" data-testid="memory-editor">
    <template #header>
      <header class="memory-editor__header">
        <div class="memory-editor__heading">
          <h2>
            {{
              editingMemory
                ? t('intelligence.memoryReview.editTitle')
                : t('intelligence.memoryReview.newMemory')
            }}
          </h2>
          <p>{{ t('intelligence.memoryReview.panelDescription') }}</p>
        </div>
        <div class="memory-editor__header-actions shell-chrome-safe-inline-end">
          <span class="memory-editor__guard">
            <i class="i-carbon-policy" aria-hidden="true" />
            {{ t('intelligence.memoryReview.manualOnly') }}
          </span>
          <TxButton
            variant="flat"
            size="sm"
            data-testid="memory-review-cancel-edit"
            @click="emit('cancel')"
          >
            {{ t('common.cancel') }}
          </TxButton>
        </div>
      </header>
    </template>

    <div class="memory-editor__body">
      <p v-if="editingMemory" class="memory-editor__editing" data-testid="memory-review-editing">
        {{ t('intelligence.memoryReview.editingId') }}: {{ editingMemory.id }}
      </p>

      <div class="memory-editor__form">
        <!-- TxTextarea's own root is a <label>, so the caption names it by id instead of wrapping it. -->
        <div class="memory-editor__field">
          <span :id="contentLabelId" class="memory-editor__caption">
            {{ t('intelligence.memoryReview.contentLabel') }}
          </span>
          <TxTextarea
            v-model="candidateContent"
            :rows="5"
            :placeholder="t('intelligence.memoryReview.contentPlaceholder')"
            :aria-labelledby="contentLabelId"
            data-testid="memory-review-content"
            @input="invalidateEvaluation"
          />
        </div>

        <div class="memory-editor__inline-fields">
          <label class="memory-editor__field">
            <span class="memory-editor__caption">{{ t('intelligence.memoryReview.summary') }}</span>
            <TxInput
              v-model="candidateSummary"
              :placeholder="t('intelligence.memoryReview.summaryPlaceholder')"
              data-testid="memory-review-summary"
              @input="invalidateEvaluation"
            />
          </label>
          <label class="memory-editor__field">
            <span class="memory-editor__caption">{{ t('intelligence.memoryReview.tags') }}</span>
            <TxInput
              v-model="candidateTags"
              :placeholder="t('intelligence.memoryReview.tagsPlaceholder')"
              data-testid="memory-review-tags"
              @input="invalidateEvaluation"
            />
          </label>
          <label class="memory-editor__field">
            <span class="memory-editor__caption">
              {{ t('intelligence.memoryReview.typeLabel') }}
            </span>
            <TxSelect
              :model-value="selectedType"
              class="memory-editor__select"
              data-testid="memory-review-type"
              @update:model-value="chooseType"
            >
              <TxSelectItem
                v-for="type in MEMORY_TYPES"
                :key="type"
                :value="type"
                :label="typeLabel(type)"
              />
            </TxSelect>
          </label>
          <label class="memory-editor__field">
            <span class="memory-editor__caption">
              {{ t('intelligence.memoryReview.scopeLabel') }}
            </span>
            <TxSelect
              :model-value="selectedScope"
              class="memory-editor__select"
              data-testid="memory-review-scope"
              @update:model-value="chooseScope"
            >
              <TxSelectItem
                v-for="option in scopeOptions"
                :key="option.scope"
                :value="option.scope"
                :label="option.label"
              >
                <span class="memory-editor__option" :data-scope-option="option.scope">
                  <span>{{ scopeLabel(option.scope) }}</span>
                  <span
                    v-if="option.effect !== 'effective'"
                    class="memory-editor__marker"
                    :class="`is-${option.effect}`"
                  >
                    {{ effectLabel(option.effect) }}
                  </span>
                </span>
              </TxSelectItem>
            </TxSelect>
          </label>
        </div>

        <div class="memory-editor__actions">
          <TxButton
            variant="flat"
            type="primary"
            :loading="evaluating"
            :disabled="!canEvaluate"
            data-testid="memory-review-evaluate"
            @click="handleEvaluate"
          >
            <i class="i-carbon-search-locate" aria-hidden="true" />
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
            <i class="i-carbon-save" aria-hidden="true" />
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
            <i class="i-carbon-close" aria-hidden="true" />
            {{ t('intelligence.memoryReview.ignore') }}
          </TxButton>
        </div>
      </div>

      <p v-if="errorMessage" class="memory-editor__message is-error" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="evaluationInvalidated" class="memory-editor__message" role="status">
        {{ t('intelligence.memoryReview.evaluationInvalidated') }}
      </p>

      <div
        v-if="evaluationResult"
        class="memory-editor__result"
        :class="`is-${statusClass}`"
        data-testid="memory-review-result"
      >
        <div class="memory-editor__result-line">
          <strong>{{ memoryStatusLabel(evaluationResult.status) }}</strong>
          <span>{{ memoryReasonLabel(evaluationResult.reason) }}</span>
        </div>
        <div v-if="evaluationResult.candidate" class="memory-editor__candidate">
          <span
            >{{ t('intelligence.memoryReview.summary') }}:
            {{ evaluationResult.candidate.summary }}</span
          >
          <span
            >{{ t('intelligence.memoryReview.typeLabel') }}:
            {{ typeLabel(evaluationResult.candidate.type) }}</span
          >
          <span
            >{{ t('intelligence.memoryReview.scopeLabel') }}:
            {{ scopeLabel(evaluationResult.candidate.scope) }}</span
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
        <p v-if="evaluationResult.status !== 'suggested'" class="memory-editor__message">
          {{ t('intelligence.memoryReview.failClosed') }}
        </p>
      </div>
    </div>
  </TxScroll>
</template>

<style lang="scss" scoped>
.memory-editor {
  height: 100%;
  min-height: 0;
  // The pane's own width decides the layout: the window can be wide while the detail is narrow.
  container-type: inline-size;
}

.memory-editor__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--shell-space-4);
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--shell-border);
  -webkit-app-region: drag;
}

.memory-editor__heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  h2 {
    margin: 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-lg);
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
  }
}

.memory-editor__header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--shell-space-2);
  -webkit-app-region: no-drag;
}

.memory-editor__guard {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-sm);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.memory-editor__body {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-4);
  padding: 20px 24px 32px;
}

.memory-editor__editing {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--shell-primary-border);
  border-radius: var(--shell-radius-sm);
  background: var(--shell-primary-soft);
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-sm);
  overflow-wrap: anywhere;
}

.memory-editor__form {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3);
}

.memory-editor__inline-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-3);
}

.memory-editor__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.memory-editor__caption {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  font-weight: 500;
}

/* TxSelect is a compact 240px by default; in the form grid it takes its column. */
.memory-editor__select {
  width: 100%;
}

.memory-editor__option {
  display: inline-flex;
  align-items: center;
  gap: var(--shell-space-2);
  min-width: 0;
}

.memory-editor__marker {
  padding: 0 8px;
  border-radius: var(--shell-radius-full);
  background: var(--shell-info-soft);
  color: var(--shell-info);
  font-size: var(--shell-fs-caption);
  font-weight: 500;
  line-height: 18px;

  &.is-inactive {
    background: var(--shell-warning-soft);
    color: var(--shell-warning);
  }
}

.memory-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
}

.memory-editor__message {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);

  &.is-error {
    color: var(--shell-danger);
  }
}

.memory-editor__result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: var(--shell-space-3);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface);

  &.is-suggested {
    border-color: var(--shell-success-border);
  }

  &.is-rejected {
    border-color: var(--shell-danger-border);
  }

  &.is-needs_review {
    border-color: var(--shell-warning-border);
  }
}

.memory-editor__result-line {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2);
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);

  span {
    color: var(--shell-text-secondary);
  }
}

.memory-editor__candidate {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-2) var(--shell-space-3);
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  overflow-wrap: anywhere;
}

@container (max-width: 560px) {
  .memory-editor__header {
    flex-direction: column;
  }

  .memory-editor__inline-fields,
  .memory-editor__candidate {
    grid-template-columns: 1fr;
  }
}
</style>
