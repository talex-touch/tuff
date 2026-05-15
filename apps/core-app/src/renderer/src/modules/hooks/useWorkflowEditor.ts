import type {
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceStateSnapshot,
  WorkflowContextSource,
  WorkflowDefinition,
  WorkflowDefinitionStep,
  WorkflowModelInputSource,
  WorkflowModelOutputContract,
  WorkflowReviewQueueItemStatus as SharedWorkflowReviewQueueItemStatus,
  WorkflowRunRecord,
  WorkflowStepKind,
  WorkflowTrigger,
  WorkflowTriggerType
} from '@talex-touch/tuff-intelligence'
import type { AgentDescriptor } from '@talex-touch/utils'
import { useAgentsSdk } from '@talex-touch/utils/renderer/hooks/use-agents-sdk'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer/hooks/use-intelligence-sdk'
import { computed, ref } from 'vue'
import type { Translate } from '~/modules/lang/useI18nText'
import { useI18nText } from '~/modules/lang/useI18nText'

export type WorkflowValidationErrorCode =
  | 'name_required'
  | 'min_steps'
  | 'step_name_required'
  | 'tool_required'
  | 'agent_required'
  | 'input_json'
  | 'metadata_json'
  | 'trigger_config_json'
  | 'context_config_json'

export type WorkflowReviewQueueItemStatus =
  SharedWorkflowReviewQueueItemStatus

export class WorkflowValidationError extends Error {
  constructor(
    readonly code: WorkflowValidationErrorCode,
    readonly reason: string,
    readonly stepUid?: string
  ) {
    super(reason)
    this.name = 'WorkflowValidationError'
  }
}

export interface WorkflowStepDraft {
  uid: string
  id: string
  name: string
  kind: WorkflowStepKind
  instruction: string
  toolId: string
  toolSource: 'builtin' | 'mcp'
  agentId: string
  input: string
  inputSources: string
  outputContract: string
  continueOnError: boolean
}

export interface WorkflowTriggerDraft {
  uid: string
  id: string
  type: WorkflowTriggerType
  enabled: boolean
  label: string
  config: string
}

export interface WorkflowContextSourceDraft {
  uid: string
  id: string
  type: string
  enabled: boolean
  label: string
  config: string
}

export interface WorkflowDraft {
  id: string
  name: string
  description: string
  enabled: boolean
  toolSources: Array<'builtin' | 'mcp'>
  approvalThreshold: 'low' | 'medium' | 'high' | 'critical'
  autoApproveReadOnly: boolean
  metadata: string
  triggers: WorkflowTriggerDraft[]
  contextSources: WorkflowContextSourceDraft[]
  steps: WorkflowStepDraft[]
  isBuiltin: boolean
}

export interface BuiltinToolOption {
  id: string
  label: string
  toolSource: 'builtin' | 'mcp'
}

export interface WorkflowRunViewModel extends WorkflowRunRecord {
  sessionId?: string
  pendingApprovals: TuffIntelligenceApprovalTicket[]
}

export interface WorkflowReviewQueueItem {
  id: string
  runId: string
  workflowId: string
  workflowName?: string
  stepId: string
  stepName?: string
  capabilityId?: string
  traceId?: string
  provider?: string
  model?: string
  riskLevel: 'low' | 'medium'
  text: string
  preview: string
  status: WorkflowReviewQueueItemStatus
  error?: string
  createdAt: number
}

const BUILTIN_TOOL_OPTIONS: BuiltinToolOption[] = [
  { id: 'clipboard.readRecent', label: 'clipboard.readRecent', toolSource: 'builtin' },
  { id: 'clipboard.copyResult', label: 'clipboard.copyResult', toolSource: 'builtin' },
  { id: 'desktop.context.activeApp', label: 'desktop.context.activeApp', toolSource: 'builtin' },
  { id: 'desktop.context.snapshot', label: 'desktop.context.snapshot', toolSource: 'builtin' },
  { id: 'browser.open', label: 'browser.open', toolSource: 'builtin' },
  { id: 'browser.search', label: 'browser.search', toolSource: 'builtin' },
  { id: 'browser.extract', label: 'browser.extract', toolSource: 'builtin' }
]

