<script lang="ts" name="IntelligenceWorkflowPage" setup>
import type { PromptWorkflowExecution } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import { WorkflowValidationError, useWorkflowEditor } from '~/modules/hooks/useWorkflowEditor'

type WorkflowStatus =
  | PromptWorkflowExecution['status']
  | PromptWorkflowExecution['steps'][number]['status']
  | 'not-run'

const { t } = useI18n()

const {
  steps,
  continueOnError,
  executing,
  executionResult,
  executionError,
  validationErrors,
  agentOptions,
  addStep,
  removeStep,
  clearResult,
  resetSteps,
  loadAgents,
  executeWorkflow
} = useWorkflowEditor()

const runResult = computed(() => executionResult.value?.result ?? null)

const workflowStatus = computed<WorkflowStatus>(() => runResult.value?.status ?? 'pending')

const workflowSummaryText = computed(() => {
  switch (workflowStatus.value) {
    case 'completed':
      return t('intelligence.workflow.summaryCompleted')
    case 'failed':
      return t('intelligence.workflow.summaryFailed')
    case 'running':
      return t('intelligence.workflow.summaryRunning')
    case 'cancelled':
      return t('intelligence.workflow.summaryCancelled')
    default:
      return t('intelligence.workflow.summaryPending')
  }
})

const stepResultMap = computed(() => {
  const map = new Map<string, PromptWorkflowExecution['steps'][number]>()
  for (const step of runResult.value?.steps ?? []) {
    map.set(step.stepId, step)
  }
  return map
})

function safeSerializeOutput(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return `[unserializable output: ${reason}]`
  }
}

const displaySteps = computed(() => {
  const hasResult = Boolean(runResult.value)

  return steps.value.map((step, index) => {
    const stepId = step.id.trim() || `step-${index + 1}`
    const stepResult = stepResultMap.value.get(stepId)
    const status: WorkflowStatus = stepResult?.status ?? (hasResult ? 'not-run' : 'pending')

    return {
      uid: step.uid,
      index,
      stepId,
      agentId: step.agentId.trim(),
      status,
      outputText: stepResult?.output === undefined ? '' : safeSerializeOutput(stepResult.output),
      errorText: stepResult?.error || ''
    }
  })
})

const hasUsage = computed(() => {
  const usage = executionResult.value?.usage
  return Boolean(usage && usage.totalTokens > 0)
})

const successCount = computed(() => {
  return runResult.value?.steps.filter((step) => step.status === 'completed').length ?? 0
})

const failedCount = computed(() => {
  return runResult.value?.steps.filter((step) => step.status === 'failed').length ?? 0
})

const notRunCount = computed(() => {
  return displaySteps.value.filter((step) => step.status === 'not-run').length
})

function statusClass(status: WorkflowStatus): string {
  switch (status) {
    case 'completed':
      return 'status-pill status-pill--success'
    case 'failed':
      return 'status-pill status-pill--error'
    case 'running':
      return 'status-pill status-pill--running'
    case 'cancelled':
      return 'status-pill status-pill--warning'
    case 'skipped':
      return 'status-pill status-pill--warning'
    case 'not-run':
      return 'status-pill status-pill--muted'
    default:
      return 'status-pill status-pill--pending'
  }
}

function statusText(status: WorkflowStatus): string {
  switch (status) {
    case 'completed':
      return t('intelligence.workflow.statusCompleted')
    case 'failed':
      return t('intelligence.workflow.statusFailed')
    case 'running':
      return t('intelligence.workflow.statusRunning')
    case 'cancelled':
      return t('intelligence.workflow.statusCancelled')
    case 'skipped':
      return t('intelligence.workflow.statusSkipped')
    case 'not-run':
      return t('intelligence.workflow.statusNotRun')
    default:
      return t('intelligence.workflow.statusPending')
  }
}

