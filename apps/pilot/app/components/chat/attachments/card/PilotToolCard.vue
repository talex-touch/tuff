<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { endHttp } from '~/composables/api/axios'

const props = defineProps<{
  block: IInnerItemMeta
}>()
const TOOL_APPROVAL_DECISION_EVENT = 'pilot-tool-approval-decision'
const TOOL_SOURCE_PREVIEW_LIMIT = 5
const TOOL_SOURCE_SNIPPET_MAX = 180

function parseJsonRecord(value: string | undefined): Record<string, any> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {}
  }
  catch {
    return {}
  }
}

const payload = computed(() => parseJsonRecord(props.block.data))
const route = useRoute()
const decidingAction = ref<'approve' | 'reject' | ''>('')

const blockExtra = computed(() => (
  props.block.extra && typeof props.block.extra === 'object' && !Array.isArray(props.block.extra)
    ? props.block.extra as Record<string, unknown>
    : {}
))

function includesToolApprovalRequired(value: unknown): boolean {
  const text = String(value || '').trim().toUpperCase()
  if (!text) {
    return false
  }
  return text === 'TOOL_APPROVAL_REQUIRED' || text.includes('TOOL_APPROVAL_REQUIRED')
}

const payloadDetail = computed(() => (
  payload.value.detail && typeof payload.value.detail === 'object' && !Array.isArray(payload.value.detail)
    ? payload.value.detail as Record<string, unknown>
    : {}
))

const approvalStatus = computed(() => String(payload.value.status || '').trim().toLowerCase())
const ticketId = computed(() => String(
  payload.value.ticketId
  || payload.value.ticket_id
  || payloadDetail.value.ticketId
  || payloadDetail.value.ticket_id
  || blockExtra.value.ticketId
  || blockExtra.value.ticket_id
  || '',
).trim())
const sessionId = computed(() => String(
  payload.value.sessionId
  || payload.value.session_id
  || payloadDetail.value.sessionId
  || payloadDetail.value.session_id
  || blockExtra.value.sessionId
  || blockExtra.value.session_id
  || route.query.id
  || '',
).trim())
const isShareView = computed(() => {
  const raw = route.query.share
  if (raw === undefined || raw === null) {
    return false
  }
  const text = String(raw).trim().toLowerCase()
  if (!text || text === '0' || text === 'false' || text === 'no' || text === 'off') {
    return false
  }
  return true
})
const isApprovalRequired = computed(() => (
  approvalStatus.value === 'approval_required'
  || approvalStatus.value === 'waiting_approval'
  || includesToolApprovalRequired(payload.value.errorCode)
  || includesToolApprovalRequired(payload.value.code)
  || includesToolApprovalRequired(payloadDetail.value.code)
))
const canDecideApproval = computed(() => (
  isApprovalRequired.value
  && ticketId.value.length > 0
  && sessionId.value.length > 0
  && !isShareView.value
))

function patchToolCardPayload(patch: Record<string, unknown>) {
  const current = parseJsonRecord(props.block.data)
  const next = {
    ...current,
    ...patch,
  }

  ;(props.block as any).data = JSON.stringify(next)
  ;(props.block as any).extra = {
    ...(blockExtra.value || {}),
    status: String(next.status || blockExtra.value.status || '').trim(),
    ticketId: String(next.ticketId || blockExtra.value.ticketId || '').trim(),
    sessionId: String(next.sessionId || blockExtra.value.sessionId || '').trim(),
  }
}

async function decideApproval(approved: boolean) {
  if (!canDecideApproval.value || decidingAction.value) {
    return
  }

  decidingAction.value = approved ? 'approve' : 'reject'
  try {
    const res: any = await endHttp.$http({
      method: 'POST',
      url: `v1/chat/sessions/${encodeURIComponent(sessionId.value)}/tool-approvals/${encodeURIComponent(ticketId.value)}`,
      data: {
        approved,
      },
    })
    if (res?.code && Number(res.code) !== 200) {
      throw new Error(String(res.message || '审批提交失败'))
    }

    patchToolCardPayload({
      status: approved ? 'approved' : 'rejected',
      errorMessage: approved ? '' : (payload.value.errorMessage || '工具调用已拒绝'),
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TOOL_APPROVAL_DECISION_EVENT, {
        detail: {
          sessionId: sessionId.value,
          ticketId: ticketId.value,
          approved,
        },
      }))
    }

    ElMessage.success(approved ? '已批准，正在继续执行。' : '已拒绝该工具调用。')
  }
  catch (error) {
    const message = String((error as any)?.message || '').trim()
    ElMessage.error(message || '审批提交失败，请稍后重试。')
  }
  finally {
    decidingAction.value = ''
  }
}

