<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'

definePageMeta({
  layout: 'pilot',
})

interface StorageConfigForm {
  attachmentProvider: 'auto' | 'memory' | 'r2' | 's3'
  attachmentPublicBaseUrl: string
  minioEndpoint: string
  minioBucket: string
  minioAccessKey: string
  minioSecretKey: string
  clearMinioSecretKey: boolean
  minioRegion: string
  minioForcePathStyle: boolean
  minioPublicBaseUrl: string
  hasMinioSecretKey: boolean
}

const loading = ref(false)
const saving = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

const form = reactive<StorageConfigForm>({
  attachmentProvider: 'auto',
  attachmentPublicBaseUrl: '',
  minioEndpoint: '',
  minioBucket: '',
  minioAccessKey: '',
  minioSecretKey: '',
  clearMinioSecretKey: false,
  minioRegion: 'us-east-1',
  minioForcePathStyle: true,
  minioPublicBaseUrl: '',
  hasMinioSecretKey: false,
})

function applySettings(settings: Partial<StorageConfigForm>) {
  form.attachmentProvider = (settings.attachmentProvider as StorageConfigForm['attachmentProvider']) || 'auto'
  form.attachmentPublicBaseUrl = String(settings.attachmentPublicBaseUrl || '')
  form.minioEndpoint = String(settings.minioEndpoint || '')
  form.minioBucket = String(settings.minioBucket || '')
  form.minioAccessKey = String(settings.minioAccessKey || '')
  form.minioRegion = String(settings.minioRegion || 'us-east-1')
  form.minioForcePathStyle = settings.minioForcePathStyle !== false
  form.minioPublicBaseUrl = String(settings.minioPublicBaseUrl || '')
  form.hasMinioSecretKey = Boolean(settings.hasMinioSecretKey)
  form.minioSecretKey = ''
  form.clearMinioSecretKey = false
}

