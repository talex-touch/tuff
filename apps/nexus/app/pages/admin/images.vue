<script setup lang="ts">
import type { FileUploaderFile } from '@talex-touch/tuffex/file-uploader'
import type { ImageResource } from '~/utils/admin-images'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton, TxCopyButton, TxIconButton } from '@talex-touch/tuffex/button'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxErrorState } from '@talex-touch/tuffex/error-state'
import { TxFileUploader } from '@talex-touch/tuffex/file-uploader'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { TxSpinner } from '@talex-touch/tuffex/spinner'
import { computed, onMounted, ref } from 'vue'
import AdminConfirmDialog from '~/components/admin/AdminConfirmDialog.vue'
import AdminPageShell from '~/components/admin/AdminPageShell.vue'
import AdminSection from '~/components/admin/AdminSection.vue'
import { useAdminFormat } from '~/composables/useAdminFormat'
import { useToast } from '~/composables/useToast'
import {
  createImageResourceList,
  fetchImageResourcePage,
  isPreviewableResource,
  resourceAbsoluteUrl,
} from '~/utils/admin-images'
import { resolveAdminErrorMessage } from '~/utils/admin-request-error'
import { requestJson } from '~/utils/request'

definePageMeta({
  layout: 'admin',
  requiresAuth: true,
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

defineI18nRoute(false)

// The administrator gate is the layout's (`useAdminGate`): this page only mounts
// for an administrator, so it neither checks the role nor asks for data it
// cannot have.
const { t } = useI18n()
const format = useAdminFormat()
const toast = useToast()
const origin = useRequestURL().origin

// One page of the bucket at a time; "Load more" follows the listing's cursor.
const resources = createImageResourceList(
  cursor => fetchImageResourcePage(requestJson, cursor),
  () => t('dashboard.sections.images.loadFailed', 'Resources could not be loaded.'),
  () => t('dashboard.sections.images.loadMoreFailed', 'More resources could not be loaded.'),
)

onMounted(() => {
  void resources.reload()
})

const PLACEHOLDER_CARDS = 8

const showListFooter = computed(() =>
  !resources.loading.value && !resources.error.value && resources.items.value.length > 0)

const countLabel = computed(() => {
  const count = format.number(resources.items.value.length)
  return resources.truncated.value
    ? t('dashboard.sections.images.loadedCount', { count })
    : t('dashboard.sections.images.totalCount', { count })
})

// Upload: one file at a time, shown first in the grid once it is stored.
const uploadFiles = ref<FileUploaderFile[]>([])
const uploading = ref(false)
const uploadError = ref<string | null>(null)

async function handleUpload(files: FileUploaderFile[]) {
  const file = files[0]?.file
  if (!file || uploading.value)
    return

  uploading.value = true
  uploadError.value = null
  try {
    const formData = new FormData()
    formData.append('file', file)
    const result = await requestJson<{ key?: unknown, url?: unknown }>('/api/images/upload', {
      method: 'POST',
      body: formData,
    })
    uploadFiles.value = []
    toast.success(t('dashboard.sections.images.uploadSuccess', 'Resource uploaded.'))
    if (typeof result?.key === 'string' && typeof result?.url === 'string' && !resources.error.value)
      resources.prepend({ key: result.key, url: result.url })
    else
      await resources.reload()
  }
  catch (error: unknown) {
    uploadError.value = resolveAdminErrorMessage(error, t('dashboard.sections.images.errors.uploadFailed', 'Upload failed.'))
  }
  finally {
    uploading.value = false
  }
}

function onCopyFailed() {
  toast.warning(t('dashboard.sections.images.errors.copyFailed', 'Copy failed'))
}

// Delete, behind a confirmation.
const deleteTarget = ref<ImageResource | null>(null)
const deleteOpen = ref(false)
const deleting = ref(false)

function requestDelete(item: ImageResource) {
  deleteTarget.value = item
  deleteOpen.value = true
}

async function confirmDelete() {
  const target = deleteTarget.value
  if (!target || deleting.value)
    return
  deleting.value = true
  try {
    await requestJson(`/api/images/${encodeURIComponent(target.key)}`, { method: 'DELETE' })
    resources.remove(target.key)
    deleteOpen.value = false
    toast.success(t('dashboard.sections.images.deleteSuccess', 'Resource deleted.'))
  }
  catch (error: unknown) {
    toast.warning(resolveAdminErrorMessage(error, t('dashboard.sections.images.errors.deleteFailed', 'Delete failed.')))
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <AdminPageShell :title="t('dashboard.sections.menu.images', 'Asset Library')">
    <template #actions>
      <TxButton
        variant="secondary"
        size="sm"
        :disabled="resources.loading.value || resources.refreshing.value"
        @click="resources.reload()"
      >
        {{ t('common.refresh', 'Refresh') }}
      </TxButton>
    </template>

    <div class="ResourcePage">
      <AdminSection :title="t('dashboard.sections.images.uploadTitle', 'Upload resource')">
        <div class="ResourceUpload">
          <TxFileUploader
            v-model="uploadFiles"
            :multiple="false"
            :max="1"
            accept="*/*"
            :disabled="uploading"
            :drop-text="t('dashboard.sections.images.dropText', 'Drop a file here')"
            :hint-text="t('dashboard.sections.images.uploadSubtitle', 'PNG, JPEG, WebP, GIF, SVG, or other approved attachments up to 5 MB.')"
            :button-text="t('dashboard.sections.images.selectFile', 'Select file')"
            @change="handleUpload"
          />
          <p v-if="uploading" class="ResourceUpload-Status" role="status">
            <TxSpinner :size="14" />
            {{ t('dashboard.sections.images.uploading', 'Uploading...') }}
          </p>
          <TxAlert v-if="uploadError" type="error" :message="uploadError" closable @close="uploadError = null" />
        </div>
      </AdminSection>

      <AdminSection :title="t('dashboard.sections.images.listTitle', 'Uploaded resources')">
        <ul v-if="resources.loading.value" class="ResourceGrid" aria-hidden="true">
          <li v-for="index in PLACEHOLDER_CARDS" :key="index" class="ResourceCard">
            <div class="ResourceCard-Preview">
              <TxSkeleton class="ResourceCard-Placeholder" width="100%" height="100%" :radius="0" />
            </div>
            <div class="ResourceCard-Body">
              <div class="ResourceCard-Key is-placeholder">
                <TxSkeleton :width="`${56 + (index * 7) % 30}%`" :height="10" :radius="4" />
              </div>
              <div class="ResourceCard-Actions">
                <TxSkeleton :width="96" :height="30" :radius="8" />
                <TxSkeleton :width="24" :height="24" :radius="4" />
              </div>
            </div>
          </li>
        </ul>

        <TxErrorState
          v-else-if="resources.error.value"
          size="small"
          :title="t('dashboard.sections.adminKit.table.loadFailedTitle', 'Could not load this list')"
          :description="resources.error.value"
          :primary-action="{ label: t('common.retry', 'Retry'), variant: 'flat' }"
          @primary="resources.reload()"
        />

        <TxEmptyState
          v-else-if="!resources.items.value.length"
          variant="no-data"
          size="small"
          :title="t('dashboard.sections.images.empty', 'No resources uploaded yet')"
          description=""
        />

        <ul v-else class="ResourceGrid">
          <li v-for="item in resources.items.value" :key="item.key" class="ResourceCard">
            <div class="ResourceCard-Preview">
              <img
                v-if="isPreviewableResource(item.key)"
                class="ResourceCard-Image"
                :src="item.url"
                alt=""
                loading="lazy"
              >
              <span v-else class="ResourceCard-FileIcon i-carbon-document" aria-hidden="true" />
            </div>
            <div class="ResourceCard-Body">
              <p class="ResourceCard-Key" :title="item.key">
                {{ item.key }}
              </p>
              <div class="ResourceCard-Actions">
                <TxCopyButton
                  :text="resourceAbsoluteUrl(item.url, origin)"
                  :copy-label="t('dashboard.sections.images.copyUrl', 'Copy URL')"
                  :copied-label="t('dashboard.sections.images.copied', 'Copied!')"
                  @error="onCopyFailed"
                />
                <TxIconButton
                  size="xs"
                  status="danger"
                  icon="i-carbon-trash-can"
                  :label="t('dashboard.sections.images.delete', 'Delete')"
                  :title="t('dashboard.sections.images.delete', 'Delete')"
                  @click="requestDelete(item)"
                />
              </div>
            </div>
          </li>
        </ul>

        <template v-if="showListFooter" #footer>
          <div class="ResourceList-Footer">
            <p class="ResourceList-Count">
              {{ countLabel }}
            </p>
            <div v-if="resources.truncated.value" class="ResourceList-More">
              <p v-if="resources.moreError.value" class="ResourceList-MoreError" role="alert">
                {{ resources.moreError.value }}
              </p>
              <TxButton
                variant="secondary"
                size="sm"
                :loading="resources.loadingMore.value"
                :disabled="resources.refreshing.value"
                @click="resources.loadMore()"
              >
                {{ t('dashboard.sections.images.loadMore', 'Load more') }}
              </TxButton>
            </div>
          </div>
        </template>
      </AdminSection>
    </div>

    <AdminConfirmDialog
      v-model:open="deleteOpen"
      :title="t('dashboard.sections.images.confirmDeleteTitle', 'Delete Resource')"
      :description="deleteTarget ? t('dashboard.sections.images.confirmDelete', { key: deleteTarget.key }) : ''"
      :confirm-label="t('dashboard.sections.images.delete', 'Delete')"
      :cancel-label="t('dashboard.sections.images.cancel', 'Cancel')"
      tone="danger"
      :loading="deleting"
      @confirm="confirmDelete"
    />
  </AdminPageShell>
</template>

<style scoped>
.ResourcePage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ResourceUpload {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ResourceUpload-Status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}

/* The placeholder cards are built from the same boxes as the loaded ones, so the
   grid keeps its shape when the listing lands. */
.ResourceGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ResourceCard {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 14px;
  background: var(--tx-fill-color-lighter);
}

.ResourceCard-Preview {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: var(--tx-fill-color-light);
}

.ResourceCard-Image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ResourceCard-FileIcon {
  color: var(--tx-text-color-secondary);
  font-size: 28px;
}

.ResourceCard-Body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.ResourceCard-Key {
  height: 1lh;
  margin: 0;
  overflow: hidden;
  color: var(--tx-text-color-regular);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The bar's width is a share of this box, so the box is a column that stretches
   it full width rather than a row that would shrink it to nothing. */
.ResourceCard-Key.is-placeholder {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ResourceCard-Placeholder {
  width: 100%;
  height: 100%;
}

.ResourceCard-Actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 30px;
}

.ResourceList-Footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ResourceList-Count,
.ResourceList-MoreError {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.ResourceList-Count {
  color: var(--tx-text-color-regular);
}

.ResourceList-MoreError {
  color: var(--tx-color-danger);
}

.ResourceList-More {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>
