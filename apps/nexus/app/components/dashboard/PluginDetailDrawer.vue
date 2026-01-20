<script setup lang="ts">
import type {
  DashboardPlugin as Plugin,
  PluginChannel,
  PluginStatus,
  DashboardPluginVersion as PluginVersion,
  VersionStatus,
} from '~/types/dashboard-plugin'
import Button from '~/components/ui/Button.vue'
import Drawer from '~/components/ui/Drawer.vue'
import FlatButton from '~/components/ui/FlatButton.vue'
import StatusBadge from '~/components/ui/StatusBadge.vue'
import Tag from '~/components/ui/Tag.vue'

interface Props {
  isOpen: boolean
  plugin: Plugin | null
  categoryLabel?: string
  isOwner?: boolean
  isAdmin?: boolean
  loading?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit', plugin: Plugin): void
  (e: 'delete', plugin: Plugin): void
  (e: 'publishVersion', plugin: Plugin): void
  (e: 'submitReview', plugin: Plugin): void
  (e: 'withdrawReview', plugin: Plugin): void
  (e: 'download-version', version: PluginVersion): void
  (e: 'deleteVersion', plugin: Plugin, version: PluginVersion): void
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

function statusTone(status: PluginStatus) {
  switch (status) {
    case 'approved':
      return 'success'
    case 'pending':
      return 'warning'
    case 'rejected':
      return 'danger'
    default:
      return 'muted'
  }
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
</script>

<template>
  <Drawer
    :visible="isOpen"
    width="640px"
    @update:visible="(v) => {
      if (!v)
        emit('close')
    }"
    @close="emit('close')"
  >
    <div v-if="plugin" class="flex h-full flex-col">
      <!-- Header -->
      <div class="flex shrink-0 items-start gap-4 border-b border-black/5 pb-4 dark:border-white/5">
        <div class="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/10">
          <img
            v-if="plugin.iconUrl"
            :src="plugin.iconUrl"
            :alt="plugin.name"
            class="size-full object-cover"
          >
          <span v-else class="text-2xl font-semibold text-black/60 dark:text-white/60">
            {{ plugin.name.charAt(0).toUpperCase() }}
          </span>
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h2 class="truncate text-lg font-semibold text-black dark:text-white">
              {{ plugin.name }}
            </h2>
            <span
              v-if="plugin.isOfficial"
              class="i-carbon-certificate shrink-0 text-amber-500"
              :title="t('dashboard.sections.plugins.officialBadge')"
            />
          </div>
          <p class="text-xs text-black/50 dark:text-white/50">
            {{ plugin.slug }}
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge
              :text="t(`dashboard.sections.plugins.statuses.${plugin.status}`)"
              :status="statusTone(plugin.status)"
              size="sm"
            />
            <StatusBadge
              v-if="plugin.latestVersion"
              :text="`v${plugin.latestVersion.version}`"
              :status="channelTone(plugin.latestVersion.channel)"
              size="sm"
            />
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto pt-4">
        <!-- Summary -->
        <div class="border-b border-black/5 pb-4 dark:border-white/5">
          <p class="text-sm text-black/70 dark:text-white/70">
            {{ plugin.summary }}
          </p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 border-b border-black/5 py-4 dark:border-white/5">
          <div>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.plugins.stats.category') }}
            </p>
            <p class="mt-1 text-sm font-medium text-black dark:text-white">
              {{ categoryLabel || plugin.category }}
            </p>
          </div>
          <div>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.plugins.stats.installs', { count: '' }).replace('{count}', '').trim() || 'Installs' }}
            </p>
            <p class="mt-1 text-sm font-medium text-black dark:text-white">
              {{ formatNumber(plugin.installs) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.plugins.stats.created') }}
            </p>
            <p class="mt-1 text-sm font-medium text-black dark:text-white">
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
            <Button
              v-if="canPublishVersion"
              type="primary"
              size="small"
              @click="emit('publishVersion', plugin)"
            >
              <span class="i-carbon-cloud-upload text-sm" />
              {{ t('dashboard.sections.plugins.publishVersion') }}
            </Button>
          </div>

          <div v-if="plugin.versions?.length" class="space-y-3">
            <div
              v-for="version in plugin.versions"
              :key="version.id"
              class="rounded-xl border border-black/5 bg-black/[0.02] p-4 dark:border-white/5 dark:bg-white/[0.02]"
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
      </div>
    </div>

    <template #footer>
      <div v-if="plugin" class="flex flex-wrap items-center justify-end gap-2">
        <Button
          v-if="canSubmitReview"
          size="small"
          :disabled="loading"
          @click="emit('submitReview', plugin)"
        >
          <span class="i-carbon-send text-sm" />
          {{ t('dashboard.sections.plugins.actions.submitReview') }}
        </Button>
        <Button
          v-if="canWithdrawReview"
          size="small"
          :disabled="loading"
          @click="emit('withdrawReview', plugin)"
        >
          <span class="i-carbon-undo text-sm" />
          {{ t('dashboard.sections.plugins.actions.withdrawReview') }}
        </Button>
        <Button
          v-if="canEdit"
          size="small"
          @click="emit('edit', plugin)"
        >
          <span class="i-carbon-edit text-sm" />
          {{ t('dashboard.sections.plugins.editMetadata') }}
        </Button>
        <Button
          v-if="canDelete"
          type="danger"
          size="small"
          @click="emit('delete', plugin)"
        >
          <span class="i-carbon-trash-can text-sm" />
          {{ t('dashboard.sections.plugins.delete') }}
        </Button>
      </div>
    </template>
  </Drawer>
</template>
