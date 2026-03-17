<script setup lang="ts">
import { endHttp } from '~/composables/api/axios'

definePageMeta({
  name: 'Storage',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type AttachmentProvider = 'auto' | 'memory' | 's3'

interface StorageForm {
  attachmentProvider: AttachmentProvider
  attachmentPublicBaseUrl: string
  minioEndpoint: string
  minioBucket: string
  minioRegion: string
  minioForcePathStyle: boolean
  minioPublicBaseUrl: string
  minioAccessKey: string
  minioAccessKeyMasked: string
  minioSecretKey: string
  minioSecretKeyMasked: string
  hasMinioAccessKey: boolean
  hasMinioSecretKey: boolean
  clearMinioAccessKey: boolean
  clearMinioSecretKey: boolean
}

const loading = ref(false)
const saving = ref(false)
const storage = ref<StorageForm | null>(null)

const dialog = reactive<{
  visible: boolean
  mode: 'new' | 'edit'
  submitting: boolean
  form: StorageForm
}>({
  visible: false,
  mode: 'new',
  submitting: false,
  form: createEmptyStorage(),
})

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeProvider(value: unknown): AttachmentProvider {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'memory' || normalized === 's3') {
    return normalized
  }
  return 'auto'
}

function createEmptyStorage(): StorageForm {
  return {
    attachmentProvider: 'auto',
    attachmentPublicBaseUrl: '',
    minioEndpoint: '',
    minioBucket: '',
    minioRegion: 'us-east-1',
    minioForcePathStyle: true,
    minioPublicBaseUrl: '',
    minioAccessKey: '',
    minioAccessKeyMasked: '',
    minioSecretKey: '',
    minioSecretKeyMasked: '',
    hasMinioAccessKey: false,
    hasMinioSecretKey: false,
    clearMinioAccessKey: false,
    clearMinioSecretKey: false,
  }
}

function normalizeStorageForm(raw: Partial<StorageForm>): StorageForm {
  const base = createEmptyStorage()
  return {
    ...base,
    ...raw,
    attachmentProvider: normalizeProvider(raw.attachmentProvider),
    attachmentPublicBaseUrl: normalizeText(raw.attachmentPublicBaseUrl),
    minioEndpoint: normalizeText(raw.minioEndpoint),
    minioBucket: normalizeText(raw.minioBucket),
    minioRegion: normalizeText(raw.minioRegion) || 'us-east-1',
    minioPublicBaseUrl: normalizeText(raw.minioPublicBaseUrl),
    minioAccessKeyMasked: normalizeText(raw.minioAccessKeyMasked),
    minioSecretKeyMasked: normalizeText(raw.minioSecretKeyMasked),
    minioAccessKey: normalizeText(raw.minioAccessKey),
    minioSecretKey: normalizeText(raw.minioSecretKey),
    hasMinioAccessKey: Boolean(raw.hasMinioAccessKey),
    hasMinioSecretKey: Boolean(raw.hasMinioSecretKey),
    minioForcePathStyle: raw.minioForcePathStyle !== false,
    clearMinioAccessKey: Boolean(raw.clearMinioAccessKey),
    clearMinioSecretKey: Boolean(raw.clearMinioSecretKey),
  }
}

const tableRows = computed(() => {
  if (!storage.value) {
    return []
  }
  return [storage.value]
})

async function fetchSettings() {
  loading.value = true
  try {
    const res: any = await endHttp.get('admin/settings')
    const payload = res?.settings?.storage
    if (!payload) {
      ElMessage.error(res?.message || '加载 Storage 失败')
      return
    }
    storage.value = normalizeStorageForm(payload)
  }
  finally {
    loading.value = false
  }
}

function openCreateDialog() {
  dialog.mode = 'new'
  dialog.form = createEmptyStorage()
  dialog.visible = true
}

function openEditDialog() {
  dialog.mode = 'edit'
  dialog.form = normalizeStorageForm({
    ...(storage.value || createEmptyStorage()),
    minioAccessKey: '',
    minioSecretKey: '',
    clearMinioAccessKey: false,
    clearMinioSecretKey: false,
  })
  dialog.visible = true
}

function validateStorageForm(form: StorageForm): boolean {
  if (form.attachmentProvider === 's3' && !normalizeText(form.minioEndpoint)) {
    ElMessage.warning('attachmentProvider=s3 时必须填写 MinIO Endpoint')
    return false
  }
  return true
}

function buildSavePayload(form: StorageForm) {
  return {
    attachmentProvider: form.attachmentProvider,
    attachmentPublicBaseUrl: form.attachmentPublicBaseUrl,
    minioEndpoint: form.minioEndpoint,
    minioBucket: form.minioBucket,
    minioAccessKey: form.minioAccessKey,
    clearMinioAccessKey: form.clearMinioAccessKey,
    minioSecretKey: form.minioSecretKey,
    clearMinioSecretKey: form.clearMinioSecretKey,
    minioRegion: form.minioRegion,
    minioForcePathStyle: form.minioForcePathStyle,
    minioPublicBaseUrl: form.minioPublicBaseUrl,
  }
}

async function submitDialog() {
  const validForm = normalizeStorageForm(dialog.form)
  if (!validateStorageForm(validForm)) {
    return
  }

  dialog.submitting = true
  saving.value = true
  try {
    const res: any = await endHttp.post('admin/settings', {
      storage: buildSavePayload(validForm),
    })
    if (!res?.ok) {
      ElMessage.error(res?.message || '保存 Storage 失败')
      return
    }

    const payload = res?.settings?.storage
    if (!payload) {
      ElMessage.error('保存成功但返回数据异常，请刷新页面')
      return
    }
    storage.value = normalizeStorageForm(payload)
    dialog.visible = false
    ElMessage.success('Storage 保存成功')
  }
  finally {
    dialog.submitting = false
    saving.value = false
  }
}

onMounted(() => {
  fetchSettings()
})
</script>

<template>
  <el-container class="CmsStorage">
    <el-main>
      <div class="storage-toolbar">
        <el-button :loading="loading" @click="fetchSettings">
          刷新
        </el-button>
        <el-button type="primary" @click="openCreateDialog">
          新增配置
        </el-button>
      </div>

      <el-table v-loading="loading || saving" border table-layout="auto" :data="tableRows" style="width: 100%">
        <el-table-column label="Provider" width="130">
          <template #default="{ row }">
            <el-tag>
              {{ row.attachmentProvider }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="Attachment Public URL" min-width="240">
          <template #default="{ row }">
            {{ row.attachmentPublicBaseUrl || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="MinIO Endpoint" min-width="200">
          <template #default="{ row }">
            {{ row.minioEndpoint || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="Bucket" width="180">
          <template #default="{ row }">
            {{ row.minioBucket || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="Region" width="140">
          <template #default="{ row }">
            {{ row.minioRegion || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="密钥状态" width="220">
          <template #default="{ row }">
            <el-tag :type="row.hasMinioAccessKey ? 'success' : 'info'">
              Access Key: {{ row.hasMinioAccessKey ? '已设置' : '未设置' }}
            </el-tag>
            <el-tag :type="row.hasMinioSecretKey ? 'success' : 'info'" style="margin-left: 6px">
              Secret Key: {{ row.hasMinioSecretKey ? '已设置' : '未设置' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default>
            <el-button text type="primary" @click="openEditDialog">
              编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-main>
  </el-container>

  <el-dialog
    v-model="dialog.visible"
    :title="dialog.mode === 'new' ? '新增存储配置' : '编辑存储配置'"
    width="760px"
    :close-on-click-modal="false"
  >
    <el-form label-width="160px">
      <el-form-item label="Attachment Provider">
        <el-select v-model="dialog.form.attachmentProvider" style="width: 100%">
          <el-option label="auto" value="auto" />
          <el-option label="memory" value="memory" />
          <el-option label="s3" value="s3" />
        </el-select>
      </el-form-item>

      <el-form-item label="Attachment Public URL">
        <el-input v-model="dialog.form.attachmentPublicBaseUrl" placeholder="https://pilot.example.com" />
      </el-form-item>

      <el-form-item label="MinIO Endpoint">
        <el-input v-model="dialog.form.minioEndpoint" placeholder="https://minio.example.com" />
      </el-form-item>

      <el-form-item label="MinIO Bucket">
        <el-input v-model="dialog.form.minioBucket" placeholder="pilot-attachments" />
      </el-form-item>

      <el-form-item label="Access Key">
        <el-input
          v-model="dialog.form.minioAccessKey"
          autocomplete="off"
          :placeholder="dialog.form.minioAccessKeyMasked ? `留空保持不变（当前：${dialog.form.minioAccessKeyMasked}）` : '留空表示未设置'"
        />
      </el-form-item>

      <el-form-item label="清空 Access Key">
        <el-switch v-model="dialog.form.clearMinioAccessKey" />
      </el-form-item>

      <el-form-item label="Secret Key">
        <el-input
          v-model="dialog.form.minioSecretKey"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="dialog.form.minioSecretKeyMasked ? `留空保持不变（当前：${dialog.form.minioSecretKeyMasked}）` : '留空表示未设置'"
        />
      </el-form-item>

      <el-form-item label="清空 Secret Key">
        <el-switch v-model="dialog.form.clearMinioSecretKey" />
      </el-form-item>

      <el-form-item label="MinIO Region">
        <el-input v-model="dialog.form.minioRegion" placeholder="us-east-1" />
      </el-form-item>

      <el-form-item label="Force Path Style">
        <el-switch v-model="dialog.form.minioForcePathStyle" />
      </el-form-item>

      <el-form-item label="MinIO Public URL">
        <el-input v-model="dialog.form.minioPublicBaseUrl" placeholder="https://files.example.com/pilot-attachments" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="dialog.visible = false">
        取消
      </el-button>
      <el-button type="primary" :loading="dialog.submitting || saving" @click="submitDialog">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.storage-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
