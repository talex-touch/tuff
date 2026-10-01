<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxAvatar } from '@talex-touch/tuffex/avatar'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TxDropdownItem, TxDropdownMenu } from '@talex-touch/tuffex/dropdown-menu'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxRowSkeleton, TxSkeleton } from '@talex-touch/tuffex/skeleton'
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

interface AdminUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: string
  status: string
  emailState: string
  locale: string | null
  disabledAt: string | null
  deletionRequestedAt: string | null
  deletionScheduledAt: string | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface CreditBalance {
  quota: number
  used: number
}

interface CreditLedgerItem {
  id: string
  delta: number
  reason: string
  createdAt: string
  metadata: Record<string, unknown> | null
}

interface CreditsResponse {
  summary: { month: string, user: CreditBalance | null, team: CreditBalance | null }
  ledger: { entries: CreditLedgerItem[], pagination: Pagination }
}

interface UserSubscription {
  plan: string
  activatedAt: string | null
  expiresAt: string | null
  isActive: boolean
}

type SubscriptionPlan = 'PRO' | 'PLUS' | 'TEAM' | 'ENTERPRISE'
type CreditAdjustmentDirection = 'add' | 'subtract'
type UserDrawerMode = 'details' | 'edit' | 'subscription' | 'credits' | 'delete'

function resolveErrorMessage(err: unknown, fallback: string) {
  const data = (err as { data?: { message?: unknown, statusMessage?: unknown } })?.data
  const message = data?.message ?? data?.statusMessage
  return typeof message === 'string' && message.trim() ? message.trim() : fallback
}

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
const pagination = reactive<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 })
const filters = reactive({ q: '', status: 'all', role: 'all' })

const drawerOpen = ref(false)
const drawerMode = ref<UserDrawerMode>('details')
const selectedUser = ref<AdminUser | null>(null)

const editorSaving = ref(false)
const editorForm = reactive({ name: '', image: '', locale: 'none', role: 'user', status: 'active' })

const subscription = ref<UserSubscription | null>(null)
const subscriptionLoading = ref(false)
const subscriptionSaving = ref(false)
const subscriptionError = ref<string | null>(null)
const subscriptionForm = reactive({ plan: 'PRO' as SubscriptionPlan, durationDays: 365 })

const userCredits = ref<CreditsResponse | null>(null)
const userCreditsLoading = ref(false)
const userCreditsSaving = ref(false)
const userCreditsError = ref<string | null>(null)
const userCreditLedgerPage = ref(1)
const userCreditLedgerPagination = ref<Pagination>({ page: 1, limit: 10, total: 0, totalPages: 1 })
const creditAdjustmentForm = reactive({ direction: 'add' as CreditAdjustmentDirection, amount: 100, reason: '' })

const deletionConfirmEmail = ref('')
const deletionSaving = ref(false)

const hasPrev = computed(() => pagination.page > 1)
const hasNext = computed(() => pagination.page < pagination.totalPages)
const actionsLocked = computed(() => loading.value || actionPendingId.value !== null)
const selectedUserLifecycleLocked = computed(() => (
  !selectedUser.value || ['merged', 'deletion_pending'].includes(selectedUser.value.status)
))
const selectedUserAccessLocked = computed(() => selectedUserLifecycleLocked.value || selectedUser.value?.id === user.value?.id)
const selectedUserCanReceiveSubscription = computed(() => selectedUser.value?.status === 'active')
const selectedUserCanAdjustCredits = computed(() => !selectedUserLifecycleLocked.value)
const deletionConfirmed = computed(() => Boolean(selectedUser.value)
  && deletionConfirmEmail.value.trim().toLowerCase() === selectedUser.value?.email.trim().toLowerCase())

const userCreditBalance = computed(() => userCredits.value?.summary.user ?? null)
const userCreditRemaining = computed(() => userCreditBalance.value
  ? Math.max(0, userCreditBalance.value.quota - userCreditBalance.value.used)
  : 0)
const userCreditUsagePercent = computed(() => userCreditBalance.value?.quota
  ? Math.min(100, Math.round((userCreditBalance.value.used / userCreditBalance.value.quota) * 100))
  : 0)
const userCreditLedgerItems = computed(() => userCredits.value?.ledger.entries ?? [])

const statusOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.users.filters.statusAll', 'All statuses') },
  { value: 'active', label: t('dashboard.sections.users.filters.statusActive', 'Active') },
  { value: 'disabled', label: t('dashboard.sections.users.filters.statusDisabled', 'Disabled') },
  { value: 'merged', label: t('dashboard.sections.users.filters.statusMerged', 'Merged') },
  { value: 'deletion_pending', label: t('dashboard.sections.users.filters.statusDeletionPending', 'Pending deletion') },
])
const roleOptions = computed(() => [
  { value: 'all', label: t('dashboard.sections.users.filters.roleAll', 'All roles') },
  { value: 'admin', label: t('dashboard.sections.users.filters.roleAdmin', 'Admin') },
  { value: 'user', label: t('dashboard.sections.users.filters.roleUser', 'User') },
])
const roleLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = Object.create(null)
  for (const option of roleOptions.value)
    labels[option.value] = option.label
  return labels
})
const editRoleOptions = computed(() => roleOptions.value.filter(option => option.value !== 'all'))
const editStatusOptions = computed(() => statusOptions.value.filter(option => ['active', 'disabled'].includes(option.value)))
const localeOptions = computed(() => [
  { value: 'none', label: t('dashboard.sections.users.editor.localeAuto', 'Auto') },
  { value: 'zh', label: t('dashboard.sections.users.editor.localeZh', 'Chinese') },
  { value: 'en', label: t('dashboard.sections.users.editor.localeEn', 'English') },
])
const planOptions = [
  { value: 'PRO', label: 'PRO' },
  { value: 'PLUS', label: 'PLUS' },
  { value: 'TEAM', label: 'TEAM' },
  { value: 'ENTERPRISE', label: 'ENTERPRISE' },
]
const creditDirectionOptions = computed(() => [
  { value: 'add', label: t('dashboard.sections.users.credits.add', 'Add') },
  { value: 'subtract', label: t('dashboard.sections.users.credits.subtract', 'Subtract') },
])
const statusLabels = computed<Record<string, string>>(() => ({
  active: t('dashboard.sections.users.status.active', 'Active'),
  disabled: t('dashboard.sections.users.status.disabled', 'Disabled'),
  merged: t('dashboard.sections.users.status.merged', 'Merged'),
  deletion_pending: t('dashboard.sections.users.status.deletionPending', 'Pending deletion'),
}))
const emailStateLabels = computed<Record<string, string>>(() => ({
  verified: t('dashboard.sections.users.emailState.verified', 'Verified'),
  unverified: t('dashboard.sections.users.emailState.unverified', 'Unverified'),
  missing: t('dashboard.sections.users.emailState.missing', 'Missing'),
}))

const drawerTitle = computed(() => ({
  details: t('dashboard.sections.users.details.title', 'User Details'),
  edit: t('dashboard.sections.users.editor.title', 'Edit User'),
  subscription: t('dashboard.sections.users.subscription.title', 'User Subscription'),
  credits: t('dashboard.sections.users.credits.title', 'Credits'),
  delete: t('dashboard.sections.users.deletion.title', 'Request User Deletion'),
})[drawerMode.value])

const userColumns = computed<DataTableColumn<AdminUser>[]>(() => [
  { key: 'user', title: t('dashboard.sections.users.table.user', 'User'), width: '38%' },
  { key: 'access', title: t('dashboard.sections.users.table.access', 'Access'), width: 240 },
  { key: 'createdAt', title: t('dashboard.sections.users.table.created', 'Created'), width: 140 },
  { key: 'actions', title: t('dashboard.sections.users.table.actions', 'Actions'), width: 280, fixed: 'right' },
])

function displayName(entry: Pick<AdminUser, 'name' | 'email'>) {
  const name = entry.name?.trim()
  if (name)
    return name
  const email = entry.email.trim()
  const separator = email.indexOf('@')
  const localPart = (separator >= 0 ? email.slice(0, separator) : email) || email
  return localPart.length > 12 ? `${localPart.slice(0, 12)}…` : localPart
}

function statusTone(status: string) {
  if (status === 'active')
    return 'success'
  if (status === 'disabled')
    return 'danger'
  if (status === 'deletion_pending')
    return 'warning'
  return 'muted'
}

function buildQuery() {
  const query: Record<string, string | number> = { page: pagination.page, limit: pagination.limit }
  if (filters.q.trim())
    query.q = filters.q.trim()
  if (filters.status !== 'all')
    query.status = filters.status
  if (filters.role !== 'all')
    query.role = filters.role
  return query
}

async function fetchUsers(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    pagination.page = 1
  loading.value = true
  error.value = null
  try {
    const response = await rawFetch<{ users: AdminUser[], pagination: Pagination }>('/api/admin/users', { query: buildQuery() })
    users.value = response.users ?? []
    Object.assign(pagination, response.pagination)
  }
  catch (err: unknown) {
    error.value = resolveErrorMessage(err, t('dashboard.sections.users.errors.loadFailed', 'Failed to load users.'))
  }
  finally {
    loading.value = false
  }
}

function formatDate(value: string | null) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale.value, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value: string | null) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale.value)
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat(locale.value).format(Math.round(value))
    : '0'
}

