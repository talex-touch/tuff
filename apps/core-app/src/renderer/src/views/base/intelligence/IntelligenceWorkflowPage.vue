<script lang="ts" name="IntelligenceWorkflowPage" setup>
import type { WorkflowStepKind } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import { useWorkflowEditor, WorkflowValidationError } from '~/modules/hooks/useWorkflowEditor'

const { t } = useI18n()

const {
  workflows,
  workflowDraft,
  selectedWorkflowId,
  loading,
  saving,
  running,
  deleting,
  history,
  currentRun,
  executionError,
  agentOptions,
  builtinToolOptions,
  pendingApprovals,
  reviewQueueItems,
  reviewQueueReplaceConfirmId,
  canDeleteCurrent,
  loadAgents,
  loadWorkflows,
  loadHistory,
  selectWorkflow,
  createWorkflowFromScratch,
  addStep,
  removeStep,
  addTrigger,
  removeTrigger,
  updateToolSource,
  saveWorkflow,
  deleteWorkflow,
  runWorkflow,
  resumeCurrentRun,
  inspectRun,
  approveTicket,
  copyReviewItemToClipboard,
  replaceClipboardWithReviewItem,
  dismissReviewItem
} = useWorkflowEditor()

const runStatusText = computed(() => {
  switch (currentRun.value?.status) {
    case 'completed':
      return t('intelligence.workflow.statusCompleted')
    case 'failed':
      return t('intelligence.workflow.statusFailed')
    case 'waiting_approval':
      return t('intelligence.workflow.statusWaitingApproval')
    case 'running':
      return t('intelligence.workflow.statusRunning')
    case 'cancelled':
      return t('intelligence.workflow.statusCancelled')
    default:
      return t('intelligence.workflow.statusNotRun')
  }
})

const runStatusClass = computed(() => {
  switch (currentRun.value?.status) {
    case 'completed':
      return 'status-pill status-pill--success'
    case 'failed':
      return 'status-pill status-pill--error'
    case 'waiting_approval':
      return 'status-pill status-pill--warning'
    case 'running':
      return 'status-pill status-pill--running'
    default:
      return 'status-pill status-pill--muted'
  }
})

const activeStepCount = computed(() => workflowDraft.value.steps.length)

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function formatDate(value?: number): string {
  if (!value) {
    return '-'
  }
  return new Date(value).toLocaleString()
}

function kindLabel(kind: WorkflowStepKind): string {
  if (kind === 'tool') return 'Tool'
  if (kind === 'prompt') return 'Prompt'
  if (kind === 'model') return 'Model'
  return 'Agent'
}

function displayStepKind(kind?: string): string {
  return kindLabel(kind === 'tool' || kind === 'prompt' || kind === 'model' ? kind : 'agent')
}

function workflowStatusText(enabled: boolean): string {
  return enabled === false
    ? t('intelligence.workflow.workflowDisabled')
    : t('intelligence.workflow.workflowEnabled')
}

function stepsCountText(count: number): string {
  return t('intelligence.workflow.stepsCount', { count })
}

function resolveValidationMessage(error: unknown): string {
  if (!(error instanceof WorkflowValidationError)) {
    return error instanceof Error ? error.message : String(error)
  }
  return error.reason
}

