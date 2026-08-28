<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { requestJson } from '~/utils/request'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useAuthUser()

const isAdmin = computed(() => user.value?.role === 'admin')
watch(isAdmin, (admin) => {
  if (user.value && !admin)
    navigateTo('/dashboard/overview')
}, { immediate: true })

type ActionKey = 'mode' | 'unblock' | 'case' | 'dual'

interface ConfirmRequest {
  action: ActionKey
  title: string
  summary: string
  warning: string
  confirmLabel: string
}

interface Outcome {
  tone: 'success' | 'pending' | 'error'
  title: string
  detail: string
  operationId: string
  raw: string
}

const stepUpToken = ref('')
const mode = ref<'NORMAL' | 'ELEVATED' | 'EXTREME'>('ELEVATED')
const modeReason = ref('')
const actorInput = ref('')
const actorReason = ref('')
const caseIp = ref('')
const caseReason = ref('')
const pendingOperationId = ref('')
const pendingDecision = ref<'confirm' | 'reject'>('confirm')
const pendingReason = ref('')

const pendingAction = ref<ActionKey | null>(null)
const busy = computed(() => pendingAction.value !== null)
const outcome = ref<Outcome | null>(null)
const validationError = ref('')
const confirmRequest = ref<ConfirmRequest | null>(null)

const actorList = computed(() => actorInput.value
  .split('\n')
  .map(item => item.trim())
  .filter(Boolean))

/**
 * Control-plane failures are rendered from this table, never from the response
 * body. Nitro returns `stack` with absolute filesystem paths outside
 * production, and the runtime credential policy puts environment variable names
 * into `statusMessage` on 5xx, so echoing the server's own text would surface
 * both on the highest-privilege screen in the product.
 */
const SERVER_MESSAGE_GUIDANCE: Record<string, string> = {
  'Passkey step-up required.': 'Mint a fresh one-time passkey step-up token and paste it above. Each token authorises a single request.',
  'Insufficient admin scope.': 'The credential used for this request does not carry the scope this action needs.',
  'Channel not allowed.': 'This action cannot be performed over the channel you are authenticated on.',
  'Control plane restricted in EXTREME mode.': 'Defense mode is EXTREME, which restricts the control plane itself. Use the emergency console to recover.',
  'Admin break-glass is disabled.': 'Break-glass access is switched off in this environment.',
  'Rate limited': 'Too many control-plane writes in the current window. Wait for the window to reset before retrying.',
  'actor or actors is required.': 'Enter at least one actor or IP address.',
  'No actor to unblock.': 'None of the supplied lines parsed as a usable actor or IP address.',
  'Invalid mode.': 'The selected defense mode is not one the control plane accepts.',
  'Invalid ip.': 'That IP address is not in a form the control plane accepts.',
  'Invalid risk case review payload.': 'The case review payload was rejected as malformed.',
  'Unsupported case review payload.': 'The control plane does not support this kind of case review.',
  'operation_id is required.': 'Enter the pending operation id to act on.',
  'Pending operation not found.': 'No pending operation matches that id. It may have already been decided.',
  'Pending operation expired.': 'That pending operation passed its approval window and can no longer be decided.',
  'Pending operation already processed.': 'That pending operation has already been confirmed or rejected.',
  'Pending operation payload mismatch.': 'The stored payload for that operation failed its integrity check and will not be executed.',
  'Submitter cannot confirm own operation.': 'Dual control requires a second administrator. The account that raised an operation cannot decide it.',
  'Scope mismatch for dual-control confirm.': 'Your credential does not carry the scope that pending operation requires.',
  'Unsupported pending operation action.': 'That pending operation refers to an action this console cannot execute.',
  Unauthorized: 'Your admin session is no longer valid. Sign in again and retry.',
}

