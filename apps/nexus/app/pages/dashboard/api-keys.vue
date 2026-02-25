<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxFlipOverlay, TxPopperDialog } from '@talex-touch/tuffex'
import type { TxSelectValue } from '@talex-touch/tuffex'
import { defineComponent, h, inject } from 'vue'

definePageMeta({
  layout: 'dashboard',
})

const { t } = useI18n()
const { user } = useAuthUser()
const isAdmin = computed(() => user.value?.role === 'admin')

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

interface ApiKeyScope {
  id: string
  label: string
  description: string
  sensitive?: boolean
}

interface ApiKeyScopeGroup {
  id: string
  label: string
  description: string
  adminOnly?: boolean
  children: ApiKeyScope[]
}

const keys = ref<ApiKey[]>([])
const loading = ref(true)
const creating = ref(false)
const error = ref<string | null>(null)

// Create form
const showCreateModal = ref(false)
const createOverlaySource = ref<HTMLElement | null>(null)
const createTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const emptyCreateTriggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const newKeyName = ref('')
const newKeyScopes = ref<string[]>(['plugin:publish'])
const newKeyExpiry = ref<TxSelectValue | undefined>(undefined)

// Newly created key (show once)
const newlyCreatedKey = ref<{ name: string, secretKey: string } | null>(null)
const copied = ref(false)

function openCreateOverlay(source?: HTMLElement | null) {
  createOverlaySource.value = source ?? null
  showCreateModal.value = true
}

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

watch(isAdmin, (admin) => {
  if (user.value && !admin) {
    navigateTo('/dashboard/overview')
    return
  }
  if (admin)
    fetchKeys()
}, { immediate: true })

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
        expiresInDays: typeof newKeyExpiry.value === 'number' ? newKeyExpiry.value : undefined,
      },
    })

    newlyCreatedKey.value = {
      name: data.key.name,
      secretKey: data.key.secretKey,
    }

    showCreateModal.value = false
    newKeyName.value = ''
    newKeyScopes.value = ['plugin:publish']
    newKeyExpiry.value = undefined

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

const DeleteConfirmDialog = defineComponent({
  name: 'ApiKeyDeleteDialog',
  setup() {
    const destroy = inject<() => void>('destroy')

    const handleCancel = () => {
      destroy?.()
    }

    const handleDelete = async () => {
      await confirmDeleteKey()
      destroy?.()
    }

    return () => h('div', { class: 'ApiKeyDeleteDialog' }, [
      h('div', { class: 'ApiKeyDeleteDialog-Header' }, [
        h('h2', { class: 'ApiKeyDeleteDialog-Title' }, 'Delete API Key'),
        h('p', { class: 'ApiKeyDeleteDialog-Desc' }, 'Are you sure you want to delete this API key? This action cannot be undone.'),
      ]),
      h('div', { class: 'ApiKeyDeleteDialog-Actions' }, [
        h(TxButton, { variant: 'secondary', size: 'small', 'native-type': 'button', onClick: handleCancel }, { default: () => 'Cancel' }),
        h(TxButton, { variant: 'danger', size: 'small', 'native-type': 'button', onClick: handleDelete }, { default: () => 'Delete' }),
      ]),
    ])
  },
})

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

