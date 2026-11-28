<script setup lang="ts">
import type { DataTableColumn } from '@talex-touch/tuffex/data-table'
import { TxAlert } from '@talex-touch/tuffex/alert'
import { TxButton } from '@talex-touch/tuffex/button'
import { TuffInput } from '@talex-touch/tuffex/input'
import { TxModal } from '@talex-touch/tuffex/modal'
import { TxSelect } from '@talex-touch/tuffex/select'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTag } from '@talex-touch/tuffex/tag'
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { consoleApi } from '@/api/endpoints'
import { resolveErrorMessage } from '@/api/http'
import type { ApiKeyItem, PrivacySettings, SecuritySettings } from '@/api/types'
import ConsoleConfirmDialog from '@/components/ConsoleConfirmDialog.vue'
import ConsoleFormField from '@/components/ConsoleFormField.vue'
import ConsolePageShell from '@/components/ConsolePageShell.vue'
import ConsoleSection from '@/components/ConsoleSection.vue'
import ConsoleTable from '@/components/ConsoleTable.vue'
import { sliceClientPage, useConsoleList } from '@/composables/useConsoleList'
import { useSession } from '@/composables/useSession'
import { setConsoleLocale } from '@/i18n'
import { formatDateTime } from '@/utils/format'
import {
  base64UrlToUint8Array,
  isWebAuthnSupported,
  serializeAttestationCredential,
} from '@/utils/webauthn'

const { t, locale } = useI18n()
const router = useRouter()
const session = useSession()

const feedback = ref<{ type: 'success' | 'error', message: string } | null>(null)
const savingProfile = ref(false)
const registeringPasskey = ref(false)
const savingSettings = ref(false)
const exportingData = ref(false)
const deletingAccount = ref(false)
const deleteDialogOpen = ref(false)

const profileForm = reactive({
  name: session.user.value?.name ?? '',
  image: session.user.value?.image ?? '',
  locale: (session.user.value?.locale ?? 'en') as 'en' | 'zh',
})

const security = reactive<SecuritySettings>({
  allowCliIpMismatch: false,
})

const privacy = reactive<PrivacySettings>({
  telemetryEnabled: true,
  crashReportingEnabled: true,
})

const localeOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '简体中文' },
]

// ─── API Keys (PATs) ──────────────────────────────────────────────────────────
const allKeysCache = ref<ApiKeyItem[] | null>(null)
const createKeyOpen = ref(false)
const creatingKey = ref(false)
const createdSecret = ref<string | null>(null)
const revokeTarget = ref<ApiKeyItem | null>(null)
const revokingKey = ref(false)

const keyForm = reactive({
  name: '',
  scopes: 'plugin:publish,plugin:read',
  expiresInDays: '90',
})

const keyList = useConsoleList<ApiKeyItem, { q: string }>({
  defaults: { q: '' },
  defaultLimit: 10,
  pageSizes: [10, 20, 50],
  debounceKeys: ['q'],
  fetch: async ({ page, limit, filters }) => {
    if (!allKeysCache.value) {
      const res = await consoleApi.listApiKeys()
      allKeysCache.value = res.keys ?? []
    }
    const term = filters.q.toLowerCase()
    const filtered = term
      ? allKeysCache.value.filter(k =>
          k.name.toLowerCase().includes(term) || k.scopes.join(',').toLowerCase().includes(term),
        )
      : allKeysCache.value
    return sliceClientPage(filtered, page, limit)
  },
})

const keyColumns = computed<DataTableColumn<ApiKeyItem>[]>(() => [
  { key: 'name', title: t('dashboard.apiKeyName'), minWidth: 160 },
  { key: 'prefix', title: t('dashboard.apiKeyPrefix'), minWidth: 120 },
  { key: 'scopes', title: t('dashboard.apiKeyScopes'), minWidth: 180 },
  { key: 'lastUsedAt', title: t('dashboard.apiKeyLastUsed'), minWidth: 150 },
  { key: 'expiresAt', title: t('dashboard.apiKeyExpires'), minWidth: 150 },
  { key: 'actions', title: t('common.actions'), type: 'actions', align: 'right', minWidth: 100 },
])

