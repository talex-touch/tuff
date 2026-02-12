<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex'
import { computed, ref, watchEffect } from 'vue'
import { useDashboardImagesData } from '~/composables/useDashboardData'

interface DashboardImage {
  key: string
  url: string
}

definePageMeta({
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

const { t } = useI18n()
const { user } = useAuthUser()

const isAdmin = computed(() => {
  return user.value?.role === 'admin'
})

const {
  images,
  pending: imagesPending,
  refresh: refreshImages,
  execute,
} = useDashboardImagesData({ lazy: true })

watchEffect(() => {
  if (isAdmin.value)
    execute()
})

const imageFiles = ref<FileUploaderFile[]>([])
const imageUploading = ref(false)
const imageError = ref<string | null>(null)
const copiedImageKey = ref<string | null>(null)

function isImageResource(key: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(key)
}

async function handleImageUpload(files: FileUploaderFile[]) {
  imageFiles.value = files
  const file = files[0]?.file
  if (!file || !isAdmin.value)
    return

  imageUploading.value = true
  imageError.value = null

  try {
    const formData = new FormData()
    formData.append('file', file)

    await $fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
    })

    await refreshImages()
    imageFiles.value = []
  }
  catch (error: unknown) {
    imageError.value = error instanceof Error ? error.message : t('dashboard.sections.images.errors.unknown', 'Upload failed')
  }
  finally {
    imageUploading.value = false
  }
}

// Delete confirmation
const deleteConfirmVisible = ref(false)
const pendingDeleteKey = ref<string | null>(null)

function requestDeleteImage(imageKey: string) {
  if (!isAdmin.value)
    return
  pendingDeleteKey.value = imageKey
  deleteConfirmVisible.value = true
}

async function confirmDeleteImage(): Promise<boolean> {
  if (!pendingDeleteKey.value)
    return true
  try {
    await $fetch(`/api/images/${pendingDeleteKey.value}`, {
      method: 'DELETE',
    })
    await refreshImages()
  }
  catch (error: unknown) {
    imageError.value = error instanceof Error ? error.message : t('dashboard.sections.images.errors.unknown', 'Delete failed')
  }
  finally {
    pendingDeleteKey.value = null
  }
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
  pendingDeleteKey.value = null
}

async function copyImageUrl(imageUrl: string, imageKey: string) {
  if (!import.meta.client)
    return

  try {
    const fullUrl = new URL(imageUrl, window.location.origin).href
    await navigator.clipboard.writeText(fullUrl)
    copiedImageKey.value = imageKey
    setTimeout(() => {
      copiedImageKey.value = null
    }, 2000)
  }
  catch (error: unknown) {
    imageError.value = error instanceof Error ? error.message : t('dashboard.sections.images.errors.copyFailed', 'Copy failed')
  }
}

watchEffect(() => {
  if (!isAdmin.value) {
    imageError.value = null
    imageFiles.value = []
  }
})
</script>

