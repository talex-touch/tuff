<script lang="ts" name="IntelligenceWorkflowPage" setup>
import type { WorkflowStepKind } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex'
import { computed, onMounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import ViewTemplate from '~/components/base/template/ViewTemplate.vue'
import { useWorkflowEditor, WorkflowValidationError } from '~/modules/hooks/useWorkflowEditor'

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
  approveTicket
} = useWorkflowEditor()

const runStatusText = computed(() => {
  switch (currentRun.value?.status) {
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'waiting_approval':
      return '等待审批'
    case 'running':
      return '运行中'
    case 'cancelled':
      return '已取消'
    default:
      return '未运行'
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
  return 'Agent'
}

function displayStepKind(kind?: string): string {
  return kindLabel(kind === 'tool' || kind === 'prompt' ? kind : 'agent')
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
    toast.success(`工作流已保存：${saved.name}`)
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleDelete(): Promise<void> {
  try {
    await deleteWorkflow()
    toast.success('工作流已删除')
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleRun(): Promise<void> {
  try {
    const result = await runWorkflow()
    if (result.status === 'waiting_approval') {
      toast.info('工作流已暂停，等待工具审批')
      return
    }
    toast.success('工作流执行完成')
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleResume(): Promise<void> {
  try {
    const result = await resumeCurrentRun()
    if (!result) {
      toast.error('当前没有可恢复的运行')
      return
    }
    if (result.status === 'waiting_approval') {
      toast.info('仍有工具等待审批')
      return
    }
    toast.success('工作流已恢复')
  } catch (error) {
    toast.error(resolveValidationMessage(error))
  }
}

async function handleApproval(ticketId: string, approved: boolean): Promise<void> {
  try {
    await approveTicket(ticketId, approved)
    toast.success(approved ? '已批准工具调用' : '已拒绝工具调用')
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
  <ViewTemplate title="Tuff Intelligence Workflows">
    <div class="workflow-page">
      <section class="workflow-sidebar card-panel">
        <div class="section-head">
          <div>
            <h2>模板与工作流</h2>
            <p>内置模板、已保存工作流与当前编辑对象都在这里。</p>
          </div>
          <TxButton variant="flat" @click="createWorkflowFromScratch">
            <i class="i-carbon-add" />
            <span>新建</span>
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
              <span v-if="workflow.metadata?.template" class="mini-badge">模板</span>
              <span v-if="workflow.metadata?.builtin" class="mini-badge mini-badge--ghost"
                >内置</span
              >
            </div>
            <div class="workflow-list-item__meta">
              <span>{{ workflow.enabled === false ? '已停用' : '可用' }}</span>
              <span>{{ workflow.steps.length }} 步</span>
            </div>
          </button>

          <div v-if="!loading && workflows.length === 0" class="empty-state">
            还没有可用工作流，先创建一个。
          </div>
        </div>
      </section>

      <section class="workflow-main">
        <div class="workflow-toolbar card-panel">
          <div>
            <h1>{{ workflowDraft.name || '新工作流' }}</h1>
            <p>v1 范围固定为可保存工作流、MCP 工具桥和轻量桌面上下文。</p>
          </div>
          <div class="toolbar-actions">
            <TxButton variant="flat" :loading="saving" @click="handleSave">
              <i class="i-carbon-save" />
              <span>{{ workflowDraft.isBuiltin ? '另存为副本' : '保存' }}</span>
            </TxButton>
            <TxButton
              variant="flat"
              :disabled="!canDeleteCurrent"
              :loading="deleting"
              @click="handleDelete"
            >
              <i class="i-carbon-trash-can" />
              <span>删除</span>
            </TxButton>
            <TxButton type="primary" :loading="running" @click="handleRun">
              <i class="i-carbon-play" />
              <span>运行</span>
            </TxButton>
            <TxButton
              variant="flat"
              :disabled="currentRun?.status !== 'waiting_approval'"
              @click="handleResume"
            >
              <i class="i-carbon-play-filled-alt" />
              <span>恢复</span>
            </TxButton>
          </div>
        </div>

        <div class="workflow-grid">
          <section class="card-panel editor-panel">
            <div class="section-head">
              <div>
                <h2>基础信息</h2>
                <p>工作流定义、触发器、上下文源和工具源。</p>
              </div>
            </div>

            <div class="form-grid">
              <label class="field">
                <span class="field-label">名称</span>
                <input
                  v-model="workflowDraft.name"
                  type="text"
                  placeholder="例如：整理近期剪贴板"
                />
              </label>

              <label class="field">
                <span class="field-label">描述</span>
                <input
                  v-model="workflowDraft.description"
                  type="text"
                  placeholder="描述这个工作流要完成什么"
                />
              </label>

              <label class="field field--checkbox">
                <input v-model="workflowDraft.enabled" type="checkbox" />
                <span>启用工作流</span>
              </label>

              <label class="field">
                <span class="field-label">审批阈值</span>
                <select v-model="workflowDraft.approvalThreshold">
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </label>

              <label class="field field--checkbox">
                <input v-model="workflowDraft.autoApproveReadOnly" type="checkbox" />
                <span>只读工具自动批准</span>
              </label>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>工具源</h3>
                <p>builtin 负责轻量桌面/剪贴板/浏览器入口，深浏览器和云服务走 MCP。</p>
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
                <h3>触发器</h3>
                <div class="subsection-actions">
                  <TxButton variant="flat" @click="addTrigger('manual')">
                    <span>手动触发</span>
                  </TxButton>
                  <TxButton variant="flat" @click="addTrigger('clipboard.batch')">
                    <span>剪贴板批处理</span>
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
                      <span class="field-label">类型</span>
                      <select v-model="trigger.type">
                        <option value="manual">manual</option>
                        <option value="clipboard.batch">clipboard.batch</option>
                      </select>
                    </label>
                    <label class="field">
                      <span class="field-label">标签</span>
                      <input v-model="trigger.label" type="text" placeholder="显示名称" />
                    </label>
                    <label class="field field--checkbox">
                      <input v-model="trigger.enabled" type="checkbox" />
                      <span>启用</span>
                    </label>
                    <TxButton variant="flat" @click="removeTrigger(trigger.uid)">
                      <span>移除</span>
                    </TxButton>
                  </div>
                  <label class="field">
                    <span class="field-label">配置 JSON</span>
                    <textarea v-model="trigger.config" rows="3" />
                  </label>
                </article>
              </div>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>桌面上下文源</h3>
                <p>默认启用轻量上下文，不做静默截图或全量桌面代理。</p>
              </div>
              <div class="stack-list">
                <article
                  v-for="source in workflowDraft.contextSources"
                  :key="source.uid"
                  class="small-card"
                >
                  <div class="mini-grid">
                    <label class="field">
                      <span class="field-label">类型</span>
                      <input v-model="source.type" type="text" />
                    </label>
                    <label class="field">
                      <span class="field-label">标签</span>
                      <input v-model="source.label" type="text" />
                    </label>
                    <label class="field field--checkbox">
                      <input v-model="source.enabled" type="checkbox" />
                      <span>启用</span>
                    </label>
                  </div>
                  <label class="field">
                    <span class="field-label">配置 JSON</span>
                    <textarea v-model="source.config" rows="2" />
                  </label>
                </article>
              </div>
            </div>

            <div class="subsection">
              <div class="subsection-head">
                <h3>Metadata JSON</h3>
                <p>MCP profile、分类、模板标记等高级信息可以放这里。</p>
              </div>
              <label class="field">
                <textarea v-model="workflowDraft.metadata" rows="6" />
              </label>
            </div>
          </section>

          <section class="card-panel editor-panel">
            <div class="section-head">
              <div>
                <h2>步骤编辑器</h2>
                <p>{{ activeStepCount }} 个步骤，v1 仅支持 `prompt / tool / agent`。</p>
              </div>
              <div class="subsection-actions">
                <TxButton variant="flat" @click="addStep('prompt')">
                  <span>新增 Prompt</span>
                </TxButton>
                <TxButton variant="flat" @click="addStep('tool')">
                  <span>新增 Tool</span>
                </TxButton>
                <TxButton variant="flat" @click="addStep('agent')">
                  <span>新增 Agent</span>
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
                    <div class="step-card__index">Step {{ index + 1 }}</div>
                    <div class="step-card__title">
                      {{ step.name || `Step ${index + 1}` }}
                    </div>
                  </div>
                  <TxButton variant="flat" @click="removeStep(step.uid)">
                    <span>移除</span>
                  </TxButton>
                </div>

                <div class="form-grid">
                  <label class="field">
                    <span class="field-label">Step ID</span>
                    <input v-model="step.id" type="text" />
                  </label>

                  <label class="field">
                    <span class="field-label">名称</span>
                    <input v-model="step.name" type="text" />
                  </label>

                  <label class="field">
                    <span class="field-label">类型</span>
                    <select v-model="step.kind">
                      <option value="prompt">prompt</option>
                      <option value="tool">tool</option>
                      <option value="agent">agent</option>
                    </select>
                  </label>

                  <label class="field field--checkbox">
                    <input v-model="step.continueOnError" type="checkbox" />
                    <span>本步骤失败后继续</span>
                  </label>
                </div>

                <label class="field">
                  <span class="field-label">说明 / Prompt</span>
                  <textarea
                    v-model="step.instruction"
                    rows="4"
                    :placeholder="
                      step.kind === 'prompt' ? '输入该步骤的 Prompt' : '输入该步骤的执行说明'
                    "
                  />
                </label>

                <div v-if="step.kind === 'tool'" class="form-grid">
                  <label class="field">
                    <span class="field-label">Tool ID</span>
                    <input v-model="step.toolId" type="text" list="builtin-tool-options" />
                  </label>

                  <label class="field">
                    <span class="field-label">Tool Source</span>
                    <select v-model="step.toolSource">
                      <option value="builtin">builtin</option>
                      <option value="mcp">mcp</option>
                    </select>
                  </label>
                </div>

                <label v-if="step.kind === 'agent'" class="field">
                  <span class="field-label">Agent ID</span>
                  <input
                    v-model="step.agentId"
                    type="text"
                    list="agent-options"
                    placeholder="deepagent.workflow"
                  />
                </label>

                <label class="field">
                  <span class="field-label">输入 JSON</span>
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
            <h2>运行态</h2>
            <p>展示当前运行、待审批工具和最近历史。</p>
          </div>
          <span :class="runStatusClass">{{ runStatusText }}</span>
        </div>

        <div class="runtime-block">
          <div class="runtime-kv">
            <span>当前工作流</span>
            <strong>{{ workflowDraft.name || '-' }}</strong>
          </div>
          <div class="runtime-kv">
            <span>最近运行 ID</span>
            <strong>{{ currentRun?.id || '-' }}</strong>
          </div>
          <div class="runtime-kv">
            <span>开始时间</span>
            <strong>{{ formatDate(currentRun?.startedAt) }}</strong>
          </div>
          <div class="runtime-kv">
            <span>结束时间</span>
            <strong>{{ formatDate(currentRun?.completedAt) }}</strong>
          </div>
          <div v-if="executionError" class="runtime-error">
            {{ executionError }}
          </div>
        </div>

        <div class="subsection">
          <div class="subsection-head">
            <h3>审批面板</h3>
            <p>high / critical 工具调用会在这里暂停并等待恢复。</p>
          </div>

          <div v-if="pendingApprovals.length === 0" class="empty-state">当前没有待审批工具。</div>

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
                <span>拒绝</span>
              </TxButton>
              <TxButton type="primary" @click="handleApproval(ticket.id, true)">
                <span>批准并恢复</span>
              </TxButton>
            </div>
          </article>
        </div>

        <div v-if="currentRun" class="subsection">
          <div class="subsection-head">
            <h3>当前运行步骤</h3>
            <p>直接查看每个 step 的状态和输出。</p>
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

        <div class="subsection">
          <div class="subsection-head">
            <h3>运行历史</h3>
            <p>点击历史记录可以重新查看它的审批状态和输出。</p>
          </div>

          <div v-if="history.length === 0" class="empty-state">还没有运行历史。</div>

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
              <span>{{ run.steps.length }} 步</span>
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