async function loadSettings() {
  const [secRes, privRes] = await Promise.allSettled([
    consoleApi.getSecuritySettings(),
    consoleApi.getPrivacySettings(),
  ])
  if (secRes.status === 'fulfilled')
    security.allowCliIpMismatch = Boolean(secRes.value.settings?.allowCliIpMismatch)
  if (privRes.status === 'fulfilled') {
    privacy.telemetryEnabled = privRes.value.settings?.telemetryEnabled !== false
    privacy.crashReportingEnabled = privRes.value.settings?.crashReportingEnabled !== false
  }
}

async function saveProfile() {
  savingProfile.value = true
  feedback.value = null
  try {
    await consoleApi.updateProfile({
      name: profileForm.name.trim() || null,
      image: profileForm.image.trim() || null,
      locale: profileForm.locale,
    })
    setConsoleLocale(profileForm.locale)
    await session.refresh()
    feedback.value = { type: 'success', message: t('dashboard.profileSaved') }
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingProfile.value = false
  }
}

async function registerPasskey() {
  if (!isWebAuthnSupported() || !hasNavigator()) {
    feedback.value = { type: 'error', message: t('auth.passkeyUnsupported') }
    return
  }
  registeringPasskey.value = true
  feedback.value = null
  try {
    const raw = await consoleApi.getPasskeyRegisterOptions()
    const userObj = (raw.user ?? {}) as Record<string, unknown>
    const rpObj = (raw.rp ?? {}) as Record<string, unknown>
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: base64UrlToUint8Array(String(raw.challenge ?? '')),
        rp: {
          name: String(rpObj.name || 'Tuff'),
          id: typeof rpObj.id === 'string' ? rpObj.id : undefined,
        },
        user: {
          id: base64UrlToUint8Array(String(userObj.id ?? '')),
          name: String(userObj.name || session.user.value?.email || ''),
          displayName: String(userObj.displayName || session.user.value?.name || ''),
        },
        pubKeyCredParams: Array.isArray(raw.pubKeyCredParams)
          ? raw.pubKeyCredParams as PublicKeyCredentialParameters[]
          : [{ type: 'public-key', alg: -7 }],
        timeout: typeof raw.timeout === 'number' ? raw.timeout : 60000,
        attestation: 'none',
        authenticatorSelection: { userVerification: 'preferred' },
      },
    }) as PublicKeyCredential | null

    if (!credential)
      throw new Error(t('common.unknownError'))
    await consoleApi.verifyPasskeyRegistration(serializeAttestationCredential(credential))
    await session.refresh()
    feedback.value = { type: 'success', message: t('dashboard.passkeyRegistered') }
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    registeringPasskey.value = false
  }
}

async function saveSecurityAndPrivacy() {
  savingSettings.value = true
  feedback.value = null
  try {
    await Promise.all([
      consoleApi.updateSecuritySettings({ allowCliIpMismatch: security.allowCliIpMismatch }),
      consoleApi.updatePrivacySettings({
        telemetryEnabled: Boolean(privacy.telemetryEnabled),
        crashReportingEnabled: Boolean(privacy.crashReportingEnabled),
      }),
    ])
    feedback.value = { type: 'success', message: t('dashboard.profileSaved') }
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    savingSettings.value = false
  }
}

async function submitCreateKey() {
  const name = keyForm.name.trim()
  if (!name)
    return
  creatingKey.value = true
  feedback.value = null
  try {
    const scopes = keyForm.scopes.split(',').map(s => s.trim()).filter(Boolean)
    const days = Number(keyForm.expiresInDays)
    const res = await consoleApi.createApiKey({
      name,
      scopes,
      expiresInDays: Number.isFinite(days) && days > 0 ? days : undefined,
    })
    createdSecret.value = res.key.secret ?? res.key.key ?? null
    createKeyOpen.value = false
    keyForm.name = ''
    allKeysCache.value = null
    await keyList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    creatingKey.value = false
  }
}

async function confirmRevokeKey() {
  if (!revokeTarget.value)
    return
  revokingKey.value = true
  try {
    await consoleApi.deleteApiKey(revokeTarget.value.id)
    revokeTarget.value = null
    allKeysCache.value = null
    await keyList.refresh()
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    revokingKey.value = false
  }
}

