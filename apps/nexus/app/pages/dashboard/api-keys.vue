<script setup lang="ts">
import { TuffInput, TuffSelect, TuffSelectItem, TxButton, TxPopperDialog } from '@talex-touch/tuffex'
import type { TxSelectValue } from '@talex-touch/tuffex'
import { defineComponent, h, inject } from 'vue'
import FlipDialog from '~/components/base/dialog/FlipDialog.vue'

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
    error.value = e.data?.message || t('dashboard.sections.apiKeys.errors.load')
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
    error.value = e.data?.message || t('dashboard.sections.apiKeys.errors.create')
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
    error.value = e.data?.message || t('dashboard.sections.apiKeys.errors.delete')
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
        h('h2', { class: 'ApiKeyDeleteDialog-Title' }, t('dashboard.sections.apiKeys.deleteDialog.title')),
        h('p', { class: 'ApiKeyDeleteDialog-Desc' }, t('dashboard.sections.apiKeys.deleteDialog.description')),
      ]),
      h('div', { class: 'ApiKeyDeleteDialog-Actions' }, [
        h(TxButton, { variant: 'secondary', size: 'small', 'native-type': 'button', onClick: handleCancel }, { default: () => t('dashboard.sections.apiKeys.cancel') }),
        h(TxButton, { variant: 'danger', size: 'small', 'native-type': 'button', onClick: handleDelete }, { default: () => t('dashboard.sections.apiKeys.delete') }),
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

const scopeTree = computed<ApiKeyScopeGroup[]>(() => [
  {
    id: 'plugins',
    label: t('dashboard.sections.apiKeys.scopes.groups.plugins.label'),
    description: t('dashboard.sections.apiKeys.scopes.groups.plugins.description'),
    children: [
      {
        id: 'plugin:read',
        label: t('dashboard.sections.apiKeys.scopes.items.pluginRead.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.pluginRead.description'),
      },
      {
        id: 'plugin:publish',
        label: t('dashboard.sections.apiKeys.scopes.items.pluginPublish.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.pluginPublish.description'),
        sensitive: true,
      },
    ],
  },
  {
    id: 'account',
    label: t('dashboard.sections.apiKeys.scopes.groups.account.label'),
    description: t('dashboard.sections.apiKeys.scopes.groups.account.description'),
    children: [
      {
        id: 'account:read',
        label: t('dashboard.sections.apiKeys.scopes.items.accountRead.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.accountRead.description'),
      },
    ],
  },
  {
    id: 'releases',
    label: t('dashboard.sections.apiKeys.scopes.groups.releases.label'),
    description: t('dashboard.sections.apiKeys.scopes.groups.releases.description'),
    adminOnly: true,
    children: [
      {
        id: 'release:sync',
        label: t('dashboard.sections.apiKeys.scopes.items.releaseSync.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.releaseSync.description'),
        sensitive: true,
      },
      {
        id: 'release:write',
        label: t('dashboard.sections.apiKeys.scopes.items.releaseWrite.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.releaseWrite.description'),
        sensitive: true,
      },
      {
        id: 'release:publish',
        label: t('dashboard.sections.apiKeys.scopes.items.releasePublish.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.releasePublish.description'),
        sensitive: true,
      },
      {
        id: 'release:assets',
        label: t('dashboard.sections.apiKeys.scopes.items.releaseAssets.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.releaseAssets.description'),
        sensitive: true,
      },
      {
        id: 'release:news',
        label: t('dashboard.sections.apiKeys.scopes.items.releaseNews.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.releaseNews.description'),
        sensitive: true,
      },
      {
        id: 'release:evidence',
        label: t('dashboard.sections.apiKeys.scopes.items.releaseEvidence.label'),
        description: t('dashboard.sections.apiKeys.scopes.items.releaseEvidence.description'),
        sensitive: true,
      },
    ],
  },
])

const availableScopeTree = computed(() => scopeTree.value.filter(group => !group.adminOnly || isAdmin.value))
const selectedScopeCount = computed(() => newKeyScopes.value.length)

const expiryOptions = computed(() => [
  { value: 'never', label: t('dashboard.sections.apiKeys.expiry.never') },
  { value: 30, label: t('dashboard.sections.apiKeys.expiry.days30') },
  { value: 90, label: t('dashboard.sections.apiKeys.expiry.days90') },
  { value: 180, label: t('dashboard.sections.apiKeys.expiry.days180') },
  { value: 365, label: t('dashboard.sections.apiKeys.expiry.year1') },
])
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <!-- Header -->
    <div>
      <h1 class="apple-heading-md">
        {{ t('dashboard.sections.apiKeys.title') }}
      </h1>
      <p class="mt-2 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.apiKeys.subtitle') }}
      </p>
    </div>

    <div v-if="keys.length > 0">
      <TxButton ref="createTriggerRef" variant="primary" @click="openCreateOverlay(createTriggerRef?.$el || null)">
        <span class="i-carbon-add text-base" />
        {{ t('dashboard.sections.apiKeys.actions.createKey') }}
      </TxButton>
    </div>

    <!-- Newly Created Key Alert -->
    <div v-if="newlyCreatedKey" class="rounded-xl border border-green-500/20 bg-green-500/10 p-4">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <p class="font-medium text-green-700 dark:text-green-400">
            {{ t('dashboard.sections.apiKeys.createdAlert.title', { name: newlyCreatedKey.name }) }}
          </p>
          <p class="mt-1 text-xs text-green-600/80 dark:text-green-400/80">
            {{ t('dashboard.sections.apiKeys.createdAlert.description') }}
          </p>
          <div class="mt-3 flex items-center gap-2">
            <code class="flex-1 rounded bg-black/10 px-3 py-2 font-mono text-xs text-black dark:bg-white/10 dark:text-white">
              {{ newlyCreatedKey.secretKey }}
            </code>
            <TxButton size="small" variant="success" @click="copyKey">
              {{ copied ? t('dashboard.sections.apiKeys.actions.copied') : t('dashboard.sections.apiKeys.actions.copy') }}
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
              <span>{{ t('dashboard.sections.apiKeys.meta.created', { date: formatDate(key.createdAt) }) }}</span>
              <template v-if="key.lastUsedAt">
                <span>·</span>
                <span>{{ t('dashboard.sections.apiKeys.meta.lastUsed', { date: formatDate(key.lastUsedAt) }) }}</span>
              </template>
              <template v-if="key.expiresAt">
                <span>·</span>
                <span :class="isExpired(key.expiresAt) ? 'text-red-500' : ''">
                  {{ isExpired(key.expiresAt) ? t('dashboard.sections.apiKeys.meta.expired') : t('dashboard.sections.apiKeys.meta.expires', { date: formatDate(key.expiresAt) }) }}
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
        {{ t('dashboard.sections.apiKeys.empty.title') }}
      </h3>
      <p class="mt-1 text-sm text-black/50 dark:text-white/50">
        {{ t('dashboard.sections.apiKeys.empty.description') }}
      </p>
      <TxButton ref="emptyCreateTriggerRef" variant="primary" class="mt-4" @click="openCreateOverlay(emptyCreateTriggerRef?.$el || null)">
        {{ t('dashboard.sections.apiKeys.empty.cta') }}
      </TxButton>
    </div>

    <FlipDialog
        v-model="showCreateModal"
        :reference="createOverlaySource"
        size="md"
        :mask-closable="false"
        :prevent-accidental-close="true"
        :header-title="t('dashboard.sections.apiKeys.overlay.title')"
        :header-desc="t('dashboard.sections.apiKeys.overlay.description')"
        :close-aria-label="t('dashboard.sections.apiKeys.actions.close')"
        mask-class="ApiKeyOverlay-Mask"
      >
        <template #default="{ close }">
          <div class="ApiKeyOverlay-Inner">
            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.apiKeys.form.nameLabel') }}
                </label>
                <TuffInput
                  v-model="newKeyName"
                  type="text"
                  :placeholder="t('dashboard.sections.apiKeys.form.namePlaceholder')"
                  class="w-full"
                />
              </div>

              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.apiKeys.form.permissionsLabel') }}
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
                              {{ t('dashboard.sections.apiKeys.form.notRecommended') }}
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
                  {{ t('dashboard.sections.apiKeys.form.selectedCount', { count: selectedScopeCount }) }}
                </p>
                <p class="ApiKeyScopeTree-RiskHint">
                  {{ t('dashboard.sections.apiKeys.form.riskHint') }}
                </p>
              </div>

              <div class="space-y-2">
                <label class="text-xs text-black/60 dark:text-white/60">
                  {{ t('dashboard.sections.apiKeys.form.expirationLabel') }}
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
                {{ t('dashboard.sections.apiKeys.cancel') }}
              </TxButton>
              <TxButton variant="primary" size="small" :disabled="!newKeyName.trim() || creating" @click="createKey">
                {{ creating ? t('dashboard.sections.apiKeys.actions.creating') : t('dashboard.sections.apiKeys.actions.createKey') }}
              </TxButton>
            </div>
          </div>
        </template>
      </FlipDialog>

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

:global(.ApiKeyOverlay-Mask) {
  cursor: not-allowed;
}

:global(.ApiKeyOverlay-Mask.is-close-guard-warning::after) {
  animation: api-key-overlay-mask-warning 560ms ease-out;
}

@keyframes api-key-overlay-mask-warning {
  0% {
    opacity: 0;
    background: radial-gradient(circle at 50% 50%, rgba(255, 66, 66, 0) 0%, rgba(255, 66, 66, 0) 72%);
  }

  22% {
    opacity: 1;
    background: radial-gradient(circle at 50% 50%, rgba(255, 66, 66, 0.08) 0%, rgba(255, 66, 66, 0.04) 42%, rgba(255, 66, 66, 0) 72%);
  }

  52% {
    opacity: 0.55;
    background: radial-gradient(circle at 50% 50%, rgba(255, 66, 66, 0.06) 0%, rgba(255, 66, 66, 0.03) 42%, rgba(255, 66, 66, 0) 72%);
  }

  100% {
    opacity: 0;
    background: radial-gradient(circle at 50% 50%, rgba(255, 66, 66, 0) 0%, rgba(255, 66, 66, 0) 72%);
  }
}

:global(.ApiKeyOverlay-Mask + .FlipDialog-Card .TxFlipOverlay-Shell.is-close-guard-focus) {
  animation: none;
}

:global(.ApiKeyOverlay-Mask + .FlipDialog-Card.is-close-guard-warning) {
  animation:
    api-key-overlay-close-guard-warning 980ms ease-out,
    api-key-overlay-card-focus 420ms cubic-bezier(0.2, 0.72, 0.2, 1);
}

@keyframes api-key-overlay-close-guard-warning {
  0% {
    filter: drop-shadow(0 0 0 rgba(255, 79, 79, 0));
  }

  18% {
    filter:
      drop-shadow(0 0 6px rgba(255, 96, 96, 0.2))
      drop-shadow(0 0 22px rgba(255, 64, 64, 0.14))
      drop-shadow(0 0 42px rgba(255, 47, 47, 0.1));
  }

  52% {
    filter:
      drop-shadow(0 0 6px rgba(255, 96, 96, 0.12))
      drop-shadow(0 0 22px rgba(255, 64, 64, 0.09))
      drop-shadow(0 0 42px rgba(255, 47, 47, 0.06));
  }

  100% {
    filter: drop-shadow(0 0 0 rgba(255, 79, 79, 0));
  }
}

@keyframes api-key-overlay-card-focus {
  0% {
    scale: 1;
  }

  28% {
    scale: 1.04;
  }

  52% {
    scale: 0.988;
  }

  72% {
    scale: 1.015;
  }

  100% {
    scale: 1;
  }
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