const STATUS_GUIDANCE: Record<number, string> = {
  400: 'The control plane rejected the request payload. Check the field values and try again.',
  401: 'Your admin session is no longer valid. Sign in again and retry.',
  403: 'The control plane refused this action for the credential you used.',
  404: 'That control-plane endpoint is not available in this environment.',
  409: 'The control plane reported a conflicting state for this operation.',
  429: 'Rate limited by the control plane. Wait for the window to reset before retrying.',
  503: 'The control plane is restricted right now and is refusing writes.',
}

function readStatusCode(error: unknown): number {
  const candidate = error as {
    statusCode?: unknown
    status?: unknown
    response?: { status?: unknown }
    data?: { statusCode?: unknown }
  } | null
  const values = [
    candidate?.statusCode,
    candidate?.status,
    candidate?.response?.status,
    candidate?.data?.statusCode,
  ]
  const found = values.find(value => typeof value === 'number' && value > 0)
  return typeof found === 'number' ? found : 0
}

function readServerMessage(error: unknown): string {
  const candidate = error as { data?: { statusMessage?: unknown } } | null
  const message = candidate?.data?.statusMessage
  return typeof message === 'string' ? message.trim() : ''
}

function describeFailure(error: unknown): { title: string, detail: string } {
  const status = readStatusCode(error)
  if (status === 0) {
    return {
      title: 'Request never reached the control plane',
      detail: 'The browser could not complete the request. Check your connection and retry.',
    }
  }

  const guidance = SERVER_MESSAGE_GUIDANCE[readServerMessage(error)]
  if (guidance)
    return { title: `Rejected (HTTP ${status})`, detail: guidance }

  if (status >= 500) {
    return {
      title: `Server error (HTTP ${status})`,
      detail: 'The control plane failed to handle this request. The response body is withheld here because control-plane failures can name internal configuration; read the server logs for the cause.',
    }
  }

  return {
    title: `Rejected (HTTP ${status})`,
    detail: STATUS_GUIDANCE[status] ?? 'The control plane refused this request.',
  }
}

function isPendingResponse(data: unknown): data is { pending: true, pending_operation_id?: string, expires_at?: string } {
  return !!data && typeof data === 'object' && (data as { pending?: unknown }).pending === true
}

function formatRaw(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2)
  }
  catch {
    return String(data)
  }
}

/**
 * Step-up tokens are consumed by the guard on the way in, so a token that has
 * been sent is spent whatever the endpoint answered. Leaving it in the field
 * invites a second attempt that can only fail.
 */
function clearSpentStepUpToken() {
  stepUpToken.value = ''
}

function authHeaders() {
  const headers: Record<string, string> = {}
  const token = stepUpToken.value.trim()
  if (token)
    headers['X-Login-Token'] = token
  return headers
}

async function runAction(action: ActionKey, path: string, body: Record<string, unknown>, describeSuccess: (data: unknown) => string) {
  pendingAction.value = action
  validationError.value = ''
  const tokenWasSent = stepUpToken.value.trim().length > 0
  try {
    const data = await requestJson<unknown>(path, {
      method: 'POST',
      headers: authHeaders(),
      body,
    })
    if (tokenWasSent)
      clearSpentStepUpToken()

    if (isPendingResponse(data)) {
      const operationId = typeof data.pending_operation_id === 'string' ? data.pending_operation_id : ''
      outcome.value = {
        tone: 'pending',
        title: 'Awaiting a second approver',
        detail: 'Dual control applies to this action, so nothing has changed yet. A different administrator must confirm the pending operation before it executes.',
        operationId,
        raw: formatRaw(data),
      }
      return
    }

    outcome.value = {
      tone: 'success',
      title: 'Action executed',
      detail: describeSuccess(data),
      operationId: '',
      raw: formatRaw(data),
    }
  }
  catch (error) {
    if (tokenWasSent && readStatusCode(error) !== 0)
      clearSpentStepUpToken()
    const { title, detail } = describeFailure(error)
    outcome.value = { tone: 'error', title, detail, operationId: '', raw: '' }
  }
  finally {
    pendingAction.value = null
  }
}

function askConfirm(request: ConfirmRequest) {
  validationError.value = ''
  confirmRequest.value = request
}