export const DEFAULT_WORKFLOW_AGENT_ID = 'builtin.workflow-agent'

type DefaultContextSourceDefinition = Omit<WorkflowContextSource, 'label'> & {
  labelKey: string
}

const WORKFLOW_I18N_PREFIX = 'intelligence.workflow'

function workflowTextKey(key: string): string {
  return `${WORKFLOW_I18N_PREFIX}.${key}`
}

const DEFAULT_CONTEXT_SOURCE_DEFINITIONS: DefaultContextSourceDefinition[] = [
  {
    id: 'clipboard.recent',
    type: 'clipboard.recent',
    enabled: true,
    labelKey: 'defaults.context.clipboardRecent',
    config: { limit: 8 }
  },
  {
    id: 'desktop.active-app',
    type: 'desktop.active-app',
    enabled: true,
    labelKey: 'defaults.context.desktopActiveApp',
    config: {}
  },
  {
    id: 'desktop.recent-files',
    type: 'desktop.recent-files',
    enabled: true,
    labelKey: 'defaults.context.desktopRecentFiles',
    config: {}
  },
  {
    id: 'browser.recent-urls',
    type: 'browser.recent-urls',
    enabled: true,
    labelKey: 'defaults.context.browserRecentUrls',
    config: {}
  },
  {
    id: 'session.memory',
    type: 'session.memory',
    enabled: true,
    labelKey: 'defaults.context.sessionMemory',
    config: {}
  }
]

function createUid(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function normalizeOutputText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }

  const record = toRecord(value)
  for (const key of ['text', 'result', 'content', 'summary', 'explanation', 'translatedText']) {
    const item = record[key]
    if (typeof item === 'string' && item.trim()) {
      return item.trim()
    }
  }

  if (record.result && typeof record.result === 'object') {
    const nested = normalizeOutputText(record.result)
    if (nested) {
      return nested
    }
  }

  if (Object.keys(record).length <= 0) {
    return ''
  }

  return safeJsonStringify(record)
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function parseJson(
  text: string,
  errorCode: WorkflowValidationErrorCode,
  stepUid?: string
): Record<string, unknown> {
  const source = text.trim()
  if (!source) {
    return {}
  }
  try {
    return JSON.parse(source) as Record<string, unknown>
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid JSON'
    throw new WorkflowValidationError(errorCode, reason, stepUid)
  }
}

function parseJsonArray<T>(
  text: string,
  errorCode: WorkflowValidationErrorCode,
  stepUid?: string
): T[] {
  const source = text.trim()
  if (!source) {
    return []
  }
  try {
    const parsed = JSON.parse(source)
    if (!Array.isArray(parsed)) {
      throw new Error('expected JSON array')
    }
    return parsed as T[]
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid JSON'
    throw new WorkflowValidationError(errorCode, reason, stepUid)
  }
}

function createDefaultStep(index: number, kind: WorkflowStepKind = 'agent'): WorkflowStepDraft {
  const defaultInput =
    kind === 'model'
      ? '{\n  "capabilityId": "text.chat",\n  "outputFormat": "markdown"\n}'
      : '{\n  "outputFormat": "markdown"\n}'
  const defaultInputSources =
    kind === 'model'
      ? '[\n  {\n    "type": "workflow.input",\n    "key": "text",\n    "label": "Input text"\n  },\n  {\n    "type": "clipboardRef",\n    "key": "clipboard.recent",\n    "label": "Recent clipboard"\n  }\n]'
      : '[]'
  const defaultOutputContract =
    kind === 'model'
      ? '{\n  "format": "markdown",\n  "reviewPolicy": "preview",\n  "riskLevel": "low"\n}'
      : '{}'

  return {
    uid: createUid(),
    id: `step-${index + 1}`,
    name:
      kind === 'agent'
        ? `Agent Step ${index + 1}`
        : kind === 'model'
          ? `Use Model ${index + 1}`
          : `Step ${index + 1}`,
    kind,
    instruction: '',
    toolId: '',
    toolSource: 'builtin',
    agentId: kind === 'agent' ? DEFAULT_WORKFLOW_AGENT_ID : '',
    input: defaultInput,
    inputSources: defaultInputSources,
    outputContract: defaultOutputContract,
    continueOnError: false
  }
}

