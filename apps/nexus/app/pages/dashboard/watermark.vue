<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import { computed, ref, watch } from 'vue'
import { TxButton, TxFileUploader, TxSpinner } from '@talex-touch/tuffex'
import { useWatermarkDecode } from '~/composables/useWatermarkDecode'
import { isAdminRole } from '~/utils/role'

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t, locale } = useI18n()
const { user } = useAuthUser()

const isAdmin = computed(() => isAdminRole(user.value?.role))
const canUse = computed(() => isAdmin.value || import.meta.dev)
const localeTag = computed(() => (locale.value === 'zh' ? 'zh-CN' : 'en-US'))

const {
  resolving,
  error,
  result,
  resolveFile,
} = useWatermarkDecode()

const files = ref<FileUploaderFile[]>([])
const previewUrl = ref<string | null>(null)
const selectedFile = ref<File | null>(null)

const confidencePercent = computed(() => (result.value ? Math.round(result.value.confidence * 100) : 0))
const decodedCode = computed(() => result.value?.decodedCode ?? '--')

function formatTime(value?: number) {
  if (!value)
    return '--'
  return new Intl.DateTimeFormat(localeTag.value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function handleFiles(nextFiles: FileUploaderFile[]) {
  files.value = nextFiles
  const file = nextFiles[0]?.file ?? null
  selectedFile.value = file
  if (!file)
    return
  if (previewUrl.value)
    URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  if (!canUse.value)
    return
  await resolveFile(file)
}

async function retryResolve() {
  if (!selectedFile.value || !canUse.value)
    return
  await resolveFile(selectedFile.value)
}

watch(previewUrl, (value, previous) => {
  if (previous && value !== previous)
    URL.revokeObjectURL(previous)
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <header>
      <h1 class="apple-heading-md">
        {{ t('dashboard.watermark.title', '水印溯源') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.watermark.subtitle', '上传 Dashboard 截图或拍照，解析对应用户与设备信息。') }}
      </p>
    </header>

    <section class="apple-card-lg p-6 space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="apple-heading-sm">
            {{ t('dashboard.watermark.sectionTitle', '解析输入') }}
          </h2>
          <p class="mt-1 text-sm text-black/50 dark:text-white/50">
            {{ t('dashboard.watermark.sectionSubtitle', '建议使用原始截图或清晰拍照，压缩图仍可尝试识别。') }}
          </p>
        </div>
        <TxButton
          size="small"
          variant="secondary"
          :disabled="!selectedFile || resolving || !canUse"
          @click="retryResolve"
        >
          {{ t('dashboard.watermark.retry', '重新解析') }}
        </TxButton>
      </div>

      <div
        class="rounded-2xl border border-black/[0.08] border-dashed bg-black/[0.02] p-4 text-sm text-black dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white"
      >
        <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
          {{ t('dashboard.watermark.select', '选择截图') }}
          <TxFileUploader
            v-model="files"
            :multiple="false"
            :max="1"
            accept="image/*"
            :disabled="!canUse || resolving"
            :button-text="t('dashboard.watermark.select', '选择截图')"
            :drop-text="t('dashboard.watermark.select', '选择截图')"
            :hint-text="t('dashboard.watermark.hint', '支持 PNG/JPG/WebP，清晰截图命中率更高')"
            @change="handleFiles"
          />
        </label>
        <p v-if="!canUse" class="mt-2 text-xs text-amber-600/90 dark:text-amber-300">
          {{ t('dashboard.watermark.adminOnly', '仅管理员可使用溯源解析。') }}
        </p>
      </div>

      <div v-if="previewUrl" class="flex flex-col gap-3">
        <img :src="previewUrl" alt="watermark-preview" class="max-h-[380px] rounded-2xl border border-black/[0.06] object-contain dark:border-white/[0.12]">
      </div>

      <div v-if="resolving" class="flex items-center gap-2 text-xs text-black/60 dark:text-white/70">
        <TxSpinner :size="16" />
        {{ t('dashboard.watermark.resolving', '解析中...') }}
      </div>

      <p
        v-if="error"
        class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200"
      >
        {{ error }}
      </p>

      <div
        v-if="result"
        class="rounded-2xl border border-black/[0.06] bg-white/70 p-4 text-sm text-black dark:border-white/[0.1] dark:bg-dark/40 dark:text-white"
      >
        <div class="grid gap-3 md:grid-cols-2">
          <div>
            <p class="text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.watermark.match', '匹配结果') }}
            </p>
            <p class="mt-1 font-semibold">
              {{ result.matched ? t('dashboard.watermark.matched', '已命中') : t('dashboard.watermark.unmatched', '未命中') }}
            </p>
          </div>
          <div>
            <p class="text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.watermark.confidence', '置信度') }}
            </p>
            <p class="mt-1 font-semibold">
              {{ confidencePercent }}%
            </p>
          </div>
          <div>
            <p class="text-xs text-black/50 dark:text-white/50">
              {{ t('dashboard.watermark.code', '追踪码') }}
            </p>
            <p class="mt-1 font-semibold">
              {{ decodedCode }}
            </p>
          </div>
        </div>

        <div v-if="result.record" class="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <p class="text-xs text-black/50 dark:text-white/50">
User ID
</p>
              <p class="mt-1 font-semibold">
                {{ result.record.userId || t('dashboard.watermark.anonymous', '匿名') }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/50 dark:text-white/50">
Device ID
</p>
              <p class="mt-1 font-semibold">
                {{ result.record.deviceId }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/50 dark:text-white/50">
Session ID
</p>
              <p class="mt-1 font-semibold">
                {{ result.record.sessionId }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/50 dark:text-white/50">
Shot ID
</p>
              <p class="mt-1 font-semibold">
                {{ result.record.shotId }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.watermark.trackedAt', '登记时间') }}
              </p>
              <p class="mt-1 font-semibold">
                {{ formatTime(result.record.trackedAt) }}
              </p>
            </div>
            <div>
              <p class="text-xs text-black/50 dark:text-white/50">
                {{ t('dashboard.watermark.lastSeenAt', '最近命中') }}
              </p>
              <p class="mt-1 font-semibold">
                {{ formatTime(result.record.lastSeenAt) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