function resolveValidationMessage(error: WorkflowValidationError): string {
  const fieldLabelMap: Record<'steps' | 'agentId' | 'input', string> = {
    steps: t('intelligence.workflow.fieldSteps'),
    agentId: t('intelligence.workflow.fieldAgentId'),
    input: t('intelligence.workflow.fieldInput')
  }

  if (error.code === 'min_steps') {
    return t('intelligence.workflow.validationFieldReason', {
      field: fieldLabelMap.steps,
      reason: error.reason
    })
  }

  switch (error.code) {
    case 'agent_required':
      return t('intelligence.workflow.validationFieldReasonAtStep', {
        index: (error.stepIndex ?? 0) + 1,
        field: fieldLabelMap.agentId,
        reason: error.reason
      })
    case 'input_json':
      return t('intelligence.workflow.validationFieldReasonAtStep', {
        index: (error.stepIndex ?? 0) + 1,
        field: fieldLabelMap.input,
        reason: error.reason
      })
    default:
      return t('intelligence.workflow.runFailed')
  }
}

function formatInlineFieldError(field: 'agentId' | 'input', reason: string): string {
  return t('intelligence.workflow.validationFieldReason', {
    field:
      field === 'agentId'
        ? t('intelligence.workflow.fieldAgentId')
        : t('intelligence.workflow.fieldInput'),
    reason
  })
}

async function handleRun(): Promise<void> {
  try {
    await executeWorkflow()
    if (runResult.value?.status === 'failed') {
      toast.error(t('intelligence.workflow.runFailed'))
      return
    }
    toast.success(t('intelligence.workflow.runSuccess'))
  } catch (error) {
    if (error instanceof WorkflowValidationError) {
      toast.error(resolveValidationMessage(error))
      return
    }

    toast.error(error instanceof Error ? error.message : t('intelligence.workflow.runFailed'))
  }
}

function handleRemoveStep(uid: string): void {
  removeStep(uid)
  clearResult()
}

onMounted(async () => {
  try {
    await loadAgents()
  } catch {
    toast.error(t('intelligence.workflow.loadAgentsFailed'))
  }
})
</script>

