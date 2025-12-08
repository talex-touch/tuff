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
  createdAt: string
}

interface Plugin {
  id: string
  slug: string
  name: string
  summary: string
  category: string
  status: PluginStatus
  iconUrl?: string | null
  homepage?: string | null
  isOfficial: boolean
  versions?: PluginVersion[]
}

export interface ReviewItem {
  type: 'plugin' | 'version'
  plugin: Plugin
  version?: PluginVersion
}

interface Props {
  isOpen: boolean
  item: ReviewItem | null
  categoryLabel?: string
  loading?: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'approve', item: ReviewItem): void
  (e: 'reject', item: ReviewItem, reason: string): void
}>()

const { t, locale } = useI18n()
const modalRef = ref<HTMLElement | null>(null)
const rejectReason = ref('')
const showRejectForm = ref(false)

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    rejectReason.value = ''
    showRejectForm.value = false
  }
})

onClickOutside(modalRef, () => {
  if (props.isOpen)
    emit('close')
})

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

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

function handleApprove() {
  if (props.item)
    emit('approve', props.item)
}

function handleReject() {
  if (props.item)
    emit('reject', props.item, rejectReason.value.trim())
}

function toggleRejectForm() {
  showRejectForm.value = !showRejectForm.value
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm dark:bg-black/50"
      />
    </Transition>

    <!-- Modal -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen && item"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          ref="modalRef"
          class="w-full max-w-md overflow-hidden rounded-2xl border border-black/5 bg-white shadow-2xl dark:border-white/10 dark:bg-[#111]"
        >
          <!-- Header -->
          <div class="flex items-start gap-4 border-b border-black/5 p-5 dark:border-white/5">
            <div class="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/10">
              <img
                v-if="item.plugin.iconUrl"
                :src="item.plugin.iconUrl"
                :alt="item.plugin.name"
                class="size-full object-cover"
              >
              <span v-else class="text-xl font-semibold text-black/60 dark:text-white/60">
                {{ item.plugin.name.charAt(0).toUpperCase() }}
              </span>
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-base font-semibold text-black dark:text-white">
                {{ item.type === 'plugin' ? t('dashboard.sections.plugins.reviewPlugin') : t('dashboard.sections.plugins.reviewVersion') }}
              </h3>
              <p class="truncate text-sm text-black/60 dark:text-white/60">
                {{ item.plugin.name }}
                <template v-if="item.type === 'version' && item.version">
                  · v{{ item.version.version }}
                </template>
              </p>
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
          <div class="max-h-80 overflow-y-auto p-5">
            <!-- Plugin Review -->
            <template v-if="item.type === 'plugin'">
              <div class="space-y-4">
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.form.identifier') }}
                  </p>
                  <p class="mt-1 font-mono text-sm text-black dark:text-white">
                    {{ item.plugin.slug }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.form.summary') }}
                  </p>
                  <p class="mt-1 text-sm text-black/70 dark:text-white/70">
                    {{ item.plugin.summary }}
                  </p>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.form.category') }}
                  </p>
                  <p class="mt-1 text-sm text-black dark:text-white">
                    {{ categoryLabel || item.plugin.category }}
                  </p>
                </div>
                <div v-if="item.plugin.homepage">
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.form.homepage') }}
                  </p>
                  <a
                    :href="item.plugin.homepage"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-1 inline-flex items-center gap-1 text-sm text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white"
                  >
                    {{ item.plugin.homepage }}
                    <span class="i-carbon-arrow-up-right text-xs" />
                  </a>
                </div>
              </div>
            </template>

            <!-- Version Review -->
            <template v-else-if="item.type === 'version' && item.version">
              <div class="space-y-4">
                <div class="flex items-center gap-3">
                  <span class="text-lg font-semibold text-black dark:text-white">
                    v{{ item.version.version }}
                  </span>
                  <span
                    class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                    :class="channelClass(item.version.channel)"
                  >
                    {{ item.version.channel }}
                  </span>
                </div>
                <div>
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.signature') }}
                  </p>
                  <p class="mt-1 break-all font-mono text-xs text-black/60 dark:text-white/60">
                    {{ item.version.signature }}
                  </p>
                </div>
                <div class="flex gap-6">
                  <div>
                    <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.stats.created') }}
                    </p>
                    <p class="mt-1 text-sm text-black dark:text-white">
                      {{ formatDate(item.version.createdAt) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                      {{ t('dashboard.sections.plugins.stats.size') }}
                    </p>
                    <p class="mt-1 text-sm text-black dark:text-white">
                      {{ formatSize(item.version.packageSize) }}
                    </p>
                  </div>
                </div>
                <div v-if="item.version.changelog">
                  <p class="text-xs font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {{ t('dashboard.sections.plugins.versionForm.changelog') }}
                  </p>
                  <p class="mt-1 text-sm text-black/70 dark:text-white/70">
                    {{ item.version.changelog }}
                  </p>
                </div>
                <div>
                  <a
                    :href="item.version.packageUrl"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1.5 text-sm text-black/70 transition hover:text-black dark:text-white/70 dark:hover:text-white"
                  >
                    <span class="i-carbon-download" />
                    {{ t('dashboard.sections.plugins.downloadPackage') }}
                  </a>
                </div>
              </div>
            </template>

            <!-- Reject Reason Form -->
            <Transition
              enter-active-class="transition duration-200 ease-out"
              enter-from-class="opacity-0 -translate-y-2"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-150 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-2"
            >
              <div v-if="showRejectForm" class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                <label class="block">
                  <span class="text-xs font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
                    {{ t('dashboard.sections.plugins.rejectReason') }}
                  </span>
                  <textarea
                    v-model="rejectReason"
                    rows="3"
                    class="mt-2 w-full resize-none rounded-lg border border-rose-200 bg-white p-3 text-sm text-black outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-200 dark:border-rose-500/30 dark:bg-black/20 dark:text-white dark:focus:border-rose-500/50 dark:focus:ring-rose-500/20"
                    :placeholder="t('dashboard.sections.plugins.rejectReasonPlaceholder')"
                  />
                </label>
              </div>
            </Transition>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 border-t border-black/5 p-4 dark:border-white/5">
            <button
              type="button"
              class="rounded-full px-4 py-2 text-sm font-medium text-black/60 transition hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
              @click="emit('close')"
            >
              {{ t('dashboard.sections.plugins.license.cancel') }}
            </button>
            <template v-if="!showRejectForm">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                :disabled="loading"
                @click="toggleRejectForm"
              >
                <span class="i-carbon-close" />
                {{ t('dashboard.sections.plugins.actions.reject') }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600"
                :disabled="loading"
                @click="handleApprove"
              >
                <span v-if="loading" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-checkmark" />
                {{ t('dashboard.sections.plugins.actions.approve') }}
              </button>
            </template>
            <template v-else>
              <button
                type="button"
                class="rounded-full px-4 py-2 text-sm font-medium text-black/60 transition hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/5 dark:hover:text-white"
                @click="toggleRejectForm"
              >
                {{ t('dashboard.sections.plugins.warnings.immutable.cancel') }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-600"
                :disabled="loading"
                @click="handleReject"
              >
                <span v-if="loading" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-close" />
                {{ t('dashboard.sections.plugins.actions.reject') }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