function applyUserUpdate(updated: AdminUser) {
  users.value = users.value.map(entry => entry.id === updated.id ? { ...entry, ...updated } : entry)
  if (selectedUser.value?.id === updated.id)
    selectedUser.value = { ...selectedUser.value, ...updated }
}

function resetCreditsState() {
  userCredits.value = null
  userCreditsError.value = null
  userCreditLedgerPage.value = 1
  userCreditLedgerPagination.value = { page: 1, limit: 10, total: 0, totalPages: 1 }
  Object.assign(creditAdjustmentForm, { direction: 'add', amount: 100, reason: '' })
}

function openUserDrawer(entry: AdminUser, mode: UserDrawerMode) {
  selectedUser.value = entry
  drawerMode.value = mode
  drawerOpen.value = true
  if (mode === 'edit') {
    Object.assign(editorForm, {
      name: entry.name || '',
      image: entry.image || '',
      locale: entry.locale || 'none',
      role: entry.role === 'admin' ? 'admin' : 'user',
      status: entry.status === 'disabled' ? 'disabled' : 'active',
    })
  }
  else if (mode === 'subscription') {
    subscription.value = null
    subscriptionError.value = null
    Object.assign(subscriptionForm, { plan: 'PRO', durationDays: 365 })
    void fetchSelectedUserSubscription()
  }
  else if (mode === 'credits') {
    resetCreditsState()
    void fetchSelectedUserCredits({ resetPage: true })
  }
  else if (mode === 'delete') {
    deletionConfirmEmail.value = ''
  }
}

async function patchUser(entry: AdminUser, segment: 'profile' | 'role' | 'status', body: Record<string, unknown>) {
  const response = await rawFetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/${segment}`, { method: 'PATCH', body })
  applyUserUpdate(response.user)
}

async function saveEditor() {
  const entry = selectedUser.value
  if (!entry || editorSaving.value || selectedUserLifecycleLocked.value)
    return
  editorSaving.value = true
  actionPendingId.value = entry.id
  try {
    await patchUser(entry, 'profile', {
      name: editorForm.name.trim() || null,
      image: editorForm.image.trim() || null,
      locale: editorForm.locale === 'none' ? null : editorForm.locale,
    })
    if (!selectedUserAccessLocked.value) {
      if (entry.role !== editorForm.role)
        await patchUser(entry, 'role', { role: editorForm.role })
      if (entry.status !== editorForm.status)
        await patchUser(entry, 'status', { status: editorForm.status })
    }
    toast.success(t('dashboard.sections.users.editor.saveSuccess', 'User updated.'))
    drawerOpen.value = false
    await fetchUsers()
  }
  catch (err: unknown) {
    toast.warning(resolveErrorMessage(err, t('dashboard.sections.users.editor.saveFailed', 'Failed to update user.')))
  }
  finally {
    editorSaving.value = false
    actionPendingId.value = null
  }
}

async function fetchSelectedUserSubscription() {
  const entry = selectedUser.value
  if (!entry)
    return
  subscriptionLoading.value = true
  subscriptionError.value = null
  try {
    const response = await rawFetch<{ subscription: UserSubscription }>(`/api/admin/users/${entry.id}/subscription`)
    subscription.value = response.subscription
  }
  catch (err: unknown) {
    subscriptionError.value = resolveErrorMessage(err, t('dashboard.sections.users.subscription.loadFailed', 'Failed to load subscription.'))
  }
  finally {
    subscriptionLoading.value = false
  }
}

async function grantSelectedUserSubscription() {
  const entry = selectedUser.value
  const durationDays = Math.round(Number(subscriptionForm.durationDays))
  if (!entry || subscriptionSaving.value || !selectedUserCanReceiveSubscription.value)
    return
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    toast.warning(t('dashboard.sections.users.editor.invalidDuration', 'Invalid subscription duration.'))
    return
  }
  subscriptionSaving.value = true
  try {
    await rawFetch('/api/admin/subscriptions/grant', {
      method: 'POST',
      body: { userId: entry.id, plan: subscriptionForm.plan, durationDays, expiresInDays: durationDays },
    })
    toast.success(t('dashboard.sections.users.editor.subscriptionSuccess', 'Subscription granted.'))
    await fetchSelectedUserSubscription()
  }
  catch (err: unknown) {
    toast.warning(resolveErrorMessage(err, t('dashboard.sections.users.subscription.grantFailed', 'Failed to grant subscription.')))
  }
  finally {
    subscriptionSaving.value = false
  }
}

function applyUserCreditsResponse(response: CreditsResponse) {
  userCredits.value = response
  userCreditLedgerPagination.value = response.ledger.pagination
  userCreditLedgerPage.value = response.ledger.pagination.page
}

async function fetchSelectedUserCredits(options: { resetPage?: boolean } = {}) {
  const entry = selectedUser.value
  if (!entry)
    return
  if (options.resetPage)
    userCreditLedgerPage.value = 1
  userCreditsLoading.value = true
  userCreditsError.value = null
  try {
    const response = await rawFetch<CreditsResponse>(`/api/admin/users/${entry.id}/credits`, {
      query: { page: userCreditLedgerPage.value, limit: userCreditLedgerPagination.value.limit },
    })
    applyUserCreditsResponse(response)
  }
  catch (err: unknown) {
    userCreditsError.value = resolveErrorMessage(err, t('dashboard.sections.users.credits.loadFailed', 'Failed to load credits.'))
  }
  finally {
    userCreditsLoading.value = false
  }
}

async function adjustSelectedUserCredits() {
  const entry = selectedUser.value
  const amount = Math.round(Math.abs(Number(creditAdjustmentForm.amount)))
  if (!entry || userCreditsSaving.value || !selectedUserCanAdjustCredits.value)
    return
  if (!Number.isFinite(amount) || amount <= 0) {
    toast.warning(t('dashboard.sections.users.credits.invalidAmount', 'Invalid credit amount.'))
    return
  }
  userCreditsSaving.value = true
  try {
    const response = await rawFetch<CreditsResponse>(`/api/admin/users/${entry.id}/credits`, {
      method: 'PATCH',
      body: { amount, direction: creditAdjustmentForm.direction, reason: creditAdjustmentForm.reason.trim() || undefined },
    })
    applyUserCreditsResponse(response)
    creditAdjustmentForm.reason = ''
    toast.success(t('dashboard.sections.users.credits.adjustSuccess', 'Credits updated.'))
  }
  catch (err: unknown) {
    toast.warning(resolveErrorMessage(err, t('dashboard.sections.users.credits.adjustFailed', 'Failed to update credits.')))
  }
  finally {
    userCreditsSaving.value = false
  }
}

async function requestSelectedUserDeletion() {
  const entry = selectedUser.value
  if (!entry || deletionSaving.value || !deletionConfirmed.value)
    return
  deletionSaving.value = true
  actionPendingId.value = entry.id
  try {
    const response = await rawFetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/deletion`, {
      method: 'POST',
      body: { confirmEmail: deletionConfirmEmail.value.trim() },
    })
    applyUserUpdate(response.user)
    toast.success(t('dashboard.sections.users.deletion.success', 'User deletion scheduled.'))
    drawerOpen.value = false
    await fetchUsers()
  }
  catch (err: unknown) {
    toast.warning(resolveErrorMessage(err, t('dashboard.sections.users.deletion.failed', 'Failed to schedule user deletion.')))
  }
  finally {
    deletionSaving.value = false
    actionPendingId.value = null
  }
}

