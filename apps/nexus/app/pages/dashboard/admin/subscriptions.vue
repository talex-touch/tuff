<script setup lang="ts">
import { $fetch as rawFetch } from 'ofetch'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TuffInput } from '@talex-touch/tuffex/input'
import AccountTabs from '~/components/dashboard/admin/AccountTabs.vue'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxRowSkeleton } from '@talex-touch/tuffex/skeleton'
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

const { t, locale } = useI18n()
const { user } = useAuthUser()
const toast = useToast()

/**
 * ofetch puts the whole request line in `err.message`
 * (`[GET] "/api/admin/codes": <no response> Failed to fetch`), so using it as
 * the fallback prints an internal route at the operator and says nothing they
 * can act on. Only `err.data.message` — what the endpoint chose to say — is
 * safe to surface.
 */
function resolveErrorMessage(err: unknown, fallback: string) {
  const message = (err as { data?: { message?: unknown } })?.data?.message
  return typeof message === 'string' && message.trim() ? message.trim() : fallback
}

// Admin check - redirect if not admin
const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
  }
}, { immediate: true })

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface AdminSubscriptionUser {
  id: string
  email: string
  name: string | null
  image: string | null
  role: string
  status: string
  createdAt: string
}

interface AdminSubscription {
  user: AdminSubscriptionUser
  subscription: {
    plan: string
    activatedAt: string | null
    expiresAt: string | null
    isActive: boolean
  }
}

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

const subscriptionList = ref<AdminSubscription[]>([])
const subscriptionLoading = ref(false)
const subscriptionError = ref<string | null>(null)
const subscriptionPagination = reactive<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})

const subscriptionFilters = reactive({
  q: '',
  status: 'all',
  role: 'all',
})

const subscriptionHasPrev = computed(() => subscriptionPagination.page > 1)
const subscriptionHasNext = computed(() => subscriptionPagination.page < subscriptionPagination.totalPages)

const statusOptions = computed(() => ([
  { value: 'all', label: t('dashboard.sections.subscriptions.filters.statusAll', 'All statuses') },
  { value: 'active', label: t('dashboard.sections.subscriptions.filters.statusActive', 'Active') },
  { value: 'disabled', label: t('dashboard.sections.subscriptions.filters.statusDisabled', 'Disabled') },
  { value: 'merged', label: t('dashboard.sections.subscriptions.filters.statusMerged', 'Merged') },
]))

const roleOptions = computed(() => ([
  { value: 'all', label: t('dashboard.sections.subscriptions.filters.roleAll', 'All roles') },
  { value: 'admin', label: t('dashboard.sections.subscriptions.filters.roleAdmin', 'Admin') },
  { value: 'user', label: t('dashboard.sections.subscriptions.filters.roleUser', 'User') },
]))

const planOptions = [
  { value: 'FREE', label: 'Free', color: 'text-slate-500' },
  { value: 'PLUS', label: 'Plus', color: 'text-blue-500' },
  { value: 'PRO', label: 'Pro', color: 'text-purple-500' },
  { value: 'ENTERPRISE', label: 'Enterprise', color: 'text-amber-500' },
  { value: 'TEAM', label: 'Team', color: 'text-green-500' },
]

// Computed, not a plain object: resolving t() once at setup freezes the English
// strings into the table, so switching language leaves every badge behind.
const subscriptionStatusLabels = computed<Record<string, string>>(() => ({
  active: t('dashboard.sections.subscriptions.status.active', 'Active'),
  expired: t('dashboard.sections.subscriptions.status.expired', 'Expired'),
}))

const grantForm = reactive({
  target: '',
  plan: 'PLUS' as 'PLUS' | 'PRO' | 'TEAM' | 'ENTERPRISE',
  durationDays: 30,
})

const grantLoading = ref(false)
const grantError = ref<string | null>(null)

const codes = ref<ActivationCode[]>([])
const codesLoading = ref(false)
const codesGenerating = ref(false)
const codesError = ref<string | null>(null)
const codesActionPendingId = ref<string | null>(null)
const revokeArmedId = ref<string | null>(null)
const copiedCodeId = ref<string | null>(null)
let revokeArmTimer: ReturnType<typeof setTimeout> | null = null
let copyResetTimer: ReturnType<typeof setTimeout> | null = null