function getDefaultContextSources(t: Translate): WorkflowContextSource[] {
  return DEFAULT_CONTEXT_SOURCE_DEFINITIONS.map((source) => ({
    id: source.id,
    type: source.type,
    enabled: source.enabled,
    label: t(workflowTextKey(source.labelKey)),
    config: source.config
  }))
}

function getDefaultTriggerLabel(type: WorkflowTriggerType, t: Translate): string {
  return t(
    workflowTextKey(
      type === 'clipboard.batch' ? 'defaults.trigger.clipboardBatch' : 'defaults.trigger.manual'
    )
  )
}

function createDefaultWorkflowDraft(t: Translate): WorkflowDraft {
  return {
    id: '',
    name: t(workflowTextKey('defaults.workflowName')),
    description: '',
    enabled: true,
    toolSources: ['builtin'],
    approvalThreshold: 'high',
    autoApproveReadOnly: true,
    metadata: '{}',
    triggers: [
      {
        uid: createUid(),
        id: 'manual',
        type: 'manual',
        enabled: true,
        label: getDefaultTriggerLabel('manual', t),
        config: '{}'
      }
    ],
    contextSources: getDefaultContextSources(t).map((item) => ({
      uid: createUid(),
      id: item.id || item.type || createUid(),
      type: item.type || '',
      enabled: item.enabled !== false,
      label: item.label || item.type || '',
      config: safeJsonStringify(item.config ?? {})
    })),
    steps: [createDefaultStep(0)],
    isBuiltin: false
  }
}

function mapStepToDraft(step: WorkflowDefinitionStep, index: number): WorkflowStepDraft {
  const kind =
    step.kind === 'tool' || step.kind === 'prompt' || step.kind === 'model'
      ? step.kind
      : 'agent'
  return {
    uid: createUid(),
    id: step.id || `step-${index + 1}`,
    name: step.name || `Step ${index + 1}`,
    kind,
    instruction: step.prompt || step.description || '',
    toolId: step.toolId || '',
    toolSource: step.toolSource === 'mcp' ? 'mcp' : 'builtin',
    agentId: kind === 'agent' ? step.agentId || DEFAULT_WORKFLOW_AGENT_ID : '',
    input: safeJsonStringify(step.input ?? {}),
    inputSources: safeJsonStringify(step.inputSources ?? []),
    outputContract: safeJsonStringify(step.output ?? {}),
    continueOnError: step.continueOnError === true
  }
}

function mapWorkflowToDraft(workflow: WorkflowDefinition, t: Translate): WorkflowDraft {
  const metadata = workflow.metadata ?? {}
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || '',
    enabled: workflow.enabled !== false,
    toolSources: workflow.toolSources?.length > 0 ? workflow.toolSources : ['builtin'],
    approvalThreshold: workflow.approvalPolicy?.requireApprovalAtOrAbove || 'high',
    autoApproveReadOnly: workflow.approvalPolicy?.autoApproveReadOnly !== false,
    metadata: safeJsonStringify(metadata),
    triggers: (workflow.triggers?.length
      ? workflow.triggers
      : [{ type: 'manual', enabled: true }]
    ).map((trigger, index) => {
      const type: WorkflowTriggerType =
        trigger.type === 'clipboard.batch' ? 'clipboard.batch' : 'manual'

      return {
        uid: createUid(),
        id: trigger.id || `trigger-${index + 1}`,
        type,
        enabled: trigger.enabled !== false,
        label: trigger.label || getDefaultTriggerLabel(type, t),
        config: safeJsonStringify(trigger.config ?? {})
      }
    }),
    contextSources: (workflow.contextSources?.length
      ? workflow.contextSources
      : getDefaultContextSources(t)
    ).map((source, index) => ({
      uid: createUid(),
      id: source.id || `context-${index + 1}`,
      type: source.type || '',
      enabled: source.enabled !== false,
      label: source.label || source.type || '',
      config: safeJsonStringify(source.config ?? {})
    })),
    steps: workflow.steps.map((step, index) => mapStepToDraft(step, index)),
    isBuiltin: metadata.builtin === true || workflow.id.startsWith('builtin.')
  }
}