async function goPrev() {
  if (!hasPrev.value || loading.value)
    return
  pagination.page -= 1
  await fetchUsers()
}

async function goNext() {
  if (!hasNext.value || loading.value)
    return
  pagination.page += 1
  await fetchUsers()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => filters.q, () => {
  if (searchTimer)
    clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void fetchUsers({ resetPage: true }), 300)
})
watch([() => filters.status, () => filters.role], () => void fetchUsers({ resetPage: true }))
watch(userCreditLedgerPage, () => {
  if (drawerOpen.value && drawerMode.value === 'credits')
    void fetchSelectedUserCredits()
})
onBeforeUnmount(() => {
  if (searchTimer)
    clearTimeout(searchTimer)
})
onMounted(() => void fetchUsers())
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.users', 'User Management')">
    <template #actions>
      <TxButton variant="secondary" size="sm" :disabled="loading" @click="fetchUsers({ resetPage: true })">
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <template #filters>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_180px]">
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.users.filters.searchLabel', 'Search') }}</label>
          <TuffInput v-model="filters.q" type="text" autocomplete="off" :placeholder="t('dashboard.sections.users.filters.searchPlaceholder', 'Search by name or email')" class="w-full" />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.users.filters.statusLabel', 'Status') }}</label>
          <TuffSelect v-model="filters.status" class="w-full">
            <TuffSelectItem v-for="option in statusOptions" :key="option.value" :value="option.value" :label="option.label" />
          </TuffSelect>
        </div>
        <div>
          <label class="apple-section-title mb-1 block">{{ t('dashboard.sections.users.filters.roleLabel', 'Role') }}</label>
          <TuffSelect v-model="filters.role" class="w-full">
            <TuffSelectItem v-for="option in roleOptions" :key="option.value" :value="option.value" :label="option.label" />
          </TuffSelect>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <div v-if="error && users.length" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
{{ error }}
</div>
      <div v-if="loading && !users.length" class="py-5" role="status" :aria-label="t('dashboard.sections.users.loading', 'Loading...')">
        <TxRowSkeleton :rows="5" description separated trailing />
      </div>
      <TxEmptyState v-else-if="error && !users.length" variant="error" size="small" layout="vertical" :title="t('dashboard.sections.users.errors.loadFailed', 'Failed to load users.')" :description="error" :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }" @primary="fetchUsers()" />
      <TxEmptyState v-else-if="!users.length" variant="empty" size="small" layout="vertical" icon="i-carbon-user-multiple" :title="t('dashboard.sections.users.empty', 'No users found.')" description="" />

    <div v-else class="overflow-x-auto">
      <TxDataTable :columns="userColumns" :data="users" row-key="id" scroll-x>
        <template #cell-user="{ row: entry }">
          <div class="flex min-w-0 items-center gap-3">
            <TxAvatar :src="entry.image || undefined" :name="displayName(entry)" :size="36" class="shrink-0" />
            <div class="min-w-0">
              <p class="truncate font-medium text-black dark:text-white" :title="entry.name || displayName(entry)">
{{ displayName(entry) }}
</p>
              <p class="max-w-[360px] truncate whitespace-nowrap text-xs text-black/60 dark:text-white/60" :title="entry.email">
{{ entry.email }}
</p>
            </div>
          </div>
        </template>
        <template #cell-access="{ row: entry }">
          <div class="flex flex-wrap items-center gap-2">
            <TxStatusBadge :text="roleLabels[entry.role] || entry.role" :status="entry.role === 'admin' ? 'info' : 'muted'" size="sm" />
            <TxStatusBadge :text="statusLabels[entry.status] || entry.status" :status="statusTone(entry.status)" size="sm" />
            <span class="text-xs text-black/50 dark:text-white/50">{{ emailStateLabels[entry.emailState] || entry.emailState }}</span>
          </div>
        </template>
        <template #cell-createdAt="{ row: entry }">