<template>
  <ViewTemplate :title="t('intelligence.workflow.title')">
    <div class="workflow-page">
      <section class="workflow-editor">
        <div class="panel-header">
          <h2>{{ t('intelligence.workflow.title') }}</h2>
          <p>{{ t('intelligence.workflow.description') }}</p>
        </div>

        <div class="editor-toolbar">
          <label class="continue-option">
            <input v-model="continueOnError" type="checkbox" />
            <span>{{ t('intelligence.workflow.continueOnError') }}</span>
          </label>
          <span class="continue-hint">{{ t('intelligence.workflow.continueOnErrorHint') }}</span>

          <div class="toolbar-actions">
            <TxButton variant="flat" @click="addStep">
              <i class="i-carbon-add" />
              <span>{{ t('intelligence.workflow.addStep') }}</span>
            </TxButton>
            <TxButton variant="flat" @click="resetSteps">
              <i class="i-carbon-reset" />
              <span>{{ t('intelligence.workflow.reset') }}</span>
            </TxButton>
            <TxButton type="primary" :loading="executing" @click="handleRun">
              <i class="i-carbon-play" />
              <span>
                {{
                  executing
                    ? t('intelligence.workflow.executing')
                    : t('intelligence.workflow.execute')
                }}
              </span>
            </TxButton>
          </div>
        </div>

        <div class="steps-editor">
          <article v-for="(step, index) in steps" :key="step.uid" class="step-card">
            <header class="step-header">
              <div class="step-title-wrap">
                <span class="step-title">{{
                  t('intelligence.workflow.stepTitle', { index: index + 1 })
                }}</span>
                <span class="step-id-preview">{{ step.id || `step-${index + 1}` }}</span>
              </div>
              <TxButton
                variant="flat"
                type="danger"
                :disabled="steps.length <= 1"
                @click="handleRemoveStep(step.uid)"
              >
                <i class="i-carbon-trash-can" />
                <span>{{ t('intelligence.workflow.removeStep') }}</span>
              </TxButton>
            </header>

            <div class="step-grid">
              <label class="field">
                <span class="field-label">{{ t('intelligence.workflow.stepId') }}</span>
                <input v-model="step.id" class="field-input" type="text" />
              </label>
              <label class="field">
                <span class="field-label">{{ t('intelligence.workflow.agentId') }}</span>
                <input
                  v-model="step.agentId"
                  class="field-input"
                  type="text"
                  list="workflow-agent-options"
                  :placeholder="t('intelligence.workflow.agentIdPlaceholder')"
                />
                <span v-if="validationErrors[step.uid]?.agentId" class="field-error">
                  {{ formatInlineFieldError('agentId', validationErrors[step.uid].agentId || '') }}
                </span>
              </label>
              <label class="field">
                <span class="field-label">{{ t('intelligence.workflow.stepType') }}</span>
                <select v-model="step.type" class="field-input">
                  <option value="execute">{{ t('intelligence.workflow.typeExecute') }}</option>
                  <option value="plan">{{ t('intelligence.workflow.typePlan') }}</option>
                  <option value="chat">{{ t('intelligence.workflow.typeChat') }}</option>
                </select>
              </label>
            </div>

            <label class="field field--full">
              <span class="field-label">{{ t('intelligence.workflow.inputJson') }}</span>
              <textarea
                v-model="step.input"
                class="field-textarea"
                :placeholder="t('intelligence.workflow.inputPlaceholder')"
                rows="4"
              />
              <span v-if="validationErrors[step.uid]?.input" class="field-error">
                {{ formatInlineFieldError('input', validationErrors[step.uid].input || '') }}
              </span>
            </label>
          </article>
        </div>

        <datalist id="workflow-agent-options">
          <option v-for="agent in agentOptions" :key="agent.id" :value="agent.id">
            {{ agent.name }}
          </option>
        </datalist>
      </section>

      <section class="workflow-result">
        <div class="panel-header">
          <h2>{{ t('intelligence.workflow.resultTitle') }}</h2>
          <p>{{ t('intelligence.workflow.resultDescription') }}</p>
        </div>

        <div class="result-summary">
          <div class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.statusLabel') }}</span>
            <span :class="statusClass(workflowStatus)">{{ workflowSummaryText }}</span>
          </div>
          <div v-if="runResult" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.successCount') }}</span>
            <span class="summary-value">{{ successCount }}</span>
          </div>
          <div v-if="runResult" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.failedCount') }}</span>
            <span class="summary-value">{{ failedCount }}</span>
          </div>
          <div v-if="runResult" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.notRunCount') }}</span>
            <span class="summary-value">{{ notRunCount }}</span>
          </div>
          <div v-if="executionResult?.traceId" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.traceId') }}</span>
            <span class="summary-value">{{ executionResult?.traceId }}</span>
          </div>
          <div v-if="executionResult?.latency !== undefined" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.latency') }}</span>
            <span class="summary-value">{{ executionResult?.latency }}ms</span>
          </div>
          <div v-if="executionResult?.provider" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.provider') }}</span>
            <span class="summary-value">{{ executionResult?.provider }}</span>
          </div>
          <div v-if="executionResult?.model" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.model') }}</span>
            <span class="summary-value">{{ executionResult?.model }}</span>
          </div>
          <div v-if="hasUsage" class="summary-item">
            <span class="summary-label">{{ t('intelligence.workflow.tokens') }}</span>
            <span class="summary-value">{{ executionResult?.usage?.totalTokens }}</span>
          </div>
        </div>

        <p v-if="executionError" class="result-error">{{ executionError }}</p>

        <div class="result-steps">
          <article v-for="step in displaySteps" :key="step.uid" class="result-step-card">
            <header class="result-step-header">
              <div>
                <div class="result-step-title">{{ step.stepId }}</div>
                <div v-if="step.agentId" class="result-step-agent">{{ step.agentId }}</div>
              </div>
              <span :class="statusClass(step.status)">{{ statusText(step.status) }}</span>
            </header>

            <div v-if="step.errorText" class="result-block result-block--error">
              <div class="result-block-title">{{ t('intelligence.workflow.errorLabel') }}</div>
              <pre>{{ step.errorText }}</pre>
            </div>

            <div v-if="step.outputText" class="result-block">
              <div class="result-block-title">{{ t('intelligence.workflow.outputLabel') }}</div>
              <pre>{{ step.outputText }}</pre>
            </div>
          </article>
        </div>
      </section>
    </div>
  </ViewTemplate>