function extractSessionId(run: WorkflowRunRecord | null | undefined): string | undefined {
  const metadata = run?.metadata
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }
  const sessionId = (metadata as Record<string, unknown>).sessionId
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId : undefined
}

function buildReviewQueueItems(
  run: WorkflowRunRecord | null | undefined
): WorkflowReviewQueueItem[] {
  if (!run) {
    return []
  }

  const metadata = toRecord(run.metadata)
  const reviewQueue = toRecord(metadata.reviewQueue)
  const itemState = toRecord(reviewQueue.items) as Record<
    string,
    { status?: WorkflowReviewQueueItemStatus; error?: string }
  >

  return (run.steps ?? [])
    .filter((step) => step.status === 'completed' && step.output !== undefined)
    .map((step, index): WorkflowReviewQueueItem | null => {
      const text = normalizeOutputText(step.output)
      if (!text) {
        return null
      }

      const output = toRecord(step.output)
      const input = toRecord(step.input)
      const metadata = toRecord(step.metadata)
      const modelContract = toRecord(metadata.modelContract)
      const outputContract = toRecord(modelContract.output)
      const stepId = String(step.workflowStepId || step.id || `step-${index + 1}`)
      const id = `${run.id}:${stepId}`
      const state = itemState[id]
      const status = state?.status ?? 'pending'
      if (status === 'dismissed') {
        return null
      }

      return {
        id,
        runId: run.id,
        workflowId: run.workflowId,
        workflowName: run.workflowName,
        stepId,
        stepName: step.name,
        capabilityId: firstString(output.capabilityId, input.capabilityId, metadata.capabilityId),
        traceId: firstString(output.traceId, metadata.traceId),
        provider: firstString(output.provider, metadata.provider),
        model: firstString(output.model, metadata.model),
        riskLevel: outputContract.riskLevel === 'medium' ? 'medium' : 'low',
        text,
        preview: text.length > 500 ? `${text.slice(0, 500)}...` : text,
        status,
        error: state?.error,
        createdAt: step.completedAt ?? run.completedAt ?? run.startedAt
      }
    })
    .filter((item): item is WorkflowReviewQueueItem => Boolean(item))
}

async function writeClipboardText(text: string): Promise<void> {
  const clipboard = globalThis.navigator?.clipboard
  if (!clipboard?.writeText) {
    throw new Error('Clipboard write is not available')
  }
  await clipboard.writeText(text)
}