<span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(entry.createdAt) }}</span>
</template>
        <template #cell-actions="{ row: entry }">
          <div class="flex items-center gap-2 whitespace-nowrap">
            <TxButton variant="bare" size="sm" :disabled="actionsLocked" @click="openUserDrawer(entry, 'details')">
{{ t('dashboard.sections.users.actions.details', 'Details') }}
</TxButton>
            <TxButton variant="secondary" size="sm" :disabled="actionsLocked || ['merged', 'deletion_pending'].includes(entry.status)" @click="openUserDrawer(entry, 'edit')">
{{ t('dashboard.sections.users.actions.edit', 'Edit') }}
</TxButton>
            <TxDropdownMenu placement="bottom-end" :min-width="180">
              <template #trigger>
<TxButton variant="secondary" size="sm" :disabled="actionsLocked">
{{ t('dashboard.sections.users.actions.more', 'More') }}
</TxButton>
</template>
              <TxDropdownItem @select="openUserDrawer(entry, 'subscription')">
{{ t('dashboard.sections.users.actions.subscription', 'Subscription') }}
</TxDropdownItem>
              <TxDropdownItem @select="openUserDrawer(entry, 'credits')">
{{ t('dashboard.sections.users.actions.credits', 'Credit ledger') }}
</TxDropdownItem>
              <TxDropdownItem danger :disabled="entry.id === user?.id || entry.status !== 'active'" @select="openUserDrawer(entry, 'delete')">
{{ t('dashboard.sections.users.actions.delete', 'Delete') }}
</TxDropdownItem>
            </TxDropdownMenu>
          </div>
        </template>
      </TxDataTable>
    </div>

      <div v-if="users.length" class="flex items-center justify-between gap-3 border-t border-black/[0.04] pt-4 dark:border-white/[0.06]">
        <span class="text-xs text-black/50 dark:text-white/50">{{ pagination.page }} / {{ pagination.totalPages }}</span>
        <div class="flex items-center gap-2">
          <TxButton variant="secondary" size="sm" :disabled="!hasPrev || loading" @click="goPrev">
{{ t('dashboard.sections.users.pagination.prev', 'Prev') }}
</TxButton>
          <TxButton variant="secondary" size="sm" :disabled="!hasNext || loading" @click="goNext">
{{ t('dashboard.sections.users.pagination.next', 'Next') }}
</TxButton>
        </div>
      </div>
    </div>

    <TxDrawer v-model:visible="drawerOpen" :title="drawerTitle" width="min(560px, 100vw)">
      <div v-if="selectedUser" class="space-y-6">
        <section class="flex min-w-0 items-center gap-3 rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <TxAvatar :src="selectedUser.image || undefined" :name="displayName(selectedUser)" :size="44" class="shrink-0" />
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-black dark:text-white" :title="selectedUser.name || displayName(selectedUser)">
{{ displayName(selectedUser) }}
</p>
            <p class="truncate whitespace-nowrap text-xs text-black/50 dark:text-white/50" :title="selectedUser.email">
{{ selectedUser.email }}
</p>
            <p class="mt-1 truncate text-[11px] text-black/40 dark:text-white/40" :title="selectedUser.id">
