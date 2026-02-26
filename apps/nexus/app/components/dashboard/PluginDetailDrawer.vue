<script setup lang="ts">
import type {
  DashboardPlugin as Plugin,
  DashboardPluginTimelineEvent,
  PluginChannel,
  DashboardPluginVersion as PluginVersion,
  VersionStatus,
} from '~/types/dashboard-plugin'
import { TxButton } from '@talex-touch/tuffex'
import FlatButton from '~/components/ui/FlatButton.vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import PluginMetaHeader from '~/components/dashboard/PluginMetaHeader.vue'
import StatusBadge from '~/components/ui/StatusBadge.vue'
import Tag from '~/components/ui/Tag.vue'

interface Props {
  isOpen: boolean
  source?: HTMLElement | DOMRect | null
  plugin: Plugin | null
  categoryLabel?: string
  isOwner?: boolean
  isAdmin?: boolean
  timeline?: DashboardPluginTimelineEvent[]
  timelineLoading?: boolean
  timelineError?: string | null
  loading?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit', plugin: Plugin, event: MouseEvent): void
  (e: 'delete', plugin: Plugin): void
  (e: 'publishVersion', plugin: Plugin): void
  (e: 'submitReview', plugin: Plugin): void
  (e: 'withdrawReview', plugin: Plugin): void
  (e: 'download-version', version: PluginVersion): void
  (e: 'deleteVersion', plugin: Plugin, version: PluginVersion): void
  (e: 'reeditVersion', plugin: Plugin, version: PluginVersion): void
}>()

const { t, locale } = useI18n()

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

function formatNumber(count: number) {
  return numberFormatter.value.format(count)
}

function formatDate(value?: string | null) {
  if (!value)
    return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()))
    return value
  return dateFormatter.value.format(parsed)
}