// Generation form
const genForm = reactive({
  plan: 'PLUS' as 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | 'TEAM',
  durationDays: 30,
  maxUses: 1,
  expiresInDays: 90,
  count: 1,
})

const subscriptionColumns = computed<DataTableColumn<AdminSubscription>[]>(() => [
  { key: 'user', title: t('dashboard.sections.subscriptions.table.user', 'User'), width: '28%' },
  { key: 'role', title: t('dashboard.sections.subscriptions.table.role', 'Role'), width: 120 },
  { key: 'plan', title: t('dashboard.sections.subscriptions.table.plan', 'Plan'), width: 120 },
  { key: 'status', title: t('dashboard.sections.subscriptions.table.status', 'Status'), width: 140 },
  { key: 'activatedAt', title: t('dashboard.sections.subscriptions.table.activatedAt', 'Activated'), width: 150 },
  { key: 'expiresAt', title: t('dashboard.sections.subscriptions.table.expiresAt', 'Expires'), width: 150 },
])

const codeColumns = computed<DataTableColumn<ActivationCode>[]>(() => [
  { key: 'code', title: t('dashboard.sections.codes.table.code', 'Code'), width: 230 },
  { key: 'plan', title: t('dashboard.sections.codes.table.plan', 'Plan'), width: 110 },
  { key: 'duration', title: t('dashboard.sections.codes.table.duration', 'Duration'), width: 130 },
  { key: 'uses', title: t('dashboard.sections.codes.table.uses', 'Uses'), width: 110 },
  { key: 'status', title: t('dashboard.sections.codes.table.status', 'Status'), width: 130 },
  { key: 'created', title: t('dashboard.sections.codes.table.created', 'Created'), width: 140 },
  { key: 'expires', title: t('dashboard.sections.codes.table.expires', 'Expires'), width: 140 },
  { key: 'actions', title: t('dashboard.sections.codes.table.actions', 'Actions'), width: 120 },
])

function buildSubscriptionQuery() {
  const query: Record<string, string | number> = {
    page: subscriptionPagination.page,
    limit: subscriptionPagination.limit,
  }
  if (subscriptionFilters.q.trim())
    query.q = subscriptionFilters.q.trim()
  if (subscriptionFilters.status !== 'all')
    query.status = subscriptionFilters.status
  if (subscriptionFilters.role !== 'all')
    query.role = subscriptionFilters.role
  return query
}

async function fetchSubscriptions(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    subscriptionPagination.page = 1

  subscriptionLoading.value = true
  subscriptionError.value = null
  try {
    const res = await rawFetch<{ subscriptions: AdminSubscription[], pagination: Pagination }>('/api/admin/subscriptions', {
      query: buildSubscriptionQuery(),
    })
    subscriptionList.value = res.subscriptions ?? []
    if (res.pagination) {
      subscriptionPagination.page = res.pagination.page
      subscriptionPagination.limit = res.pagination.limit
      subscriptionPagination.total = res.pagination.total
      subscriptionPagination.totalPages = res.pagination.totalPages
    }
  }
  catch (err: unknown) {
    subscriptionError.value = resolveErrorMessage(err, t('dashboard.sections.subscriptions.errors.loadFailed', 'Failed to load subscriptions.'))
  }
  finally {
    subscriptionLoading.value = false
  }
}

async function fetchCodes() {
  codesLoading.value = true
  codesError.value = null
  try {
    const res = await rawFetch<{ codes: ActivationCode[] }>('/api/admin/codes')
    codes.value = res.codes ?? []
  }
  catch (err: unknown) {
    // Fallback is untranslated: sections.codes has no errors.loadFailed key.
    codesError.value = resolveErrorMessage(err, 'Failed to load codes')
  }
  finally {
    codesLoading.value = false
  }
}

async function generateCodes() {
  codesGenerating.value = true
  codesError.value = null
  try {
    await rawFetch('/api/admin/codes/generate', {
      method: 'POST',
      body: genForm,
    })
    await fetchCodes()
  }
  catch (err: unknown) {
    // Fallback is untranslated: sections.codes has no errors.generateFailed key.
    codesError.value = resolveErrorMessage(err, 'Failed to generate codes')
  }
  finally {
    codesGenerating.value = false
  }
}

