<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { useToast } from '~/composables/useToast'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useAuthUser()
const toast = useToast()

const isAdmin = computed(() => user.value?.role === 'admin')

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
  createdAt: string
}

interface CreditBalance {
  quota: number
  used: number
}

interface CreditLedgerItem {
  id: string
  userId: string | null
  userEmail: string | null
  userName: string | null
  delta: number
  reason: string
  createdAt: string
  metadata: Record<string, any> | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type SubscriptionPlan = 'FREE' | 'PRO' | 'PLUS' | 'TEAM' | 'ENTERPRISE'
type CreditAdjustmentDirection = 'add' | 'subtract'

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
const editorOpen = ref(false)
const selectedUser = ref<AdminUser | null>(null)
const editorSaving = ref(false)
const resetLinkGenerating = ref(false)
const resetLinkCopied = ref(false)
const resetLinkResult = ref<{
  userId: string
  resetUrl: string
  expiresAt: string
  ttlMinutes: number
} | null>(null)
const userCredits = ref<{
  summary: {
    month: string
    user: CreditBalance | null
    team: CreditBalance | null
  }
  ledger: {
    entries: CreditLedgerItem[]
    pagination: Pagination
  }
} | null>(null)
const userCreditsLoading = ref(false)
const userCreditsSaving = ref(false)
const userCreditsError = ref<string | null>(null)
const userCreditLedgerPage = ref(1)
const userCreditLedgerPagination = ref<Pagination>({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
})
const pagination = reactive<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})

const filters = reactive({
  q: '',
  status: 'all',
  role: 'all',
})

const editorForm = reactive({
  name: '',
  image: '',
  locale: 'none',
  role: 'user',
  status: 'active',
  grantSubscription: false,
  plan: 'PRO' as SubscriptionPlan,
  durationDays: 365,
})

const creditAdjustmentForm = reactive({
  direction: 'add' as CreditAdjustmentDirection,
  amount: 100,
  reason: '',
})

const hasPrev = computed(() => pagination.page > 1)
const hasNext = computed(() => pagination.page < pagination.totalPages)
const actionsLocked = computed(() => loading.value || actionPendingId.value !== null)
const selectedUserLocked = computed(() => !selectedUser.value || selectedUser.value.status === 'merged' || selectedUser.value.id === user.value?.id)
const selectedUserCanGenerateResetLink = computed(() => selectedUser.value?.status === 'active')
const userCreditBalance = computed(() => userCredits.value?.summary.user ?? null)
const userCreditRemaining = computed(() => {
  const balance = userCreditBalance.value
  if (!balance)
    return 0
  return Math.max(0, balance.quota - balance.used)
})
const userCreditUsagePercent = computed(() => {
  const balance = userCreditBalance.value
  if (!balance?.quota)
    return 0
  return Math.min(100, Math.round((balance.used / balance.quota) * 100))
})
const userCreditLedgerItems = computed(() => userCredits.value?.ledger.entries ?? [])

const statusOptions = computed(() => ([
  { value: 'all', label: t('dashboard.sections.users.filters.statusAll', 'All statuses') },
  { value: 'active', label: t('dashboard.sections.users.filters.statusActive', 'Active') },
  { value: 'disabled', label: t('dashboard.sections.users.filters.statusDisabled', 'Disabled') },
  { value: 'merged', label: t('dashboard.sections.users.filters.statusMerged', 'Merged') },
]))

const roleOptions = computed(() => ([
  { value: 'all', label: t('dashboard.sections.users.filters.roleAll', 'All roles') },
  { value: 'admin', label: t('dashboard.sections.users.filters.roleAdmin', 'Admin') },
  { value: 'user', label: t('dashboard.sections.users.filters.roleUser', 'User') },
]))