function formatSize(bytes?: number | null) {
  if (!bytes)
    return '—'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function versionStatusTone(status: VersionStatus) {
  switch (status) {
    case 'approved':
      return 'success'
    case 'rejected':
      return 'danger'
    default:
      return 'warning'
  }
}

function channelTone(channel: PluginChannel) {
  switch (channel) {
    case 'RELEASE':
      return 'success'
    case 'BETA':
      return 'warning'
    default:
      return 'muted'
  }
}

const canSubmitReview = computed(() => {
  if (!props.plugin || !props.isOwner)
    return false
  return props.plugin.status === 'draft' || props.plugin.status === 'rejected'
})

const canWithdrawReview = computed(() => {
  if (!props.plugin || !props.isOwner)
    return false
  return props.plugin.status === 'pending'
})

const canPublishVersion = computed(() => {
  if (!props.plugin || !props.isOwner)
    return false
  return props.plugin.status === 'approved'
})

const canEdit = computed(() => props.isOwner || props.isAdmin)
const canDelete = computed(() => props.isOwner || props.isAdmin)
const canViewTimeline = computed(() => props.isOwner || props.isAdmin)

const visibleModel = computed({
  get: () => props.isOpen,
  set: (nextVisible) => {
    if (!nextVisible)
      emit('close')
  },
})

function resolveStatusLabel(status?: string | null) {
  if (!status)
    return '—'
  if (status === 'draft' || status === 'pending' || status === 'approved' || status === 'rejected')
    return t(`dashboard.sections.plugins.statuses.${status}`)
  return status
}

function resolveTimelineActorLabel(actorRole: DashboardPluginTimelineEvent['actorRole']) {
  return t(`dashboard.sections.plugins.timelineActors.${actorRole}`)
}

function resolveTimelineVersionTag(event: DashboardPluginTimelineEvent) {
  const metaVersion = event.meta && typeof event.meta.version === 'string'
    ? event.meta.version
    : ''
  if (metaVersion)
    return metaVersion
  return ''
}

function resolveTimelineEventLabel(event: DashboardPluginTimelineEvent) {
  const from = resolveStatusLabel(event.fromStatus)
  const to = resolveStatusLabel(event.toStatus)
  const version = resolveTimelineVersionTag(event)

  switch (event.eventType) {
    case 'plugin.created':
      return t('dashboard.sections.plugins.timelineEvents.pluginCreated')
    case 'plugin.status.changed':
      return t('dashboard.sections.plugins.timelineEvents.pluginStatusChanged', { from, to })
    case 'version.created':
      return t('dashboard.sections.plugins.timelineEvents.versionCreated', { version: version || '-' })
    case 'version.status.changed':
      return t('dashboard.sections.plugins.timelineEvents.versionStatusChanged', {
        version: version || '-',
        from,
        to,
      })
    case 'version.reedited':
      return t('dashboard.sections.plugins.timelineEvents.versionReedited', { version: version || '-' })
    default:
      return event.eventType
  }
}
</script>

<template>
  <FlipDialog
      v-model="visibleModel"
      :reference="source ?? null"
      size="lg"
    >
      <template #header-display>
        <div v-if="plugin" class="PluginDetailOverlay-CustomHeader">
          <PluginMetaHeader
            class="min-w-0 flex-1"
            :plugin="plugin"
            :category-label="categoryLabel"
          />
        </div>
        <div v-else class="PluginDetailOverlay-CustomHeader PluginDetailOverlay-CustomHeader--empty" />
      </template>
      <template #default>
        <div v-if="plugin" class="flex h-[min(86dvh,820px)] w-[min(960px,92vw)] flex-col">
          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-6 pb-2 pt-3">
            <!-- Summary -->
            <div class="border-b border-black/5 pb-4 dark:border-white/5">
              <p class="text-sm text-black/70 dark:text-white/70">
                {{ plugin.summary }}
              </p>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-1 gap-3 border-b border-black/[0.04] py-5 md:grid-cols-3 dark:border-white/[0.06]">
              <div class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="apple-section-title">
                  {{ t('dashboard.sections.plugins.stats.category') }}
                </p>
                <p class="mt-2 text-lg font-semibold text-black dark:text-white">
                  {{ categoryLabel || plugin.category }}
                </p>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="apple-section-title">
                  {{ t('dashboard.sections.plugins.stats.installs', { count: '' }).replace('{count}', '').trim() || 'Installs' }}
                </p>
                <p class="mt-2 text-lg font-semibold text-black dark:text-white">
                  {{ formatNumber(plugin.installs) }}
                </p>
              </div>
              <div class="rounded-xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
                <p class="apple-section-title">
                  {{ t('dashboard.sections.plugins.stats.created') }}
                </p>
                <p class="mt-2 text-lg font-semibold text-black dark:text-white">
                  {{ formatDate(plugin.createdAt) }}
                </p>
              </div>
            </div>

            <!-- Links -->
            <div v-if="plugin.homepage" class="border-b border-black/5 py-4 dark:border-white/5">
              <a
                :href="plugin.homepage"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-2 text-sm text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white"
              >
                <span class="i-carbon-logo-github" />
                {{ t('dashboard.sections.plugins.homepage') }}
                <span class="i-carbon-arrow-up-right text-xs" />
              </a>
            </div>

            <!-- Badges -->
            <div v-if="plugin.badges.length" class="border-b border-black/5 py-4 dark:border-white/5">
              <p class="mb-3 text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.form.badges') }}
              </p>
              <div class="flex flex-wrap gap-2">
                <Tag v-for="badge in plugin.badges" :key="badge" :label="badge" />
              </div>
            </div>

            <!-- Versions -->
            <div class="py-4">
              <div class="mb-4 flex items-center justify-between">
                <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                  {{ t('dashboard.sections.plugins.versionHistory') }}
                </p>
                <TxButton v-if="canPublishVersion" type="primary" size="small" @click="emit('publishVersion', plugin)">
                  <span class="i-carbon-cloud-upload text-sm" />
                  {{ t('dashboard.sections.plugins.publishVersion') }}
                </TxButton>
              </div>

              <div v-if="plugin.versions?.length" class="space-y-3">
                <div
                  v-for="version in plugin.versions"
                  :key="version.id"
                  class="rounded-2xl border border-black/[0.04] bg-black/[0.02] p-5 transition-all duration-200 hover:shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-medium text-black dark:text-white">
                          v{{ version.version }}
                        </span>
                        <StatusBadge
                          :text="version.channel"
                          :status="channelTone(version.channel)"
                          size="sm"
                        />
                        <StatusBadge
                          :text="t(`dashboard.sections.plugins.versionStatuses.${version.status}`)"
                          :status="versionStatusTone(version.status)"
                          size="sm"
                        />
                      </div>
                      <p class="mt-1 text-xs text-black/50 dark:text-white/50">
                        {{ formatDate(version.createdAt) }} · {{ formatSize(version.packageSize) }}
                      </p>
                      <p v-if="version.changelog" class="mt-2 text-xs text-black/60 dark:text-white/60">
                        {{ version.changelog }}
                      </p>
                      <p v-if="version.status === 'rejected' && version.rejectReason" class="mt-1 text-xs text-rose-600 dark:text-rose-300">
                        {{ t('dashboard.sections.plugins.rejectedReason') }}: {{ version.rejectReason }}
                      </p>
                    </div>
                    <div class="flex shrink-0 items-center gap-1">
                      <a
                        :href="version.packageUrl"
                        target="_blank"
                        rel="noopener"
                        class="flex size-7 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
                        :title="t('dashboard.sections.plugins.downloadPackage')"
                      >
                        <span class="i-carbon-download text-sm" />
                      </a>
                      <FlatButton
                        v-if="canEdit && version.status === 'rejected'"
                        :title="t('dashboard.sections.plugins.reeditVersion')"
                        @click="emit('reeditVersion', plugin, version)"
                      >
                        <span class="i-carbon-edit text-sm" />
                      </FlatButton>
                      <FlatButton
                        v-if="canDelete"
                        @click="emit('deleteVersion', plugin, version)"
                      >
                        <span class="i-carbon-trash-can text-sm" />
                      </FlatButton>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-center text-sm text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.noVersions') }}
              </p>
            </div>

            <div v-if="canViewTimeline" class="border-t border-black/[0.04] py-4 dark:border-white/[0.06]">
              <p class="mb-3 text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.timelineTitle') }}
              </p>

              <div v-if="timelineLoading" class="flex items-center gap-2 text-xs text-black/50 dark:text-white/50">
                <span class="i-carbon-circle-dash animate-spin" />
                {{ t('dashboard.sections.plugins.timelineLoading') }}
              </div>
              <p v-else-if="timelineError" class="text-xs text-rose-600 dark:text-rose-300">
                {{ timelineError }}
              </p>
              <div v-else-if="timeline?.length" class="space-y-2">
                <div
                  v-for="item in timeline"
                  :key="item.id"
                  class="rounded-xl border border-black/[0.04] bg-black/[0.02] px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]"
                >
                  <p class="text-xs text-black/70 dark:text-white/70">
                    {{ resolveTimelineEventLabel(item) }}
                  </p>
                  <p class="mt-1 text-[11px] text-black/45 dark:text-white/45">
                    {{ formatDate(item.createdAt) }} · {{ resolveTimelineActorLabel(item.actorRole) }}
                  </p>
                  <p v-if="item.reason" class="mt-1 text-[11px] text-rose-600 dark:text-rose-300">
                    {{ t('dashboard.sections.plugins.rejectReason') }}: {{ item.reason }}
                  </p>
                </div>
              </div>
              <p v-else class="text-xs text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.timelineEmpty') }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-black/[0.04] px-6 py-4 dark:border-white/[0.06]">
            <TxButton v-if="canSubmitReview" size="small" :disabled="loading" @click="emit('submitReview', plugin)">
              <span class="i-carbon-send text-sm" />
              {{ t('dashboard.sections.plugins.actions.submitReview') }}
            </TxButton>
            <TxButton v-if="canWithdrawReview" size="small" :disabled="loading" @click="emit('withdrawReview', plugin)">
              <span class="i-carbon-undo text-sm" />
              {{ t('dashboard.sections.plugins.actions.withdrawReview') }}
            </TxButton>
            <TxButton v-if="canEdit" size="small" @click="emit('edit', plugin, $event)">
              <span class="i-carbon-edit text-sm" />
              {{ t('dashboard.sections.plugins.editMetadata') }}
            </TxButton>
            <TxButton v-if="canDelete" type="danger" size="small" @click="emit('delete', plugin)">
              <span class="i-carbon-trash-can text-sm" />
              {{ t('dashboard.sections.plugins.delete') }}
            </TxButton>
          </div>
        </div>
      </template>
    </FlipDialog>
</template>

<style scoped>
.PluginDetailOverlay-CustomHeader {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 24px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--tx-border-color-lighter, rgba(120, 120, 120, 0.24)) 100%, transparent);
}

.PluginDetailOverlay-CustomHeader--empty {
  justify-content: flex-end;
}
</style>
