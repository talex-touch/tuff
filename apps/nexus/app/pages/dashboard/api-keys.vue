<script setup lang="ts">
import Modal from '~/components/ui/Modal.vue'
import { TxButton } from '@talex-touch/tuffex'

definePageMeta({
  layout: 'dashboard',
})

const { t } = useI18n()

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

interface NewKeyResponse {
  key: {
    id: string
    secretKey: string
    name: string
    keyPrefix: string
    scopes: string[]
  }
  message: string
}

const keys = ref<ApiKey[]>([])
const loading = ref(true)
const creating = ref(false)
const error = ref<string | null>(null)

// Create form
const showCreateModal = ref(false)
const newKeyName = ref('')
const newKeyScopes = ref<string[]>(['plugin:publish'])
const newKeyExpiry = ref<number | null>(null)

// Newly created key (show once)
const newlyCreatedKey = ref<{ name: string, secretKey: string } | null>(null)
const copied = ref(false)

async function fetchKeys() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<{ keys: ApiKey[] }>('/api/dashboard/api-keys')
    keys.value = data.keys
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to load API keys'
  }
  finally {
    loading.value = false
  }
}

async function createKey() {
  if (!newKeyName.value.trim())
    return

  creating.value = true
  try {
    const data = await $fetch<NewKeyResponse>('/api/dashboard/api-keys', {
      method: 'POST',
      body: {
        name: newKeyName.value.trim(),
        scopes: newKeyScopes.value,
        expiresInDays: newKeyExpiry.value,
      },
    })

    newlyCreatedKey.value = {
      name: data.key.name,
      secretKey: data.key.secretKey,
    }

    showCreateModal.value = false
    newKeyName.value = ''
    newKeyScopes.value = ['plugin:publish']
    newKeyExpiry.value = null

    await fetchKeys()
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to create API key'
  }
  finally {
    creating.value = false
  }
}

// Delete confirmation
const deleteConfirmVisible = ref(false)
const pendingDeleteKeyId = ref<string | null>(null)

function requestDeleteKey(keyId: string) {
  pendingDeleteKeyId.value = keyId
  deleteConfirmVisible.value = true
}

async function confirmDeleteKey(): Promise<boolean> {
  if (!pendingDeleteKeyId.value)
    return true
  try {
    await $fetch(`/api/dashboard/api-keys/${pendingDeleteKeyId.value}`, { method: 'DELETE' })
    await fetchKeys()
  }
  catch (e: any) {
    error.value = e.data?.message || 'Failed to delete API key'
  }
  finally {
    pendingDeleteKeyId.value = null
  }
  return true
}

function closeDeleteConfirm() {
  deleteConfirmVisible.value = false
  pendingDeleteKeyId.value = null
}

