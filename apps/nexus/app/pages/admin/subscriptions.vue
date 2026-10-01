<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import { useToast } from '~/composables/useToast'

definePageMeta({ layout: 'admin', requiresAuth: true, pageTransition: { name: 'fade', mode: 'out-in' } })
defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useAuthUser()
const { isAdmin } = useAccountRole()
const toast = useToast()

watch(isAdmin, (admin) => {
  if (user.value && !admin)
    navigateTo('/dashboard/overview')
}, { immediate: true })

interface ActivationCode {
  id: string
  code: string
  plan: string
  duration_days: number
  max_uses: number
  uses: number
  created_at: string
  expires_at: string | null
  status: string
}

interface CodePagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

function resolveErrorMessage(err: unknown, fallback: string) {
  const data = (err as { data?: { message?: unknown, statusMessage?: unknown } })?.data
  const message = data?.message ?? data?.statusMessage
  return typeof message === 'string' && message.trim() ? message.trim() : fallback
}

const planOptions = [
  { value: 'FREE', label: 'FREE', color: 'text-slate-500' },
  { value: 'PLUS', label: 'PLUS', color: 'text-blue-500' },
  { value: 'PRO', label: 'PRO', color: 'text-purple-500' },
  { value: 'ENTERPRISE', label: 'ENTERPRISE', color: 'text-amber-500' },
  { value: 'TEAM', label: 'TEAM', color: 'text-green-500' },
]

const codes = ref<ActivationCode[]>([])
const codesLoading = ref(false)
const codesGenerating = ref(false)
const codesError = ref<string | null>(null)
const generationError = ref<string | null>(null)
const generatorOpen = ref(false)
const codesActionPendingId = ref<string | null>(null)
const revokeArmedId = ref<string | null>(null)
const copiedCodeId = ref<string | null>(null)
const filters = reactive({ q: '', plan: 'all', status: 'all' })
const pagination = reactive<CodePagination>({ page: 1, limit: 20, total: 0, totalPages: 1 })
let revokeArmTimer: ReturnType<typeof setTimeout> | null = null
let copyResetTimer: ReturnType<typeof setTimeout> | null = null
let searchTimer: ReturnType<typeof setTimeout> | null = null
let latestCodesRequest = 0

const genForm = reactive({
  plan: 'PLUS' as 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | 'TEAM',
  durationDays: 30,
  maxUses: 1,
  expiresInDays: 90,
  count: 1,
})

const codeStatusLabels = computed<Record<string, string>>(() => ({
  active: t('dashboard.sections.codes.status.active', 'Active'),
  expired: t('dashboard.sections.codes.status.expired', 'Expired'),
  revoked: t('dashboard.sections.codes.status.revoked', 'Revoked'),
  exhausted: t('dashboard.sections.codes.status.exhausted', 'Exhausted'),
}))
const hasFilters = computed(() => Boolean(filters.q.trim()) || filters.plan !== 'all' || filters.status !== 'all')
const statusOptions = computed(() => Object.entries(codeStatusLabels.value).map(([value, label]) => ({ value, label })))
const codeColumns = computed<DataTableColumn<ActivationCode>[]>(() => [
  { key: 'code', title: t('dashboard.sections.codes.table.code', 'Code'), width: 300, fixed: 'left', nowrap: true },
  { key: 'plan', title: t('dashboard.sections.codes.table.plan', 'Plan'), width: 110, nowrap: true },
  { key: 'duration', title: t('dashboard.sections.codes.table.duration', 'Duration'), width: 130, nowrap: true },
  { key: 'uses', title: t('dashboard.sections.codes.table.uses', 'Uses'), width: 110, nowrap: true },
  { key: 'status', title: t('dashboard.sections.codes.table.status', 'Status'), width: 130, nowrap: true },
  { key: 'created', title: t('dashboard.sections.codes.table.created', 'Created'), width: 140, nowrap: true },
  { key: 'expires', title: t('dashboard.sections.codes.table.expires', 'Expires'), width: 140, nowrap: true },
  { key: 'actions', title: t('dashboard.sections.codes.table.actions', 'Actions'), width: 120, fixed: 'right', nowrap: true },
])

async function fetchCodes(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    pagination.page = 1
  const requestId = ++latestCodesRequest
  codesLoading.value = true
  codesError.value = null
  try {
    const response = await rawFetch<{ codes: ActivationCode[], pagination: CodePagination }>('/api/admin/codes', {
      query: {
        page: pagination.page,
        limit: pagination.limit,
        q: filters.q.trim() || undefined,
        plan: filters.plan === 'all' ? undefined : filters.plan,
        status: filters.status === 'all' ? undefined : filters.status,
      },
    })
    if (requestId !== latestCodesRequest)
      return
    codes.value = response.codes ?? []
    Object.assign(pagination, response.pagination)
  }
  catch (err: unknown) {
    if (requestId !== latestCodesRequest)
      return
    codesError.value = resolveErrorMessage(err, t('dashboard.sections.codes.errors.loadFailed', 'Failed to load activation codes.'))
  }
  finally {
    if (requestId === latestCodesRequest)
      codesLoading.value = false
  }
}

