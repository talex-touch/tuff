<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxDataTable, type DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TuffSelect, TuffSelectItem } from '@talex-touch/tuffex/select'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { hasWindow } from '@talex-touch/utils/env'
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

interface AdminAudit {
  id: string
  adminUserId: string
  adminName: string | null
  adminEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  metadata: Record<string, any> | null
  ip: string | null
  userAgent: string | null
  createdAt: string
}

const audits = ref<AdminAudit[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const pagination = reactive<Pagination>({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
})

const filters = reactive({
  q: '',
  action: 'all',
})

const hasPrev = computed(() => pagination.page > 1)
const hasNext = computed(() => pagination.page < pagination.totalPages)

// Covers only 5 of the 17 actions logAdminAudit() writes; the other 12 have no
// locale key yet, so they stay out of the filter and render as their raw action
// id. admin-page-layout-contracts.test.ts pins that list so it cannot grow.
const actionLabels = computed<Record<string, string>>(() => ({
  'user.role.update': t('dashboard.sections.audits.actions.userRole', 'User role updated'),
  'user.status.update': t('dashboard.sections.audits.actions.userStatus', 'User status updated'),
  'subscription.grant': t('dashboard.sections.audits.actions.subscriptionGrant', 'Subscription granted'),
  'activation_code.revoke': t('dashboard.sections.audits.actions.codeRevoke', 'Activation code revoked'),
  'audit.export': t('dashboard.sections.audits.actions.auditExport', 'Audit exported'),
  // The audit-coverage pass made these actions start appearing in the table.
  // Without a label each renders as its raw id and is absent from the filter
  // dropdown, so the entries exist but no admin can find them.
  'user.role.bootstrap': t('dashboard.sections.audits.actions.userRoleBootstrap', 'Administrator bootstrapped'),
  'user.profile.update': t('dashboard.sections.audits.actions.userProfileUpdate', 'User profile updated'),
  'user.credits.adjust': t('dashboard.sections.audits.actions.userCreditsAdjust', 'User credits adjusted'),
  'activation_code.generate': t('dashboard.sections.audits.actions.codeGenerate', 'Activation codes generated'),
  'doc_comment.delete': t('dashboard.sections.audits.actions.docCommentDelete', 'Doc comment deleted'),
  'store_review.status.update': t('dashboard.sections.audits.actions.storeReviewStatus', 'Store review status updated'),
  'plugin_scan_waiver.create': t('dashboard.sections.audits.actions.scanWaiverCreate', 'Plugin scan waiver created'),
  'plugin_scan_waiver.revoke': t('dashboard.sections.audits.actions.scanWaiverRevoke', 'Plugin scan waiver revoked'),
  'maintenance.telemetry_retention.run': t('dashboard.sections.audits.actions.telemetryRetentionRun', 'Telemetry retention run'),
  'intelligence.prompt.upsert': t('dashboard.sections.audits.actions.promptUpsert', 'Agent prompt saved'),
  'intelligence.prompt.delete': t('dashboard.sections.audits.actions.promptDelete', 'Agent prompt deleted'),
  'intelligence.prompt-binding.upsert': t('dashboard.sections.audits.actions.promptBindingUpsert', 'Agent prompt binding saved'),
  'intelligence.prompt-binding.delete': t('dashboard.sections.audits.actions.promptBindingDelete', 'Agent prompt binding deleted'),
  'release.evidence.run.create': t('dashboard.sections.audits.actions.evidenceRunCreate', 'Release evidence run created'),
  'release.evidence.item.upsert': t('dashboard.sections.audits.actions.evidenceItemUpsert', 'Release evidence item saved'),
  'release.evidence.doc-guard.record': t('dashboard.sections.audits.actions.evidenceDocGuard', 'Release doc guard recorded'),
}))

const actionOptions = computed(() => ([
  { value: 'all', label: t('dashboard.sections.audits.filters.actionAll', 'All actions') },
  ...Object.entries(actionLabels.value).map(([value, label]) => ({ value, label })),
]))

const auditColumns = computed<DataTableColumn<AdminAudit>[]>(() => [
  { key: 'time', title: t('dashboard.sections.audits.table.time', 'Time'), width: 180 },
  { key: 'admin', title: t('dashboard.sections.audits.table.admin', 'Admin'), width: '24%' },
  { key: 'action', title: t('dashboard.sections.audits.table.action', 'Action'), width: 180 },
  { key: 'target', title: t('dashboard.sections.audits.table.target', 'Target'), width: 180 },
  { key: 'detail', title: t('dashboard.sections.audits.table.detail', 'Detail') },
])

function buildQuery() {
  const query: Record<string, string | number> = {
    page: pagination.page,
    limit: pagination.limit,
  }
  if (filters.q.trim())
    query.q = filters.q.trim()
  if (filters.action !== 'all')
    query.action = filters.action
  return query
}

async function fetchAudits(options: { resetPage?: boolean } = {}) {
  if (options.resetPage)
    pagination.page = 1

  loading.value = true
  error.value = null
  try {
    const res = await requestJson<{ audits: AdminAudit[], pagination: Pagination }>('/api/admin/audits', {
      query: buildQuery(),
    })
    audits.value = res.audits ?? []
    if (res.pagination) {
      pagination.page = res.pagination.page
      pagination.limit = res.pagination.limit
      pagination.total = res.pagination.total
      pagination.totalPages = res.pagination.totalPages
    }
  }
  catch (err: any) {
    // Only the server-supplied message is presentable; err.message is ofetch's
    // internal '[GET] "/api/..." <no response> Failed to fetch' string.
    error.value = err?.data?.message || t('dashboard.sections.audits.errors.loadFailed', 'Failed to load audit logs.')
    audits.value = []
  }
  finally {
    loading.value = false
  }
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatAdmin(entry: AdminAudit) {
  return entry.adminName || entry.adminEmail || entry.adminUserId
}

function formatTarget(entry: AdminAudit) {
  if (entry.targetLabel)
    return entry.targetLabel
  if (entry.targetId)
    return entry.targetId
  return '-'
}

function formatDetail(entry: AdminAudit) {
  const meta = entry.metadata
  const detailParts: string[] = []

  if (entry.action === 'user.role.update') {
    const from = meta?.before?.role ?? '-'
    const to = meta?.after?.role ?? '-'
    detailParts.push(`${from} -> ${to}`)
  }

  if (entry.action === 'user.status.update') {
    const from = meta?.before?.status ?? '-'
    const to = meta?.after?.status ?? '-'
    detailParts.push(`${from} -> ${to}`)
  }

  if (entry.action === 'subscription.grant') {
    const plan = meta?.plan ?? '-'
    const expiresAt = meta?.expiresAt ? formatDate(meta.expiresAt) : '-'
    detailParts.push(`${plan} · ${expiresAt}`)
  }

  if (entry.action === 'activation_code.revoke') {
    detailParts.push(t('dashboard.sections.audits.actions.codeRevoke', 'Activation code revoked'))
  }

  if (entry.action === 'audit.export') {
    detailParts.push(t('dashboard.sections.audits.actions.auditExport', 'Audit exported'))
  }

  if (entry.ip)
    detailParts.push(`IP ${entry.ip}`)

  if (!detailParts.length && meta) {
    detailParts.push(JSON.stringify(meta))
  }

  return detailParts.length ? detailParts.join(' · ') : '-'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

async function goPrev() {
  if (!hasPrev.value || loading.value)
    return
  pagination.page -= 1
  await fetchAudits()
}

async function goNext() {
  if (!hasNext.value || loading.value)
    return
  pagination.page += 1
  await fetchAudits()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null

const exporting = ref(false)

function exportAudits() {
  if (exporting.value)
    return
  exporting.value = true
  try {
    const params = new URLSearchParams()
    if (filters.q.trim())
      params.set('q', filters.q.trim())
    if (filters.action !== 'all')
      params.set('action', filters.action)
    const url = `/api/admin/audits/export?${params.toString()}`
    if (hasWindow())
      window.open(url, '_blank')
  }
  finally {
    setTimeout(() => {
      exporting.value = false
    }, 300)
  }
}

watch(() => filters.q, () => {
  if (searchTimer)
    clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    fetchAudits({ resetPage: true })
  }, 300)
})

watch(() => filters.action, () => {
  fetchAudits({ resetPage: true })
})

onBeforeUnmount(() => {
  if (searchTimer)
    clearTimeout(searchTimer)
})

onMounted(() => {
  fetchAudits()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.audits.title', 'Audit Logs') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.audits.subtitle', 'Track administrator actions and changes.') }}
      </p>
    </div>

    <section class="apple-card-lg p-5 space-y-4">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px_auto_auto]">
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.audits.filters.searchLabel', 'Search') }}
          </label>
          <TuffInput
            v-model="filters.q"
            type="text"
            autocomplete="off"
            :placeholder="t('dashboard.sections.audits.filters.searchPlaceholder', 'Search by admin or target')"
            class="w-full"
          />
        </div>
        <div>
          <label class="apple-section-title mb-1 block">
            {{ t('dashboard.sections.audits.filters.actionLabel', 'Action') }}
          </label>
          <TuffSelect v-model="filters.action" class="w-full">
            <TuffSelectItem v-for="opt in actionOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
          </TuffSelect>
        </div>
        <div class="flex items-end">
          <TxButton variant="secondary" size="small" :disabled="loading" @click="fetchAudits({ resetPage: true })">
            {{ t('common.refresh', 'Refresh') }}
          </TxButton>
        </div>
        <div class="flex items-end">
          <TxButton variant="secondary" size="small" :disabled="exporting" @click="exportAudits">
            {{ exporting ? t('dashboard.sections.audits.export.exporting', 'Exporting...') : t('dashboard.sections.audits.export.label', 'Export CSV') }}
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
            {{ t('dashboard.sections.audits.title', 'Audit Logs') }}
          </h2>
          <div class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
            <span>{{ pagination.page }} / {{ pagination.totalPages }}</span>
          </div>
        </div>
      </div>

      <div v-if="loading && !audits.length" class="p-5 space-y-3">
        <div class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
          <TxSpinner :size="16" />
          {{ t('dashboard.sections.audits.loading', 'Loading...') }}
        </div>
        <!-- One skeleton row per audit row, split on the same 5 columns. -->
        <div
          v-for="row in 6"
          :key="row"
          class="grid grid-cols-[180px_24%_180px_180px_1fr] items-center gap-4 rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]"
        >
          <TxSkeleton v-for="col in 5" :key="col" :loading="true" :lines="1" />
        </div>
      </div>

      <!-- The banner above already names the failure; showing the empty state
           too would read as "the log is genuinely empty". -->
      <div v-else-if="!audits.length && !error" class="p-8 text-center text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.audits.empty', 'No audit records found.') }}
      </div>

      <div v-else>
        <!-- scroll-x makes TxDataTable own the scroll; without it the component's
             own `overflow: hidden` clips the last column and no ancestor can
             scroll to it. -->
        <TxDataTable :columns="auditColumns" :data="audits" row-key="id" scroll-x>
          <template #cell-time="{ row: entry }">
            <span class="text-sm text-black/60 dark:text-white/60">{{ formatTime(entry.createdAt) }}</span>
          </template>
          <template #cell-admin="{ row: entry }">
            <div class="space-y-1">
              <p class="font-medium text-black dark:text-white">
                {{ formatAdmin(entry) }}
              </p>
              <p v-if="entry.adminEmail" class="text-xs text-black/60 dark:text-white/60">
                {{ entry.adminEmail }}
              </p>
            </div>
          </template>
          <template #cell-action="{ row: entry }">
            <span class="text-sm text-black/70 dark:text-white/70">
              {{ actionLabels[entry.action] || entry.action }}
            </span>
          </template>
          <template #cell-target="{ row: entry }">
            <span class="text-sm text-black/70 dark:text-white/70">{{ formatTarget(entry) }}</span>
          </template>
          <template #cell-detail="{ row: entry }">
            <span class="text-xs text-black/50 dark:text-white/50">{{ formatDetail(entry) }}</span>
          </template>
        </TxDataTable>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-black/[0.04] p-4 dark:border-white/[0.06]">
        <TxButton variant="secondary" size="small" :disabled="!hasPrev || loading" @click="goPrev">
          {{ t('dashboard.sections.audits.pagination.prev', 'Prev') }}
        </TxButton>
        <TxButton variant="secondary" size="small" :disabled="!hasNext || loading" @click="goNext">
          {{ t('dashboard.sections.audits.pagination.next', 'Next') }}
        </TxButton>
      </div>
    </section>
  </div>
</template>