async function copyKey() {
  if (!newlyCreatedKey.value)
    return
  await navigator.clipboard.writeText(newlyCreatedKey.value.secretKey)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function toggleScope(scopeId: string, enabled: boolean) {
  const current = newKeyScopes.value
  if (enabled) {
    if (!current.includes(scopeId))
      newKeyScopes.value = [...current, scopeId]
    return
  }
  newKeyScopes.value = current.filter(item => item !== scopeId)
}

function formatDate(date: string | null): string {
  if (!date)
    return '-'
  return new Date(date).toLocaleDateString()
}

function isExpired(date: string | null): boolean {
  if (!date)
    return false
  return new Date(date) < new Date()
}

onMounted(() => {
  fetchKeys()
})

const availableScopes = [
  { id: 'plugin:publish', label: 'Publish Plugins', description: 'Upload and publish plugins to the marketplace' },
  { id: 'plugin:read', label: 'Read Plugins', description: 'View plugin information' },
  { id: 'account:read', label: 'Read Account', description: 'View account information' },
]

const expiryOptions = [
  { value: null, label: 'Never expires' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' },
  { value: 365, label: '1 year' },
]
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="apple-heading-md">
        API Keys
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        Manage API keys for CLI tools and integrations
      </p>
    </div>

    <div>
      <TxButton variant="primary" @click="showCreateModal = true">
        <span class="i-carbon-add text-base" />
        Create Key
      </TxButton>
    </div>

    <!-- Newly Created Key Alert -->
    <div v-if="newlyCreatedKey" class="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <p class="font-medium text-green-700 dark:text-green-400">
            API Key Created: {{ newlyCreatedKey.name }}
          </p>
          <p class="mt-1 text-xs text-green-600/80 dark:text-green-400/80">
            Copy your secret key now. It won't be shown again.
          </p>
          <div class="mt-3 flex items-center gap-2">
            <code class="flex-1 rounded bg-black/10 px-3 py-2 font-mono text-xs text-black dark:bg-white/10 dark:text-white">
              {{ newlyCreatedKey.secretKey }}
            </code>
            <TxButton size="small" variant="success" @click="copyKey">
              {{ copied ? 'Copied!' : 'Copy' }}
            </TxButton>
          </div>
        </div>
        <TxButton variant="bare" circle size="mini" native-type="button" class="text-green-600/60 transition hover:text-green-600" @click="newlyCreatedKey = null">
          <span class="i-carbon-close text-lg" />
        </TxButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4 py-6">
      <div class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-white/50">
        <TxSpinner :size="22" />
      </div>
      <div class="space-y-3">
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
        <div class="rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]">
          <TxSkeleton :loading="true" :lines="2" />
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="rounded-xl bg-red-500/10 p-4 text-center text-red-500">
      {{ error }}
    </div>

    <!-- Keys List -->
    <div v-else-if="keys.length > 0" class="space-y-3">
      <div
        v-for="key in keys"
        :key="key.id"
        class="flex items-center justify-between rounded-2xl bg-black/[0.02] p-4 dark:bg-white/[0.03]"
        :class="{ 'opacity-50': isExpired(key.expiresAt) }"
      >
        <div class="flex items-center gap-4">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-black/[0.04] dark:bg-white/[0.06]">
            <span class="i-carbon-password text-lg text-black/60 dark:text-white/60" />
          </div>
          <div>
            <p class="font-medium text-black dark:text-white">
              {{ key.name }}
            </p>
            <div class="flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
              <code class="font-mono">{{ key.keyPrefix }}</code>
              <span>·</span>
              <span>Created {{ formatDate(key.createdAt) }}</span>
              <template v-if="key.lastUsedAt">
                <span>·</span>
                <span>Last used {{ formatDate(key.lastUsedAt) }}</span>
              </template>
              <template v-if="key.expiresAt">
                <span>·</span>
                <span :class="isExpired(key.expiresAt) ? 'text-red-500' : ''">
                  {{ isExpired(key.expiresAt) ? 'Expired' : `Expires ${formatDate(key.expiresAt)}` }}
                </span>
              </template>
            </div>
            <div class="mt-1 flex gap-1">
              <span
                v-for="scope in key.scopes"
                :key="scope"
                class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
              >
                {{ scope }}
              </span>
            </div>
          </div>
        </div>
        <TxButton variant="bare" circle size="mini" native-type="button" class="rounded-lg text-red-400 transition hover:bg-red-500/10 hover:text-red-500" @click="requestDeleteKey(key.id)">
          <span class="i-carbon-trash-can text-lg" />
        </TxButton>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="rounded-2xl bg-black/[0.02] p-8 text-center dark:bg-white/[0.03]">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/[0.04] dark:bg-white/[0.06]">
        <span class="i-carbon-password text-2xl text-black/30 dark:text-white/30" />
      </div>
      <h3 class="font-medium text-black dark:text-white">
        No API Keys
      </h3>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        Create an API key to use with tuffcli and other integrations
      </p>
      <TxButton variant="primary" class="mt-4" @click="showCreateModal = true">
        Create Your First Key
      </TxButton>
    </div>

    <!-- Create Modal -->
    <Modal v-model="showCreateModal" title="Create API Key" width="480px">
      <p class="text-sm text-black/50 dark:text-white/50">
        Generate a new API key for CLI tools
      </p>

      <div class="mt-6 space-y-4">
        <!-- Name -->
        <div>
          <label class="apple-section-title mb-1 block">
            Key Name
          </label>
          <Input
            v-model="newKeyName"
            type="text"
            placeholder="e.g., My Laptop, CI/CD"
            class="w-full"
          />
        </div>

        <!-- Scopes -->
        <div>
          <label class="apple-section-title mb-2 block">
            Permissions
          </label>
          <div class="space-y-2">
            <label
              v-for="scope in availableScopes"
              :key="scope.id"
              class="flex cursor-pointer items-start gap-3 rounded-xl bg-black/[0.03] p-3 transition hover:bg-black/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
            >
              <TxCheckbox
                class="mt-0.5"
                :model-value="newKeyScopes.includes(scope.id)"
                @change="(value: boolean) => toggleScope(scope.id, value)"
              />
              <div>
                <p class="text-sm font-medium text-black dark:text-white">{{ scope.label }}</p>
                <p class="text-xs text-black/50 dark:text-white/50">{{ scope.description }}</p>
              </div>
            </label>
          </div>
        </div>

        <!-- Expiry -->
        <div>
          <label class="apple-section-title mb-1 block">
            Expiration
          </label>
          <TuffSelect v-model="newKeyExpiry" class="w-full">
            <TuffSelectItem
              v-for="opt in expiryOptions"
              :key="opt.value ?? 'never'"
              :value="opt.value"
              :label="opt.label"
            />
          </TuffSelect>
        </div>
      </div>

      <template #footer>
        <div class="flex gap-3">
          <TxButton variant="secondary" class="flex-1" @click="showCreateModal = false">
            Cancel
          </TxButton>
          <TxButton variant="primary" class="flex-1" :disabled="!newKeyName.trim() || creating" @click="createKey">
            {{ creating ? 'Creating...' : 'Create Key' }}
          </TxButton>
        </div>
      </template>
    </Modal>

    <!-- Delete Confirmation Dialog -->
    <TxBottomDialog
      v-if="deleteConfirmVisible"
      title="Delete API Key"
      message="Are you sure you want to delete this API key? This action cannot be undone."
      :btns="[
        { content: 'Cancel', type: 'info', onClick: () => true },
        { content: 'Delete', type: 'error', onClick: confirmDeleteKey },
      ]"
      :close="closeDeleteConfirm"
    />
  </div>
</template>