const sources = computed(() => {
  const rows = payload.value.sources
  if (!Array.isArray(rows)) {
    return []
  }
  return rows
    .filter(item => item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const row = item as Record<string, unknown>
      const snippetRaw = String(row.snippet || '').trim().replace(/\s+/g, ' ')
      const snippet = snippetRaw.length > TOOL_SOURCE_SNIPPET_MAX
        ? `${snippetRaw.slice(0, TOOL_SOURCE_SNIPPET_MAX)}...`
        : snippetRaw
      return {
        url: String(row.url || '').trim(),
        title: String(row.title || row.url || '').trim() || '未命名来源',
        domain: String(row.domain || '').trim(),
        snippet,
      }
    })
    .filter(item => item.url)
    .slice(0, TOOL_SOURCE_PREVIEW_LIMIT)
})

const statusText = computed(() => {
  const status = String(payload.value.status || '').trim().toLowerCase()
  if (status === 'started') {
    return '执行中'
  }
  if (status === 'approval_required') {
    return '等待审批'
  }
  if (status === 'approved') {
    return '已审批'
  }
  if (status === 'rejected') {
    return '已拒绝'
  }
  if (status === 'failed') {
    return '失败'
  }
  if (status === 'completed') {
    return '完成'
  }
  return status || '未知'
})

const riskLevelText = computed(() => {
  const risk = String(payload.value.riskLevel || '').trim().toLowerCase()
  if (risk === 'critical') {
    return 'critical'
  }
  if (risk === 'high') {
    return 'high'
  }
  if (risk === 'medium') {
    return 'medium'
  }
  if (risk === 'low') {
    return 'low'
  }
  return 'n/a'
})
</script>

<template>
  <div class="PilotToolCard fake-background">
    <header class="PilotToolCard-Header">
      <div class="left">
        <i class="i-carbon-tool-box" />
        <strong>{{ payload.toolName || 'tool' }}</strong>
      </div>
      <div class="right">
        <span class="status">{{ statusText }}</span>
        <span class="risk">{{ riskLevelText }}</span>
      </div>
    </header>

    <p v-if="payload.inputPreview" class="line">
      <span class="label">Input</span>
      <span class="value">{{ payload.inputPreview }}</span>
    </p>
    <p v-if="payload.outputPreview" class="line">
      <span class="label">Output</span>
      <span class="value">{{ payload.outputPreview }}</span>
    </p>
    <p v-if="payload.errorMessage" class="line error">
      <span class="label">Error</span>
      <span class="value">{{ payload.errorMessage }}</span>
    </p>

    <ul v-if="sources.length > 0" class="sources">
      <li v-for="(item, index) in sources" :key="`${item.url}-${index}`">
        <a :href="item.url" target="_blank" rel="noopener noreferrer" class="source-title">
          {{ item.title }}
        </a>
        <small v-if="item.domain" class="source-domain">({{ item.domain }})</small>
        <p class="source-url">
          {{ item.url }}
        </p>
        <p v-if="item.snippet" class="source-snippet">
          {{ item.snippet }}
        </p>
      </li>
    </ul>

    <footer class="PilotToolCard-Footer">
      <span v-if="payload.durationMs">耗时 {{ (Number(payload.durationMs) / 1000).toFixed(2) }}s</span>
      <span v-if="ticketId">ticket: {{ ticketId }}</span>
      <span v-if="payload.callId">call: {{ payload.callId }}</span>
    </footer>

    <div v-if="canDecideApproval" class="PilotToolCard-Actions">
      <el-button
        type="success"
        size="small"
        :loading="decidingAction === 'approve'"
        :disabled="!!decidingAction"
        @click="decideApproval(true)"
      >
        批准
      </el-button>
      <el-button
        size="small"
        :loading="decidingAction === 'reject'"
        :disabled="!!decidingAction"
        @click="decideApproval(false)"
      >
        拒绝
      </el-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.PilotToolCard {
  min-width: min(560px, 72vw);
  max-width: min(760px, 86vw);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: color-mix(in srgb, var(--el-bg-color-page) 94%, transparent);
}

.PilotToolCard-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  .left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
}

.status {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-primary-light-9) 86%, transparent);
}

.risk {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-warning-light-9) 82%, transparent);
}

.line {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.value {
  font-size: 13px;
  white-space: pre-wrap;
}

.error .value {
  color: var(--el-color-danger);
}

.sources {
  margin: 0;
  padding-left: 16px;
  display: grid;
  gap: 4px;
  font-size: 12px;

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
}

.source-title {
  font-weight: 600;
}

.source-domain {
  color: var(--el-text-color-secondary);
}

.source-url {
  margin: 0;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.source-snippet {
  margin: 0;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  line-height: 1.4;
}

.PilotToolCard-Footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.PilotToolCard-Actions {
  display: flex;
  gap: 8px;
}
</style>