ID: {{ selectedUser.id }}
</p>
          </div>
        </section>

        <dl v-if="drawerMode === 'details'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.table.role', 'Role') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ roleLabels[selectedUser.role] || selectedUser.role }}
</dd>
</div>
          <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.table.status', 'Status') }}
</dt><dd class="mt-1">
<TxStatusBadge :text="statusLabels[selectedUser.status] || selectedUser.status" :status="statusTone(selectedUser.status)" size="sm" />
</dd>
</div>
          <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.table.emailState', 'Email') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ emailStateLabels[selectedUser.emailState] || selectedUser.emailState }}
</dd>
</div>
          <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.editor.locale', 'Locale') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ selectedUser.locale || t('dashboard.sections.users.editor.localeAuto', 'Auto') }}
</dd>
</div>
          <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.table.created', 'Created') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ formatDateTime(selectedUser.createdAt) }}
</dd>
</div>
          <div v-if="selectedUser.disabledAt">
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.details.disabledAt', 'Disabled at') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ formatDateTime(selectedUser.disabledAt) }}
</dd>
</div>
          <div v-if="selectedUser.deletionRequestedAt">
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.details.deletionRequestedAt', 'Deletion requested') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ formatDateTime(selectedUser.deletionRequestedAt) }}
</dd>
</div>
          <div v-if="selectedUser.deletionScheduledAt">
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.details.deletionScheduledAt', 'Scheduled deletion') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ formatDateTime(selectedUser.deletionScheduledAt) }}
</dd>
</div>
        </dl>

        <template v-else-if="drawerMode === 'edit'">
          <section class="space-y-3">
            <h3 class="apple-section-title">
{{ t('dashboard.sections.users.editor.profile', 'Profile') }}
</h3>
            <div><label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.editor.name', 'Display name') }}</label><TuffInput v-model="editorForm.name" class="w-full" /></div>
            <div><label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.editor.image', 'Avatar URL') }}</label><TuffInput v-model="editorForm.image" class="w-full" /></div>
            <div>
<label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.editor.locale', 'Locale') }}</label><TuffSelect v-model="editorForm.locale" class="w-full">
<TuffSelectItem v-for="option in localeOptions" :key="option.value" :value="option.value" :label="option.label" />
</TuffSelect>
</div>
          </section>
          <section class="space-y-3">
            <h3 class="apple-section-title">
{{ t('dashboard.sections.users.editor.access', 'Access') }}
</h3>
            <p v-if="selectedUserAccessLocked" class="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
              {{ selectedUser.status === 'merged' ? t('dashboard.sections.users.editor.mergedLocked', 'Merged users cannot be edited.') : selectedUser.status === 'deletion_pending' ? t('dashboard.sections.users.editor.deletionPendingLocked', 'Users pending deletion cannot be edited.') : t('dashboard.sections.users.editor.selfLocked', 'You cannot change your own role or status here.') }}
            </p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
<label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.table.role', 'Role') }}</label><TuffSelect v-model="editorForm.role" class="w-full" :disabled="selectedUserAccessLocked">
<TuffSelectItem v-for="option in editRoleOptions" :key="option.value" :value="option.value" :label="option.label" />
</TuffSelect>
</div>
              <div>
<label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.table.status', 'Status') }}</label><TuffSelect v-model="editorForm.status" class="w-full" :disabled="selectedUserAccessLocked">
<TuffSelectItem v-for="option in editStatusOptions" :key="option.value" :value="option.value" :label="option.label" />
</TuffSelect>
</div>
            </div>
          </section>
        </template>

        <template v-else-if="drawerMode === 'subscription'">
          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3">
<h3 class="apple-section-title">
{{ t('dashboard.sections.users.subscription.current', 'Current subscription') }}
</h3><TxButton variant="secondary" size="sm" :loading="subscriptionLoading" :disabled="subscriptionLoading" @click="fetchSelectedUserSubscription">
{{ t('common.refresh', 'Refresh') }}
</TxButton>
</div>
            <TxSkeleton v-if="subscriptionLoading && !subscription" :loading="true" :lines="3" />
            <TxEmptyState v-else-if="subscriptionError" variant="error" size="small" layout="vertical" :title="t('dashboard.sections.users.subscription.loadFailed', 'Failed to load subscription.')" :description="subscriptionError" :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }" @primary="fetchSelectedUserSubscription" />
            <dl v-else-if="subscription" class="grid grid-cols-1 gap-3 rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.04] sm:grid-cols-2">
              <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.editor.plan', 'Plan') }}
