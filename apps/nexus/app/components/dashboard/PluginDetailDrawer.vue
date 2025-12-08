<script setup lang="ts">
import { onClickOutside } from '@vueuse/core'

type PluginChannel = 'SNAPSHOT' | 'BETA' | 'RELEASE'
type PluginStatus = 'draft' | 'pending' | 'approved' | 'rejected'
type VersionStatus = 'pending' | 'approved' | 'rejected'

interface PluginVersion {
  id: string
  pluginId: string
  channel: PluginChannel
  version: string
  signature: string
  packageUrl: string
  packageSize: number
  changelog?: string | null
  status: VersionStatus
  reviewedAt?: string | null
  createdAt: string
}

interface Plugin {
  id: string
  userId: string
  slug: string
  name: string
  summary: string
  category: string
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  status: PluginStatus
  iconUrl?: string | null
  createdAt: string
  updatedAt: string
  versions?: PluginVersion[]
  latestVersion?: PluginVersion | null
}

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
  (e: 'publish-version', plugin: Plugin): void
  (e: 'submit-review', plugin: Plugin): void
  (e: 'withdraw-review', plugin: Plugin): void
  (e: 'download-version', version: PluginVersion): void
  (e: 'delete-version', plugin: Plugin, version: PluginVersion): void
}>()

const { t, locale } = useI18n()
const drawerRef = ref<HTMLElement | null>(null)

onClickOutside(drawerRef, () => {
  if (props.isOpen)
    emit('close')
})

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const numberFormatter = computed(() => new Intl.NumberFormat(localeTag.value))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

function formatNumber(count: number) {
  return numberFormatter.value.format(count)
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return dateFormatter.value.format(parsed)
}

function formatSize(bytes?: number | null) {
  if (!bytes) return '—'
  return `${(bytes / 1024).toFixed(1)} KB`
}

function statusClass(status: PluginStatus) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'pending':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    case 'rejected':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
  }
}

function versionStatusClass(status: VersionStatus) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'rejected':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
    default:
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  }
}

function channelClass(channel: PluginChannel) {
  switch (channel) {
    case 'RELEASE':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    case 'BETA':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
  }
}

const canSubmitReview = computed(() => {
  if (!props.plugin || !props.isOwner) return false
  return props.plugin.status === 'draft' || props.plugin.status === 'rejected'
})

const canWithdrawReview = computed(() => {
  if (!props.plugin || !props.isOwner) return false
  return props.plugin.status === 'pending'
})

const canPublishVersion = computed(() => {
  if (!props.plugin || !props.isOwner) return false
  return props.plugin.status === 'approved'
})

const canEdit = computed(() => props.isOwner || props.isAdmin)
const canDelete = computed(() => props.isOwner || props.isAdmin)
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm dark:bg-black/40"
      />
    </Transition>

    <!-- Drawer -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isOpen && plugin"
        ref="drawerRef"
        class="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111]"
      >
        <!-- Header -->
        <div class="flex shrink-0 items-start gap-4 border-b border-black/5 p-6 dark:border-white/5">
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
              <span
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="statusClass(plugin.status)"
              >
                {{ t(`dashboard.sections.plugins.statuses.${plugin.status}`) }}
              </span>
              <span
                v-if="plugin.latestVersion"
                class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                :class="channelClass(plugin.latestVersion.channel)"
              >
                v{{ plugin.latestVersion.version }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="flex size-8 shrink-0 items-center justify-center rounded-full text-black/40 transition hover:bg-black/5 hover:text-black dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white"
            @click="emit('close')"
          >
            <span class="i-carbon-close text-lg" />
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto">
          <!-- Summary -->
          <div class="border-b border-black/5 p-6 dark:border-white/5">
            <p class="text-sm text-black/70 dark:text-white/70">
              {{ plugin.summary }}
            </p>
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-3 gap-4 border-b border-black/5 p-6 dark:border-white/5">
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
          <div v-if="plugin.homepage" class="border-b border-black/5 p-6 dark:border-white/5">
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
          <div v-if="plugin.badges.length" class="border-b border-black/5 p-6 dark:border-white/5">
            <p class="mb-3 text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.plugins.form.badges') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="badge in plugin.badges"
                :key="badge"
                class="inline-flex items-center rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/70 dark:bg-white/10 dark:text-white/70"
              >
                {{ badge }}
              </span>
            </div>
          </div>

          <!-- Versions -->
          <div class="p-6">
            <div class="mb-4 flex items-center justify-between">
              <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                {{ t('dashboard.sections.plugins.versionHistory') }}
              </p>
              <button
                v-if="canPublishVersion"
                type="button"
                class="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/80"
                @click="emit('publish-version', plugin)"
              >
                <span class="i-carbon-cloud-upload text-sm" />
                {{ t('dashboard.sections.plugins.publishVersion') }}
              </button>
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
                      <span
                        class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                        :class="channelClass(version.channel)"
                      >
                        {{ version.channel }}
                      </span>
                      <span
                        class="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                        :class="versionStatusClass(version.status)"
                      >
                        {{ t(`dashboard.sections.plugins.versionStatuses.${version.status}`) }}
                      </span>
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
                    <button
                      v-if="canDelete"
                      type="button"
                      class="flex size-7 items-center justify-center rounded-full text-black/40 transition hover:bg-rose-50 hover:text-rose-500 dark:text-white/40 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                      :title="t('dashboard.sections.plugins.deleteVersion')"
                      @click="emit('delete-version', plugin, version)"
                    >
                      <span class="i-carbon-trash-can text-sm" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="text-center text-sm text-black/40 dark:text-white/40">
              {{ t('dashboard.sections.plugins.noVersions') }}
            </p>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="shrink-0 border-t border-black/5 p-4 dark:border-white/5">
          <div class="flex flex-wrap items-center justify-end gap-2">
            <button
              v-if="canSubmitReview"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-4 py-2 text-xs font-medium text-black transition hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
              :disabled="loading"
              @click="emit('submit-review', plugin)"
            >
              <span class="i-carbon-send text-sm" />
              {{ t('dashboard.sections.plugins.actions.submitReview') }}
            </button>
            <button
              v-if="canWithdrawReview"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-4 py-2 text-xs font-medium text-black transition hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
              :disabled="loading"
              @click="emit('withdraw-review', plugin)"
            >
              <span class="i-carbon-undo text-sm" />
              {{ t('dashboard.sections.plugins.actions.withdrawReview') }}
            </button>
            <button
              v-if="canEdit"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-black/10 px-4 py-2 text-xs font-medium text-black transition hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5"
              @click="emit('edit', plugin)"
            >
              <span class="i-carbon-edit text-sm" />
              {{ t('dashboard.sections.plugins.editMetadata') }}
            </button>
            <button
              v-if="canDelete"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-4 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
              @click="emit('delete', plugin)"
            >
              <span class="i-carbon-trash-can text-sm" />
              {{ t('dashboard.sections.plugins.delete') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