const scopeTree: ApiKeyScopeGroup[] = [
  {
    id: 'plugins',
    label: 'Plugins',
    description: 'Manage plugin registry visibility and publishing',
    children: [
      { id: 'plugin:read', label: 'Read Plugins', description: 'View plugin information' },
      { id: 'plugin:publish', label: 'Publish Plugins', description: 'Upload and publish plugins to the store', sensitive: true },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Read account level profile information',
    children: [
      { id: 'account:read', label: 'Read Account', description: 'View account information' },
    ],
  },
  {
    id: 'releases',
    label: 'Releases',
    description: 'Manage release sync, metadata, publishing and assets',
    adminOnly: true,
    children: [
      { id: 'release:sync', label: 'Sync Releases', description: 'Sync releases, assets, and publish status from CI', sensitive: true },
      { id: 'release:write', label: 'Write Releases', description: 'Create or update release metadata', sensitive: true },
      { id: 'release:publish', label: 'Publish Releases', description: 'Publish release notes and channels', sensitive: true },
      { id: 'release:assets', label: 'Manage Release Assets', description: 'Upload or link release assets', sensitive: true },
      { id: 'release:news', label: 'Sync Update News', description: 'Create dashboard updates/news records from CI', sensitive: true },
    ],
  },
]

const availableScopeTree = computed(() => scopeTree.filter(group => !group.adminOnly || isAdmin.value))
const selectedScopeCount = computed(() => newKeyScopes.value.length)

const expiryOptions = [
  { value: 'never', label: 'Never expires' },
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

    <div v-if="keys.length > 0">
      <TxButton ref="createTriggerRef" variant="primary" @click="openCreateOverlay(createTriggerRef?.$el || null)">
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
      <TxButton ref="emptyCreateTriggerRef" variant="primary" class="mt-4" @click="openCreateOverlay(emptyCreateTriggerRef?.$el || null)">
        Create Your First Key
      </TxButton>
    </div>

    <Teleport to="body">
      <TxFlipOverlay
        v-model="showCreateModal"
        :source="createOverlaySource"
        :mask-closable="false"
        :prevent-accidental-close="true"
        header-title="Create API Key"
        header-desc="Generate a new API key for CLI tools"
      >
        <template #default="{ close }">
          <div class="ApiKeyOverlay-Inner">
            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  Key Name
                </label>
                <TuffInput
                  v-model="newKeyName"
                  type="text"
                  placeholder="e.g., My Laptop, CI/CD"
                  class="w-full"
                />
              </div>

              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  Permissions
                </label>
                <div class="ApiKeyScopeTree">
                  <section
                    v-for="group in availableScopeTree"
                    :key="group.id"
                    class="ApiKeyScopeTree-Group"
                  >
                    <div class="ApiKeyScopeTree-GroupHeader">
                      <p class="ApiKeyScopeTree-GroupTitle">
                        {{ group.label }}
                      </p>
                      <p class="ApiKeyScopeTree-GroupDesc">
                        {{ group.description }}
                      </p>
                    </div>
                    <div class="ApiKeyScopeTree-Children">
                      <label
                        v-for="scope in group.children"
                        :key="scope.id"
                        class="ApiKeyScopeTree-Node"
                        :class="{ 'is-sensitive': scope.sensitive }"
                      >
                        <TxCheckbox
                          class="mt-0.5"
                          :model-value="newKeyScopes.includes(scope.id)"
                          @change="(value: boolean) => toggleScope(scope.id, value)"
                        />
                        <div class="min-w-0">
                          <div class="ApiKeyScopeTree-NodeTitleRow">
                            <p
                              class="ApiKeyScopeTree-NodeTitle"
                              :class="{ 'is-sensitive': scope.sensitive }"
                            >
                              {{ scope.label }}
                            </p>
                            <span v-if="scope.sensitive" class="ApiKeyScopeTree-RiskTag">
                              不建议
                            </span>
                          </div>
                          <p
                            class="ApiKeyScopeTree-NodeDesc"
                            :class="{ 'is-sensitive': scope.sensitive }"
                          >
                            {{ scope.description }}
                          </p>
                        </div>
                      </label>
                    </div>
                  </section>
                </div>
                <p class="ApiKeyScopeTree-Count">
                  Selected permissions: {{ selectedScopeCount }}
                </p>
                <p class="ApiKeyScopeTree-RiskHint">
                  红色权限属于敏感操作，不建议分配给长期或共享 API Key。
                </p>
              </div>

              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
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

            <div class="ApiKeyOverlay-Actions">
              <TxButton variant="secondary" size="small" @click="close">
                Cancel
              </TxButton>
              <TxButton variant="primary" size="small" :disabled="!newKeyName.trim() || creating" @click="createKey">
                {{ creating ? 'Creating...' : 'Create Key' }}
              </TxButton>
            </div>
          </div>
        </template>
      </TxFlipOverlay>
    </Teleport>

    <!-- Delete Confirmation Dialog -->
    <TxPopperDialog
      v-if="deleteConfirmVisible"
      :comp="DeleteConfirmDialog"
      :close="closeDeleteConfirm"
    />
  </div>
</template>

<style scoped>
.ApiKeyOverlay-Inner {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 18px;
}

.ApiKeyOverlay-Actions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ApiKeyScopeTree {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ApiKeyScopeTree-Group {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-lighter) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 90%, transparent);
  padding: 10px 12px;
}

.ApiKeyScopeTree-GroupHeader {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ApiKeyScopeTree-GroupTitle {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--tx-text-color-primary);
  text-transform: uppercase;
}

.ApiKeyScopeTree-GroupDesc {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.ApiKeyScopeTree-Children {
  margin-top: 8px;
  margin-left: 8px;
  padding-left: 12px;
  border-left: 1px solid color-mix(in srgb, var(--tx-border-color-lighter) 74%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ApiKeyScopeTree-Node {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  border-radius: 10px;
  padding: 8px 10px;
  transition: background-color 160ms ease;
}

.ApiKeyScopeTree-Node:hover {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 7%, transparent);
}

.ApiKeyScopeTree-Node.is-sensitive {
  border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
  background: color-mix(in srgb, #ef4444 8%, transparent);
}

.ApiKeyScopeTree-NodeTitleRow {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ApiKeyScopeTree-NodeTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.ApiKeyScopeTree-NodeTitle.is-sensitive {
  color: color-mix(in srgb, #ef4444 80%, var(--tx-text-color-primary));
}

.ApiKeyScopeTree-NodeDesc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.ApiKeyScopeTree-NodeDesc.is-sensitive {
  color: color-mix(in srgb, #ef4444 70%, var(--tx-text-color-secondary));
}

.ApiKeyScopeTree-RiskTag {
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, #ef4444 55%, transparent);
  background: color-mix(in srgb, #ef4444 14%, transparent);
  color: #ef4444;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  padding: 3px 8px;
}

.ApiKeyScopeTree-Count {
  margin: 2px 4px 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.ApiKeyScopeTree-RiskHint {
  margin: 4px 4px 0;
  font-size: 12px;
  color: color-mix(in srgb, #ef4444 75%, var(--tx-text-color-secondary));
}
</style>

<style>
.ApiKeyDeleteDialog {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 180px;
}

.ApiKeyDeleteDialog-Header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}

.ApiKeyDeleteDialog-Title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary);
}

.ApiKeyDeleteDialog-Desc {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.ApiKeyDeleteDialog-Actions {
  margin-top: auto;
  display: flex;
  justify-content: center;
  gap: 10px;
}
</style>
