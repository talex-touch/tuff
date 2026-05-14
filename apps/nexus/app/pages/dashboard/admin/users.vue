<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { DataTableColumn } from '@talex-touch/tuffex'
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxCheckbox, TxDataTable, TxDrawer, TxSkeleton, TxSpinner, TxStatusBadge } from '@talex-touch/tuffex'
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

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type SubscriptionPlan = 'FREE' | 'PRO' | 'PLUS' | 'TEAM' | 'ENTERPRISE'

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
const editorOpen = ref(false)
const selectedUser = ref<AdminUser | null>(null)
const editorSaving = ref(false)
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

const hasPrev = computed(() => pagination.page > 1)
const hasNext = computed(() => pagination.page < pagination.totalPages)
const actionsLocked = computed(() => loading.value || actionPendingId.value !== null)
const selectedUserLocked = computed(() => !selectedUser.value || selectedUser.value.status === 'merged' || selectedUser.value.id === user.value?.id)

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

function applyUserUpdate(updated: AdminUser) {
  users.value = users.value.map(entry => (entry.id === updated.id ? { ...entry, ...updated } : entry))
  if (selectedUser.value?.id === updated.id)
    selectedUser.value = { ...selectedUser.value, ...updated }
}

function openEditor(entry: AdminUser) {
  selectedUser.value = entry
  editorForm.name = entry.name || ''
  editorForm.image = entry.image || ''
  editorForm.locale = entry.locale || 'none'
  editorForm.role = entry.role === 'admin' ? 'admin' : 'user'
  editorForm.status = entry.status === 'disabled' ? 'disabled' : 'active'
  editorForm.grantSubscription = false
  editorForm.plan = 'PRO'
  editorForm.durationDays = 365
  editorOpen.value = true
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