async function exportAccountData() {
  exportingData.value = true
  feedback.value = null
  try {
    const data = await consoleApi.exportMyData()
    if (hasWindow() && hasDocument()) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `tuff-account-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    }
    feedback.value = { type: 'success', message: t('dashboard.exportSuccess') }
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    exportingData.value = false
  }
}

async function confirmDeleteAccount() {
  deletingAccount.value = true
  feedback.value = null
  try {
    await consoleApi.deleteMyAccount({ confirm: 'DELETE_MY_DATA' })
    deleteDialogOpen.value = false
    await session.signOut()
    await router.replace('/sign-in')
  }
  catch (cause) {
    feedback.value = { type: 'error', message: resolveErrorMessage(cause, t('common.unknownError')) }
  }
  finally {
    deletingAccount.value = false
  }
}

onMounted(() => void loadSettings())
</script>

<template>
  <ConsolePageShell :title="t('dashboard.accountTitle')">
    <TxAlert
      v-if="feedback"
      :type="feedback.type"
      :message="feedback.message"
      closable
      @close="feedback = null"
    />

    <TxAlert
      v-if="createdSecret"
      type="warning"
      :title="t('dashboard.apiKeyCreatedBanner')"
      :message="createdSecret"
      closable
      @close="createdSecret = null"
    />

    <ConsoleSection :title="t('dashboard.profileSection')" :description="t('dashboard.profileDesc')">
      <form class="console-form-stack" @submit.prevent="saveProfile">
        <div class="console-form-grid">
          <ConsoleFormField :label="t('dashboard.displayName')" for-id="acc-name">
            <TuffInput id="acc-name" v-model="profileForm.name" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('dashboard.avatarUrl')" for-id="acc-image">
            <TuffInput id="acc-image" v-model="profileForm.image" />
          </ConsoleFormField>
          <ConsoleFormField :label="t('dashboard.languageLabel')">
            <TxSelect v-model="profileForm.locale" :options="localeOptions" />
          </ConsoleFormField>
        </div>
        <div>
          <TxButton variant="primary" size="sm" native-type="submit" :loading="savingProfile">
            {{ t('common.save') }}
          </TxButton>
        </div>
      </form>
    </ConsoleSection>

    <ConsoleSection :title="t('dashboard.passkeysSection')" :description="t('dashboard.passkeysDesc')">
      <template #actions>
        <TxButton
          variant="primary"
          size="sm"
          icon="i-carbon-password"
          :loading="registeringPasskey"
          @click="registerPasskey"
        >
          {{ t('dashboard.registerPasskey') }}
        </TxButton>
      </template>
      <p class="AccountMeta">
        {{ t('dashboard.passkeysEnrolled') }}: <strong>{{ session.user.value?.passkeyCount ?? 0 }}</strong>
      </p>
    </ConsoleSection>

    <ConsoleSection :title="t('dashboard.securitySection')" :description="t('dashboard.securityDesc')">
      <div class="console-form-stack">
        <div class="AccountSwitchRow">
          <span>{{ t('dashboard.allowCliIpMismatch') }}</span>
          <TxSwitch v-model="security.allowCliIpMismatch" />
        </div>
        <div class="AccountSwitchRow">
          <span>{{ t('dashboard.telemetryEnabled') }}</span>
          <TxSwitch v-model="privacy.telemetryEnabled" />
        </div>
        <div class="AccountSwitchRow">
          <span>{{ t('dashboard.crashReportingEnabled') }}</span>
          <TxSwitch v-model="privacy.crashReportingEnabled" />
        </div>
        <div>
          <TxButton variant="primary" size="sm" :loading="savingSettings" @click="saveSecurityAndPrivacy">
            {{ t('common.save') }}
          </TxButton>
        </div>
      </div>
    </ConsoleSection>

    <ConsoleSection
      :title="t('dashboard.apiKeysSection')"
      :description="t('dashboard.apiKeysDesc')"
      :padded="false"
    >
      <template #actions>
        <TxButton variant="primary" size="sm" icon="i-carbon-add" @click="createKeyOpen = true">
          {{ t('dashboard.createApiKey') }}
        </TxButton>
      </template>

      <ConsoleTable
        :columns="keyColumns"
        :rows="keyList.rows.value"
        row-key="id"
        :loading="keyList.loading.value"
        :refreshing="keyList.refreshing.value"
        :error="keyList.error.value"
        :filtered="keyList.hasActiveFilters.value"
        :page="keyList.page.value"
        :limit="keyList.limit.value"
        :total="keyList.total.value"
        :page-sizes="keyList.pageSizes"
        @retry="keyList.refresh()"
        @clear-filters="keyList.clearFilters()"
        @update:page="keyList.setPage($event)"
        @update:limit="keyList.setLimit($event)"
      >
        <template #cell-prefix="{ row }">
          <span class="console-mono">{{ row.prefix || row.keyPrefix || 'tuff_***' }}</span>
        </template>
        <template #cell-scopes="{ row }">
          <div class="console-inline-actions">
            <TxTag v-for="scope in row.scopes" :key="scope" :label="scope" size="sm" variant="soft" />
          </div>
        </template>
        <template #cell-lastUsedAt="{ row }">
          {{ formatDateTime(row.lastUsedAt, locale) }}
        </template>
        <template #cell-expiresAt="{ row }">
          {{ formatDateTime(row.expiresAt, locale) }}
        </template>
        <template #cell-actions="{ row }">
          <TxButton variant="danger" size="sm" @click="revokeTarget = row">
            {{ t('common.revoke') }}
          </TxButton>
        </template>
      </ConsoleTable>
    </ConsoleSection>

    <ConsoleSection :title="t('dashboard.dataSection')" :description="t('dashboard.dataDesc')">
      <div class="console-inline-actions">
        <TxButton
          variant="secondary"
          size="sm"
          icon="i-carbon-download"
          :loading="exportingData"
          @click="exportAccountData"
        >
          {{ t('dashboard.exportData') }}
        </TxButton>
        <TxButton
          variant="danger"
          size="sm"
          icon="i-carbon-trash-can"
          @click="deleteDialogOpen = true"
        >
          {{ t('dashboard.deleteAccount') }}
        </TxButton>
      </div>
    </ConsoleSection>

    <TxModal
      v-model="createKeyOpen"
      :title="t('dashboard.createApiKey')"
      :close-label="t('common.close')"
      width="460px"
    >
      <div class="console-form-stack">
        <ConsoleFormField :label="t('dashboard.apiKeyName')" for-id="pat-name">
          <TuffInput id="pat-name" v-model="keyForm.name" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.apiKeyScopes')" for-id="pat-scopes">
          <TuffInput id="pat-scopes" v-model="keyForm.scopes" />
        </ConsoleFormField>
        <ConsoleFormField :label="t('dashboard.apiKeyExpiry')" for-id="pat-expiry">
          <TuffInput id="pat-expiry" v-model="keyForm.expiresInDays" type="number" />
        </ConsoleFormField>
      </div>
      <template #footer>
        <TxButton variant="secondary" size="sm" @click="createKeyOpen = false">
          {{ t('common.cancel') }}
        </TxButton>
        <TxButton
          variant="primary"
          size="sm"
          :loading="creatingKey"
          :disabled="!keyForm.name.trim()"
          @click="submitCreateKey"
        >
          {{ t('common.create') }}
        </TxButton>
      </template>
    </TxModal>

    <ConsoleConfirmDialog
      :open="Boolean(revokeTarget)"
      :title="t('dashboard.revokeApiKeyTitle')"
      :description="t('dashboard.revokeApiKeyDesc', { name: revokeTarget?.name || '' })"
      :loading="revokingKey"
      @update:open="!$event && (revokeTarget = null)"
      @confirm="confirmRevokeKey"
    />

    <ConsoleConfirmDialog
      v-model:open="deleteDialogOpen"
      :title="t('dashboard.deleteAccountTitle')"
      :description="t('dashboard.deleteAccountDesc')"
      require-text="DELETE_MY_DATA"
      :loading="deletingAccount"
      @confirm="confirmDeleteAccount"
    />
  </ConsolePageShell>
</template>

<style scoped>
.AccountMeta {
  margin: 0;
  font-size: 14px;
  color: var(--tx-text-color-regular);
}

.AccountSwitchRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 14px;
}
</style>