function openGenerator() {
  generationError.value = null
  generatorOpen.value = true
}

async function generateCodes() {
  if (codesGenerating.value)
    return
  codesGenerating.value = true
  generationError.value = null
  try {
    await rawFetch('/api/admin/codes/generate', { method: 'POST', body: genForm })
    toast.success(t('dashboard.sections.codes.generateSuccess', 'Activation codes generated.'))
    generatorOpen.value = false
    await fetchCodes({ resetPage: true })
  }
  catch (err: unknown) {
    const message = resolveErrorMessage(err, t('dashboard.sections.codes.errors.generateFailed', 'Failed to generate activation codes.'))
    generationError.value = message
    toast.warning(message)
  }
  finally {
    codesGenerating.value = false
  }
}

async function changePage(page: number) {
  if (codesLoading.value)
    return
  pagination.page = page
  await fetchCodes()
}

async function copyCode(id: string, code: string) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCodeId.value = id
    toast.success(t('dashboard.sections.codes.copySuccess', 'Activation code copied.'))
  }
  catch {
    copiedCodeId.value = null
    toast.warning(t('dashboard.sections.codes.copyFailed', 'Failed to copy activation code.'))
  }
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => { copiedCodeId.value = null }, 2000)
}

function requestRevoke(code: ActivationCode) {
  if (codesActionPendingId.value)
    return
  if (revokeArmedId.value === code.id) {
    void revokeCode(code)
    return
  }
  revokeArmedId.value = code.id
  if (revokeArmTimer)
    clearTimeout(revokeArmTimer)
  revokeArmTimer = setTimeout(() => { revokeArmedId.value = null }, 5000)
}

async function revokeCode(code: ActivationCode) {
  if (codesActionPendingId.value)
    return
  if (revokeArmTimer)
    clearTimeout(revokeArmTimer)
  revokeArmedId.value = null
  codesActionPendingId.value = code.id
  try {
    await rawFetch(`/api/admin/codes/${code.id}`, { method: 'PATCH', body: { status: 'revoked' } })
    toast.success(t('dashboard.sections.codes.revokeSuccess', 'Activation code revoked.'))
    await fetchCodes()
  }
  catch (err: unknown) {
    toast.warning(resolveErrorMessage(err, t('dashboard.sections.codes.revokeFailed', 'Failed to revoke activation code.')))
  }
  finally {
    codesActionPendingId.value = null
  }
}

function formatDate(value: string | null) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
}

function resolvePlanStyle(plan: string) {
  return planOptions.find(option => option.value === plan)
}

function codeStatusTone(status: string) {
  if (status === 'active')
    return 'success'
  if (status === 'expired')
    return 'danger'
  if (status === 'revoked')
    return 'warning'
  if (status === 'exhausted')
    return 'muted'
  return 'info'
}

watch(() => filters.q, () => {
  if (searchTimer)
    clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void fetchCodes({ resetPage: true }) }, 300)
})
watch([() => filters.plan, () => filters.status], () => {
  if (searchTimer)
    clearTimeout(searchTimer)
  void fetchCodes({ resetPage: true })
})

onBeforeUnmount(() => {
  if (revokeArmTimer)
    clearTimeout(revokeArmTimer)
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
  if (searchTimer)
    clearTimeout(searchTimer)
})
onMounted(() => void fetchCodes())
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.codes.title', 'Activation Codes')">
    <template #actions>
      <TxButton variant="primary" size="sm" icon="i-carbon-add" @click="openGenerator">
        {{ t('dashboard.sections.codes.addButton', 'Add') }}
      </TxButton>
    </template>

    <template #filters>
      <div class="grid gap-4 md:grid-cols-[1fr_180px_180px]">
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.filters.search', 'Search') }}</label>
          <TuffInput v-model="filters.q" :placeholder="t('dashboard.sections.codes.filters.searchPlaceholder', 'Search activation code')" class="w-full" />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.form.plan', 'Plan') }}</label>
          <TuffSelect v-model="filters.plan" class="w-full">
            <TuffSelectItem value="all" :label="t('dashboard.sections.codes.filters.allPlans', 'All plans')" />
            <TuffSelectItem v-for="option in planOptions" :key="option.value" :value="option.value" :label="option.label" />
          </TuffSelect>
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.table.status', 'Status') }}</label>
          <TuffSelect v-model="filters.status" class="w-full">
            <TuffSelectItem value="all" :label="t('dashboard.sections.codes.filters.allStatuses', 'All statuses')" />
            <TuffSelectItem v-for="option in statusOptions" :key="option.value" :value="option.value" :label="option.label" />
          </TuffSelect>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <div v-if="codesError && codes.length" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
{{ codesError }}
</div>
      <div v-if="codesLoading && !codes.length" class="py-5" role="status" :aria-label="t('dashboard.sections.codes.loading', 'Loading...')">
        <TxRowSkeleton :rows="4" description separated trailing />
      </div>
      <TxEmptyState v-else-if="codesError && !codes.length" variant="error" size="small" :title="t('dashboard.sections.codes.errors.loadFailed', 'Failed to load activation codes.')" :description="codesError" :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }" @primary="fetchCodes()" />
      <TxEmptyState v-else-if="!codes.length" variant="blank-slate" size="small" icon="i-carbon-ticket" :title="hasFilters ? t('dashboard.sections.codes.emptyFiltered', 'No activation codes match these filters.') : t('dashboard.sections.codes.empty', 'No activation codes yet. Add one to get started.')" description="" />
      <TxDataTable v-else :columns="codeColumns" :data="codes" row-key="id" :loading="codesLoading" scroll-x nowrap>
        <template #cell-code="{ row: code }">
          <div class="flex min-w-0 items-center gap-2">
            <code class="truncate rounded bg-black/5 px-2 py-1 font-mono text-sm text-black dark:bg-white/[0.08] dark:text-white" :title="code.code">{{ code.code }}</code>
            <TxButton variant="bare" size="sm" native-type="button" :icon="copiedCodeId === code.id ? 'i-carbon-checkmark' : 'i-carbon-copy'" :title="t('dashboard.sections.codes.copy', 'Copy')" class="shrink-0" @click="copyCode(code.id, code.code)" />
          </div>
        </template>
        <template #cell-plan="{ row: code }">
