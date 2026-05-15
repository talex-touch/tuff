import type {
  ToolApprovalPolicy,
  ToolSource,
  WorkflowDefinition,
  WorkflowDefinitionStep,
  WorkflowModelInputSource,
  WorkflowModelOutputContract,
  WorkflowReviewQueueItemState,
  WorkflowReviewQueueItemStatus,
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowStepKind,
  WorkflowTriggerType
} from '@talex-touch/tuff-intelligence'
import type { SQL } from 'drizzle-orm'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import {
  intelligenceWorkflowDefinitions,
  intelligenceWorkflowRuns,
  intelligenceWorkflowRunSteps,
  intelligenceWorkflowSteps
} from '../../db/schema'
import { createLogger } from '../../utils/logger'
import { databaseModule } from '../database'

const workflowLog = createLogger('Intelligence').child('WorkflowService')

interface WorkflowListOptions {
  includeDisabled?: boolean
  includeTemplates?: boolean
}

interface WorkflowHistoryOptions {
  workflowId?: string
  limit?: number
  status?: WorkflowRunRecord['status']
}

export interface WorkflowRunRequest {
  workflowId?: string
  workflow?: WorkflowDefinition
  runId?: string
  inputs?: Record<string, unknown>
  sessionId?: string
  triggerType?: WorkflowTriggerType
  continueOnError?: boolean
  metadata?: Record<string, unknown>
}

export interface WorkflowReviewQueueUpdateRequest {
  runId: string
  itemId: string
  status: WorkflowReviewQueueItemStatus
  error?: string
}

export interface WorkflowExecutionContext {
  workflow: WorkflowDefinition
  run: WorkflowRunRecord
  inputs: Record<string, unknown>
  sessionId?: string
  triggerType: WorkflowTriggerType
  continueOnError: boolean
  metadata?: Record<string, unknown>
  onUpdate: (run: WorkflowRunRecord) => Promise<void>
}

type WorkflowExecutor = (ctx: WorkflowExecutionContext) => Promise<WorkflowRunRecord>

const BUILTIN_WORKFLOW_TEMPLATE_VERSION = 1

function now(): number {
  return Date.now()
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback
  }
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function toJson(value: unknown, fallback: unknown = null): string {
  return JSON.stringify(value ?? fallback)
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeTriggerType(value: unknown): WorkflowTriggerType {
  return value === 'clipboard.batch' ? 'clipboard.batch' : 'manual'
}

function normalizeRunStatus(value: unknown): WorkflowRunStatus {
  if (
    value === 'running' ||
    value === 'waiting_approval' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value
  }
  return 'pending'
}

function normalizeWorkflowStepKind(value: unknown): WorkflowStepKind {
  if (value === 'prompt' || value === 'tool' || value === 'agent' || value === 'model') {
    return value
  }
  throw new Error(`Unsupported workflow step kind: ${String(value || '')}`)
}

function normalizeToolSource(value: unknown): ToolSource {
  if (value === 'mcp') {
    return 'mcp'
  }
  if (value === 'builtin' || value == null || value === '') {
    return 'builtin'
  }
  throw new Error(`Unsupported workflow tool source: ${String(value)}`)
}

function normalizeReviewQueueStatus(value: unknown): WorkflowReviewQueueItemStatus {
  if (
    value === 'pending' ||
    value === 'copied' ||
    value === 'clipboard_replaced' ||
    value === 'dismissed' ||
    value === 'failed'
  ) {
    return value
  }
  throw new Error(`Unsupported workflow review queue status: ${String(value)}`)
}

function normalizeModelInputSources(value: unknown): WorkflowModelInputSource[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item): WorkflowModelInputSource | null => {
      const source = toRecord(item)
      const type = optionalString(source.type)
      if (!type) {
        return null
      }
      return {
        type,
        key: optionalString(source.key),
        label: optionalString(source.label),
        text: optionalString(source.text),
        stepId: optionalString(source.stepId),
        field: optionalString(source.field),
        fallback: optionalString(source.fallback)
      }
    })
    .filter((item): item is WorkflowModelInputSource => Boolean(item))
}

function normalizeModelOutputContract(
  value: unknown,
  input: Record<string, unknown>
): WorkflowModelOutputContract {
  const output = toRecord(value)
  const inputFormat = optionalString(input.outputFormat)
  const format = optionalString(output.format) ?? inputFormat ?? 'markdown'
  const schema = toRecord(output.schema)
  const reviewPolicy = output.reviewPolicy === 'approval' ? 'approval' : 'preview'
  const riskLevel =
    output.riskLevel === 'high' || output.riskLevel === 'medium' ? output.riskLevel : 'low'

  return {
    format,
    schema: Object.keys(schema).length > 0 ? schema : undefined,
    reviewPolicy,
    riskLevel
  }
}

function omitModelContractMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const { modelContract, ...rest } = metadata
  void modelContract
  return rest
}

function createDefaultManualTrigger(): WorkflowDefinition['triggers'] {
  return [
    {
      id: 'manual',
      type: 'manual',
      enabled: true,
      label: '手动运行'
    }
  ]
}