async function handleSave(): Promise<void> {
  try {
    const saved = await saveWorkflow()
    toast.success(t('intelligence.workflow.toastSaved', { name: saved.name }))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleDelete(): Promise<void> {
  try {
    await deleteWorkflow()
    toast.success(t('intelligence.workflow.toastDeleted'))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleRun(): Promise<void> {
  try {
    const result = await runWorkflow()
    if (result.status === 'waiting_approval') {
      toast.info(t('intelligence.workflow.toastWaitingApproval'))
      return
    }
    toast.success(t('intelligence.workflow.toastRunCompleted'))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleResume(): Promise<void> {
  try {
    const result = await resumeCurrentRun()
    if (!result) {
      toast.error(t('intelligence.workflow.toastNoResumableRun'))
      return
    }
    if (result.status === 'waiting_approval') {
      toast.info(t('intelligence.workflow.toastStillWaitingApproval'))
      return
    }
    toast.success(t('intelligence.workflow.toastResumed'))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleApproval(ticketId: string, approved: boolean): Promise<void> {
  try {
    await approveTicket(ticketId, approved)
    toast.success(
      approved
        ? t('intelligence.workflow.toastToolApproved')
        : t('intelligence.workflow.toastToolRejected')
    )
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleCopyReviewItem(itemId: string): Promise<void> {
  try {
    await copyReviewItemToClipboard(itemId)
    toast.success(t('intelligence.workflow.toastReviewCopied'))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleReplaceClipboardReviewItem(itemId: string): Promise<void> {
  try {
    const result = await replaceClipboardWithReviewItem(itemId)
    if (!result.confirmed) {
      toast.info(t('intelligence.workflow.toastReviewReplaceConfirm'))
      return
    }
    toast.success(t('intelligence.workflow.toastReviewClipboardReplaced'))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleDismissReviewItem(itemId: string): Promise<void> {
  try {
    await dismissReviewItem(itemId)
    toast.success(t('intelligence.workflow.toastReviewDismissed'))
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

function handleToolSourceToggle(source: 'builtin' | 'mcp', event: Event): void {
  const target = event.target
  updateToolSource(source, target instanceof HTMLInputElement ? target.checked : false)
}

watch(
  () => selectedWorkflowId.value,
  async (workflowId) => {
    await loadHistory(workflowId || undefined)
  }
)

onMounted(async () => {
  try {
    await Promise.all([loadAgents(), loadWorkflows()])
    await loadHistory()
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
})
</script>

<template>
  <ViewTemplate :title="t('intelligence.workflow.pageTitle')">
    <div class="workflow-page">
      <section class="workflow-sidebar card-panel">
        <div class="section-head">
          <div>
            <h2>{{ t('intelligence.workflow.libraryTitle') }}</h2>
            <p>{{ t('intelligence.workflow.libraryDescription') }}</p>
          </div>
          <TxButton variant="flat" @click="createWorkflowFromScratch">
            <i class="i-carbon-add" />
            <span>{{ t('intelligence.workflow.newWorkflow') }}</span>
          </TxButton>
        </div>

        <div class="workflow-list">
          <button
            v-for="workflow in workflows"
            :key="workflow.id"
            class="workflow-list-item"
            :class="{ 'workflow-list-item--active': workflow.id === selectedWorkflowId }"
            @click="selectWorkflow(workflow.id)"
          >
            <div class="workflow-list-item__title">
              <span>{{ workflow.name }}</span>
              <span v-if="workflow.metadata?.template" class="mini-badge">
                {{ t('intelligence.workflow.badgeTemplate') }}
              </span>
              <span v-if="workflow.metadata?.builtin" class="mini-badge mini-badge--ghost">
                {{ t('intelligence.workflow.badgeBuiltin') }}
              </span>
            </div>
            <div class="workflow-list-item__meta">
              <span>{{ workflowStatusText(workflow.enabled !== false) }}</span>
              <span>{{ stepsCountText(workflow.steps.length) }}</span>
            </div>
          </button>

          <div v-if="!loading && workflows.length === 0" class="empty-state">
            {{ t('intelligence.workflow.emptyWorkflowList') }}
          </div>
        </div>
      </section>

      <section class="workflow-main">
        <div class="workflow-toolbar card-panel">
          <div>
            <h1>{{ workflowDraft.name || t('intelligence.workflow.defaults.workflowName') }}</h1>
            <p>{{ t('intelligence.workflow.toolbarDescription') }}</p>
          </div>
          <div class="toolbar-actions">
            <TxButton variant="flat" :loading="saving" @click="handleSave">
              <i class="i-carbon-save" />
              <span>
                {{
                  workflowDraft.isBuiltin
                    ? t('intelligence.workflow.saveAsCopy')
                    : t('intelligence.workflow.save')
                }}
              </span>
            </TxButton>
            <TxButton
              variant="flat"
              :disabled="!canDeleteCurrent"
              :loading="deleting"
              @click="handleDelete"
            >
              <i class="i-carbon-trash-can" />
              <span>{{ t('intelligence.workflow.delete') }}</span>
            </TxButton>
            <TxButton type="primary" :loading="running" @click="handleRun">
              <i class="i-carbon-play" />
              <span>{{ t('intelligence.workflow.run') }}</span>
            </TxButton>
            <TxButton
              variant="flat"
              :disabled="currentRun?.status !== 'waiting_approval'"
              @click="handleResume"
            >
              <i class="i-carbon-play-filled-alt" />
              <span>{{ t('intelligence.workflow.resume') }}</span>
            </TxButton>
          </div>
        </div>

        <div class="workflow-grid">
          <section class="card-panel editor-panel">
            <div class="section-head">
              <div>
                <h2>{{ t('intelligence.workflow.basicInfoTitle') }}</h2>
                <p>{{ t('intelligence.workflow.basicInfoDescription') }}</p>
              </div>
            </div>

            <div class="form-grid">
              <label class="field">
                <span class="field-label">{{ t('intelligence.workflow.fieldName') }}</span>
                <input
                  v-model="workflowDraft.name"
                  type="text"
                  :placeholder="t('intelligence.workflow.namePlaceholder')"
                />
              </label>

              <label class="field">
                <span class="field-label">{{ t('intelligence.workflow.fieldDescription') }}</span>
                <input
                  v-model="workflowDraft.description"
                  type="text"
                  :placeholder="t('intelligence.workflow.descriptionPlaceholder')"
                />
              </label>

              <label class="field field--checkbox">
                <input v-model="workflowDraft.enabled" type="checkbox" />
                <span>{{ t('intelligence.workflow.enableWorkflow') }}</span>
              </label>

              <label class="field">
                <span class="field-label">{{ t('intelligence.workflow.approvalThreshold') }}</span>
                <select v-model="workflowDraft.approvalThreshold">
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>

              <label class="field field--checkbox">
                <input v-model="workflowDraft.autoApproveReadOnly" type="checkbox" />
                <span>{{ t('intelligence.workflow.autoApproveReadOnly') }}</span>
              </label>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>{{ t('intelligence.workflow.toolSourcesTitle') }}</h3>
                <p>{{ t('intelligence.workflow.toolSourcesDescription') }}</p>
              </div>
              <div class="toggle-row">
                <label class="pill-toggle">
                  <input
                    :checked="workflowDraft.toolSources.includes('builtin')"
                    type="checkbox"
                    @change="handleToolSourceToggle('builtin', $event)"
                  />
                  <span>builtin</span>
                </label>
                <label class="pill-toggle">
                  <input
                    :checked="workflowDraft.toolSources.includes('mcp')"
                    type="checkbox"
                    @change="handleToolSourceToggle('mcp', $event)"
                  />
                  <span>mcp</span>
                </label>
              </div>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>{{ t('intelligence.workflow.triggersTitle') }}</h3>
                <div class="subsection-actions">
                  <TxButton variant="flat" @click="addTrigger('manual')">
                    <span>{{ t('intelligence.workflow.addManualTrigger') }}</span>
                  </TxButton>
                  <TxButton variant="flat" @click="addTrigger('clipboard.batch')">
                    <span>{{ t('intelligence.workflow.addClipboardBatchTrigger') }}</span>
                  </TxButton>
                </div>
              </div>

              <div class="stack-list">
                <article
                  v-for="trigger in workflowDraft.triggers"
                  :key="trigger.uid"
                  class="small-card"
                >
                  <div class="mini-grid">
                    <label class="field">
                      <span class="field-label">{{ t('intelligence.workflow.fieldType') }}</span>
                      <select v-model="trigger.type">
                        <option value="manual">manual</option>
                        <option value="clipboard.batch">clipboard.batch</option>
                      </select>
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('intelligence.workflow.fieldLabel') }}</span>
                      <input
                        v-model="trigger.label"
                        type="text"
                        :placeholder="t('intelligence.workflow.labelPlaceholder')"
                      />
                    </label>
                    <label class="field field--checkbox">
                      <input v-model="trigger.enabled" type="checkbox" />
                      <span>{{ t('intelligence.workflow.enable') }}</span>
                    </label>
                    <TxButton variant="flat" @click="removeTrigger(trigger.uid)">
                      <span>{{ t('intelligence.workflow.remove') }}</span>
                    </TxButton>
                  </div>
                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.configJson') }}</span>
                    <textarea v-model="trigger.config" rows="3" />
                  </label>
                </article>
              </div>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>{{ t('intelligence.workflow.contextSourcesTitle') }}</h3>
                <p>{{ t('intelligence.workflow.contextSourcesDescription') }}</p>
              </div>
              <div class="stack-list">
                <article
                  v-for="source in workflowDraft.contextSources"
                  :key="source.uid"
                  class="small-card"
                >
                  <div class="mini-grid">
                    <label class="field">
                      <span class="field-label">{{ t('intelligence.workflow.fieldType') }}</span>
                      <input v-model="source.type" type="text" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ t('intelligence.workflow.fieldLabel') }}</span>
                      <input v-model="source.label" type="text" />
                    </label>
                    <label class="field field--checkbox">
                      <input v-model="source.enabled" type="checkbox" />
                      <span>{{ t('intelligence.workflow.enable') }}</span>
                    </label>
                  </div>
                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.configJson') }}</span>
                    <textarea v-model="source.config" rows="2" />
                  </label>
                </article>
              </div>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>{{ t('intelligence.workflow.metadataJsonTitle') }}</h3>
                <p>{{ t('intelligence.workflow.metadataDescription') }}</p>
              </div>
              <label class="field">
                <textarea v-model="workflowDraft.metadata" rows="6" />
              </label>
            </div>
          </section>

          <section class="card-panel editor-panel">
            <div class="section-head">
              <div>
                <h2>{{ t('intelligence.workflow.stepEditorTitle') }}</h2>
                <p>
                  {{
                    t('intelligence.workflow.stepEditorDescription', {
                      count: activeStepCount
                    })
                  }}
                </p>
              </div>
              <div class="subsection-actions">
                <TxButton variant="flat" @click="addStep('prompt')">
                  <span>{{ t('intelligence.workflow.addPromptStep') }}</span>
                </TxButton>
                <TxButton variant="flat" @click="addStep('model')">
                  <span>{{ t('intelligence.workflow.addModelStep') }}</span>
                </TxButton>
                <TxButton variant="flat" @click="addStep('tool')">
                  <span>{{ t('intelligence.workflow.addToolStep') }}</span>
                </TxButton>
                <TxButton variant="flat" @click="addStep('agent')">
                  <span>{{ t('intelligence.workflow.addAgentStep') }}</span>
                </TxButton>
              </div>
            </div>

            <div class="stack-list">
              <article
                v-for="(step, index) in workflowDraft.steps"
                :key="step.uid"
                class="step-card"
              >
                <div class="step-card__header">
                  <div>
                    <div class="step-card__index">
                      {{ t('intelligence.workflow.stepTitle', { index: index + 1 }) }}
                    </div>
                    <div class="step-card__title">
                      {{ step.name || t('intelligence.workflow.stepTitle', { index: index + 1 }) }}
                    </div>
                  </div>
                  <TxButton variant="flat" @click="removeStep(step.uid)">
                    <span>{{ t('intelligence.workflow.remove') }}</span>
                  </TxButton>
                </div>

                <div class="form-grid">
                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.stepId') }}</span>
                    <input v-model="step.id" type="text" />
                  </label>

                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.fieldName') }}</span>
                    <input v-model="step.name" type="text" />
                  </label>

                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.fieldType') }}</span>
                    <select v-model="step.kind">
                      <option value="prompt">prompt</option>
                      <option value="model">model</option>
                      <option value="tool">tool</option>
                      <option value="agent">agent</option>
                    </select>
                  </label>

                  <label class="field field--checkbox">
                    <input v-model="step.continueOnError" type="checkbox" />
                    <span>{{ t('intelligence.workflow.continueOnError') }}</span>
                  </label>
                </div>

                <label class="field">
                  <span class="field-label">{{
                    t('intelligence.workflow.instructionPrompt')
                  }}</span>
                  <textarea
                    v-model="step.instruction"
                    rows="4"
                    :placeholder="
                      step.kind === 'prompt'
                        ? t('intelligence.workflow.promptPlaceholder')
                        : step.kind === 'model'
                          ? t('intelligence.workflow.modelPlaceholder')
                        : t('intelligence.workflow.instructionPlaceholder')
                    "
                  />
                </label>

                <div v-if="step.kind === 'tool'" class="form-grid">
                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.toolId') }}</span>
                    <input v-model="step.toolId" type="text" list="builtin-tool-options" />
                  </label>

                  <label class="field">
                    <span class="field-label">{{ t('intelligence.workflow.toolSource') }}</span>
                    <select v-model="step.toolSource">
                      <option value="builtin">builtin</option>
                      <option value="mcp">mcp</option>
                    </select>
                  </label>
                </div>

                <label v-if="step.kind === 'agent'" class="field">
                  <span class="field-label">{{ t('intelligence.workflow.agentId') }}</span>
                  <input
                    v-model="step.agentId"
                    type="text"
                    list="agent-options"
                    placeholder="builtin.workflow-agent"
                  />
                </label>

                <div v-if="step.kind === 'model'" class="form-grid">
                  <label class="field">
                    <span class="field-label">{{
                      t('intelligence.workflow.modelInputSources')
                    }}</span>
                    <textarea v-model="step.inputSources" rows="5" />
                  </label>

                  <label class="field">
                    <span class="field-label">{{
                      t('intelligence.workflow.modelOutputContract')
                    }}</span>
                    <textarea v-model="step.outputContract" rows="5" />
                  </label>
                </div>

                <label class="field">
                  <span class="field-label">{{ t('intelligence.workflow.inputJsonShort') }}</span>
                  <textarea v-model="step.input" rows="5" />
                </label>
              </article>
            </div>

            <datalist id="agent-options">
              <option v-for="agent in agentOptions" :key="agent.id" :value="agent.id">
                {{ agent.name }}
              </option>
            </datalist>

            <datalist id="builtin-tool-options">
              <option v-for="tool in builtinToolOptions" :key="tool.id" :value="tool.id">
                {{ tool.label }}
              </option>
            </datalist>
          </section>
        </div>
      </section>

      <section class="workflow-right card-panel">
        <div class="section-head">
          <div>
            <h2>{{ t('intelligence.workflow.runtimeTitle') }}</h2>
            <p>{{ t('intelligence.workflow.runtimeDescription') }}</p>
          </div>
          <span :class="runStatusClass">{{ runStatusText }}</span>
        </div>

        <div class="runtime-block">
          <div class="runtime-kv">
            <span>{{ t('intelligence.workflow.currentWorkflow') }}</span>
            <strong>{{ workflowDraft.name || '-' }}</strong>
          </div>
          <div class="runtime-kv">
            <span>{{ t('intelligence.workflow.latestRunId') }}</span>
            <strong>{{ currentRun?.id || '-' }}</strong>
          </div>
          <div class="runtime-kv">
            <span>{{ t('intelligence.workflow.startedAt') }}</span>
            <strong>{{ formatDate(currentRun?.startedAt) }}</strong>
          </div>
          <div class="runtime-kv">
            <span>{{ t('intelligence.workflow.completedAt') }}</span>
            <strong>{{ formatDate(currentRun?.completedAt) }}</strong>
          </div>
          <div v-if="executionError" class="runtime-error">
            {{ executionError }}
          </div>
        </div>

        <div class="subsection">
          <div class="subsection-head">
            <h3>{{ t('intelligence.workflow.approvalPanelTitle') }}</h3>
            <p>{{ t('intelligence.workflow.approvalPanelDescription') }}</p>
          </div>

          <div v-if="pendingApprovals.length === 0" class="empty-state">
            {{ t('intelligence.workflow.emptyApprovals') }}
          </div>

          <article v-for="ticket in pendingApprovals" :key="ticket.id" class="small-card">
            <div class="approval-title">
              <span>{{ ticket.toolId }}</span>
              <span class="mini-badge mini-badge--ghost">{{ ticket.riskLevel }}</span>
            </div>
            <div class="approval-reason">
              {{ ticket.reason }}
            </div>
            <div class="approval-actions">
              <TxButton variant="flat" @click="handleApproval(ticket.id, false)">
                <span>{{ t('intelligence.workflow.reject') }}</span>
              </TxButton>
              <TxButton type="primary" @click="handleApproval(ticket.id, true)">
                <span>{{ t('intelligence.workflow.approveAndResume') }}</span>
              </TxButton>
            </div>
          </article>
        </div>

        <div v-if="currentRun" class="subsection">
          <div class="subsection-head">
            <h3>{{ t('intelligence.workflow.currentRunStepsTitle') }}</h3>
            <p>{{ t('intelligence.workflow.currentRunStepsDescription') }}</p>
          </div>
          <div class="stack-list">
            <article v-for="step in currentRun.steps" :key="step.id" class="small-card">
              <div class="runtime-kv">
                <span>{{ step.name }}</span>
                <span class="mini-badge">{{ step.status }}</span>
              </div>
              <div class="small-card__meta">
                {{ displayStepKind(step.kind) }}
              </div>
              <pre v-if="step.output !== undefined" class="result-pre">{{
                formatJson(step.output)
              }}</pre>
              <div v-if="step.error" class="runtime-error">
                {{ step.error }}
              </div>
            </article>
          </div>
        </div>

        <div v-if="currentRun" class="subsection">
          <div class="subsection-head">
            <h3>{{ t('intelligence.workflow.reviewQueueTitle') }}</h3>
            <p>{{ t('intelligence.workflow.reviewQueueDescription') }}</p>
          </div>

          <div v-if="reviewQueueItems.length === 0" class="empty-state">
            {{ t('intelligence.workflow.emptyReviewQueue') }}
          </div>

          <article v-for="item in reviewQueueItems" :key="item.id" class="small-card">
            <div class="review-title">
              <span>{{ item.stepName || item.stepId }}</span>
              <span class="mini-badge">{{ item.status }}</span>
            </div>
            <div class="small-card__meta">
              <span>{{ item.capabilityId || 'workflow.output' }}</span>
              <span v-if="item.provider || item.model">
                {{ [item.provider, item.model].filter(Boolean).join(' / ') }}
              </span>
            </div>
            <div v-if="item.traceId" class="small-card__meta">
              trace: {{ item.traceId }}
            </div>
            <pre class="result-pre">{{ item.preview }}</pre>
            <div v-if="item.error" class="runtime-error">
              {{ item.error }}
            </div>
            <div class="approval-actions">
              <TxButton variant="flat" @click="handleDismissReviewItem(item.id)">
                <span>{{ t('intelligence.workflow.dismissReviewItem') }}</span>
              </TxButton>
              <TxButton variant="flat" @click="handleCopyReviewItem(item.id)">
                <span>{{ t('intelligence.workflow.copyReviewItem') }}</span>
              </TxButton>
              <TxButton
                :variant="reviewQueueReplaceConfirmId === item.id ? 'flat' : 'ghost'"
                @click="handleReplaceClipboardReviewItem(item.id)"
              >
                <span>
                  {{
                    reviewQueueReplaceConfirmId === item.id
                      ? t('intelligence.workflow.confirmReplaceClipboard')
                      : t('intelligence.workflow.replaceClipboard')
                  }}
                </span>
              </TxButton>
            </div>
          </article>
        </div>

        <div class="subsection">
          <div class="subsection-head">
            <h3>{{ t('intelligence.workflow.historyTitle') }}</h3>
            <p>{{ t('intelligence.workflow.historyDescription') }}</p>
          </div>

          <div v-if="history.length === 0" class="empty-state">
            {{ t('intelligence.workflow.emptyHistory') }}
          </div>

          <button
            v-for="run in history"
            :key="run.id"
            class="history-item"
            @click="inspectRun(run)"
          >
            <div class="history-item__row">
              <span>{{ run.workflowName || run.workflowId }}</span>
              <span class="mini-badge">{{ run.status }}</span>
            </div>
            <div class="history-item__meta">
              <span>{{ formatDate(run.startedAt) }}</span>
              <span>{{ stepsCountText(run.steps.length) }}</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  </ViewTemplate>
</template>

<style scoped lang="scss">
.workflow-page {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr) 360px;
  gap: 16px;
  min-height: calc(100vh - 120px);
}

.card-panel {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(18, 24, 33, 0.96), rgba(13, 18, 27, 0.92));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
}

.workflow-sidebar,
.workflow-right {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.workflow-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.workflow-toolbar {
  padding: 18px 20px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.workflow-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.editor-panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.section-head,
.subsection-head,
.step-card__header,
.history-item__row,
.runtime-kv,
.workflow-list-item__title,
.workflow-list-item__meta,
.approval-actions,
.approval-title,
.review-title,
.toolbar-actions,
.subsection-actions,
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-head h1,
.section-head h2,
.subsection-head h3 {
  margin: 0;
}

.section-head p,
.subsection-head p,
.small-card__meta,
.workflow-list-item__meta,
.runtime-kv span,
.approval-reason,
.empty-state {
  color: rgba(255, 255, 255, 0.66);
  font-size: 12px;
}

.workflow-list,
.stack-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workflow-list-item,
.history-item {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 14px;
  padding: 12px;
  text-align: left;
  transition:
    border-color 0.2s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.workflow-list-item:hover,
.history-item:hover {
  border-color: rgba(106, 201, 255, 0.32);
  transform: translateY(-1px);
}

.workflow-list-item--active {
  border-color: rgba(106, 201, 255, 0.45);
  background: rgba(106, 201, 255, 0.08);
}

.mini-badge,
.status-pill {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.08);
}

.mini-badge--ghost {
  background: rgba(255, 255, 255, 0.04);
}

.status-pill--success {
  background: rgba(42, 184, 92, 0.18);
  color: #97f3b6;
}

.status-pill--error {
  background: rgba(255, 87, 87, 0.18);
  color: #ffb5b5;
}

.status-pill--warning {
  background: rgba(255, 183, 77, 0.18);
  color: #ffd59c;
}

.status-pill--running {
  background: rgba(106, 201, 255, 0.18);
  color: #9fe3ff;
}

.status-pill--muted {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
}

.form-grid,
.mini-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field--checkbox {
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  margin-top: 24px;
}

.field-label,
.step-card__index {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(5, 9, 14, 0.5);
  color: rgba(255, 255, 255, 0.92);
  padding: 10px 12px;
}

textarea {
  resize: vertical;
  min-height: 92px;
}

.subsection,
.runtime-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.small-card,
.step-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.step-card__title {
  font-size: 16px;
  font-weight: 600;
}

.runtime-error {
  color: #ffb5b5;
  font-size: 12px;
  white-space: pre-wrap;
}

.result-pre {
  margin: 0;
  padding: 10px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.24);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
}

@media (max-width: 1440px) {
  .workflow-page {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .workflow-right {
    grid-column: span 2;
  }
}

@media (max-width: 980px) {
  .workflow-page,
  .workflow-grid,
  .form-grid,
  .mini-grid {
    grid-template-columns: 1fr;
  }

  .workflow-toolbar,
  .section-head,
  .subsection-head,
  .toolbar-actions,
  .subsection-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