/**
 * writeText rejects when the clipboard permission is denied or the document is
 * not focused. Unhandled, the button looked identical either way and the
 * operator pasted whatever was on the clipboard before.
 *
 * The confirmation is an icon swap rather than a toast because a message would
 * need copySuccess / copyFailed keys, which sections.codes does not have.
 */
async function copyCode(id: string, code: string) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCodeId.value = id
  }
  catch {
    copiedCodeId.value = null
  }
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
  copyResetTimer = setTimeout(() => {
    copiedCodeId.value = null
  }, 2000)
}

function formatDate(date: string | null) {
  if (!date)
    return '-'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime()))
    return date
  return parsed.toLocaleDateString(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function resolvePlanStyle(plan: string) {
  return planOptions.find(option => option.value === plan)
}

function resolveSubscriptionStatus(item: AdminSubscription) {
  return item.subscription.isActive ? 'active' : 'expired'
}

function subscriptionStatusTone(item: AdminSubscription) {
  return item.subscription.isActive ? 'success' : 'danger'
}

function codeStatusTone(status: string) {
  switch (status) {
    case 'active':
      return 'success'
    case 'expired':
      return 'danger'
    case 'revoked':
      return 'warning'
    case 'exhausted':
      return 'muted'
    default:
      return 'info'
  }
}

async function grantSubscription() {
  if (grantLoading.value)
    return
  grantLoading.value = true
  grantError.value = null
  const target = grantForm.target.trim()
  try {
    if (!target) {
      grantError.value = t('dashboard.sections.subscriptions.grant.errors.missingTarget', 'Please enter a user id or email.')
      return
    }
    const payload: Record<string, any> = {
      plan: grantForm.plan,
      durationDays: grantForm.durationDays,
    }
    if (target.includes('@'))
      payload.email = target
    else
      payload.userId = target

    await rawFetch('/api/admin/subscriptions/grant', {
      method: 'POST',
      body: payload,
    })
    toast.success(t('dashboard.sections.subscriptions.grant.success', 'Subscription granted.'))
    grantForm.target = ''
    await fetchSubscriptions({ resetPage: true })
  }
  catch (err: unknown) {
    const message = resolveErrorMessage(err, t('dashboard.sections.subscriptions.grant.errors.failed', 'Failed to grant subscription.'))
    grantError.value = message
    toast.warning(message)
  }
  finally {
    grantLoading.value = false
  }
}

async function goSubscriptionsPrev() {
  if (!subscriptionHasPrev.value || subscriptionLoading.value)
    return
  subscriptionPagination.page -= 1
  await fetchSubscriptions()
}

async function goSubscriptionsNext() {
  if (!subscriptionHasNext.value || subscriptionLoading.value)
    return
  subscriptionPagination.page += 1
  await fetchSubscriptions()
}

let subscriptionSearchTimer: ReturnType<typeof setTimeout> | null = null

watch(() => subscriptionFilters.q, () => {
  if (subscriptionSearchTimer)
    clearTimeout(subscriptionSearchTimer)
  subscriptionSearchTimer = setTimeout(() => {
    fetchSubscriptions({ resetPage: true })
  }, 300)
})

watch([() => subscriptionFilters.status, () => subscriptionFilters.role], () => {
  fetchSubscriptions({ resetPage: true })
})

onBeforeUnmount(() => {
  if (subscriptionSearchTimer)
    clearTimeout(subscriptionSearchTimer)
  if (revokeArmTimer)
    clearTimeout(revokeArmTimer)
  if (copyResetTimer)
    clearTimeout(copyResetTimer)
})

onMounted(() => {
  fetchSubscriptions()
  fetchCodes()
})

/**
 * Revoking is irreversible and the codes may already be in circulation, so the
 * first click only arms the button. It disarms itself so a stray click cannot
 * sit there waiting to be completed by an unrelated one later.
 */
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
  revokeArmTimer = setTimeout(() => {
    revokeArmedId.value = null
  }, 5000)
}

