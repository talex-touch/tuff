import type { AgentDescriptor } from '@talex-touch/utils'
import type {
  IntelligenceInvokeResult,
  PromptWorkflowExecution
} from '@talex-touch/tuff-intelligence'
import { useAgentsSdk } from '@talex-touch/utils/renderer/hooks/use-agents-sdk'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer/hooks/use-intelligence-sdk'
import { computed, ref } from 'vue'

export type WorkflowStepType = 'execute' | 'plan' | 'chat'

export interface WorkflowStepDraft {
  uid: string
  id: string
  agentId: string
  type: WorkflowStepType
  input: string
}

export interface WorkflowPayloadStep {
  id: string
  agentId: string
  type: WorkflowStepType
  input: unknown
}

export type WorkflowValidationErrorCode = 'min_steps' | 'agent_required' | 'input_json'
export type WorkflowValidationField = 'steps' | 'agentId' | 'input'

export interface WorkflowStepValidationState {
  agentId?: string
  input?: string
}

export class WorkflowValidationError extends Error {
  readonly stepIndex?: number
  readonly stepUid?: string
  readonly field: WorkflowValidationField
  readonly reason: string

  constructor(
    readonly code: WorkflowValidationErrorCode,
    payload: {
      stepIndex?: number
      stepUid?: string
      field: WorkflowValidationField
      reason: string
    }
  ) {
    super(code)
    this.name = 'WorkflowValidationError'
    this.stepIndex = payload.stepIndex
    this.stepUid = payload.stepUid
    this.field = payload.field
    this.reason = payload.reason
  }
}

const DEFAULT_STEP_INPUT = '{"query": ""}'

function createUid(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createDefaultStep(index: number): WorkflowStepDraft {
  return {
    uid: createUid(),
    id: `step-${index + 1}`,
    agentId: '',
    type: 'execute',
    input: DEFAULT_STEP_INPUT
  }
}

function createDefaultSteps(count = 3): WorkflowStepDraft[] {
  return Array.from({ length: count }, (_, index) => createDefaultStep(index))
}

export function useWorkflowEditor() {
  const intelligenceSdk = useIntelligenceSdk()
  const agentsSdk = useAgentsSdk()

  const steps = ref<WorkflowStepDraft[]>(createDefaultSteps())
  const continueOnError = ref(true)
  const executing = ref(false)
  const executionResult = ref<IntelligenceInvokeResult<PromptWorkflowExecution> | null>(null)
  const executionError = ref<string | null>(null)
  const validationErrors = ref<Record<string, WorkflowStepValidationState>>({})
  const agents = ref<AgentDescriptor[]>([])

  const agentOptions = computed(() =>
    agents.value.filter((agent) => agent.enabled !== false).sort((a, b) => a.id.localeCompare(b.id))
  )

  function addStep(): void {
    steps.value = [...steps.value, createDefaultStep(steps.value.length)]
  }

  function removeStep(uid: string): void {
    steps.value = steps.value.filter((step) => step.uid !== uid)
    const next = { ...validationErrors.value }
    delete next[uid]
    validationErrors.value = next
  }

  function clearResult(): void {
    executionResult.value = null
    executionError.value = null
  }

  function clearValidationErrors(): void {
    validationErrors.value = {}
  }

  function resetSteps(): void {
    steps.value = createDefaultSteps()
    continueOnError.value = true
    clearValidationErrors()
    clearResult()
  }

  async function loadAgents(): Promise<void> {
    agents.value = await agentsSdk.listAll()
  }

  function normalizeStepsPayload(): WorkflowPayloadStep[] {
    clearValidationErrors()

    if (steps.value.length === 0) {
      throw new WorkflowValidationError('min_steps', {
        field: 'steps',
        reason: 'at least one workflow step is required'
      })
    }

    return steps.value.map((step, index) => {
      const setFieldError = (field: 'agentId' | 'input', reason: string): void => {
        validationErrors.value = {
          ...validationErrors.value,
          [step.uid]: {
            ...(validationErrors.value[step.uid] ?? {}),
            [field]: reason
          }
        }
      }

      const agentId = step.agentId.trim()
      if (!agentId) {
        const reason = 'agentId is required'
        setFieldError('agentId', reason)
        throw new WorkflowValidationError('agent_required', {
          stepIndex: index,
          stepUid: step.uid,
          field: 'agentId',
          reason
        })
      }

      const stepId = step.id.trim() || `step-${index + 1}`
      const inputText = step.input.trim()

      if (!inputText) {
        return {
          id: stepId,
          agentId,
          type: step.type,
          input: {}
        }
      }

      try {
        return {
          id: stepId,
          agentId,
          type: step.type,
          input: JSON.parse(inputText)
        }
      } catch (error) {
        const parseMessage = error instanceof Error ? error.message : 'invalid JSON'
        const reason = `invalid JSON: ${parseMessage}`
        setFieldError('input', reason)
        throw new WorkflowValidationError('input_json', {
          stepIndex: index,
          stepUid: step.uid,
          field: 'input',
          reason
        })
      }
    })
  }

  async function executeWorkflow(): Promise<IntelligenceInvokeResult<PromptWorkflowExecution>> {
    executing.value = true
    executionError.value = null

    try {
      const payloadSteps = normalizeStepsPayload()
      const result = await intelligenceSdk.invoke<PromptWorkflowExecution>('workflow.execute', {
        steps: payloadSteps,
        continueOnError: continueOnError.value
      })
      executionResult.value = result
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      executionError.value = message
      throw error
    } finally {
      executing.value = false
    }
  }

  return {
    steps,
    continueOnError,
    executing,
    executionResult,
    executionError,
    agentOptions,
    validationErrors,
    addStep,
    removeStep,
    clearResult,
    clearValidationErrors,
    resetSteps,
    loadAgents,
    executeWorkflow
  }
}