function createDefaultTemplateContextSources(limit: number): WorkflowDefinition['contextSources'] {
  return [
    {
      id: 'clipboard.recent',
      type: 'clipboard.recent',
      enabled: true,
      label: '最近剪贴板',
      config: {
        limit
      }
    },
    {
      id: 'desktop.active-app',
      type: 'desktop.active-app',
      enabled: true,
      label: '前台应用'
    },
    {
      id: 'session.memory',
      type: 'session.memory',
      enabled: true,
      label: '当前会话记忆'
    }
  ]
}

function createDefaultTemplateApprovalPolicy(): ToolApprovalPolicy {
  return {
    requireApprovalAtOrAbove: 'high',
    autoApproveReadOnly: true
  }
}

function createClipboardOrganizerTemplate(): WorkflowDefinition {
  const timestamp = now()
  return {
    id: 'builtin.organize-recent-clipboard',
    name: '整理近期剪贴板',
    description: '读取最近剪贴板历史，按主题分组并生成可复制的整理结果。',
    version: '1',
    enabled: true,
    triggers: createDefaultManualTrigger(),
    contextSources: createDefaultTemplateContextSources(8),
    toolSources: ['builtin'],
    approvalPolicy: createDefaultTemplateApprovalPolicy(),
    steps: [
      {
        id: 'organize-clipboard',
        name: '整理近期剪贴板',
        kind: 'model',
        description:
          '读取最近的剪贴板内容，按主题或任务分组，输出简明摘要和一个适合再次复制的整理结果。',
        prompt:
          '你会收到近期剪贴板、前台应用和会话记忆。请把近期剪贴板按主题或任务分组，输出 Markdown，总结每组要点，并在结尾给出一个适合再次复制的整理结果代码块。',
        input: {
          capabilityId: 'text.chat',
          outputFormat: 'markdown',
          includeCopyReadyBlock: true
        },
        inputSources: [
          {
            type: 'clipboardRef',
            key: 'clipboard.recent',
            label: '最近剪贴板'
          },
          {
            type: 'workflow.input',
            key: 'text',
            label: '手动输入'
          }
        ],
        output: {
          format: 'markdown',
          reviewPolicy: 'preview',
          riskLevel: 'low'
        },
        metadata: {
          builtin: true
        }
      }
    ],
    metadata: {
      builtin: true,
      template: true,
      category: 'clipboard',
      templateVersion: BUILTIN_WORKFLOW_TEMPLATE_VERSION
    },
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createMeetingSummaryTemplate(): WorkflowDefinition {
  const timestamp = now()
  return {
    id: 'builtin.meeting-summary',
    name: '会议纪要 / 摘要',
    description: '整理会议转写稿或会议相关文本，生成摘要、决议和行动项。',
    version: '1',
    enabled: true,
    triggers: createDefaultManualTrigger(),
    contextSources: createDefaultTemplateContextSources(6),
    toolSources: ['builtin'],
    approvalPolicy: createDefaultTemplateApprovalPolicy(),
    steps: [
      {
        id: 'summarize-meeting',
        name: '生成会议纪要',
        kind: 'model',
        description: '根据近期剪贴板、前台应用和会话记忆中的会议文本生成结构化会议纪要。',
        prompt:
          '你会收到会议转写稿、会议相关剪贴板、前台应用和会话记忆。请输出 Markdown：1. 三句话摘要；2. 决议；3. 行动项，包含负责人、截止时间和状态，未知请写“待确认”；4. 风险 / 待确认项。不要编造不存在的负责人或时间。',
        input: {
          capabilityId: 'text.summarize',
          outputFormat: 'markdown'
        },
        inputSources: [
          {
            type: 'workflow.input',
            key: 'text',
            label: '会议文本'
          },
          {
            type: 'clipboardRef',
            key: 'clipboard.recent',
            label: '最近剪贴板'
          }
        ],
        output: {
          format: 'markdown',
          reviewPolicy: 'preview',
          riskLevel: 'low'
        },
        metadata: {
          builtin: true
        }
      }
    ],
    metadata: {
      builtin: true,
      template: true,
      category: 'meeting',
      templateVersion: BUILTIN_WORKFLOW_TEMPLATE_VERSION
    },
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createBatchTextProcessingTemplate(): WorkflowDefinition {
  const timestamp = now()
  return {
    id: 'builtin.batch-text-processing',
    name: '文本批处理',
    description: '按多段文本逐条执行整理、改写、摘要或翻译建议，保留逐条结果。',
    version: '1',
    enabled: true,
    triggers: createDefaultManualTrigger(),
    contextSources: createDefaultTemplateContextSources(12),
    toolSources: ['builtin'],
    approvalPolicy: createDefaultTemplateApprovalPolicy(),
    steps: [
      {
        id: 'process-text-batch',
        name: '批量处理文本',
        kind: 'model',
        description: '从近期剪贴板和会话上下文中识别多段文本，逐条输出处理结果与失败原因。',
        prompt:
          '你会收到多段文本、近期剪贴板、前台应用和会话记忆。请把输入拆成编号条目，逐条处理并输出 Markdown 表格：序号、原文摘要、处理结果、状态、需人工确认项。默认执行清洗、格式化和摘要；如果文本明确要求翻译或改写，则按该要求处理。无法可靠处理的条目标记为“需人工确认”，不要静默跳过。',
        input: {
          capabilityId: 'text.chat',
          outputFormat: 'markdown',
          preserveItemOrder: true
        },
        inputSources: [
          {
            type: 'workflow.input',
            key: 'items',
            label: '批处理条目'
          },
          {
            type: 'clipboardRef',
            key: 'clipboard.recent',
            label: '最近剪贴板'
          }
        ],
        output: {
          format: 'markdown',
          reviewPolicy: 'preview',
          riskLevel: 'medium'
        },
        metadata: {
          builtin: true
        }
      }
    ],
    metadata: {
      builtin: true,
      template: true,
      category: 'batch-text',
      templateVersion: BUILTIN_WORKFLOW_TEMPLATE_VERSION
    },
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function createBuiltinWorkflowTemplates(): WorkflowDefinition[] {
  return [
    createClipboardOrganizerTemplate(),
    createMeetingSummaryTemplate(),
    createBatchTextProcessingTemplate()
  ]
}

export class IntelligenceWorkflowService {
  private initialized = false
  private initPromise: Promise<void> | null = null
  private executor: WorkflowExecutor | null = null

  setExecutor(executor: WorkflowExecutor): void {
    this.executor = executor
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }
    if (!this.initPromise) {
      this.initPromise = this.initializeInternal().catch((error) => {
        this.initPromise = null
        throw error
      })
    }
    await this.initPromise
  }

  async listWorkflows(options: WorkflowListOptions = {}): Promise<WorkflowDefinition[]> {
    await this.initialize()
    const db = databaseModule.getDb()
    const conditions: SQL<unknown>[] = []

    if (options.includeDisabled !== true) {
      conditions.push(eq(intelligenceWorkflowDefinitions.enabled, true))
    }

    const rows = await db
      .select()
      .from(intelligenceWorkflowDefinitions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(intelligenceWorkflowDefinitions.updatedAt))

    const steps =
      rows.length > 0
        ? await db
            .select()
            .from(intelligenceWorkflowSteps)
            .where(
              inArray(
                intelligenceWorkflowSteps.workflowId,
                rows.map((row) => row.id)
              )
            )
            .orderBy(
              asc(intelligenceWorkflowSteps.workflowId),
              asc(intelligenceWorkflowSteps.stepOrder)
            )
        : []

    const workflows = this.hydrateDefinitions(rows, steps)
    return options.includeTemplates === false
      ? workflows.filter((workflow) => workflow.metadata?.template !== true)
      : workflows
  }

  async getWorkflow(workflowId: string): Promise<WorkflowDefinition | null> {
    await this.initialize()
    const id = String(workflowId || '').trim()
    if (!id) {
      return null
    }

    const db = databaseModule.getDb()
    const rows = await db
      .select()
      .from(intelligenceWorkflowDefinitions)
      .where(eq(intelligenceWorkflowDefinitions.id, id))
      .limit(1)

    if (rows.length <= 0) {
      return null
    }

    const steps = await db
      .select()
      .from(intelligenceWorkflowSteps)
      .where(eq(intelligenceWorkflowSteps.workflowId, id))
      .orderBy(asc(intelligenceWorkflowSteps.stepOrder))

    return this.hydrateDefinitions(rows, steps)[0] ?? null
  }

  async saveWorkflow(workflow: WorkflowDefinition): Promise<WorkflowDefinition> {
    await this.initialize()
    const existing = workflow.id ? await this.getWorkflow(workflow.id) : null
    const normalized = this.normalizeWorkflowDefinition(workflow, existing ?? undefined)
    const db = databaseModule.getDb()

    await db.transaction(async (tx) => {
      await tx
        .insert(intelligenceWorkflowDefinitions)
        .values({
          id: normalized.id,
          name: normalized.name,
          description: normalized.description ?? null,
          version: normalized.version ?? null,
          enabled: normalized.enabled !== false,
          triggers: toJson(normalized.triggers, []),
          contextSources: toJson(normalized.contextSources, []),
          toolSources: toJson(normalized.toolSources, []),
          approvalPolicy: toJson(normalized.approvalPolicy, {}),
          metadata: toJson(normalized.metadata, {}),
          createdAt: new Date(normalized.createdAt ?? now()),
          updatedAt: new Date(normalized.updatedAt ?? now())
        })
        .onConflictDoUpdate({
          target: intelligenceWorkflowDefinitions.id,
          set: {
            name: normalized.name,
            description: normalized.description ?? null,
            version: normalized.version ?? null,
            enabled: normalized.enabled !== false,
            triggers: toJson(normalized.triggers, []),
            contextSources: toJson(normalized.contextSources, []),
            toolSources: toJson(normalized.toolSources, []),
            approvalPolicy: toJson(normalized.approvalPolicy, {}),
            metadata: toJson(normalized.metadata, {}),
            updatedAt: new Date(normalized.updatedAt ?? now())
          }
        })

      await tx
        .delete(intelligenceWorkflowSteps)
        .where(eq(intelligenceWorkflowSteps.workflowId, normalized.id))

      if (normalized.steps.length > 0) {
        await tx.insert(intelligenceWorkflowSteps).values(
          normalized.steps.map((step, index) => ({
            id: step.id ?? `${normalized.id}_step_${index + 1}`,
            workflowId: normalized.id,
            stepOrder: index,
            name: step.name ?? `step-${index + 1}`,
            kind: step.kind ?? 'prompt',
            description: step.description ?? null,
            prompt: step.prompt ?? null,
            toolId: step.toolId ?? null,
            toolSource: step.toolSource ?? null,
            agentId: step.agentId ?? null,
            input: toJson(step.input, {}),
            continueOnError: step.continueOnError === true,
            metadata: toJson(
              step.kind === 'model'
                ? {
                    ...omitModelContractMetadata(toRecord(step.metadata)),
                    modelContract: {
                      inputSources: step.inputSources ?? [],
                      output: step.output ?? {}
                    }
                  }
                : step.metadata,
              {}
            ),
            createdAt: new Date(normalized.createdAt ?? now()),
            updatedAt: new Date(normalized.updatedAt ?? now())
          }))
        )
      }
    })

    return (await this.getWorkflow(normalized.id)) ?? normalized
  }

  async deleteWorkflow(workflowId: string): Promise<{ deleted: boolean }> {
    await this.initialize()
    const id = String(workflowId || '').trim()
    if (!id) {
      return { deleted: false }
    }

    const existing = await this.getWorkflow(id)
    if (existing?.metadata?.builtin === true) {
      return { deleted: false }
    }

    const db = databaseModule.getDb()
    await db
      .delete(intelligenceWorkflowDefinitions)
      .where(eq(intelligenceWorkflowDefinitions.id, id))

    return { deleted: true }
  }

  async getRun(runId: string): Promise<WorkflowRunRecord | null> {
    await this.initialize()
    const id = String(runId || '').trim()
    if (!id) {
      return null
    }

    const db = databaseModule.getDb()
    const rows = await db
      .select()
      .from(intelligenceWorkflowRuns)
      .where(eq(intelligenceWorkflowRuns.id, id))
      .limit(1)

    if (rows.length <= 0) {
      return null
    }

    const steps = await db
      .select()
      .from(intelligenceWorkflowRunSteps)
      .where(eq(intelligenceWorkflowRunSteps.runId, id))
      .orderBy(asc(intelligenceWorkflowRunSteps.stepOrder))

    return this.hydrateRuns(rows, steps)[0] ?? null
  }

  async listHistory(options: WorkflowHistoryOptions = {}): Promise<WorkflowRunRecord[]> {
    await this.initialize()
    const db = databaseModule.getDb()
    const conditions: SQL<unknown>[] = []

    if (options.workflowId) {
      conditions.push(eq(intelligenceWorkflowRuns.workflowId, options.workflowId))
    }
    if (options.status) {
      conditions.push(eq(intelligenceWorkflowRuns.status, options.status))
    }

    const rows = await db
      .select()
      .from(intelligenceWorkflowRuns)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(intelligenceWorkflowRuns.startedAt))
      .limit(Math.min(Math.max(options.limit ?? 20, 1), 100))

    const stepRows =
      rows.length > 0
        ? await db
            .select()
            .from(intelligenceWorkflowRunSteps)
            .where(
              inArray(
                intelligenceWorkflowRunSteps.runId,
                rows.map((row) => row.id)
              )
            )
            .orderBy(
              asc(intelligenceWorkflowRunSteps.runId),
              asc(intelligenceWorkflowRunSteps.stepOrder)
            )
        : []

    return this.hydrateRuns(rows, stepRows)
  }

  async updateReviewQueueItem(
    request: WorkflowReviewQueueUpdateRequest
  ): Promise<WorkflowRunRecord> {
    await this.initialize()
    const runId = String(request.runId || '').trim()
    const itemId = String(request.itemId || '').trim()
    if (!runId) {
      throw new Error('runId is required')
    }
    if (!itemId) {
      throw new Error('review itemId is required')
    }

    const run = await this.getRun(runId)
    if (!run) {
      throw new Error('Workflow run not found')
    }

    const status = normalizeReviewQueueStatus(request.status)
    const metadata = toRecord(run.metadata)
    const reviewQueue = toRecord(metadata.reviewQueue)
    const items = toRecord(reviewQueue.items) as Record<string, WorkflowReviewQueueItemState>
    const nextRun = this.normalizeRunRecord({
      ...run,
      metadata: {
        ...metadata,
        reviewQueue: {
          ...reviewQueue,
          items: {
            ...items,
            [itemId]: {
              status,
              error: status === 'failed' ? optionalString(request.error) : undefined,
              updatedAt: now()
            }
          }
        }
      }
    })

    await this.persistRun(nextRun)
    return nextRun
  }

  async runWorkflow(request: WorkflowRunRequest): Promise<WorkflowRunRecord> {
    await this.initialize()

    const existingRun = request.runId ? await this.getRun(request.runId) : null
    if (existingRun && ['completed', 'failed', 'cancelled'].includes(String(existingRun.status))) {
      return existingRun
    }

    const workflow = request.workflow
      ? await this.saveWorkflow(request.workflow)
      : request.workflowId
        ? await this.getWorkflow(request.workflowId)
        : existingRun
          ? await this.getWorkflow(existingRun.workflowId)
          : null

    if (!workflow) {
      throw new Error('Workflow not found')
    }

    const triggerType = normalizeTriggerType(
      request.triggerType ?? existingRun?.triggerType ?? workflow.triggers[0]?.type
    )

    const currentRun = existingRun
      ? this.prepareResumedRun(existingRun, workflow, request, triggerType)
      : this.createInitialRun(workflow, request, triggerType)

    await this.persistRun(currentRun)

    if (!this.executor) {
      const failed: WorkflowRunRecord = {
        ...currentRun,
        status: 'failed',
        error: 'Workflow executor is not configured',
        completedAt: now()
      }
      await this.persistRun(failed)
      return failed
    }

    try {
      const result = await this.executor({
        workflow,
        run: currentRun,
        inputs: currentRun.inputs,
        sessionId: request.sessionId,
        triggerType,
        continueOnError: request.continueOnError === true,
        metadata: request.metadata,
        onUpdate: async (run) => {
          await this.persistRun(run)
        }
      })

      const finalRun = this.normalizeRunRecord({
        ...currentRun,
        ...result,
        id: currentRun.id,
        workflowId: workflow.id,
        workflowName: workflow.name,
        startedAt: currentRun.startedAt,
        completedAt:
          result.completedAt ??
          (result.status === 'running' || result.status === 'waiting_approval' ? undefined : now())
      })

      await this.persistRun(finalRun)
      return finalRun
    } catch (error) {
      const failed: WorkflowRunRecord = {
        ...currentRun,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: now()
      }
      await this.persistRun(failed)
      return failed
    }
  }

  async persistRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord> {
    await this.initialize()
    const normalized = this.normalizeRunRecord(run)
    const db = databaseModule.getDb()

    await db.transaction(async (tx) => {
      await tx
        .insert(intelligenceWorkflowRuns)
        .values({
          id: normalized.id,
          workflowId: normalized.workflowId,
          workflowName: normalized.workflowName ?? null,
          triggerType: normalized.triggerType ?? null,
          status: normalized.status,
          inputs: toJson(normalized.inputs, {}),
          outputs: toJson(normalized.outputs, {}),
          error: normalized.error ?? null,
          contextSnapshot: toJson(normalized.contextSnapshot, {}),
          metadata: toJson(normalized.metadata, {}),
          startedAt: new Date(normalized.startedAt),
          completedAt: normalized.completedAt ? new Date(normalized.completedAt) : null
        })
        .onConflictDoUpdate({
          target: intelligenceWorkflowRuns.id,
          set: {
            workflowName: normalized.workflowName ?? null,
            triggerType: normalized.triggerType ?? null,
            status: normalized.status,
            inputs: toJson(normalized.inputs, {}),
            outputs: toJson(normalized.outputs, {}),
            error: normalized.error ?? null,
            contextSnapshot: toJson(normalized.contextSnapshot, {}),
            metadata: toJson(normalized.metadata, {}),
            startedAt: new Date(normalized.startedAt),
            completedAt: normalized.completedAt ? new Date(normalized.completedAt) : null
          }
        })

      await tx
        .delete(intelligenceWorkflowRunSteps)
        .where(eq(intelligenceWorkflowRunSteps.runId, normalized.id))

      if (normalized.steps.length > 0) {
        await tx.insert(intelligenceWorkflowRunSteps).values(
          normalized.steps.map((step, index) => ({
            id: step.id ?? `${normalized.id}_step_${index + 1}`,
            runId: normalized.id,
            workflowStepId: step.workflowStepId ?? `step_${index + 1}`,
            stepOrder: index,
            name: step.name ?? `Step ${index + 1}`,
            kind: step.kind ?? 'prompt',
            status: step.status ?? 'pending',
            toolId: step.toolId ?? null,
            toolSource: step.toolSource ?? null,
            input: toJson(step.input, {}),
            output: toJson(step.output, null),
            error: step.error ?? null,
            metadata: toJson(step.metadata, {}),
            startedAt: step.startedAt ? new Date(step.startedAt) : null,
            completedAt: step.completedAt ? new Date(step.completedAt) : null
          }))
        )
      }
    })

    return normalized
  }

  private async initializeInternal(): Promise<void> {
    await this.ensureTables()
    this.initialized = true

    try {
      await this.seedBuiltinTemplates()
      workflowLog.info('Workflow service initialized')
    } catch (error) {
      this.initialized = false
      throw error
    }
  }

  private async ensureTables(): Promise<void> {
    const client = databaseModule.getClient()
    if (!client) {
      throw new Error('Database client is not ready')
    }

    const statements = [
      `CREATE TABLE IF NOT EXISTS intelligence_workflow_definitions (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        triggers TEXT NOT NULL DEFAULT '[]',
        context_sources TEXT NOT NULL DEFAULT '[]',
        tool_sources TEXT NOT NULL DEFAULT '[]',
        approval_policy TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_intelligence_workflow_definitions_enabled ON intelligence_workflow_definitions(enabled)',
      'CREATE INDEX IF NOT EXISTS idx_intelligence_workflow_definitions_updated ON intelligence_workflow_definitions(updated_at)',
      `CREATE TABLE IF NOT EXISTS intelligence_workflow_steps (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES intelligence_workflow_definitions(id) ON DELETE CASCADE,
        step_order INTEGER NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        description TEXT,
        prompt TEXT,
        tool_id TEXT,
        tool_source TEXT,
        agent_id TEXT,
        input TEXT,
        continue_on_error INTEGER NOT NULL DEFAULT 0,
        metadata TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      )`,
      'CREATE INDEX IF NOT EXISTS idx_intelligence_workflow_steps_workflow_order ON intelligence_workflow_steps(workflow_id, step_order)',
      `CREATE TABLE IF NOT EXISTS intelligence_workflow_runs (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT NOT NULL REFERENCES intelligence_workflow_definitions(id) ON DELETE CASCADE,
        workflow_name TEXT,
        trigger_type TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        inputs TEXT,
        outputs TEXT,
        error TEXT,
        context_snapshot TEXT,
        metadata TEXT,
        started_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        completed_at INTEGER
      )`,
      'CREATE INDEX IF NOT EXISTS idx_intelligence_workflow_runs_workflow_started ON intelligence_workflow_runs(workflow_id, started_at)',
      'CREATE INDEX IF NOT EXISTS idx_intelligence_workflow_runs_status_started ON intelligence_workflow_runs(status, started_at)',
      `CREATE TABLE IF NOT EXISTS intelligence_workflow_run_steps (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL REFERENCES intelligence_workflow_runs(id) ON DELETE CASCADE,
        workflow_step_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        tool_id TEXT,
        tool_source TEXT,
        input TEXT,
        output TEXT,
        error TEXT,
        metadata TEXT,
        started_at INTEGER,
        completed_at INTEGER
      )`,
      'CREATE INDEX IF NOT EXISTS idx_intelligence_workflow_run_steps_run_order ON intelligence_workflow_run_steps(run_id, step_order)'
    ]

    for (const statement of statements) {
      await client.execute(statement)
    }
  }

  private async seedBuiltinTemplates(): Promise<void> {
    for (const template of createBuiltinWorkflowTemplates()) {
      await this.seedBuiltinTemplate(template)
    }
  }

  private async seedBuiltinTemplate(template: WorkflowDefinition): Promise<void> {
    const existing = await this.getWorkflow(template.id)
    if (existing) {
      if (existing.metadata?.builtin === true) {
        await this.saveWorkflow({
          ...template,
          createdAt: existing.createdAt
        })
      }
      return
    }
    await this.saveWorkflow(template)
  }

  private createInitialRun(
    workflow: WorkflowDefinition,
    request: WorkflowRunRequest,
    triggerType: WorkflowTriggerType
  ): WorkflowRunRecord {
    const startedAt = now()
    return {
      id: makeId('workflow_run'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      triggerType,
      inputs: request.inputs ?? {},
      steps: workflow.steps.map((step, index) => ({
        id: `${step.id}_run_${index + 1}`,
        workflowStepId: step.id,
        kind: step.kind,
        name: step.name,
        status: 'pending',
        toolId: step.toolId,
        toolSource: step.toolSource,
        input: step.input ?? {},
        metadata: step.metadata
      })),
      startedAt,
      metadata: request.metadata
    }
  }

  private prepareResumedRun(
    existingRun: WorkflowRunRecord,
    workflow: WorkflowDefinition,
    request: WorkflowRunRequest,
    triggerType: WorkflowTriggerType
  ): WorkflowRunRecord {
    const stepMap = new Map(
      (existingRun.steps ?? []).map((step) => [String(step.workflowStepId || ''), step])
    )

    return this.normalizeRunRecord({
      ...existingRun,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      triggerType,
      error: undefined,
      completedAt: undefined,
      inputs: request.inputs ?? existingRun.inputs ?? {},
      metadata: {
        ...(existingRun.metadata ?? {}),
        ...(request.metadata ?? {})
      },
      steps: workflow.steps.map((step, index) => {
        const previous = stepMap.get(String(step.id || ''))
        return {
          ...previous,
          id: previous?.id ?? `${existingRun.id}_step_${index + 1}`,
          workflowStepId: step.id,
          kind: step.kind,
          name: step.name,
          toolId: step.toolId,
          toolSource: step.toolSource,
          input: previous?.input ?? step.input ?? {},
          metadata: {
            ...(step.metadata ?? {}),
            ...(previous?.metadata ?? {})
          },
          status: previous?.status ?? 'pending'
        }
      })
    })
  }

  private normalizeWorkflowDefinition(
    workflow: WorkflowDefinition,
    existing?: WorkflowDefinition
  ): WorkflowDefinition {
    const timestamp = now()
    const id = String(workflow.id || existing?.id || makeId('workflow')).trim()
    const name = String(workflow.name || existing?.name || 'Untitled Workflow').trim()

    const steps = (workflow.steps ?? existing?.steps ?? []).map((step, index) =>
      this.normalizeWorkflowStep(step, id, index)
    )

    const approvalPolicy = {
      requireApprovalAtOrAbove:
        workflow.approvalPolicy?.requireApprovalAtOrAbove ??
        existing?.approvalPolicy?.requireApprovalAtOrAbove ??
        'high',
      autoApproveReadOnly:
        workflow.approvalPolicy?.autoApproveReadOnly ??
        existing?.approvalPolicy?.autoApproveReadOnly ??
        true
    } satisfies ToolApprovalPolicy

    return {
      ...existing,
      ...workflow,
      id,
      name: name || 'Untitled Workflow',
      description: workflow.description ?? existing?.description,
      version: workflow.version ?? existing?.version ?? '1',
      enabled: workflow.enabled ?? existing?.enabled ?? true,
      triggers: (
        workflow.triggers ??
        existing?.triggers ?? [{ type: 'manual', enabled: true }]
      ).map((trigger, index) => ({
        ...trigger,
        id: String(trigger.id || `${id}_trigger_${index + 1}`).trim(),
        type: normalizeTriggerType(trigger.type),
        enabled: trigger.enabled !== false,
        config: trigger.config ?? {}
      })),
      contextSources: (
        workflow.contextSources ??
        existing?.contextSources ?? [
          { type: 'clipboard.recent', enabled: true },
          { type: 'desktop.active-app', enabled: true },
          { type: 'session.memory', enabled: true }
        ]
      ).map((source, index) => ({
        ...source,
        id: String(source.id || `${id}_context_${index + 1}`).trim(),
        enabled: source.enabled !== false,
        config: source.config ?? {}
      })),
      toolSources: Array.from(
        new Set(
          (workflow.toolSources ?? existing?.toolSources ?? ['builtin']).map(normalizeToolSource)
        )
      ),
      approvalPolicy,
      steps,
      metadata: workflow.metadata ?? existing?.metadata ?? {},
      createdAt: existing?.createdAt ?? workflow.createdAt ?? timestamp,
      updatedAt: timestamp
    }
  }

  private normalizeWorkflowStep(
    step: WorkflowDefinitionStep,
    workflowId: string,
    index: number
  ): WorkflowDefinitionStep {
    const normalizedKind = normalizeWorkflowStepKind(step.kind ?? 'prompt')
    const stepId = String(step.id || `${workflowId}_step_${index + 1}`).trim()
    const toolId = normalizedKind === 'tool' ? String(step.toolId || '').trim() : ''
    const agentId = normalizedKind === 'agent' ? String(step.agentId || '').trim() : ''

    if (normalizedKind === 'tool' && !toolId) {
      throw new Error(`Workflow tool step ${stepId} requires toolId`)
    }
    if (normalizedKind === 'agent' && !agentId) {
      throw new Error(`Workflow agent step ${stepId} requires agentId`)
    }

    const input = toRecord(step.input)
    const inputSources =
      normalizedKind === 'model'
        ? normalizeModelInputSources(step.inputSources ?? input.inputSources)
        : undefined
    const output =
      normalizedKind === 'model'
        ? normalizeModelOutputContract(step.output ?? input.output, input)
        : undefined

    return {
      ...step,
      id: stepId,
      name: String(step.name || `${normalizedKind}-${index + 1}`).trim(),
      kind: normalizedKind,
      toolSource: normalizedKind === 'tool' ? normalizeToolSource(step.toolSource) : undefined,
      toolId: normalizedKind === 'tool' ? toolId : undefined,
      agentId: normalizedKind === 'agent' ? agentId : undefined,
      prompt: normalizedKind === 'prompt' || normalizedKind === 'model' ? step.prompt : undefined,
      input,
      inputSources,
      output,
      continueOnError: step.continueOnError === true,
      metadata:
        normalizedKind === 'model'
          ? {
              ...omitModelContractMetadata(toRecord(step.metadata)),
              modelContract: {
                inputSources,
                output
              }
            }
          : step.metadata ?? {}
    }
  }

  private normalizeRunRecord(run: WorkflowRunRecord): WorkflowRunRecord {
    const runId = String(run.id || makeId('workflow_run')).trim()
    return {
      ...run,
      id: runId,
      workflowId: String(run.workflowId || '').trim(),
      workflowName: run.workflowName,
      status: normalizeRunStatus(run.status),
      triggerType: run.triggerType ? normalizeTriggerType(run.triggerType) : undefined,
      inputs: run.inputs ?? {},
      outputs: run.outputs ?? {},
      contextSnapshot: run.contextSnapshot,
      steps: (run.steps ?? []).map((step, index) => this.normalizeRunStep(step, runId, index)),
      startedAt: run.startedAt ?? now(),
      metadata: run.metadata ?? {}
    }
  }

  private normalizeRunStep(
    step: WorkflowRunRecord['steps'][number],
    runId: string,
    index: number
  ): WorkflowRunRecord['steps'][number] {
    const stepId = String(step.id || `${runId}_step_${index + 1}`).trim()
    const kind = normalizeWorkflowStepKind(step.kind ?? 'prompt')
    const toolId = kind === 'tool' ? String(step.toolId || '').trim() : ''

    if (kind === 'tool' && !toolId) {
      throw new Error(`Workflow run tool step ${stepId} requires toolId`)
    }

    return {
      ...step,
      id: stepId,
      workflowStepId: String(step.workflowStepId || `step_${index + 1}`).trim(),
      kind,
      name: String(step.name || `Step ${index + 1}`).trim(),
      status:
        step.status === 'running' ||
        step.status === 'waiting_approval' ||
        step.status === 'completed' ||
        step.status === 'failed' ||
        step.status === 'skipped'
          ? step.status
          : 'pending',
      toolId: kind === 'tool' ? toolId : undefined,
      toolSource: kind === 'tool' ? normalizeToolSource(step.toolSource) : undefined,
      input: step.input ?? {},
      output: step.output,
      metadata: step.metadata ?? {}
    }
  }

  private hydrateDefinitions(
    rows: Array<typeof intelligenceWorkflowDefinitions.$inferSelect>,
    stepRows: Array<typeof intelligenceWorkflowSteps.$inferSelect>
  ): WorkflowDefinition[] {
    const stepMap = new Map<string, Array<typeof intelligenceWorkflowSteps.$inferSelect>>()
    for (const row of stepRows) {
      const list = stepMap.get(row.workflowId) ?? []
      list.push(row)
      stepMap.set(row.workflowId, list)
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      version: row.version ?? undefined,
      enabled: row.enabled,
      triggers: parseJson(row.triggers, []),
      contextSources: parseJson(row.contextSources, []),
      toolSources: parseJson(row.toolSources, []),
      approvalPolicy: parseJson(row.approvalPolicy, undefined),
      metadata: parseJson(row.metadata, {}),
      createdAt: row.createdAt ? new Date(row.createdAt).getTime() : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).getTime() : undefined,
      steps: (stepMap.get(row.id) ?? []).map((step, index) => {
        const input = parseJson<Record<string, unknown>>(step.input, {})
        const metadata = parseJson<Record<string, unknown>>(step.metadata, {})
        const modelContract = toRecord(metadata.modelContract)
        return this.normalizeWorkflowStep(
          {
            id: step.id,
            name: step.name,
            kind: step.kind,
            description: step.description ?? undefined,
            prompt: step.prompt ?? undefined,
            toolId: step.toolId ?? undefined,
            toolSource: step.toolSource ?? undefined,
            agentId: step.agentId ?? undefined,
            input,
            inputSources: normalizeModelInputSources(modelContract.inputSources),
            output: normalizeModelOutputContract(modelContract.output, input),
            continueOnError: step.continueOnError,
            metadata
          },
          row.id,
          index
        )
      })
    }))
  }

  private hydrateRuns(
    rows: Array<typeof intelligenceWorkflowRuns.$inferSelect>,
    stepRows: Array<typeof intelligenceWorkflowRunSteps.$inferSelect>
  ): WorkflowRunRecord[] {
    const stepMap = new Map<string, Array<typeof intelligenceWorkflowRunSteps.$inferSelect>>()
    for (const row of stepRows) {
      const list = stepMap.get(row.runId) ?? []
      list.push(row)
      stepMap.set(row.runId, list)
    }

    return rows.map((row) => ({
      id: row.id,
      workflowId: row.workflowId,
      workflowName: row.workflowName ?? undefined,
      status: normalizeRunStatus(row.status),
      triggerType: row.triggerType ? normalizeTriggerType(row.triggerType) : undefined,
      inputs: parseJson(row.inputs, {}),
      outputs: parseJson(row.outputs, {}),
      error: row.error ?? undefined,
      contextSnapshot: parseJson(row.contextSnapshot, undefined),
      metadata: parseJson(row.metadata, {}),
      startedAt: row.startedAt ? new Date(row.startedAt).getTime() : now(),
      completedAt: row.completedAt ? new Date(row.completedAt).getTime() : undefined,
      steps: (stepMap.get(row.id) ?? []).map((step, index) =>
        this.normalizeRunStep(
          {
            id: step.id,
            workflowStepId: step.workflowStepId,
            kind: step.kind,
            name: step.name,
            status: step.status,
            toolId: step.toolId ?? undefined,
            toolSource: step.toolSource ?? undefined,
            input: parseJson(step.input, {}),
            output: parseJson(step.output, undefined),
            error: step.error ?? undefined,
            metadata: parseJson(step.metadata, {}),
            startedAt: step.startedAt ? new Date(step.startedAt).getTime() : undefined,
            completedAt: step.completedAt ? new Date(step.completedAt).getTime() : undefined
          },
          row.id,
          index
        )
      )
    }))
  }
}

export const intelligenceWorkflowService = new IntelligenceWorkflowService()