function requestModeOverride() {
  askConfirm({
    action: 'mode',
    title: 'Change the global defense mode',
    summary: `Every request handled by this deployment will be evaluated under ${mode.value} until the mode is changed again.`,
    warning: mode.value === 'EXTREME'
      ? 'EXTREME also restricts this control plane. Once applied you may only be able to recover through the emergency console.'
      : mode.value === 'NORMAL'
        ? 'Lowering the mode to NORMAL requires a second approver, so this will be queued rather than applied immediately.'
        : 'This raises enforcement for all traffic.',
    confirmLabel: `Set mode to ${mode.value}`,
  })
}

function requestActorUnblock() {
  if (actorList.value.length === 0) {
    validationError.value = 'Enter at least one actor or IP address, one per line.'
    return
  }
  const preview = actorList.value.slice(0, 5).join(', ')
  const rest = actorList.value.length > 5 ? ` and ${actorList.value.length - 5} more` : ''
  askConfirm({
    action: 'unblock',
    title: 'Remove risk blocks',
    summary: `${actorList.value.length} actor(s) will be unblocked: ${preview}${rest}.`,
    warning: actorList.value.length > 50
      ? 'Batches above 50 actors require a second approver and will be queued rather than applied immediately.'
      : 'Traffic from these actors will stop being blocked as soon as the change lands.',
    confirmLabel: 'Remove blocks now',
  })
}

function requestCaseReview() {
  if (!caseIp.value.trim()) {
    validationError.value = 'Enter the IP address to ban.'
    return
  }
  askConfirm({
    action: 'case',
    title: 'Create a permanent IP ban',
    summary: `${caseIp.value.trim()} will be banned permanently.`,
    warning: 'Permanent bans always require a second approver, so this will be queued as a pending operation rather than applied immediately.',
    confirmLabel: 'Create the ban case',
  })
}

function requestDualControlDecision() {
  if (!pendingOperationId.value.trim()) {
    validationError.value = 'Enter the pending operation id to decide.'
    return
  }
  const rejecting = pendingDecision.value === 'reject'
  askConfirm({
    action: 'dual',
    title: rejecting ? 'Reject a pending operation' : 'Confirm a pending operation',
    summary: `Operation ${pendingOperationId.value.trim()} will be ${rejecting ? 'rejected and discarded' : 'approved and executed immediately'}.`,
    warning: rejecting
      ? 'The queued action will be discarded and cannot be resumed; it would have to be raised again.'
      : 'Approving runs the queued action straight away with the payload the submitter recorded.',
    confirmLabel: rejecting ? 'Reject operation' : 'Confirm and execute',
  })
}

const CONFIRM_HANDLERS: Record<ActionKey, () => Promise<void>> = {
  mode: () => runAction(
    'mode',
    '/api/admin/risk/mode.override',
    { mode: mode.value, reason: modeReason.value.trim() || null },
    () => `Defense mode is now ${mode.value}.`,
  ),
  unblock: () => runAction(
    'unblock',
    '/api/admin/risk/actor.unblock',
    { actors: actorList.value, reason: actorReason.value.trim() || null },
    (data) => {
      const result = data as { total?: number, successCount?: number } | null
      const total = typeof result?.total === 'number' ? result.total : actorList.value.length
      const succeeded = typeof result?.successCount === 'number' ? result.successCount : total
      if (succeeded === total)
        return `Unblocked ${total} of ${total} actor(s).`
      return `Unblocked ${succeeded} of ${total} actor(s). The rest were already clear or could not be updated — expand the raw response for the per-actor breakdown.`
    },
  ),
  case: () => runAction(
    'case',
    '/api/admin/risk/case.review',
    {
      kind: 'ip-ban-upsert',
      ip: caseIp.value.trim(),
      enabled: true,
      permanent: true,
      reason: caseReason.value.trim() || null,
    },
    () => `Permanent ban recorded for ${caseIp.value.trim()}.`,
  ),
  dual: () => runAction(
    'dual',
    '/api/admin/risk/dual-control/confirm',
    {
      operation_id: pendingOperationId.value.trim(),
      decision: pendingDecision.value,
      reason: pendingReason.value.trim() || null,
    },
    () => pendingDecision.value === 'reject'
      ? 'Pending operation rejected.'
      : 'Pending operation confirmed and executed.',
  ),
}

