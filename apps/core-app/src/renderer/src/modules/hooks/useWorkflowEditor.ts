import type {
  TuffIntelligenceApprovalTicket,
  TuffIntelligenceStateSnapshot,
  WorkflowContextSource,
  WorkflowDefinition,
  WorkflowDefinitionStep,
  WorkflowRunRecord,
  WorkflowStepKind,
  WorkflowTrigger,
  WorkflowTriggerType
} from '@talex-touch/tuff-intelligence'
import type { AgentDescriptor } from '@talex-touch/utils'
import { useAgentsSdk } from '@talex-touch/utils/renderer/hooks/use-agents-sdk'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer/hooks/use-intelligence-sdk'
import { computed, ref } from 'vue'

export type WorkflowValidationErrorCode =
  | 'name_required'
  | 'min_steps'
  | 'step_name_required'
  | 'tool_required'
  | 'input_json'
  | 'metadata_json'
  | 'trigger_config_json'
  | 'context_config_json'

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

const BUILTIN_TOOL_OPTIONS: BuiltinToolOption[] = [
  { id: 'clipboard.readRecent', label: 'clipboard.readRecent', toolSource: 'builtin' },
  { id: 'clipboard.copyResult', label: 'clipboard.copyResult', toolSource: 'builtin' },
  { id: 'desktop.context.activeApp', label: 'desktop.context.activeApp', toolSource: 'builtin' },
  { id: 'desktop.context.snapshot', label: 'desktop.context.snapshot', toolSource: 'builtin' },
  { id: 'browser.open', label: 'browser.open', toolSource: 'builtin' },
  { id: 'browser.search', label: 'browser.search', toolSource: 'builtin' },
  { id: 'browser.extract', label: 'browser.extract', toolSource: 'builtin' }
]

const DEFAULT_CONTEXT_SOURCES: WorkflowContextSource[] = [
  {
    id: 'clipboard.recent',
    type: 'clipboard.recent',
    enabled: true,
    label: '最近剪贴板',
    config: { limit: 8 }
  },
  {
    id: 'desktop.active-app',
    type: 'desktop.active-app',
    enabled: true,
    label: '前台应用',
    config: {}
  },
  {
    id: 'desktop.recent-files',
    type: 'desktop.recent-files',
    enabled: true,
    label: '最近文件',
    config: {}
  },
  {
    id: 'browser.recent-urls',
    type: 'browser.recent-urls',
    enabled: true,
    label: '最近 URL',
    config: {}
  },
  { id: 'session.memory', type: 'session.memory', enabled: true, label: '当前会话记忆', config: {} }
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

function createDefaultStep(index: number, kind: WorkflowStepKind = 'agent'): WorkflowStepDraft {
  return {
    uid: createUid(),
    id: `step-${index + 1}`,
    name: kind === 'agent' ? `Agent Step ${index + 1}` : `Step ${index + 1}`,
    kind,
    instruction: '',
    toolId: '',
    toolSource: 'builtin',
    agentId: kind === 'agent' ? 'deepagent.workflow' : '',
    input: '{\n  "outputFormat": "markdown"\n}',
    continueOnError: false
  }
}

function createDefaultWorkflowDraft(): WorkflowDraft {
  return {
    id: '',
    name: '新工作流',
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
        label: '手动运行',
        config: '{}'
      }
    ],
    contextSources: DEFAULT_CONTEXT_SOURCES.map((item) => ({
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
  return {
    uid: createUid(),
    id: step.id || `step-${index + 1}`,
    name: step.name || `Step ${index + 1}`,
    kind: step.kind === 'tool' || step.kind === 'prompt' ? step.kind : 'agent',
    instruction: step.prompt || step.description || '',
    toolId: step.toolId || '',
    toolSource: step.toolSource === 'mcp' ? 'mcp' : 'builtin',
    agentId: step.agentId || '',
    input: safeJsonStringify(step.input ?? {}),
    continueOnError: step.continueOnError === true
  }
}

function mapWorkflowToDraft(workflow: WorkflowDefinition): WorkflowDraft {
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
    ).map((trigger, index) => ({
      uid: createUid(),
      id: trigger.id || `trigger-${index + 1}`,
      type: trigger.type === 'clipboard.batch' ? 'clipboard.batch' : 'manual',
      enabled: trigger.enabled !== false,
      label: trigger.label || (trigger.type === 'clipboard.batch' ? '剪贴板批处理' : '手动运行'),
      config: safeJsonStringify(trigger.config ?? {})
    })),
    contextSources: (workflow.contextSources?.length
      ? workflow.contextSources
      : DEFAULT_CONTEXT_SOURCES
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

export function useWorkflowEditor() {
  const intelligenceSdk = useIntelligenceSdk()
  const agentsSdk = useAgentsSdk()

  const workflows = ref<WorkflowDefinition[]>([])
  const workflowDraft = ref<WorkflowDraft>(createDefaultWorkflowDraft())
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

  const agentOptions = computed(() =>
    agents.value.filter((agent) => agent.enabled !== false).sort((a, b) => a.id.localeCompare(b.id))
  )

  const builtinToolOptions = computed(() => BUILTIN_TOOL_OPTIONS)
  const pendingApprovals = computed(() => sessionState.value?.pendingApprovals ?? [])
  const currentSessionId = computed(() => extractSessionId(currentRun.value))

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
        workflowDraft.value = createDefaultWorkflowDraft()
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
    workflowDraft.value = workflow ? mapWorkflowToDraft(workflow) : createDefaultWorkflowDraft()
    executionError.value = null
  }

  function createWorkflowFromScratch(): void {
    selectedWorkflowId.value = ''
    workflowDraft.value = createDefaultWorkflowDraft()
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
        label: type === 'clipboard.batch' ? '剪贴板批处理' : '手动运行',
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
  }

  function buildWorkflowDefinition(): WorkflowDefinition {
    const draft = workflowDraft.value
    const name = draft.name.trim()
    if (!name) {
      throw new WorkflowValidationError('name_required', '工作流名称不能为空')
    }
    if (draft.steps.length <= 0) {
      throw new WorkflowValidationError('min_steps', '至少需要一个步骤')
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
        throw new WorkflowValidationError('step_name_required', '步骤名称不能为空', step.uid)
      }

      const input = parseJson(step.input, 'input_json', step.uid)
      if (step.kind === 'tool' && !step.toolId.trim()) {
        throw new WorkflowValidationError('tool_required', '工具步骤必须填写 toolId', step.uid)
      }

      return {
        id: step.id.trim() || `step-${index + 1}`,
        name: stepName,
        kind: step.kind,
        description: step.instruction.trim() || undefined,
        prompt: step.kind === 'prompt' ? step.instruction.trim() || undefined : undefined,
        toolId: step.kind === 'tool' ? step.toolId.trim() || undefined : undefined,
        toolSource: step.kind === 'tool' ? step.toolSource : undefined,
        agentId: step.kind === 'agent' ? step.agentId.trim() || 'deepagent.workflow' : undefined,
        input,
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
    saveWorkflow,
    deleteWorkflow,
    runWorkflow,
    resumeCurrentRun,
    inspectRun,
    approveTicket,
    refreshSessionState
  }
}