<span class="font-medium" :class="resolvePlanStyle(code.plan)?.color">{{ code.plan }}</span>
</template>
        <template #cell-duration="{ row: code }">
<span class="text-sm text-black/60 dark:text-white/60">{{ code.duration_days }} {{ t('dashboard.sections.codes.days', 'days') }}</span>
</template>
        <template #cell-uses="{ row: code }">
<span class="text-sm text-black dark:text-white">{{ code.uses }} / {{ code.max_uses }}</span>
</template>
        <template #cell-status="{ row: code }">
<TxStatusBadge :text="codeStatusLabels[code.status] || code.status" :status="codeStatusTone(code.status)" size="sm" />
</template>
        <template #cell-created="{ row: code }">
<span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(code.created_at) }}</span>
</template>
        <template #cell-expires="{ row: code }">
<span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(code.expires_at) }}</span>
</template>
        <template #cell-actions="{ row: code }">
          <TxButton v-if="code.status === 'active'" :variant="revokeArmedId === code.id ? 'danger' : 'secondary'" size="sm" :disabled="codesActionPendingId === code.id" @click="requestRevoke(code)">
            {{ revokeArmedId === code.id ? t('common.confirm', 'Confirm') : t('dashboard.sections.codes.revoke', 'Revoke') }}
          </TxButton>
        </template>
      </TxDataTable>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
        <span class="text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.codes.pagination.total', { count: pagination.total }) }}</span>
        <TxPagination :current-page="pagination.page" :page-size="pagination.limit" :total="pagination.total" :total-pages="pagination.totalPages" :prev-label="t('dashboard.sections.users.pagination.prev', 'Previous page')" :next-label="t('dashboard.sections.users.pagination.next', 'Next page')" @update:current-page="changePage" />
      </div>
    </div>

    <TxDrawer v-model:visible="generatorOpen" :title="t('dashboard.sections.codes.generateTitle', 'Generate Activation Codes')" width="640px" :show-close="!codesGenerating" :close-on-click-mask="!codesGenerating" :close-on-press-escape="!codesGenerating">
      <form id="activation-code-generator" class="grid gap-4 sm:grid-cols-2" @submit.prevent="generateCodes">
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.form.plan', 'Plan') }}</label>
          <TuffSelect v-model="genForm.plan" class="w-full">
            <TuffSelectItem v-for="option in planOptions" :key="option.value" :value="option.value" :label="option.label" />
          </TuffSelect>
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.form.durationDays', 'Duration (days)') }}</label>
          <TuffInput v-model="genForm.durationDays" type="number" min="1" max="365" required class="w-full" />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.form.maxUses', 'Max uses') }}</label>
          <TuffInput v-model="genForm.maxUses" type="number" min="1" max="1000" required class="w-full" />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.form.expiresInDays', 'Expires in (days)') }}</label>
          <TuffInput v-model="genForm.expiresInDays" type="number" min="1" max="365" required class="w-full" />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.codes.form.count', 'Count') }}</label>
          <TuffInput v-model="genForm.count" type="number" min="1" max="100" required class="w-full" />
        </div>
        <p v-if="generationError" role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200 sm:col-span-2">
{{ generationError }}
</p>
      </form>
      <template #footer>
        <div class="flex justify-end gap-2">
          <TxButton variant="secondary" size="sm" :disabled="codesGenerating" @click="generatorOpen = false">
{{ t('common.cancel', 'Cancel') }}
</TxButton>
          <TxButton variant="primary" size="sm" native-type="submit" form="activation-code-generator" :loading="codesGenerating" :disabled="codesGenerating">
{{ t('dashboard.sections.codes.generateButton', 'Generate Codes') }}
</TxButton>
        </div>
      </template>
    </TxDrawer>
  </AdminPageShell>
</template>
