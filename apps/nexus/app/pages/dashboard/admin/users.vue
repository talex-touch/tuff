<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex'
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

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
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

const users = ref<AdminUser[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const actionPendingId = ref<string | null>(null)
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

const hasPrev = computed(() => pagination.page > 1)
const hasNext = computed(() => pagination.page < pagination.totalPages)
const actionsLocked = computed(() => loading.value || actionPendingId.value !== null)

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

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  disabled: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  merged: 'bg-black/[0.06] text-black/60 dark:bg-white/[0.08] dark:text-white/60',
}

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
    const res = await $fetch<{ users: AdminUser[], pagination: Pagination }>('/api/admin/users', {
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
}

async function updateUserRole(entry: AdminUser) {
  if (actionsLocked.value)
    return
  const nextRole = entry.role === 'admin' ? 'user' : 'admin'
  actionPendingId.value = entry.id
  try {
    const res = await $fetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/role`, {
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
  }
  finally {
    actionPendingId.value = null
  }
}

async function updateUserStatus(entry: AdminUser) {
  if (actionsLocked.value)
    return
  const nextStatus = entry.status === 'active' ? 'disabled' : 'active'
  actionPendingId.value = entry.id
  try {
    const res = await $fetch<{ user: AdminUser }>(`/api/admin/users/${entry.id}/status`, {
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
  }
  finally {
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
        {{ t('dashboard.sections.users.title', 'User Management') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.users.subtitle', 'Manage access, roles, and account status across your organization.') }}
      </p>
    </div>

    <section class="apple-card-lg p-5 space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_180px_auto]">
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.users.filters.searchLabel', 'Search') }}
          </label>
          <Input
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
        <table class="w-full min-w-[760px]">
          <thead class="bg-black/5 dark:bg-white/[0.04]">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.users.table.user', 'User') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.users.table.role', 'Role') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.users.table.status', 'Status') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.users.table.emailState', 'Email') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.users.table.created', 'Created') }}
              </th>
              <th class="px-4 py-3 text-left text-xs font-medium text-black/60 uppercase dark:text-white/60">
                {{ t('dashboard.sections.users.table.actions', 'Actions') }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            <tr v-for="entry in users" :key="entry.id" class="transition hover:bg-black/[0.04] dark:hover:bg-white/[0.04]">
              <td class="px-4 py-3">
                <div class="space-y-1">
                  <p class="font-medium text-black dark:text-white">
                    {{ entry.name || '-' }}
                  </p>
                  <p class="text-xs text-black/60 dark:text-white/60">
                    {{ entry.email }}
                  </p>
                </div>
              </td>
              <td class="px-4 py-3 text-sm text-black/70 dark:text-white/70">
                {{ entry.role }}
              </td>
              <td class="px-4 py-3">
                <span
                  class="inline-flex rounded-full px-2 py-1 text-xs font-medium"
                  :class="statusStyles[entry.status] || 'bg-black/10 text-black/60 dark:bg-white/[0.08] dark:text-white/60'"
                >
                  {{ statusLabels[entry.status] || entry.status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-black/70 dark:text-white/70">
                {{ emailStateLabels[entry.emailState] || entry.emailState }}
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-white/60">
                {{ formatDate(entry.createdAt) }}
              </td>
              <td class="px-4 py-3 text-sm text-black/60 dark:text-white/60">
                <div class="flex flex-wrap items-center gap-2">
                  <TxButton
                    variant="secondary"
                    size="mini"
                    :disabled="actionsLocked || entry.status === 'merged' || entry.id === user?.id"
                    @click="updateUserRole(entry)"
                  >
                    {{ entry.role === 'admin'
                      ? t('dashboard.sections.users.actions.demote', 'Demote')
                      : t('dashboard.sections.users.actions.promote', 'Promote') }}
                  </TxButton>
                  <TxButton
                    variant="secondary"
                    size="mini"
                    :disabled="actionsLocked || entry.status === 'merged' || entry.id === user?.id"
                    @click="updateUserStatus(entry)"
                  >
                    {{ entry.status === 'active'
                      ? t('dashboard.sections.users.actions.disable', 'Disable')
                      : t('dashboard.sections.users.actions.enable', 'Enable') }}
                  </TxButton>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
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
  </div>
</template>
