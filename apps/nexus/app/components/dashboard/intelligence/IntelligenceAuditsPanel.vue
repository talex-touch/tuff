<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxPagination } from '@talex-touch/tuffex/pagination'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { $fetch as rawFetch } from 'ofetch'

/**
 * AI call audit log, previously the `audits` tab of `IntelligenceAdminPanel`.
 *
 * `fetchSettings` is here rather than in a shared parent because the only thing
 * this view reads from it is `enableAudit`, and it reads it to answer one
 * question: an empty list means "auditing is off", not "nothing happened".
 * `settingsLoaded` stays false when that request fails, so a failed settings
 * fetch never renders as a confirmed configuration state.
 */
const { t } = useI18n()

interface Settings {
  enableAudit: boolean
}

interface AuditLog {
  id: string
  providerId: string
  providerType: string
  providerName: string | null
  model: string
  endpoint: string | null
  status: number | null
  latency: number | null
  success: boolean
  errorMessage: string | null
  traceId: string | null
  metadata: Record<string, any> | null
  createdAt: string
}

const settingsLoaded = ref(false)
const settings = ref<Settings>({
  enableAudit: false,
})

const auditLogs = ref<AuditLog[]>([])
const auditLoading = ref(false)
const auditError = ref<string | null>(null)
const auditPage = ref(1)
const auditPageSize = ref(20)
const auditTotal = ref(0)
const auditUserId = ref('')

async function fetchSettings() {
  try {
    const data = await rawFetch<{ settings: Settings }>('/api/dashboard/intelligence/settings')
    if (data.settings)
      settings.value = { ...settings.value, ...data.settings }
    settingsLoaded.value = true
  }
  catch {
    // enableAudit stays at its `false` default here, so claiming "auditing is off"
    // would report our own fetch failure as a confirmed configuration state.
    settingsLoaded.value = false
  }
}

async function fetchAudits() {
  auditLoading.value = true
  auditError.value = null
  try {
    const data = await rawFetch<{ audits: AuditLog[], total: number }>('/api/dashboard/intelligence/audits', {
      query: {
        limit: auditPageSize.value,
        page: auditPage.value,
        userId: auditUserId.value.trim() || undefined,
      },
    })
    auditLogs.value = data.audits || []
    auditTotal.value = data.total || 0
  }
  catch (e: any) {
    auditError.value = e.data?.message || t('dashboard.sections.intelligence.audit.loadFailed', 'Failed to load audit logs')
  }
  finally {
    auditLoading.value = false
  }
}

function applyAuditFilter() {
  auditPage.value = 1
  fetchAudits()
}

function providerTypeLabel(type: string) {
  return t(`dashboard.sections.intelligence.types.${type}`, type)
}

function formatAuditTime(value: string) {
  if (!value)
    return ''
  try {
    return new Date(value).toLocaleString()
  }
  catch {
    return value
  }
}

function auditStatusLabel(log: AuditLog) {
  if (log.success)
    return t('dashboard.sections.intelligence.audit.status.success')
  return t('dashboard.sections.intelligence.audit.status.failed')
}

function formatEndpointCandidates(list?: string[]) {
  if (!list || !list.length)
    return ''
  return list.join(' | ')
}

onMounted(() => {
  fetchSettings()
  fetchAudits()
})