export function useWorkflowEditor() {
  const { t } = useI18nText()
  const intelligenceSdk = useIntelligenceSdk()
  const agentsSdk = useAgentsSdk()

  const workflows = ref<WorkflowDefinition[]>([])
  const workflowDraft = ref<WorkflowDraft>(createDefaultWorkflowDraft(t))
  const selectedWorkflowId = ref<string>('')
  const loading = ref(false)
  const saving = ref(false)
  const running = ref(false)
  const deleting = ref(false)
  const history = ref<WorkflowRunRecord[]>([])
  const currentRun = ref<WorkflowRunViewModel | null>(null)
  const executionError = ref<string | null>(null)
  const agents = ref<AgentDescriptor[]>([])
  const sessionState = ref<TuffIntelligenceStateSnapshot | null>(null)
  const reviewQueueReplaceConfirmId = ref<string | null>(null)

  const agentOptions = computed(() =>
    agents.value.filter((agent) => agent.enabled !== false).sort((a, b) => a.id.localeCompare(b.id))
  )

  const builtinToolOptions = computed(() => BUILTIN_TOOL_OPTIONS)
  const pendingApprovals = computed(() => sessionState.value?.pendingApprovals ?? [])
  const currentSessionId = computed(() => extractSessionId(currentRun.value))
  const reviewQueueItems = computed(() => buildReviewQueueItems(currentRun.value))

  async function loadAgents(): Promise<void> {
    agents.value = await agentsSdk.listAll()
  }

  async function loadWorkflows(): Promise<void> {
    loading.value = true
    try {
      workflows.value = await intelligenceSdk.workflowList({
        includeDisabled: true,
        includeTemplates: true
      })
      if (!selectedWorkflowId.value && workflows.value.length > 0) {
        selectWorkflow(workflows.value[0]!.id)
      }
      if (workflows.value.length <= 0) {
        workflowDraft.value = createDefaultWorkflowDraft(t)
      }
    } finally {
      loading.value = false
    }
  }

  async function loadHistory(workflowId?: string): Promise<void> {
    history.value = await intelligenceSdk.workflowHistory({
      workflowId: workflowId || selectedWorkflowId.value || undefined,
      limit: 20
    })
  }

  function selectWorkflow(workflowId: string): void {
    selectedWorkflowId.value = workflowId
    const workflow = workflows.value.find((item) => item.id === workflowId)
    workflowDraft.value = workflow ? mapWorkflowToDraft(workflow, t) : createDefaultWorkflowDraft(t)
    executionError.value = null
  }

  function createWorkflowFromScratch(): void {
    selectedWorkflowId.value = ''
    workflowDraft.value = createDefaultWorkflowDraft(t)
    executionError.value = null
  }

  function addStep(kind: WorkflowStepKind = 'agent'): void {
    workflowDraft.value.steps = [
      ...workflowDraft.value.steps,
      createDefaultStep(workflowDraft.value.steps.length, kind)
    ]
  }

  function removeStep(uid: string): void {
    workflowDraft.value.steps = workflowDraft.value.steps.filter((step) => step.uid !== uid)
  }

  function addTrigger(type: WorkflowTriggerType = 'manual'): void {
    workflowDraft.value.triggers = [
      ...workflowDraft.value.triggers,
      {
        uid: createUid(),
        id: `trigger-${workflowDraft.value.triggers.length + 1}`,
        type,
        enabled: true,
        label: getDefaultTriggerLabel(type, t),
        config: '{}'
      }
    ]
  }

  function removeTrigger(uid: string): void {
    workflowDraft.value.triggers = workflowDraft.value.triggers.filter((item) => item.uid !== uid)
  }

  function updateToolSource(source: 'builtin' | 'mcp', enabled: boolean): void {
    const next = new Set(workflowDraft.value.toolSources)
    if (enabled) {
      next.add(source)
    } else {
      next.delete(source)
    }
    workflowDraft.value.toolSources = Array.from(next)
  }

  function resetCurrentRun(): void {
    currentRun.value = null
    sessionState.value = null
    executionError.value = null
    reviewQueueReplaceConfirmId.value = null
  }

  async function setReviewQueueItemStatus(
    itemId: string,
    status: WorkflowReviewQueueItemStatus,
    error?: string
  ): Promise<WorkflowRunRecord> {
    if (!currentRun.value) {
      throw new Error('No workflow run is selected')
    }
    const updated = await intelligenceSdk.workflowReviewUpdate({
      runId: currentRun.value.id,
      itemId,
      status,
      error
    })
    currentRun.value = {
      ...updated,
      sessionId: extractSessionId(updated),
      pendingApprovals: currentRun.value.pendingApprovals ?? []
    }
    return updated
  }

  function getReviewQueueItem(itemId: string): WorkflowReviewQueueItem {
    const item = reviewQueueItems.value.find((entry) => entry.id === itemId)
    if (!item) {
      throw new Error('Review queue item not found')
    }
    return item
  }

  async function copyReviewItemToClipboard(itemId: string): Promise<WorkflowReviewQueueItem> {
    const item = getReviewQueueItem(itemId)
    try {
      await writeClipboardText(item.text)
      await setReviewQueueItemStatus(itemId, 'copied')
      reviewQueueReplaceConfirmId.value = null
      return { ...item, status: 'copied' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await setReviewQueueItemStatus(itemId, 'failed', message)
      throw error
    }
  }

  async function replaceClipboardWithReviewItem(
    itemId: string
  ): Promise<{ item: WorkflowReviewQueueItem; confirmed: boolean }> {
    const item = getReviewQueueItem(itemId)
    if (reviewQueueReplaceConfirmId.value !== itemId) {
      reviewQueueReplaceConfirmId.value = itemId
      return { item, confirmed: false }
    }

    try {
      await writeClipboardText(item.text)
      await setReviewQueueItemStatus(itemId, 'clipboard_replaced')
      reviewQueueReplaceConfirmId.value = null
      return { item: { ...item, status: 'clipboard_replaced' }, confirmed: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await setReviewQueueItemStatus(itemId, 'failed', message)
      throw error
    }
  }

  async function dismissReviewItem(itemId: string): Promise<void> {
    await setReviewQueueItemStatus(itemId, 'dismissed')
    if (reviewQueueReplaceConfirmId.value === itemId) {
      reviewQueueReplaceConfirmId.value = null
    }
  }

  function buildWorkflowDefinition(): WorkflowDefinition {
    const draft = workflowDraft.value
    const name = draft.name.trim()
    if (!name) {
      throw new WorkflowValidationError(
        'name_required',
        t(workflowTextKey('validationNameRequired'))
      )
    }
    if (draft.steps.length <= 0) {
      throw new WorkflowValidationError('min_steps', t(workflowTextKey('validationMinSteps')))
    }

    const metadata = parseJson(draft.metadata, 'metadata_json')
    const triggers: WorkflowTrigger[] = draft.triggers.map((trigger) => ({
      id: trigger.id || createUid(),
      type: trigger.type,
      enabled: trigger.enabled,
      label: trigger.label.trim() || undefined,
      config: parseJson(trigger.config, 'trigger_config_json')
    }))

    const contextSources: WorkflowContextSource[] = draft.contextSources.map((source) => ({
      id: source.id || createUid(),
      type: source.type,
      enabled: source.enabled,
      label: source.label.trim() || undefined,
      config: parseJson(source.config, 'context_config_json')
    }))

    const steps: WorkflowDefinitionStep[] = draft.steps.map((step, index) => {
      const stepName = step.name.trim()
      if (!stepName) {
        throw new WorkflowValidationError(
          'step_name_required',
          t(workflowTextKey('validationStepNameRequired')),
          step.uid
        )
      }

      const input = parseJson(step.input, 'input_json', step.uid)
      const inputSources =
        step.kind === 'model'
          ? parseJsonArray<WorkflowModelInputSource>(step.inputSources, 'input_json', step.uid)
          : undefined
      const output =
        step.kind === 'model'
          ? (parseJson(step.outputContract, 'input_json', step.uid) as WorkflowModelOutputContract)
          : undefined
      if (step.kind === 'tool' && !step.toolId.trim()) {
        throw new WorkflowValidationError(
          'tool_required',
          t(workflowTextKey('validationToolRequired')),
          step.uid
        )
      }
      if (step.kind === 'agent' && !step.agentId.trim()) {
        throw new WorkflowValidationError(
          'agent_required',
          t(workflowTextKey('validationAgentStepRequired')),
          step.uid
        )
      }

      return {
        id: step.id.trim() || `step-${index + 1}`,
        name: stepName,
        kind: step.kind,
        description: step.instruction.trim() || undefined,
        prompt:
          step.kind === 'prompt' || step.kind === 'model'
            ? step.instruction.trim() || undefined
            : undefined,
        toolId: step.kind === 'tool' ? step.toolId.trim() || undefined : undefined,
        toolSource: step.kind === 'tool' ? step.toolSource : undefined,
        agentId: step.kind === 'agent' ? step.agentId.trim() : undefined,
        input,
        inputSources,
        output,
        continueOnError: step.continueOnError,
        metadata: {}
      }
    })

    const workflowId = draft.id.trim()
    const shouldCloneBuiltin = draft.isBuiltin || workflowId.startsWith('builtin.')

    return {
      id: shouldCloneBuiltin ? `workflow_${Date.now()}` : workflowId || `workflow_${Date.now()}`,
      name,
      description: draft.description.trim() || undefined,
      version: '1',
      enabled: draft.enabled,
      triggers,
      contextSources,
      toolSources: draft.toolSources.length > 0 ? draft.toolSources : ['builtin'],
      approvalPolicy: {
        requireApprovalAtOrAbove: draft.approvalThreshold,
        autoApproveReadOnly: draft.autoApproveReadOnly
      },
      steps,
      metadata: {
        ...metadata,
        builtin: false
      }
    }
  }

  async function saveWorkflow(): Promise<WorkflowDefinition> {
    saving.value = true
    try {
      const workflow = buildWorkflowDefinition()
      const saved = await intelligenceSdk.workflowSave(workflow)
      await loadWorkflows()
      selectWorkflow(saved.id)
      return saved
    } finally {
      saving.value = false
    }
  }

  async function deleteWorkflow(): Promise<void> {
    const workflowId = selectedWorkflowId.value || workflowDraft.value.id
    if (!workflowId || workflowDraft.value.isBuiltin) {
      return
    }
    deleting.value = true
    try {
      await intelligenceSdk.workflowDelete({ workflowId })
      await loadWorkflows()
      if (workflows.value.length > 0) {
        selectWorkflow(workflows.value[0]!.id)
      } else {
        createWorkflowFromScratch()
      }
      await loadHistory()
    } finally {
      deleting.value = false
    }
  }

  async function refreshSessionState(
    run: WorkflowRunRecord | null = currentRun.value
  ): Promise<void> {
    const sessionId = extractSessionId(run)
    if (!sessionId) {
      sessionState.value = null
      return
    }
    sessionState.value = await intelligenceSdk.agentSessionGetState({ sessionId })
  }

  async function runWorkflow(): Promise<WorkflowRunRecord> {
    running.value = true
    executionError.value = null
    try {
      const workflow = buildWorkflowDefinition()
      const result = await intelligenceSdk.workflowRun({
        workflowId: selectedWorkflowId.value || undefined,
        workflow,
        inputs: {},
        continueOnError: false,
        sessionId: currentSessionId.value
      })
      currentRun.value = {
        ...result,
        sessionId: extractSessionId(result),
        pendingApprovals: []
      }
      await refreshSessionState(result)
      currentRun.value = {
        ...result,
        sessionId: extractSessionId(result),
        pendingApprovals: sessionState.value?.pendingApprovals ?? []
      }
      await loadHistory(result.workflowId)
      return result
    } catch (error) {
      executionError.value = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      running.value = false
    }
  }

  async function resumeCurrentRun(): Promise<WorkflowRunRecord | null> {
    if (!currentRun.value) {
      return null
    }
    running.value = true
    try {
      const resumed = await intelligenceSdk.workflowRun({
        runId: currentRun.value.id,
        workflowId: currentRun.value.workflowId,
        sessionId: currentSessionId.value
      })
      currentRun.value = {
        ...resumed,
        sessionId: extractSessionId(resumed),
        pendingApprovals: []
      }
      await refreshSessionState(resumed)
      currentRun.value.pendingApprovals = sessionState.value?.pendingApprovals ?? []
      await loadHistory(resumed.workflowId)
      return resumed
    } finally {
      running.value = false
    }
  }

  async function inspectRun(run: WorkflowRunRecord): Promise<void> {
    currentRun.value = {
      ...run,
      sessionId: extractSessionId(run),
      pendingApprovals: []
    }
    await refreshSessionState(run)
    currentRun.value.pendingApprovals = sessionState.value?.pendingApprovals ?? []
  }

  async function approveTicket(
    ticketId: string,
    approved: boolean,
    reason?: string
  ): Promise<void> {
    await intelligenceSdk.agentToolApprove({
      ticketId,
      approved,
      reason
    })
    await refreshSessionState()
    if (approved) {
      await resumeCurrentRun()
    }
  }

  const canDeleteCurrent = computed(
    () => Boolean(selectedWorkflowId.value) && workflowDraft.value.isBuiltin !== true
  )

  return {
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
    sessionState,
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
    resetCurrentRun,
    copyReviewItemToClipboard,
    replaceClipboardWithReviewItem,
    dismissReviewItem,
    saveWorkflow,
    deleteWorkflow,
    runWorkflow,
    resumeCurrentRun,
    inspectRun,
    approveTicket,
    refreshSessionState
  }
}
