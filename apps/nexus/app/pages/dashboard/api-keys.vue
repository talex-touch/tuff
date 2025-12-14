<script setup lang="ts">
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
const newlyCreatedKey = ref<{ name: string; secretKey: string } | null>(null)
const copied = ref(false)

async function fetchKeys() {
  loading.value = true
  error.value = null
  try {
    const data = await $fetch<{ keys: ApiKey[] }>('/api/dashboard/api-keys')
    keys.value = data.keys
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to load API keys'
  } finally {
    loading.value = false
  }
}

async function createKey() {
  if (!newKeyName.value.trim()) return
  
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
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to create API key'
  } finally {
    creating.value = false
  }
}

async function deleteKey(keyId: string) {
  if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
    return
  }
  
  try {
    await $fetch(`/api/dashboard/api-keys/${keyId}`, { method: 'DELETE' })
    await fetchKeys()
  } catch (e: any) {
    error.value = e.data?.message || 'Failed to delete API key'
  }
}

async function copyKey() {
  if (!newlyCreatedKey.value) return
  await navigator.clipboard.writeText(newlyCreatedKey.value.secretKey)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString()
}

function isExpired(date: string | null): boolean {
  if (!date) return false
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
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-black dark:text-light">API Keys</h1>
        <p class="text-sm text-black/50 dark:text-light/50">Manage API keys for CLI tools and integrations</p>
      </div>
      <button
        class="flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-light dark:text-black dark:hover:bg-light/80"
        @click="showCreateModal = true"
      >
        <span class="i-carbon-add text-base" />
        Create Key
      </button>
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
            <code class="flex-1 rounded bg-black/10 px-3 py-2 font-mono text-xs text-black dark:bg-white/10 dark:text-light">
              {{ newlyCreatedKey.secretKey }}
            </code>
            <button
              class="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-green-700"
              @click="copyKey"
            >
              {{ copied ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>
        <button
          class="text-green-600/60 transition hover:text-green-600"
          @click="newlyCreatedKey = null"
        >
          <span class="i-carbon-close text-lg" />
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <span class="i-carbon-circle-dash animate-spin text-2xl text-black/30 dark:text-light/30" />
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
        class="flex items-center justify-between rounded-2xl bg-white/60 p-4 dark:bg-dark/40"
        :class="{ 'opacity-50': isExpired(key.expiresAt) }"
      >
        <div class="flex items-center gap-4">
          <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 dark:bg-light/5">
            <span class="i-carbon-password text-lg text-black/60 dark:text-light/60" />
          </div>
          <div>
            <p class="font-medium text-black dark:text-light">{{ key.name }}</p>
            <div class="flex items-center gap-2 text-xs text-black/40 dark:text-light/40">
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
        <button
          class="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-500"
          @click="deleteKey(key.id)"
        >
          <span class="i-carbon-trash-can text-lg" />
        </button>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="rounded-2xl bg-white/60 p-8 text-center dark:bg-dark/40">
      <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/5 dark:bg-light/5">
        <span class="i-carbon-password text-2xl text-black/30 dark:text-light/30" />
      </div>
      <h3 class="font-medium text-black dark:text-light">No API Keys</h3>
      <p class="mt-1 text-sm text-black/50 dark:text-light/50">
        Create an API key to use with tuffcli and other integrations
      </p>
      <button
        class="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 dark:bg-light dark:text-black"
        @click="showCreateModal = true"
      >
        Create Your First Key
      </button>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        @click.self="showCreateModal = false"
      >
        <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-dark">
          <h3 class="text-lg font-semibold text-black dark:text-light">Create API Key</h3>
          <p class="mt-1 text-sm text-black/50 dark:text-light/50">
            Generate a new API key for CLI tools
          </p>

          <div class="mt-6 space-y-4">
            <!-- Name -->
            <div>
              <label class="mb-1 block text-xs font-medium text-black/60 dark:text-light/60">
                Key Name
              </label>
              <input
                v-model="newKeyName"
                type="text"
                placeholder="e.g., My Laptop, CI/CD"
                class="w-full rounded-lg border-0 bg-black/5 px-3 py-2 text-sm text-black outline-none dark:bg-light/5 dark:text-light"
              />
            </div>

            <!-- Scopes -->
            <div>
              <label class="mb-2 block text-xs font-medium text-black/60 dark:text-light/60">
                Permissions
              </label>
              <div class="space-y-2">
                <label
                  v-for="scope in availableScopes"
                  :key="scope.id"
                  class="flex cursor-pointer items-start gap-3 rounded-lg bg-black/5 p-3 transition hover:bg-black/10 dark:bg-light/5 dark:hover:bg-light/10"
                >
                  <input
                    v-model="newKeyScopes"
                    type="checkbox"
                    :value="scope.id"
                    class="mt-0.5"
                  />
                  <div>
                    <p class="text-sm font-medium text-black dark:text-light">{{ scope.label }}</p>
                    <p class="text-xs text-black/50 dark:text-light/50">{{ scope.description }}</p>
                  </div>
                </label>
              </div>
            </div>

            <!-- Expiry -->
            <div>
              <label class="mb-1 block text-xs font-medium text-black/60 dark:text-light/60">
                Expiration
              </label>
              <select
                v-model="newKeyExpiry"
                class="w-full rounded-lg border-0 bg-black/5 px-3 py-2 text-sm text-black outline-none dark:bg-light/5 dark:text-light"
              >
                <option v-for="opt in expiryOptions" :key="opt.value ?? 'never'" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>

          <div class="mt-6 flex gap-3">
            <button
              class="flex-1 rounded-lg bg-black/5 py-2 text-sm font-medium text-black/60 transition hover:bg-black/10 dark:bg-light/5 dark:text-light/60"
              @click="showCreateModal = false"
            >
              Cancel
            </button>
            <button
              class="flex-1 rounded-lg bg-black py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-50 dark:bg-light dark:text-black"
              :disabled="!newKeyName.trim() || creating"
              @click="createKey"
            >
              {{ creating ? 'Creating...' : 'Create Key' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