watch([auditPage, auditPageSize], () => {
  fetchAudits()
})
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.intelligence.tabs.audits') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.intelligence.audit.subtitle') }}
      </p>
    </header>

    <section class="apple-card-lg space-y-4 p-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="apple-heading-sm">
            {{ t('dashboard.sections.intelligence.audit.title') }}
          </h2>
          <p class="mt-1 text-xs text-black/40 dark:text-white/40">
            {{ t('dashboard.sections.intelligence.audit.subtitle') }}
          </p>
        </div>
        <TxButton variant="bare" size="mini" @click="fetchAudits">
          {{ t('dashboard.sections.intelligence.audit.refresh') }}
        </TxButton>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <TuffInput
          v-model="auditUserId"
          :placeholder="t('dashboard.sections.intelligence.audit.userFilter')"
          class="max-w-xs w-full"
        />
        <TxButton variant="secondary" size="mini" @click="applyAuditFilter">
          {{ t('dashboard.sections.intelligence.audit.filter') }}
        </TxButton>
      </div>

      <div
        v-if="settingsLoaded && !settings.enableAudit"
        class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/40 dark:bg-white/[0.04] dark:text-white/40"
      >
        {{ t('dashboard.sections.intelligence.audit.disabledHint') }}
      </div>

      <div v-if="auditError" class="rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-500">
        {{ auditError }}
      </div>

      <div v-if="auditLoading" class="flex items-center justify-center py-4">
        <TxSpinner :size="18" />
      </div>

      <div v-else-if="auditLogs.length" class="space-y-2">
        <div
          v-for="log in auditLogs"
          :key="log.id"
          class="rounded-2xl bg-black/[0.02] p-4 text-xs text-black/60 dark:bg-white/[0.03] dark:text-white/60"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-black font-medium dark:text-white">
                {{ log.providerName || providerTypeLabel(log.providerType) }}
              </span>
              <span class="text-[11px] text-black/40 dark:text-white/40">
                {{ log.model }}
              </span>
            </div>
            <span class="text-[11px] text-black/40 dark:text-white/40">
              {{ formatAuditTime(log.createdAt) }}
            </span>
          </div>

          <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/50 dark:text-white/50">
            <span
              class="rounded px-2 py-0.5 font-medium"
              :class="log.success
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : 'bg-red-500/10 text-red-500'"
            >
              {{ auditStatusLabel(log) }}<span v-if="log.status"> · {{ log.status }}</span>
            </span>
            <span v-if="log.latency !== null">
              {{ t('dashboard.sections.intelligence.audit.fields.latency') }} {{ log.latency }}ms
            </span>
            <span v-if="log.endpoint" class="truncate">
              {{ t('dashboard.sections.intelligence.audit.fields.endpoint') }} {{ log.endpoint }}
            </span>
            <span v-if="log.traceId">
              {{ t('dashboard.sections.intelligence.audit.fields.trace') }} {{ log.traceId }}
            </span>
          </div>

          <div
            v-if="log.metadata?.baseUrl || log.metadata?.requestId || log.metadata?.contentType || log.metadata?.endpoints || log.metadata?.tokens || log.metadata?.ip || log.metadata?.country"
            class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/50 dark:text-white/50"
          >
            <span v-if="log.metadata?.baseUrl" class="break-all">
              {{ t('dashboard.sections.intelligence.audit.fields.baseUrl') }} {{ log.metadata.baseUrl }}
            </span>
            <span v-if="log.metadata?.requestId">
              {{ t('dashboard.sections.intelligence.audit.fields.requestId') }} {{ log.metadata.requestId }}
            </span>
            <span v-if="log.metadata?.contentType">
              {{ t('dashboard.sections.intelligence.audit.fields.contentType') }} {{ log.metadata.contentType }}
            </span>
            <span v-if="log.metadata?.endpoints" class="break-all">
              {{ t('dashboard.sections.intelligence.audit.fields.candidates') }} {{ formatEndpointCandidates(log.metadata.endpoints) }}
            </span>
            <span v-if="log.metadata?.tokens">
              {{ t('dashboard.sections.intelligence.audit.fields.tokens') }} {{ log.metadata.tokens }}
            </span>
            <span v-if="log.metadata?.ip">
              {{ t('dashboard.sections.intelligence.audit.fields.ip') }} {{ log.metadata.ip }}
            </span>
            <span v-if="log.metadata?.country">
              {{ t('dashboard.sections.intelligence.audit.fields.country') }} {{ log.metadata.country }}
            </span>
          </div>

          <div v-if="log.errorMessage" class="mt-2 text-xs text-red-500">
            {{ log.errorMessage }}
          </div>

          <div
            v-if="log.metadata?.responseSnippet"
            class="mt-2 break-all rounded-lg bg-black/[0.04] px-3 py-2 text-[11px] text-black/60 dark:bg-white/[0.04] dark:text-white/60"
          >
            {{ t('dashboard.sections.intelligence.audit.fields.responseSnippet') }} {{ log.metadata.responseSnippet }}
          </div>
        </div>
      </div>

      <!-- Without the auditError guard a failed load printed the red banner and
           "no audit records yet" together: one says we don't know, one says none exist. -->
      <div v-else-if="!auditError" class="rounded-xl bg-black/[0.02] px-4 py-3 text-xs text-black/40 dark:bg-white/[0.04] dark:text-white/40">
        {{ t('dashboard.sections.intelligence.audit.empty') }}
      </div>

      <div v-if="auditTotal > auditPageSize" class="flex justify-end pt-2">
        <TxPagination v-model:current-page="auditPage" :total="auditTotal" :page-size="auditPageSize" />
      </div>
    </section>
  </div>
</template>