<template>
  <section class="mx-auto max-w-5xl apple-card-lg p-6">
    <div>
      <h2 class="apple-heading-sm">
        {{ t('dashboard.sections.images.title', 'Resources') }}
      </h2>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.images.subtitle', 'Manage your shared assets') }}
      </p>
    </div>

    <div
      v-if="!isAdmin"
      class="mt-6 rounded-2xl border border-black/[0.06] bg-black/[0.02] p-6 text-sm text-black/70 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white/70"
    >
      {{ t('dashboard.sections.images.adminOnly', 'Only administrators can manage shared resources.') }}
    </div>

    <div v-else class="mt-6">
      <div class="rounded-2xl border border-black/[0.08] border-dashed bg-black/[0.02] p-4 text-sm text-black dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white">
        <div class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-sm font-semibold text-black dark:text-white">
                {{ t('dashboard.sections.images.uploadTitle', 'Upload Resource') }}
              </h3>
              <p class="text-xs text-black/60 dark:text-white/70">
                {{ t('dashboard.sections.images.uploadSubtitle', 'Upload assets to use in plugins and updates') }}
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <label class="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-black/60 dark:text-white/60">
              {{ t('dashboard.sections.images.selectFile', 'Select File') }}
              <TxFileUploader
                v-model="imageFiles"
                :multiple="false"
                :max="1"
                accept="*/*"
                :disabled="imageUploading"
                :button-text="t('dashboard.sections.images.selectFile', 'Select File')"
                :drop-text="t('dashboard.sections.images.selectFile', 'Select File')"
                :hint-text="t('dashboard.sections.images.uploadSubtitle', 'Upload assets to use in plugins and updates')"
                @change="handleImageUpload"
              />
            </label>

            <p
              v-if="imageError"
              class="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-200"
            >
              {{ imageError }}
            </p>

            <div
              v-if="imageUploading"
              class="flex items-center gap-2 text-xs text-black/60 dark:text-white/70"
            >
              <TxSpinner :size="16" />
              {{ t('dashboard.sections.images.uploading', 'Uploading...') }}
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 space-y-4">
        <div
          v-if="imagesPending"
          class="space-y-3 rounded-2xl border border-black/[0.08] border-dashed bg-black/[0.02] px-4 py-6 text-sm text-black/60 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/50"
        >
          <div class="flex items-center gap-3">
            <TxSpinner :size="16" />
            <span>{{ t('dashboard.sections.images.loading', 'Loading resources...') }}</span>
          </div>
          <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
            <TxSkeleton :loading="true" :lines="2" />
          </div>
          <div class="rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.04]">
            <TxSkeleton :loading="true" :lines="2" />
          </div>
        </div>

        <div
          v-else-if="!images.length"
          class="rounded-2xl border border-black/[0.08] border-dashed bg-black/[0.02] px-4 py-6 text-sm text-black/60 dark:border-white/[0.1] dark:bg-white/[0.03] dark:text-white/50"
        >
          {{ t('dashboard.sections.images.empty', 'No resources uploaded yet') }}
        </div>

        <div
          v-else
          class="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          <article
            v-for="image in images as DashboardImage[]"
            :key="image.key"
            class="group relative overflow-hidden rounded-2xl border border-black/[0.04] bg-black/[0.02] transition hover:border-black/[0.08] hover:shadow-lg dark:border-white/[0.06] dark:bg-white/[0.03]"
          >
            <div class="aspect-video w-full overflow-hidden bg-black/[0.03] dark:bg-white/[0.04] flex items-center justify-center">
              <img
                v-if="isImageResource(image.key)"
                :src="image.url"
                :alt="image.key"
                class="h-full w-full object-cover transition group-hover:scale-105"
                loading="lazy"
              >
              <span
                v-else
                class="i-carbon-document text-3xl text-black/30 transition group-hover:text-black/60 dark:text-white/30 dark:group-hover:text-white/60"
              />
            </div>
            <div class="p-4">
              <p class="truncate font-mono text-xs text-black/60 dark:text-white/60">
                {{ image.key }}
              </p>
              <div class="mt-3 flex items-center gap-2">
                <TxButton variant="bare" block native-type="button" class="inline-flex flex-1 items-center justify-center gap-2 bg-black/[0.03] text-xs font-medium text-black transition hover:bg-black/[0.06] dark:bg-white/[0.06] dark:text-white" @click="copyImageUrl(image.url, image.key)">
                  <span :class="copiedImageKey === image.key ? 'i-carbon-checkmark' : 'i-carbon-copy'" class="text-sm" />
                  {{ copiedImageKey === image.key ? t('dashboard.sections.images.copied', 'Copied!') : t('dashboard.sections.images.copyUrl', 'Copy URL') }}
                </TxButton>
                <TxButton variant="bare" circle size="mini" native-type="button" class="inline-flex h-8 w-8 items-center justify-center bg-red-50 text-red-500 transition hover:text-red-600 dark:bg-red-500/10 dark:text-red-200" @click="requestDeleteImage(image.key)">
                  <span class="i-carbon-trash-can text-sm" />
                </TxButton>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>

  <!-- Delete Confirmation Dialog -->
  <TxBottomDialog
    v-if="deleteConfirmVisible"
    :title="t('dashboard.sections.images.confirmDeleteTitle', 'Delete Resource')"
    :message="t('dashboard.sections.images.confirmDelete', { key: pendingDeleteKey })"
    :btns="[
      { content: t('dashboard.sections.images.cancel', 'Cancel'), type: 'info', onClick: () => true },
      { content: t('dashboard.sections.images.delete', 'Delete'), type: 'error', onClick: confirmDeleteImage },
    ]"
    :close="closeDeleteConfirm"
  />
</template>