const editRoleOptions = computed(() => roleOptions.value.filter(item => item.value !== 'all'))
const editStatusOptions = computed(() => statusOptions.value.filter(item => item.value === 'active' || item.value === 'disabled'))
const localeOptions = computed(() => ([
  { value: 'none', label: t('dashboard.sections.users.editor.localeAuto', 'Auto') },
  { value: 'zh', label: t('dashboard.sections.users.editor.localeZh', 'Chinese') },
  { value: 'en', label: t('dashboard.sections.users.editor.localeEn', 'English') },
]))
const planOptions = computed(() => ([
  { value: 'PRO', label: 'PRO' },
  { value: 'PLUS', label: 'PLUS' },
  { value: 'TEAM', label: 'TEAM' },
  { value: 'ENTERPRISE', label: 'ENTERPRISE' },
]))
const creditDirectionOptions = computed(() => ([
  { value: 'add', label: t('dashboard.sections.users.credits.add', 'Add') },
  { value: 'subtract', label: t('dashboard.sections.users.credits.subtract', 'Subtract') },
]))

const statusLabels: Record<string, string> = {
  active: t('dashboard.sections.users.status.active', 'Active'),
  disabled: t('dashboard.sections.users.status.disabled', 'Disabled'),
  merged: t('dashboard.sections.users.status.merged', 'Merged'),
}

const emailStateLabels: Record<string, string> = {
  verified: t('dashboard.sections.users.emailState.verified', 'Verified'),
  unverified: t('dashboard.sections.users.emailState.unverified', 'Unverified'),
  missing: t('dashboard.sections.users.emailState.missing', 'Missing'),
}

const userColumns = computed<DataTableColumn<AdminUser>[]>(() => [
  { key: 'user', title: t('dashboard.sections.users.table.user', 'User'), width: '46%' },
  { key: 'access', title: t('dashboard.sections.users.table.access', 'Access'), width: 220 },
  { key: 'createdAt', title: t('dashboard.sections.users.table.created', 'Created'), width: 140 },
  { key: 'actions', title: t('dashboard.sections.users.table.actions', 'Actions'), width: 110 },
])

function buildQuery() {
  const query: Record<string, string | number> = {
    page: pagination.page,
    limit: pagination.limit,
  }
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
    const res = await rawFetch<{ users: AdminUser[], pagination: Pagination }>('/api/admin/users', {
      query: buildQuery(),
    })
    users.value = res.users ?? []
    if (res.pagination) {
      pagination.page = res.pagination.page
      pagination.limit = res.pagination.limit
      pagination.total = res.pagination.total
      pagination.totalPages = res.pagination.totalPages
    }
  }
  catch (err: any) {
    error.value = err?.data?.message || err?.message || t('dashboard.sections.users.errors.loadFailed', 'Failed to load users.')
  }
  finally {
    loading.value = false
  }
}