</dt><dd class="mt-1 text-sm font-semibold text-black dark:text-white">
{{ subscription.plan }}
</dd>
</div>
              <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.table.status', 'Status') }}
</dt><dd class="mt-1">
<TxStatusBadge :text="subscription.isActive ? t('dashboard.sections.subscriptions.status.active', 'Active') : t('dashboard.sections.subscriptions.status.expired', 'Expired')" :status="subscription.isActive ? 'success' : 'danger'" size="sm" />
</dd>
</div>
              <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.subscriptions.table.activatedAt', 'Activated') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ formatDateTime(subscription.activatedAt) }}
</dd>
</div>
              <div>
<dt class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.subscriptions.table.expiresAt', 'Expires') }}
</dt><dd class="mt-1 text-sm text-black dark:text-white">
{{ formatDateTime(subscription.expiresAt) }}
</dd>
</div>
            </dl>
          </section>
          <section class="space-y-3">
            <h3 class="apple-section-title">
{{ t('dashboard.sections.users.editor.grantSubscription', 'Grant / renew') }}
</h3>
            <p v-if="!selectedUserCanReceiveSubscription" class="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
{{ t('dashboard.sections.users.subscription.activeOnly', 'Only active users can receive a subscription.') }}
</p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
<label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.editor.plan', 'Plan') }}</label><TuffSelect v-model="subscriptionForm.plan" class="w-full" :disabled="!selectedUserCanReceiveSubscription">
<TuffSelectItem v-for="option in planOptions" :key="option.value" :value="option.value" :label="option.label" />
</TuffSelect>
</div>
              <div><label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.editor.durationDays', 'Duration (days)') }}</label><TuffInput v-model="subscriptionForm.durationDays" type="number" min="1" max="3650" class="w-full" :disabled="!selectedUserCanReceiveSubscription" /></div>
            </div>
          </section>
        </template>

        <template v-else-if="drawerMode === 'credits'">
          <section class="space-y-3">
            <div class="flex items-center justify-between gap-3">
<p class="text-xs text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.credits.hint', 'View the selected user credit balance, adjustments, and ledger.') }}
</p><TxButton variant="secondary" size="sm" :loading="userCreditsLoading" :disabled="userCreditsLoading" @click="fetchSelectedUserCredits({ resetPage: true })">
{{ t('common.refresh', 'Refresh') }}
</TxButton>
</div>
            <TxSkeleton v-if="userCreditsLoading && !userCredits" :loading="true" :lines="4" />
            <TxEmptyState v-else-if="userCreditsError && !userCredits" variant="error" size="small" layout="vertical" :title="t('dashboard.sections.users.credits.loadFailed', 'Failed to load credits.')" :description="userCreditsError" :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }" @primary="fetchSelectedUserCredits({ resetPage: true })" />
            <div v-else class="space-y-3">
              <div v-if="userCreditsError" class="rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
{{ userCreditsError }}
</div>
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
<p class="text-[11px] text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.credits.remaining', 'Remaining') }}
</p><p class="mt-1 text-base font-semibold text-black dark:text-white">
{{ formatNumber(userCreditRemaining) }}
</p>
</div>
                <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
<p class="text-[11px] text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.credits.used', 'Used') }}
</p><p class="mt-1 text-base font-semibold text-black dark:text-white">
{{ formatNumber(userCreditBalance?.used) }}
</p>
</div>
                <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
<p class="text-[11px] text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.credits.quota', 'Quota') }}
</p><p class="mt-1 text-base font-semibold text-black dark:text-white">
{{ formatNumber(userCreditBalance?.quota) }}
</p>
</div>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
<div class="h-full rounded-full bg-sky-500 transition-all" :style="{ width: `${userCreditUsagePercent}%` }" />
</div>
              <div class="grid grid-cols-1 gap-2 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08] sm:grid-cols-[120px_1fr]">
                <div>
<label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.credits.direction', 'Direction') }}</label><TuffSelect v-model="creditAdjustmentForm.direction" class="w-full" :disabled="!selectedUserCanAdjustCredits">
<TuffSelectItem v-for="option in creditDirectionOptions" :key="option.value" :value="option.value" :label="option.label" />
</TuffSelect>
</div>
                <div><label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.credits.amount', 'Amount') }}</label><TuffInput v-model="creditAdjustmentForm.amount" type="number" min="1" class="w-full" :disabled="!selectedUserCanAdjustCredits" /></div>
                <div class="sm:col-span-2">
<label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.credits.reason', 'Reason') }}</label><TuffInput v-model="creditAdjustmentForm.reason" :placeholder="t('dashboard.sections.users.credits.reasonPlaceholder', 'Optional audit reason')" class="w-full" :disabled="!selectedUserCanAdjustCredits" />
</div>
                <div class="flex justify-end sm:col-span-2">
