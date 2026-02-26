<script setup lang="ts">
import type {
  DashboardPlugin as Plugin,
  PluginChannel,
  DashboardPluginVersion as PluginVersion,
} from '~/types/dashboard-plugin'
import { TxButton } from '@talex-touch/tuffex'
import FlatButton from '~/components/ui/FlatButton.vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'
import PluginMetaHeader from '~/components/dashboard/PluginMetaHeader.vue'

export interface ReviewItem {
  type: 'plugin' | 'version'
  plugin: Plugin
  version?: PluginVersion
}

interface Props {
  isOpen: boolean
  item: ReviewItem | null
  source?: HTMLElement | DOMRect | null
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
const rejectReason = ref('')
const showRejectForm = ref(false)

const visible = computed(() => props.isOpen && Boolean(props.item))
const visibleModel = computed({
  get: () => visible.value,
  set: (nextVisible) => {
    if (!nextVisible)
      emit('close')
  },
})

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    rejectReason.value = ''
    showRejectForm.value = false
  }
})

const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))
const dateFormatter = computed(() => new Intl.DateTimeFormat(localeTag.value, { dateStyle: 'medium' }))

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

const reviewHeaderPlugin = computed(() => {
  if (!props.item)
    return null

  if (props.item.type === 'version' && props.item.version) {
    return {
      ...props.item.plugin,
      latestVersion: props.item.version,
    }
  }

  return props.item.plugin
})
</script>

<template>
  <FlipDialog
      v-model="visibleModel"
      :reference="source ?? null"
      size="md"
      :prevent-accidental-close="true"
    >
      <template #header-display>
        <div v-if="item && reviewHeaderPlugin" class="min-w-0 flex-1">
          <PluginMetaHeader
            class="min-w-0"
            :plugin="reviewHeaderPlugin"
            :category-label="categoryLabel"
          />
        </div>
        <div v-else class="text-sm text-black/50 dark:text-white/50">
          {{ t('dashboard.sections.plugins.reviewPlugin') }}
        </div>
      </template>

      <template #default>
        <div v-if="item" class="flex max-h-[min(68dvh,560px)] min-h-[340px] w-[min(700px,92vw)] flex-col">
          <div class="flex-1 overflow-y-auto px-6 pb-4 pt-2">
            <!-- Plugin Review -->
            <template v-if="item.type === 'plugin'">
              <div class="space-y-4 rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
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
              <div class="space-y-4 rounded-2xl bg-black/[0.02] p-5 dark:bg-white/[0.03]">
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
                  <TuffInput
                    v-model="rejectReason"
                    class="mt-2"
                    type="textarea"
                    :rows="3"
                    :placeholder="t('dashboard.sections.plugins.rejectReasonPlaceholder')"
                  />
                </label>
              </div>
            </Transition>
          </div>

          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-black/[0.04] px-6 py-4 dark:border-white/[0.06]">
            <template v-if="!showRejectForm">
              <TxButton type="danger" :disabled="loading" @click="toggleRejectForm">
                <span class="i-carbon-close" />
                {{ t('dashboard.sections.plugins.actions.reject') }}
              </TxButton>
              <TxButton type="success" :disabled="loading" @click="handleApprove">
                <span v-if="loading" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-checkmark" />
                {{ t('dashboard.sections.plugins.actions.approve') }}
              </TxButton>
            </template>
            <template v-else>
              <FlatButton @click="toggleRejectForm">
                {{ t('dashboard.sections.plugins.assetCreate.back') }}
              </FlatButton>
              <TxButton type="danger" :disabled="loading" @click="handleReject">
                <span v-if="loading" class="i-carbon-circle-dash animate-spin" />
                <span v-else class="i-carbon-close" />
                {{ t('dashboard.sections.plugins.actions.reject') }}
              </TxButton>
            </template>
          </div>
        </div>
      </template>
    </FlipDialog>
</template>