function formatDate(value: string | null) {
  if (!value)
    return '-'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(value: string | null) {
  if (!value)
    return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatNumber(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return '0'
  return new Intl.NumberFormat().format(Math.round(value))
}

function formatCreditAmount(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return '0'
  return new Intl.NumberFormat().format(Math.abs(Math.round(value)))
}

function resolvePasswordResetError(err: any): string {
  const code = err?.data?.data?.errorCode || err?.data?.errorCode
  if (code === 'ADMIN_PASSWORD_RESET_INVALID_TTL')
    return t('dashboard.sections.users.passwordReset.errors.invalidTtl', 'Invalid reset link TTL.')
  if (code === 'ADMIN_PASSWORD_RESET_USER_ID_REQUIRED')
    return t('dashboard.sections.users.passwordReset.errors.userIdRequired', 'User id is required.')
  if (code === 'ADMIN_PASSWORD_RESET_USER_NOT_FOUND')
    return t('dashboard.sections.users.passwordReset.errors.userNotFound', 'User not found.')
  if (code === 'ADMIN_PASSWORD_RESET_MERGED_USER')
    return t('dashboard.sections.users.passwordReset.errors.mergedUser', 'Merged users cannot reset password.')
  if (code === 'ADMIN_PASSWORD_RESET_INACTIVE_USER')
    return t('dashboard.sections.users.passwordReset.errors.inactiveUser', 'Only active users can reset password.')
  return t('dashboard.sections.users.passwordReset.generateFailed', 'Failed to generate password reset link.')
}

function applyUserCreditsResponse(res: {
  summary: {
    month: string
    user: CreditBalance | null
    team: CreditBalance | null
  }
  ledger: {
    entries: CreditLedgerItem[]
    pagination: Pagination
  }
}) {
  userCredits.value = {
    summary: res.summary,
    ledger: res.ledger,
  }
  userCreditLedgerPagination.value = res.ledger.pagination
  userCreditLedgerPage.value = res.ledger.pagination.page
}

function resetUserCreditsState() {
  userCredits.value = null
  userCreditsError.value = null
  userCreditLedgerPage.value = 1
  userCreditLedgerPagination.value = {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  }
  creditAdjustmentForm.direction = 'add'
  creditAdjustmentForm.amount = 100
  creditAdjustmentForm.reason = ''
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
    const res = await rawFetch<{
      summary: {
        month: string
        user: CreditBalance | null
        team: CreditBalance | null
      }
      ledger: {
        entries: CreditLedgerItem[]
        pagination: Pagination
      }
    }>(`/api/admin/users/${entry.id}/credits`, {
      query: {
        page: userCreditLedgerPage.value,
        limit: userCreditLedgerPagination.value.limit,
      },
    })
    applyUserCreditsResponse(res)
  }
  catch (err: any) {
    userCreditsError.value = err?.data?.message || err?.message || t('dashboard.sections.users.credits.loadFailed', 'Failed to load credits.')
  }
  finally {
    userCreditsLoading.value = false
  }
}

async function adjustSelectedUserCredits() {
  const entry = selectedUser.value
  if (!entry || userCreditsSaving.value)
    return

  const amount = Math.round(Math.abs(Number(creditAdjustmentForm.amount)))
  if (!Number.isFinite(amount) || amount <= 0) {
    toast.warning(t('dashboard.sections.users.credits.invalidAmount', 'Invalid credit amount.'))
    return
  }

  userCreditsSaving.value = true
  try {
    const res = await rawFetch<{
      summary: {
        month: string
        user: CreditBalance | null
        team: CreditBalance | null
      }
      ledger: {
        entries: CreditLedgerItem[]
        pagination: Pagination
      }
    }>(`/api/admin/users/${entry.id}/credits`, {
      method: 'PATCH',
      body: {
        amount,
        direction: creditAdjustmentForm.direction,
        reason: creditAdjustmentForm.reason.trim() || undefined,
      },
    })
    applyUserCreditsResponse(res)
    creditAdjustmentForm.reason = ''
    toast.success(t('dashboard.sections.users.credits.adjustSuccess', 'Credits updated.'))
  }
  catch (err: any) {
    const fallback = t('dashboard.sections.users.credits.adjustFailed', 'Failed to update credits.')
    toast.warning(err?.data?.message || err?.message || fallback)
  }
  finally {
    userCreditsSaving.value = false
  }
}

function applyUserUpdate(updated: AdminUser) {
  users.value = users.value.map(entry => (entry.id === updated.id ? { ...entry, ...updated } : entry))
  if (selectedUser.value?.id === updated.id)
    selectedUser.value = { ...selectedUser.value, ...updated }
}

function openEditor(entry: AdminUser) {
  selectedUser.value = entry
  resetLinkCopied.value = false
  resetLinkResult.value = null
  resetUserCreditsState()
  editorForm.name = entry.name || ''
  editorForm.image = entry.image || ''
  editorForm.locale = entry.locale || 'none'
  editorForm.role = entry.role === 'admin' ? 'admin' : 'user'
  editorForm.status = entry.status === 'disabled' ? 'disabled' : 'active'
  editorForm.grantSubscription = false
  editorForm.plan = 'PRO'
  editorForm.durationDays = 365
  editorOpen.value = true
  void fetchSelectedUserCredits({ resetPage: true })
}

async function updateUserRole(entry: AdminUser, nextRole: string) {
  if (actionsLocked.value || entry.role === nextRole)
    return
  actionPendingId.value = entry.id
  try {
    const res = await rawFetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/role`, {
      method: 'PATCH',
      body: { role: nextRole },
    })
    if (res?.user)
      applyUserUpdate(res.user)
    toast.success(t('dashboard.sections.users.actions.roleSuccess', 'Role updated.'))
  }
  catch (err: any) {
    const fallback = t('dashboard.sections.users.actions.roleFailed', 'Failed to update role.')
    toast.warning(err?.data?.message || err?.message || fallback)
    throw err
  }
  finally {
    actionPendingId.value = null
  }
}

async function updateUserStatus(entry: AdminUser, nextStatus: string) {
  if (actionsLocked.value || entry.status === nextStatus)
    return
  actionPendingId.value = entry.id
  try {
    const res = await rawFetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/status`, {
      method: 'PATCH',
      body: { status: nextStatus },
    })
    if (res?.user)
      applyUserUpdate(res.user)
    toast.success(t('dashboard.sections.users.actions.statusSuccess', 'Status updated.'))
  }
  catch (err: any) {
    const fallback = t('dashboard.sections.users.actions.statusFailed', 'Failed to update status.')
    toast.warning(err?.data?.message || err?.message || fallback)
    throw err
  }
  finally {
    actionPendingId.value = null
  }
}