async function revokeCode(code: ActivationCode) {
  if (codesActionPendingId.value)
    return
  if (revokeArmTimer)
    clearTimeout(revokeArmTimer)
  revokeArmedId.value = null
  codesActionPendingId.value = code.id
  try {
    await rawFetch(`/api/admin/codes/${code.id}`, {
      method: 'PATCH',
      body: { status: 'revoked' },
    })
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
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.menu.accounts', 'Account Management') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.subscriptions.subtitle', 'Manage plans, renewals, and activation codes.') }}
      </p>
    </div>

    <AccountTabs />

    <section class="apple-card-lg p-5 space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_180px_auto]">
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.subscriptions.filters.searchLabel', 'Search') }}
          </label>
          <TuffInput
            v-model="subscriptionFilters.q"
            type="text"
            autocomplete="off"
            :placeholder="t('dashboard.sections.subscriptions.filters.searchPlaceholder', 'Search by name or email')"
            class="w-full"
          />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.subscriptions.filters.statusLabel', 'Status') }}
          </label>
          <TuffSelect v-model="subscriptionFilters.status" class="w-full">
            <TuffSelectItem v-for="opt in statusOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.subscriptions.filters.roleLabel', 'Role') }}
          </label>
          <TuffSelect v-model="subscriptionFilters.role" class="w-full">
            <TuffSelectItem v-for="opt in roleOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </div>
        <div class="flex items-end">
          <TxButton variant="secondary" size="small" :disabled="subscriptionLoading" @click="fetchSubscriptions({ resetPage: true })">
            {{ t('common.refresh', 'Refresh') }}
          </TxButton>
        </div>
      </div>
    </section>

    <section class="apple-card-lg p-5 space-y-4">
      <div>
        <h2 class="text-base font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.subscriptions.grant.title', 'Manual Grant') }}
        </h2>
        <p class="text-xs text-black/50 dark:text-white/50">
          {{ t('dashboard.sections.subscriptions.grant.subtitle', 'Grant a plan by user id or email.') }}
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_180px_auto]">
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.subscriptions.grant.targetLabel', 'User ID or Email') }}
          </label>
          <TuffInput
            v-model="grantForm.target"
            type="text"
            autocomplete="off"
            :placeholder="t('dashboard.sections.subscriptions.grant.targetPlaceholder', 'user_123 / name@example.com')"
            class="w-full"
          />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.subscriptions.grant.planLabel', 'Plan') }}
          </label>
          <TuffSelect v-model="grantForm.plan" class="w-full">
            <TuffSelectItem v-for="opt in planOptions.filter(option => option.value !== 'FREE')" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.subscriptions.grant.durationLabel', 'Duration (days)') }}
          </label>
          <TuffInput v-model="grantForm.durationDays" type="number" min="1" max="3650" class="w-full" />
        </div>
        <div class="flex items-end">
          <TxButton variant="primary" size="small" :disabled="grantLoading" @click="grantSubscription">
            <TxSpinner v-if="grantLoading" :size="14" />
            <span>{{ grantLoading ? t('dashboard.sections.subscriptions.grant.granting', 'Granting...') : t('dashboard.sections.subscriptions.grant.action', 'Grant') }}</span>
          </TxButton>
        </div>
      </div>
      <p v-if="grantError" class="text-sm text-red-500">
        {{ grantError }}
      </p>
    </section>

    <!--
      Only while rows are still on screen, to mark them as stale. With no rows
      the error owns the card below and repeating it here says it twice.
    -->
    <div v-if="subscriptionError && subscriptionList.length" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ subscriptionError }}
    </div>

    <section class="apple-card-lg overflow-hidden">
      <div class="border-b border-black/[0.04] p-5 dark:border-white/[0.06]">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-black dark:text-white">
            {{ t('dashboard.sections.subscriptions.listTitle', 'All Subscriptions') }}
          </h2>
          <div class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
            <span>{{ subscriptionPagination.page }} / {{ subscriptionPagination.totalPages }}</span>
          </div>
        </div>
      </div>

      <div
        v-if="subscriptionLoading && !subscriptionList.length"
        class="p-5"
        role="status"
        :aria-label="t('dashboard.sections.subscriptions.loading', 'Loading...')"
      >
        <TxRowSkeleton :rows="5" description separated trailing />
      </div>

      <!--
        Ordered before the empty state: a failed request that falls through to
        "No subscription records found." reads as nobody having a plan.
      -->
      <TxEmptyState
        v-else-if="subscriptionError"
        variant="error"
        size="small"
        layout="vertical"
        :title="t('dashboard.sections.subscriptions.errors.loadFailed', 'Failed to load subscriptions.')"
        :description="subscriptionError"
        :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
        @primary="fetchSubscriptions()"
      />

      <!--
        A filtered-out list and an empty one still share this copy: telling them
        apart needs `emptyFiltered` / `filters.clear`, which do not exist in
        i18n/locales/route/{en,zh}/dashboard.ts yet.
      -->
      <TxEmptyState
        v-else-if="!subscriptionList.length"
        variant="empty"
        size="small"
        layout="vertical"
        icon="i-carbon-license"
        :title="t('dashboard.sections.subscriptions.empty', 'No subscription records found.')"
        description=""
      />

      <div v-else class="overflow-x-auto">
        <TxDataTable :columns="subscriptionColumns" :data="subscriptionList" :row-key="entry => entry.user.id" class="min-w-[760px]">
          <template #cell-user="{ row: entry }">
            <div class="space-y-1">
              <p class="font-medium text-black dark:text-white">
                {{ entry.user.name || '-' }}
              </p>
              <p class="text-xs text-black/60 dark:text-white/60">
                {{ entry.user.email }}
              </p>
            </div>
          </template>
          <template #cell-role="{ row: entry }">
            <span class="text-sm text-black/70 dark:text-white/70">{{ entry.user.role }}</span>
          </template>
          <template #cell-plan="{ row: entry }">
            <span class="font-medium" :class="resolvePlanStyle(entry.subscription.plan)?.color">
              {{ entry.subscription.plan }}
            </span>
          </template>
          <template #cell-status="{ row: entry }">
            <TxStatusBadge
              :text="subscriptionStatusLabels[resolveSubscriptionStatus(entry)] || resolveSubscriptionStatus(entry)"
              :status="subscriptionStatusTone(entry)"
              size="sm"
            />
          </template>
          <template #cell-activatedAt="{ row: entry }">
            <span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(entry.subscription.activatedAt) }}</span>
          </template>
          <template #cell-expiresAt="{ row: entry }">
            <span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(entry.subscription.expiresAt) }}</span>
          </template>
        </TxDataTable>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-black/[0.04] p-4 dark:border-white/[0.06]">
        <TxButton variant="secondary" size="small" :disabled="!subscriptionHasPrev || subscriptionLoading" @click="goSubscriptionsPrev">
          {{ t('dashboard.sections.subscriptions.pagination.prev', 'Prev') }}
        </TxButton>
        <TxButton variant="secondary" size="small" :disabled="!subscriptionHasNext || subscriptionLoading" @click="goSubscriptionsNext">
          {{ t('dashboard.sections.subscriptions.pagination.next', 'Next') }}
        </TxButton>
      </div>
    </section>

    <div>
      <h2 class="apple-heading-sm">
        {{ t('dashboard.sections.codes.title', 'Activation Codes') }}
      </h2>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.codes.subtitle', 'Generate and manage activation codes') }}
      </p>
    </div>

    <!-- Generation Form -->
    <section class="apple-card-lg p-5">
      <h3 class="apple-heading-sm">
        {{ t('dashboard.sections.codes.generateTitle', 'Generate New Codes') }}
      </h3>

      <div class="grid grid-cols-1 gap-4 mb-4 md:grid-cols-3 lg:grid-cols-5">
        <!--
          These five labels stay English in both locales: sections.codes has no
          form.* keys, and half-mapping them onto the table.* headers would drop
          the "max"/"in days"/"count" distinctions the fields depend on.
        -->
        <div>
          <label class="apple-section-title mb-1 block">Plan</label>
          <TuffSelect v-model="genForm.plan" class="w-full">
            <TuffSelectItem
              v-for="opt in planOptions"
              :key="opt.value"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Duration (days)</label>
          <TuffInput v-model="genForm.durationDays" type="number" min="1" max="365" class="w-full" />
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Max Uses</label>
          <TuffInput v-model="genForm.maxUses" type="number" min="1" max="1000" class="w-full" />
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Expires In (days)</label>
          <TuffInput v-model="genForm.expiresInDays" type="number" min="1" max="365" class="w-full" />
        </div>

        <div>
          <label class="apple-section-title mb-1 block">Count</label>
          <TuffInput v-model="genForm.count" type="number" min="1" max="100" class="w-full" />
        </div>
      </div>

      <TxButton class="mt-4" :disabled="codesGenerating" variant="primary" @click="generateCodes">
        <TxSpinner v-if="codesGenerating" :size="14" />
        <span>{{ codesGenerating ? t('dashboard.sections.codes.generating', 'Generating...') : t('dashboard.sections.codes.generateButton', 'Generate Codes') }}</span>
      </TxButton>
    </section>

    <div v-if="codesError && codes.length" class="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-200">
      {{ codesError }}
    </div>

    <section class="apple-card-lg overflow-hidden">
      <div class="border-b border-black/[0.04] p-5 dark:border-white/[0.06]">
        <h2 class="text-base font-semibold text-black dark:text-white">
          {{ t('dashboard.sections.codes.listTitle', 'All Codes') }}
        </h2>
        <div class="mt-3">
          <TxButton variant="bare" size="small" native-type="button" :disabled="codesLoading" class="inline-flex items-center gap-1.5 text-sm text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-light" @click="fetchCodes">
            <TxSpinner v-if="codesLoading" :size="14" />
            <span v-else class="i-carbon-refresh text-base" />
            {{ t('dashboard.sections.codes.refresh', 'Refresh') }}
          </TxButton>
        </div>
      </div>

      <div
        v-if="codesLoading && !codes.length"
        class="p-5"
        role="status"
        :aria-label="t('dashboard.sections.codes.loading', 'Loading...')"
      >
        <TxRowSkeleton :rows="4" description separated trailing />
      </div>

      <!--
        Ordered before the empty state, which reads "Generate some above" — an
        instruction that is actively wrong when the list simply failed to load.
      -->
      <TxEmptyState
        v-else-if="codesError"
        variant="error"
        size="small"
        layout="vertical"
        :title="codesError"
        :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
        @primary="fetchCodes"
      />

      <TxEmptyState
        v-else-if="!codes.length"
        variant="blank-slate"
        size="small"
        layout="vertical"
        icon="i-carbon-ticket"
        :title="t('dashboard.sections.codes.empty', 'No activation codes yet. Generate some above.')"
        description=""
      />

      <div v-else class="overflow-x-auto">
        <TxDataTable :columns="codeColumns" :data="codes" row-key="id" class="min-w-[700px]">
          <template #cell-code="{ row: code }">
            <div class="flex items-center gap-2">
              <code class="rounded bg-black/5 px-2 py-1 font-mono text-sm text-black dark:bg-white/[0.08] dark:text-white">{{ code.code }}</code>
              <TxButton
                variant="bare"
                size="mini"
                native-type="button"
                :icon="copiedCodeId === code.id ? 'i-carbon-checkmark' : 'i-carbon-copy'"
                class="text-black/40 transition hover:text-black/70 dark:text-white/40 dark:hover:text-light/70"
                :class="copiedCodeId === code.id ? 'text-green-600 dark:text-green-400' : ''"
                :title="t('dashboard.sections.codes.copy', 'Copy')"
                @click="copyCode(code.id, code.code)"
              />
            </div>
          </template>
          <template #cell-plan="{ row: code }">
            <span class="font-medium" :class="resolvePlanStyle(code.plan)?.color">
              {{ code.plan }}
            </span>
          </template>
          <template #cell-duration="{ row: code }">
            <span class="text-sm text-black/60 dark:text-white/60">
              {{ code.duration_days }} {{ t('dashboard.sections.codes.days', 'days') }}
            </span>
          </template>
          <template #cell-uses="{ row: code }">
            <span class="text-sm text-black dark:text-white">{{ code.uses }} / {{ code.max_uses }}</span>
          </template>
          <template #cell-status="{ row: code }">
            <TxStatusBadge :text="code.status" :status="codeStatusTone(code.status)" size="sm" />
          </template>
          <template #cell-created="{ row: code }">
            <span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(code.created_at) }}</span>
          </template>
          <template #cell-expires="{ row: code }">
            <span class="text-sm text-black/60 dark:text-white/60">{{ formatDate(code.expires_at) }}</span>
          </template>
          <template #cell-actions="{ row: code }">
            <TxButton
              v-if="code.status === 'active'"
              :variant="revokeArmedId === code.id ? 'danger' : 'secondary'"
              size="mini"
              :disabled="codesActionPendingId === code.id"
              @click="requestRevoke(code)"
            >
              {{ revokeArmedId === code.id
                ? t('common.confirm', 'Confirm')
                : t('dashboard.sections.codes.revoke', 'Revoke') }}
            </TxButton>
          </template>
        </TxDataTable>
      </div>
    </section>
  </div>
</template>