<TxButton variant="primary" size="sm" :loading="userCreditsSaving" :disabled="userCreditsSaving || !selectedUserCanAdjustCredits" @click="adjustSelectedUserCredits">
{{ t('dashboard.sections.users.credits.apply', 'Apply') }}
</TxButton>
</div>
              </div>
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
<h4 class="text-xs font-semibold uppercase tracking-normal text-black/45 dark:text-white/45">
{{ t('dashboard.sections.users.credits.ledger', 'Credit ledger') }}
</h4><span class="text-[11px] text-black/40 dark:text-white/40">{{ userCredits?.summary.month || '-' }}</span>
</div>
                <div v-if="userCreditLedgerItems.length" class="space-y-2">
                  <div v-for="entry in userCreditLedgerItems" :key="entry.id" class="flex items-start justify-between gap-3 rounded-xl bg-black/[0.02] p-3 text-xs dark:bg-white/[0.04]">
                    <div class="min-w-0">
<p class="truncate font-medium text-black dark:text-white">
{{ entry.reason || '-' }}
</p><p class="mt-1 text-[11px] text-black/45 dark:text-white/45">
{{ formatDateTime(entry.createdAt) }}
</p><p v-if="entry.metadata?.tokens" class="mt-1 text-[11px] text-black/35 dark:text-white/35">
tokens {{ entry.metadata.tokens }}
</p>
</div>
                    <p class="shrink-0 font-semibold" :class="entry.delta < 0 ? 'text-red-500' : 'text-green-600'">
{{ entry.delta < 0 ? '-' : '+' }}{{ formatNumber(Math.abs(entry.delta)) }}
</p>
                  </div>
                </div>
                <div v-else class="rounded-xl bg-black/[0.02] p-3 text-xs text-black/45 dark:bg-white/[0.04] dark:text-white/45">
{{ t('dashboard.sections.users.credits.emptyLedger', 'No credit ledger entries.') }}
</div>
                <div v-if="userCreditLedgerPagination.total > userCreditLedgerPagination.limit" class="flex justify-end pt-1">
<TxPagination v-model:current-page="userCreditLedgerPage" :total="userCreditLedgerPagination.total" :page-size="userCreditLedgerPagination.limit" />
</div>
              </div>
            </div>
          </section>
        </template>

        <section v-else-if="drawerMode === 'delete'" class="space-y-4">
          <div class="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">
            <p class="font-semibold">
{{ t('dashboard.sections.users.deletion.warningTitle', 'This schedules account deletion.') }}
</p>
            <p class="mt-2">
{{ t('dashboard.sections.users.deletion.warningBody', 'The account enters a 30-day recovery window. Devices, temporary tokens, and API keys are revoked immediately; financial and credit records are preserved.') }}
</p>
          </div>
          <div>
            <label class="mb-1 block text-xs text-black/50 dark:text-white/50">{{ t('dashboard.sections.users.deletion.confirmLabel', 'Enter the full email below to confirm') }}</label>
            <p class="mb-2 truncate font-mono text-xs text-black/70 dark:text-white/70" :title="selectedUser.email">
{{ selectedUser.email }}
</p>
            <TuffInput v-model="deletionConfirmEmail" type="email" autocomplete="off" class="w-full" />
          </div>
        </section>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <TxButton variant="secondary" size="sm" :disabled="editorSaving || subscriptionSaving || deletionSaving" @click="drawerOpen = false">
{{ drawerMode === 'details' || drawerMode === 'credits' ? t('common.close', 'Close') : t('common.cancel', 'Cancel') }}
</TxButton>
          <TxButton v-if="drawerMode === 'edit'" variant="primary" size="sm" :loading="editorSaving" :disabled="editorSaving || selectedUserLifecycleLocked" @click="saveEditor">
{{ t('common.save', 'Save') }}
</TxButton>
          <TxButton v-else-if="drawerMode === 'subscription'" variant="primary" size="sm" :loading="subscriptionSaving" :disabled="subscriptionSaving || !selectedUserCanReceiveSubscription" @click="grantSelectedUserSubscription">
{{ t('dashboard.sections.users.editor.grantSubscription', 'Grant / renew') }}
</TxButton>
          <TxButton v-else-if="drawerMode === 'delete'" variant="danger" size="sm" :loading="deletionSaving" :disabled="deletionSaving || !deletionConfirmed" @click="requestSelectedUserDeletion">
{{ t('dashboard.sections.users.deletion.confirmAction', 'Schedule deletion') }}
</TxButton>
        </div>
      </template>
    </TxDrawer>
  </AdminPageShell>
</template>