async function loadSettings() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await fetch('/api/pilot/admin/storage-config', {
      headers: {
        Accept: 'application/json',
      },
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = await response.json() as { settings?: Partial<StorageConfigForm> }
    applySettings(data.settings || {})
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载配置失败'
  }
  finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const response = await fetch('/api/pilot/admin/storage-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        attachmentProvider: form.attachmentProvider,
        attachmentPublicBaseUrl: form.attachmentPublicBaseUrl,
        minioEndpoint: form.minioEndpoint,
        minioBucket: form.minioBucket,
        minioAccessKey: form.minioAccessKey,
        minioSecretKey: form.minioSecretKey,
        clearMinioSecretKey: form.clearMinioSecretKey,
        minioRegion: form.minioRegion,
        minioForcePathStyle: form.minioForcePathStyle,
        minioPublicBaseUrl: form.minioPublicBaseUrl,
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text())
    }
    const data = await response.json() as { settings?: Partial<StorageConfigForm> }
    applySettings(data.settings || {})
    successMessage.value = '保存成功，后续上传会按新配置生效。'
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存失败'
  }
  finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<template>
  <main class="pilot-admin-storage">
    <section class="pilot-admin-storage__panel">
      <header class="pilot-admin-storage__header">
        <h1>Pilot 存储配置</h1>
        <a href="/">返回聊天页</a>
      </header>

      <p class="pilot-admin-storage__desc">
        这里用于动态配置附件存储。若未配置 MinIO，也可只配置“附件公网 Base URL”用于模型回源读取。
      </p>

      <div v-if="loading" class="pilot-admin-storage__hint">
        正在加载配置...
      </div>

      <form v-else class="pilot-admin-storage__form" @submit.prevent="saveSettings">
        <label class="pilot-admin-storage__field">
          <span>附件存储 Provider</span>
          <select v-model="form.attachmentProvider">
            <option value="auto">
              auto（优先 R2，再 MinIO，最后内存）
            </option>
            <option value="memory">
              memory
            </option>
            <option value="r2">
              r2
            </option>
            <option value="s3">
              s3/minio
            </option>
          </select>
        </label>

        <label class="pilot-admin-storage__field">
          <span>附件公网 Base URL（可选）</span>
          <input
            v-model="form.attachmentPublicBaseUrl"
            placeholder="https://pilot.example.com"
            type="url"
          >
        </label>

        <h2>MinIO / S3 兼容配置</h2>

        <label class="pilot-admin-storage__field">
          <span>Endpoint</span>
          <input
            v-model="form.minioEndpoint"
            placeholder="https://minio.example.com"
            type="url"
          >
        </label>

        <label class="pilot-admin-storage__field">
          <span>Bucket</span>
          <input v-model="form.minioBucket" placeholder="pilot-attachments">
        </label>

        <label class="pilot-admin-storage__field">
          <span>Access Key</span>
          <input v-model="form.minioAccessKey" autocomplete="off">
        </label>

        <label class="pilot-admin-storage__field">
          <span>Secret Key {{ form.hasMinioSecretKey ? '(已保存，留空则不改)' : '' }}</span>
          <input v-model="form.minioSecretKey" type="password" autocomplete="new-password">
        </label>

        <label class="pilot-admin-storage__field pilot-admin-storage__field--checkbox">
          <input v-model="form.clearMinioSecretKey" type="checkbox">
          <span>清空已保存的 Secret Key</span>
        </label>

        <label class="pilot-admin-storage__field">
          <span>Region</span>
          <input v-model="form.minioRegion" placeholder="us-east-1">
        </label>

        <label class="pilot-admin-storage__field pilot-admin-storage__field--checkbox">
          <input v-model="form.minioForcePathStyle" type="checkbox">
          <span>Force Path Style</span>
        </label>

        <label class="pilot-admin-storage__field">
          <span>MinIO Public Base URL（可选，bucket root）</span>
          <input
            v-model="form.minioPublicBaseUrl"
            placeholder="https://files.example.com/pilot-attachments"
            type="url"
          >
        </label>

        <p v-if="errorMessage" class="pilot-admin-storage__error">
          {{ errorMessage }}
        </p>
        <p v-if="successMessage" class="pilot-admin-storage__success">
          {{ successMessage }}
        </p>

        <button type="submit" :disabled="saving">
          {{ saving ? '保存中...' : '保存配置' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.pilot-admin-storage {
  min-height: 100dvh;
  padding: 24px 16px;
  background: var(--tx-bg-color-page);
  color: var(--tx-text-color-primary);
}

.pilot-admin-storage__panel {
  width: min(860px, 100%);
  margin: 0 auto;
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 88%, transparent);
  padding: 18px;
}

.pilot-admin-storage__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.pilot-admin-storage__header h1 {
  margin: 0;
  font-size: 20px;
}

.pilot-admin-storage__desc {
  margin: 10px 0 18px;
  color: var(--tx-text-color-secondary);
}

.pilot-admin-storage__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pilot-admin-storage__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pilot-admin-storage__field input,
.pilot-admin-storage__field select {
  border: 1px solid color-mix(in srgb, var(--tx-border-color) 76%, transparent);
  border-radius: 8px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 42%, transparent);
  color: var(--tx-text-color-primary);
}

.pilot-admin-storage__field--checkbox {
  flex-direction: row;
  align-items: center;
}

.pilot-admin-storage__field--checkbox input {
  width: auto;
}

.pilot-admin-storage__hint,
.pilot-admin-storage__error,
.pilot-admin-storage__success {
  margin: 0;
  font-size: 13px;
}

.pilot-admin-storage__error {
  color: var(--tx-color-danger);
}

.pilot-admin-storage__success {
  color: var(--tx-color-success);
}

.pilot-admin-storage button {
  align-self: flex-start;
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  background: color-mix(in srgb, var(--tx-color-primary) 88%, transparent);
  color: #fff;
  cursor: pointer;
}

.pilot-admin-storage button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .pilot-admin-storage {
    padding: 14px 12px;
  }

  .pilot-admin-storage__panel {
    padding: 14px;
  }

  .pilot-admin-storage__header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