async function updateUserProfile(entry: AdminUser) {
  const res = await rawFetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/profile`, {
    method: 'PATCH',
    body: {
      name: editorForm.name.trim() || null,
      image: editorForm.image.trim() || null,
      locale: editorForm.locale === 'none' ? null : editorForm.locale,
    },
  })
  if (res?.user)
    applyUserUpdate(res.user)
}

async function grantSubscription(entry: AdminUser) {
  await rawFetch('/api/admin/subscriptions/grant', {
    method: 'POST',
    body: {
      userId: entry.id,
      plan: editorForm.plan,
      durationDays: Number(editorForm.durationDays),
      expiresInDays: Number(editorForm.durationDays),
    },
  })
}

async function generatePasswordResetLink() {
  const entry = selectedUser.value
  if (!entry || resetLinkGenerating.value)
    return

  resetLinkGenerating.value = true
  resetLinkCopied.value = false
  try {
    const res = await rawFetch<{ resetUrl: string, expiresAt: string, ttlMinutes: number }>(`/api/admin/users/${entry.id}/password-reset-link`, {
      method: 'POST',
      body: { ttlMinutes: 30 },
    })
    resetLinkResult.value = {
      userId: entry.id,
      resetUrl: res.resetUrl,
      expiresAt: res.expiresAt,
      ttlMinutes: res.ttlMinutes,
    }
    toast.success(t('dashboard.sections.users.passwordReset.generated', 'Password reset link generated.'))
  }
  catch (err: any) {
    toast.warning(resolvePasswordResetError(err))
  }
  finally {
    resetLinkGenerating.value = false
  }
}

async function copyPasswordResetLink() {
  if (!resetLinkResult.value?.resetUrl)
    return
  try {
    await navigator.clipboard.writeText(resetLinkResult.value.resetUrl)
    resetLinkCopied.value = true
    toast.success(t('dashboard.sections.users.passwordReset.copied', 'Password reset link copied.'))
    setTimeout(() => {
      resetLinkCopied.value = false
    }, 2000)
  }
  catch (err: any) {
    const fallback = t('dashboard.sections.users.passwordReset.copyFailed', 'Failed to copy password reset link.')
    toast.warning(err?.message || fallback)
  }
}

async function saveEditor() {
  const entry = selectedUser.value
  if (!entry || editorSaving.value)
    return

  if (entry.status === 'merged') {
    toast.warning(t('dashboard.sections.users.editor.mergedLocked', 'Merged users cannot be edited.'))
    return
  }

  editorSaving.value = true
  try {
    await updateUserProfile(entry)
    if (!selectedUserLocked.value) {
      await updateUserRole(entry, editorForm.role)
      await updateUserStatus(entry, editorForm.status)
    }
    if (editorForm.grantSubscription) {
      if (!Number.isFinite(Number(editorForm.durationDays)) || Number(editorForm.durationDays) <= 0)
        throw new Error(t('dashboard.sections.users.editor.invalidDuration', 'Invalid subscription duration.'))
      await grantSubscription(entry)
      toast.success(t('dashboard.sections.users.editor.subscriptionSuccess', 'Subscription granted.'))
    }
    toast.success(t('dashboard.sections.users.editor.saveSuccess', 'User updated.'))
    editorOpen.value = false
    await fetchUsers()
  }
  catch (err: any) {
    const fallback = t('dashboard.sections.users.editor.saveFailed', 'Failed to update user.')
    toast.warning(err?.data?.message || err?.message || fallback)
  }
  finally {
    editorSaving.value = false
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
  searchTimer = setTimeout(() => {
    fetchUsers({ resetPage: true })
  }, 300)
})

watch([() => filters.status, () => filters.role], () => {
  fetchUsers({ resetPage: true })
})

watch(userCreditLedgerPage, () => {
  if (editorOpen.value && selectedUser.value)
    fetchSelectedUserCredits()
})

onBeforeUnmount(() => {
  if (searchTimer)
    clearTimeout(searchTimer)
})

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.menu.accounts', 'Account Management') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.users.subtitle', 'Manage access, roles, and account status across your organization.') }}
      </p>
    </div>

    <AccountTabs />

    <section class="apple-card-lg p-5 space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_180px_auto]">
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.users.filters.searchLabel', 'Search') }}
          </label>
          <TuffInput
            v-model="filters.q"
            type="text"
            autocomplete="off"
            :placeholder="t('dashboard.sections.users.filters.searchPlaceholder', 'Search by name or email')"
            class="w-full"
          />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.users.filters.statusLabel', 'Status') }}
          </label>
          <TuffSelect v-model="filters.status" class="w-full">
            <TuffSelectItem v-for="opt in statusOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.users.filters.roleLabel', 'Role') }}
          </label>
          <TuffSelect v-model="filters.role" class="w-full">
            <TuffSelectItem v-for="opt in roleOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </div>
        <div class="flex items-end">
          <TxButton variant="secondary" size="small" :disabled="loading" @click="fetchUsers({ resetPage: true })">
            {{ t('common.refresh', 'Refresh') }}
          </TxButton>
        </div>
      </div>
    </section>

    <div v-if="error" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ error }}
    </div>

    <section class="apple-card-lg overflow-hidden">
      <div class="border-b border-black/[0.04] p-5 dark:border-white/[0.06]">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ t('dashboard.sections.users.listTitle', 'All Users') }}
          </h2>
          <div class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
            <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
          </div>
        </div>
      </div>

      <div v-if="loading && !users.length" class="space-y-3 p-5">
        <div class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.users.loading', 'Loading...') }}
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>

      <div v-else-if="!users.length" class="p-8 text-center text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.users.empty', 'No users found.') }}
      </div>

      <div v-else class="overflow-x-auto">
        <TxDataTable :columns="userColumns" :data="users" row-key="id" class="min-w-[720px]">
          <template #cell-user="{ row: entry }">
            <div class="min-w-0 space-y-1">
              <p class="truncate font-medium text-black dark:text-white" :title="entry.name || '-'">
                {{ entry.name || '-' }}
              </p>
              <p class="max-w-[360px] truncate text-xs text-black/60 dark:text-white/60" :title="entry.email">
                {{ entry.email }}
              </p>
            </div>
          </template>
          <template #cell-access="{ row: entry }">
            <div class="flex flex-wrap items-center gap-2">
              <TxStatusBadge :text="entry.role" :status="entry.role === 'admin' ? 'info' : 'muted'" size="sm" />
              <TxStatusBadge
                :text="statusLabels[entry.status] || entry.status"
                :status="entry.status === 'active' ? 'success' : entry.status === 'disabled' ? 'danger' : 'muted'"
                size="sm"
              />
              <span class="text-xs text-black/50 dark:text-white/50">
                {{ emailStateLabels[entry.emailState] || entry.emailState }}
              </span>
            </div>
          </template>
          <template #cell-createdAt="{ row: entry }">
            <span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(entry.createdAt) }}</span>
          </template>
          <template #cell-actions="{ row: entry }">
            <TxButton variant="secondary" size="mini" :disabled="actionsLocked" @click="openEditor(entry)">
              {{ t('dashboard.sections.users.actions.edit', 'Edit') }}
            </TxButton>
          </template>
        </TxDataTable>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-black/[0.04] p-4 dark:border-white/[0.06]">
        <TxButton variant="secondary" size="small" :disabled="!hasPrev || loading" @click="goPrev">
          {{ t('dashboard.sections.users.pagination.prev', 'Prev') }}
        </TxButton>
        <TxButton variant="secondary" size="small" :disabled="!hasNext || loading" @click="goNext">
          {{ t('dashboard.sections.users.pagination.next', 'Next') }}
        </TxButton>
      </div>
    </section>

    <TxDrawer
      v-model:visible="editorOpen"
      :title="t('dashboard.sections.users.editor.title', 'Edit User')"
      width="min(560px, 100vw)"
    >
      <div v-if="selectedUser" class="space-y-6">
        <section class="rounded-2xl border border-black/[0.06] p-4 dark:border-white/[0.08]">
          <p class="text-sm font-semibold text-black dark:text-white">
            {{ selectedUser.name || selectedUser.email }}
          </p>
          <p class="mt-1 break-all text-xs text-black/50 dark:text-white/50">
            {{ selectedUser.email }}
          </p>
          <p class="mt-2 break-all text-[11px] text-black/40 dark:text-white/40">
            ID: {{ selectedUser.id }}
          </p>
        </section>

        <section class="space-y-3">
          <h3 class="apple-section-title">
            {{ t('dashboard.sections.users.editor.profile', 'Profile') }}
          </h3>
          <div>
            <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.users.editor.name', 'Display name') }}
            </label>
            <TuffInput v-model="editorForm.name" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.users.editor.image', 'Avatar URL') }}
            </label>
            <TuffInput v-model="editorForm.image" class="w-full" />
          </div>
          <div>
            <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.sections.users.editor.locale', 'Locale') }}
            </label>
            <TuffSelect v-model="editorForm.locale" class="w-full">
              <TuffSelectItem v-for="opt in localeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
            </TuffSelect>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="apple-section-title">
            {{ t('dashboard.sections.users.editor.access', 'Access') }}
          </h3>
          <p v-if="selectedUserLocked" class="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
            {{ selectedUser.status === 'merged'
              ? t('dashboard.sections.users.editor.mergedLocked', 'Merged users cannot be edited.')
              : t('dashboard.sections.users.editor.selfLocked', 'You cannot change your own role or status here.') }}
          </p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.users.table.role', 'Role') }}
              </label>
              <TuffSelect v-model="editorForm.role" class="w-full" :disabled="selectedUserLocked">
                <TuffSelectItem v-for="opt in editRoleOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
              </TuffSelect>
            </div>
            <div>
              <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.users.table.status', 'Status') }}
              </label>
              <TuffSelect v-model="editorForm.status" class="w-full" :disabled="selectedUserLocked">
                <TuffSelectItem v-for="opt in editStatusOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
              </TuffSelect>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <h3 class="apple-section-title">
              {{ t('dashboard.sections.users.editor.subscription', 'Subscription') }}
            </h3>
            <TxCheckbox v-model="editorForm.grantSubscription" :label="t('dashboard.sections.users.editor.grantSubscription', 'Grant / renew')" />
          </div>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2" :class="!editorForm.grantSubscription ? 'opacity-50' : ''">
            <div>
              <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.users.editor.plan', 'Plan') }}
              </label>
              <TuffSelect v-model="editorForm.plan" class="w-full" :disabled="!editorForm.grantSubscription">
                <TuffSelectItem v-for="opt in planOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
              </TuffSelect>
            </div>
            <div>
              <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.users.editor.durationDays', 'Duration (days)') }}
              </label>
              <TuffInput v-model="editorForm.durationDays" type="number" class="w-full" :disabled="!editorForm.grantSubscription" />
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="apple-section-title">
                {{ t('dashboard.sections.users.credits.title', 'Credits') }}
              </h3>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.users.credits.hint', 'View the selected user credit balance, adjustments, and ledger.') }}
              </p>
            </div>
            <TxButton
              variant="secondary"
              size="small"
              :loading="userCreditsLoading"
              :disabled="userCreditsLoading"
              @click="fetchSelectedUserCredits({ resetPage: true })"
            >
              {{ t('common.refresh', 'Refresh') }}
            </TxButton>
          </div>

          <div v-if="userCreditsError" class="rounded-xl bg-red-50 p-3 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200">
            {{ userCreditsError }}
          </div>

          <div v-if="userCreditsLoading && !userCredits" class="flex items-center justify-center gap-2 rounded-xl bg-black/[0.02] p-4 text-sm text-black/50 dark:bg-white/[0.04] dark:text-white/50">
            <TxSpinner :size="16" />
            {{ t('dashboard.sections.users.credits.loading', 'Loading credits...') }}
          </div>

          <div v-else class="space-y-3">
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="text-[11px] text-black/45 dark:text-white/45">
                  {{ t('dashboard.sections.users.credits.remaining', 'Remaining') }}
                </p>
                <p class="mt-1 text-base font-semibold text-black dark:text-white">
                  {{ formatNumber(userCreditRemaining) }}
                </p>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="text-[11px] text-black/45 dark:text-white/45">
                  {{ t('dashboard.sections.users.credits.used', 'Used') }}
                </p>
                <p class="mt-1 text-base font-semibold text-black dark:text-white">
                  {{ formatNumber(userCreditBalance?.used) }}
                </p>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
                <p class="text-[11px] text-black/45 dark:text-white/45">
                  {{ t('dashboard.sections.users.credits.quota', 'Quota') }}
                </p>
                <p class="mt-1 text-base font-semibold text-black dark:text-white">
                  {{ formatNumber(userCreditBalance?.quota) }}
                </p>
              </div>
            </div>

            <div class="h-2 overflow-hidden rounded-full bg-black/[0.05] dark:bg-white/[0.08]">
              <div
                class="h-full rounded-full bg-sky-500 transition-all"
                :style="{ width: `${userCreditUsagePercent}%` }"
              />
            </div>

            <div class="grid grid-cols-1 gap-2 rounded-xl border border-black/[0.06] p-3 dark:border-white/[0.08] sm:grid-cols-[120px_1fr]">
              <div>
                <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.users.credits.direction', 'Direction') }}
                </label>
                <TuffSelect v-model="creditAdjustmentForm.direction" class="w-full">
                  <TuffSelectItem v-for="opt in creditDirectionOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
                </TuffSelect>
              </div>
              <div>
                <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.users.credits.amount', 'Amount') }}
                </label>
                <TuffInput v-model="creditAdjustmentForm.amount" type="number" min="1" class="w-full" />
              </div>
              <div class="sm:col-span-2">
                <label class="mb-1 block text-xs text-black/50 dark:text-white/50">
                  {{ t('dashboard.sections.users.credits.reason', 'Reason') }}
                </label>
                <TuffInput
                  v-model="creditAdjustmentForm.reason"
                  :placeholder="t('dashboard.sections.users.credits.reasonPlaceholder', 'Optional audit reason')"
                  class="w-full"
                />
              </div>
              <div class="flex justify-end sm:col-span-2">
                <TxButton
                  variant="primary"
                  size="small"
                  :loading="userCreditsSaving"
                  :disabled="userCreditsSaving || selectedUser.status === 'merged'"
                  @click="adjustSelectedUserCredits"
                >
                  {{ t('dashboard.sections.users.credits.apply', 'Apply') }}
                </TxButton>
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <h4 class="text-xs font-semibold uppercase tracking-normal text-black/45 dark:text-white/45">
                  {{ t('dashboard.sections.users.credits.ledger', 'Credit ledger') }}
                </h4>
                <span class="text-[11px] text-black/40 dark:text-white/40">
                  {{ userCredits?.summary.month || '-' }}
                </span>
              </div>

              <div v-if="userCreditLedgerItems.length" class="space-y-2">
                <div
                  v-for="entry in userCreditLedgerItems"
                  :key="entry.id"
                  class="flex items-start justify-between gap-3 rounded-xl bg-black/[0.02] p-3 text-xs dark:bg-white/[0.04]"
                >
                  <div class="min-w-0">
                    <p class="truncate font-medium text-black dark:text-white">
                      {{ entry.reason || '-' }}
                    </p>
                    <p class="mt-1 text-[11px] text-black/45 dark:text-white/45">
                      {{ formatDateTime(entry.createdAt) }}
                    </p>
                    <p v-if="entry.metadata?.tokens" class="mt-1 text-[11px] text-black/35 dark:text-white/35">
                      tokens {{ entry.metadata.tokens }}
                    </p>
                  </div>
                  <p class="shrink-0 font-semibold" :class="entry.delta < 0 ? 'text-red-500' : 'text-green-600'">
                    {{ entry.delta < 0 ? '-' : '+' }}{{ formatCreditAmount(entry.delta) }}
                  </p>
                </div>
              </div>

              <div v-else class="rounded-xl bg-black/[0.02] p-3 text-xs text-black/45 dark:bg-white/[0.04] dark:text-white/45">
                {{ t('dashboard.sections.users.credits.emptyLedger', 'No credit ledger entries.') }}
              </div>

              <div v-if="userCreditLedgerPagination.total > userCreditLedgerPagination.limit" class="flex justify-end pt-1">
                <TxPagination
                  v-model:current-page="userCreditLedgerPage"
                  :total="userCreditLedgerPagination.total"
                  :page-size="userCreditLedgerPagination.limit"
                />
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="apple-section-title">
                {{ t('dashboard.sections.users.passwordReset.title', 'Password reset') }}
              </h3>
              <p class="mt-1 text-xs text-black/45 dark:text-white/45">
                {{ t('dashboard.sections.users.passwordReset.hint', 'Generate a one-time reset link for support recovery. The token is not stored in this page.') }}
              </p>
            </div>
            <TxButton
              variant="secondary"
              size="small"
              :loading="resetLinkGenerating"
              :disabled="resetLinkGenerating || !selectedUserCanGenerateResetLink"
              @click="generatePasswordResetLink"
            >
              {{ t('dashboard.sections.users.passwordReset.generate', 'Generate link') }}
            </TxButton>
          </div>
          <p v-if="!selectedUserCanGenerateResetLink" class="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-200">
            {{ t('dashboard.sections.users.passwordReset.activeOnly', 'Only active users can receive a password reset link.') }}
          </p>
          <div v-if="resetLinkResult?.userId === selectedUser.id" class="space-y-2 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.sections.users.passwordReset.expiresAt', { expiresAt: formatDate(resetLinkResult.expiresAt), ttl: resetLinkResult.ttlMinutes }, `Expires in ${resetLinkResult.ttlMinutes} minutes`) }}
              </span>
              <TxButton variant="secondary" size="mini" @click="copyPasswordResetLink">
                {{ resetLinkCopied ? t('dashboard.sections.users.passwordReset.copiedShort', 'Copied') : t('dashboard.sections.users.passwordReset.copy', 'Copy') }}
              </TxButton>
            </div>
            <TuffInput :model-value="resetLinkResult.resetUrl" readonly class="w-full font-mono text-xs" />
          </div>
        </section>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <TxButton variant="secondary" size="small" :disabled="editorSaving" @click="editorOpen = false">
            {{ t('common.cancel', 'Cancel') }}
          </TxButton>
          <TxButton variant="primary" size="small" :loading="editorSaving" :disabled="editorSaving" @click="saveEditor">
            {{ t('common.save', 'Save') }}
          </TxButton>
        </div>
      </template>
    </TxDrawer>
  </div>
</template>