async function acceptConfirm() {
  const request = confirmRequest.value
  if (!request || busy.value)
    return
  confirmRequest.value = null
  await CONFIRM_HANDLERS[request.action]()
}

function useOperationId() {
  if (outcome.value?.operationId)
    pendingOperationId.value = outcome.value.operationId
}
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 px-5 py-6">
    <header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold">
          {{ t('dashboard.sections.menu.risk', 'Risk Control') }}
        </h1>
        <p class="text-sm text-black/60 dark:text-white/60">
          Emergency control plane for defense mode, risk blocks and dual-control review. Every action here is audited.
        </p>
      </div>
      <NuxtLink
        to="/admin/emergency"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black transition hover:border-black/30 hover:bg-black/5 dark:border-white/20 dark:text-white dark:hover:border-white/40 dark:hover:bg-white/5"
      >
        Open emergency console
      </NuxtLink>
    </header>

    <section class="rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
      <label for="risk-step-up-token" class="mb-2 block text-sm font-medium">Passkey step-up token</label>
      <TuffInput
        id="risk-step-up-token"
        v-model="stepUpToken"
        type="text"
        class="w-full"
        placeholder="Paste a one-time passkey login token"
      />
      <p class="mt-2 text-xs text-black/55 dark:text-white/55">
        Sent as <code>X-Login-Token</code>. Every action below needs one, each token authorises a single request, and the field is cleared once a token has been spent.
      </p>
    </section>

    <p v-if="validationError" class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-200">
      {{ validationError }}
    </p>

    <div class="grid gap-4 xl:grid-cols-2">
      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <div>
          <h2 class="text-sm font-semibold">
            Defense mode
          </h2>
          <p class="mt-1 text-xs text-black/55 dark:text-white/55">
            Sets enforcement strength for all traffic. Dropping back to NORMAL needs a second approver.
          </p>
        </div>
        <TuffSelect v-model="mode" class="w-full">
          <TuffSelectItem value="NORMAL" label="NORMAL" />
          <TuffSelectItem value="ELEVATED" label="ELEVATED" />
          <TuffSelectItem value="EXTREME" label="EXTREME" />
        </TuffSelect>
        <TuffInput
          v-model="modeReason"
          type="text"
          class="w-full"
          placeholder="Reason (recorded in the audit log)"
        />
        <TxButton
          variant="danger"
          :loading="pendingAction === 'mode'"
          :disabled="busy"
          @click="requestModeOverride"
        >
          Change defense mode
        </TxButton>
      </section>

      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <div>
          <h2 class="text-sm font-semibold">
            Unblock actors
          </h2>
          <p class="mt-1 text-xs text-black/55 dark:text-white/55">
            Clears risk blocks. Batches over 50 actors are queued for a second approver.
          </p>
        </div>
        <TuffInput
          v-model="actorInput"
          type="textarea"
          :rows="4"
          class="w-full"
          placeholder="One actor or IP per line"
        />
        <TuffInput
          v-model="actorReason"
          type="text"
          class="w-full"
          placeholder="Reason (recorded in the audit log)"
        />
        <TxButton
          variant="danger"
          :loading="pendingAction === 'unblock'"
          :disabled="busy"
          @click="requestActorUnblock"
        >
          {{ actorList.length ? `Unblock ${actorList.length} actor(s)` : 'Unblock actors' }}
        </TxButton>
      </section>

      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <div>
          <h2 class="text-sm font-semibold">
            Permanent IP ban
          </h2>
          <p class="mt-1 text-xs text-black/55 dark:text-white/55">
            Raises a permanent ban for review. This always requires a second approver, so it is queued rather than applied.
          </p>
        </div>
        <TuffInput
          v-model="caseIp"
          type="text"
          class="w-full"
          placeholder="IP address"
        />
        <TuffInput
          v-model="caseReason"
          type="text"
          class="w-full"
          placeholder="Reason (recorded in the audit log)"
        />
        <TxButton
          variant="danger"
          :loading="pendingAction === 'case'"
          :disabled="busy"
          @click="requestCaseReview"
        >
          Queue permanent ban
        </TxButton>
      </section>

      <section class="space-y-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/15 dark:bg-black/10">
        <div>
          <h2 class="text-sm font-semibold">
            Dual-control decision
          </h2>
          <p class="mt-1 text-xs text-black/55 dark:text-white/55">
            Approve or discard an operation someone else queued. You cannot decide an operation you raised yourself.
          </p>
        </div>
        <TuffInput
          v-model="pendingOperationId"
          type="text"
          class="w-full"
          placeholder="Pending operation id"
        />
        <TuffSelect v-model="pendingDecision" class="w-full">
          <TuffSelectItem value="confirm" label="Confirm and execute" />
          <TuffSelectItem value="reject" label="Reject" />
        </TuffSelect>
        <TuffInput
          v-model="pendingReason"
          type="text"
          class="w-full"
          placeholder="Reason (recorded in the audit log)"
        />
        <TxButton
          variant="danger"
          :loading="pendingAction === 'dual'"
          :disabled="busy"
          @click="requestDualControlDecision"
        >
          Submit decision
        </TxButton>
      </section>
    </div>

    <section
      class="rounded-xl border p-4"
      :class="outcome?.tone === 'error'
        ? 'border-red-500/40 bg-red-500/5'
        : outcome?.tone === 'pending'
          ? 'border-amber-500/40 bg-amber-500/5'
          : outcome?.tone === 'success'
            ? 'border-emerald-500/40 bg-emerald-500/5'
            : 'border-black/10 bg-white dark:border-white/15 dark:bg-black/10'"
    >
      <h2 class="mb-2 text-sm font-semibold">
        Last action
      </h2>
      <p v-if="!outcome" class="text-sm text-black/55 dark:text-white/55">
        No action has been submitted yet.
      </p>
      <template v-else>
        <p
          class="text-sm font-medium"
          :class="outcome.tone === 'error'
            ? 'text-red-700 dark:text-red-300'
            : outcome.tone === 'pending'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-emerald-700 dark:text-emerald-300'"
        >
          {{ outcome.title }}
        </p>
        <p class="mt-1 text-sm text-black/70 dark:text-white/70">
          {{ outcome.detail }}
        </p>
        <div v-if="outcome.operationId" class="mt-3 flex flex-wrap items-center gap-2">
          <code class="rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">{{ outcome.operationId }}</code>
          <TxButton variant="secondary" size="small" @click="useOperationId">
            Use this id below
          </TxButton>
        </div>
        <details v-if="outcome.raw" class="mt-3">
          <summary class="cursor-pointer text-xs text-black/55 dark:text-white/55">
            Raw response
          </summary>
          <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/5 p-3 text-xs dark:bg-white/5">{{ outcome.raw }}</pre>
        </details>
      </template>
    </section>

    <TxModal
      :model-value="confirmRequest !== null"
      :title="confirmRequest?.title ?? ''"
      width="520px"
      @update:model-value="(open: boolean) => { if (!open) confirmRequest = null }"
    >
      <div v-if="confirmRequest" class="space-y-3 text-sm">
        <p>{{ confirmRequest.summary }}</p>
        <p class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-200">
          {{ confirmRequest.warning }}
        </p>
      </div>
      <template #footer>
        <div class="flex justify-end gap-2">
          <TxButton variant="secondary" @click="confirmRequest = null">
            Cancel
          </TxButton>
          <TxButton variant="danger" :disabled="busy" @click="acceptConfirm">
            {{ confirmRequest?.confirmLabel }}
          </TxButton>
        </div>
      </template>
    </TxModal>
  </div>
</template>