</template>

<style lang="scss" scoped>
.workflow-page {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: start;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
}

.workflow-editor,
.workflow-result {
  background: var(--tx-bg-color);
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  padding: 1rem;
}

.panel-header {
  margin-bottom: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1rem;
    color: var(--tx-text-color-primary);
  }

  p {
    margin: 0.25rem 0 0;
    color: var(--tx-text-color-secondary);
    font-size: 0.8125rem;
  }
}

.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 0.75rem;
  padding: 0.75rem;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter);
  border: 1px solid var(--tx-border-color-lighter);
}

.continue-option {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--tx-text-color-primary);
  font-size: 0.875rem;

  input {
    margin: 0;
  }
}

.continue-hint {
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.steps-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.step-card {
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-fill-color-blank);
  border-radius: 10px;
  padding: 0.75rem;
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.step-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.step-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.step-id-preview {
  font-size: 0.75rem;
  color: var(--tx-text-color-secondary);
}

.step-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field--full {
  margin-top: 0.6rem;
}

.field-label {
  color: var(--tx-text-color-secondary);
  font-size: 0.75rem;
  font-weight: 500;
}

.field-error {
  color: var(--tx-color-error);
  font-size: 0.75rem;
  line-height: 1.4;
}

.field-input,
.field-textarea {
  border-radius: 8px;
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  padding: 0.55rem 0.65rem;
  font-size: 0.8125rem;
  outline: none;

  &:focus {
    border-color: var(--tx-color-primary);
  }
}

.field-textarea {
  resize: vertical;
  min-height: 88px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
}

.result-summary {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-bottom: 0.75rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.summary-item {
  padding: 0.6rem;
  border-radius: 8px;
  background: var(--tx-fill-color-lighter);
  border: 1px solid var(--tx-border-color-lighter);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.summary-label {
  font-size: 0.75rem;
  color: var(--tx-text-color-secondary);
}

.summary-value {
  font-size: 0.8125rem;
  color: var(--tx-text-color-primary);
  word-break: break-all;
}

.result-error {
  margin: 0 0 0.75rem;
  padding: 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--tx-color-error-light-5);
  background: var(--tx-color-error-light-9);
  color: var(--tx-color-error);
  font-size: 0.8125rem;
}

.result-steps {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.result-step-card {
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 10px;
  padding: 0.65rem;
}

.result-step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.result-step-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.result-step-agent {
  font-size: 0.75rem;
  color: var(--tx-text-color-secondary);
}

.result-block {
  padding: 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-fill-color-lighter);

  pre {
    margin: 0;
    font-size: 0.75rem;
    color: var(--tx-text-color-primary);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 220px;
    overflow: auto;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
  }
}

.result-block--error {
  border-color: var(--tx-color-error-light-5);
  background: var(--tx-color-error-light-9);

  pre {
    color: var(--tx-color-error);
  }
}

.result-block-title {
  margin-bottom: 0.35rem;
  font-size: 0.75rem;
  color: var(--tx-text-color-secondary);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.2rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  border: 1px solid transparent;
}

.status-pill--success {
  color: var(--tx-color-success);
  background: var(--tx-color-success-light-9);
  border-color: var(--tx-color-success-light-5);
}

.status-pill--error {
  color: var(--tx-color-error);
  background: var(--tx-color-error-light-9);
  border-color: var(--tx-color-error-light-5);
}

.status-pill--running {
  color: var(--tx-color-primary);
  background: var(--tx-color-primary-light-9);
  border-color: var(--tx-color-primary-light-5);
}

.status-pill--warning {
  color: var(--tx-color-warning);
  background: var(--tx-color-warning-light-9);
  border-color: var(--tx-color-warning-light-5);
}

.status-pill--pending,
.status-pill--muted {
  color: var(--tx-text-color-secondary);
  background: var(--tx-fill-color-lighter);
  border-color: var(--tx-border-color-lighter);
}
</style>
