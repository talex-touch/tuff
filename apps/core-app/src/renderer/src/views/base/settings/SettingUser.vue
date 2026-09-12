<script setup lang="ts" name="SettingUser">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxModal as TModal } from '@talex-touch/tuffex/modal'
import { formatCompactAccountLabel, formatCompactEmail } from '@talex-touch/utils/account'
import { isDevEnv } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import CreditsSummaryBlock from '~/components/account/CreditsSummaryBlock.vue'
import UserProfileEditor from '~/components/base/UserProfileEditor.vue'
import { useUserIdentity } from '~/components/base/composables/useUserIdentity'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { resolveAuthErrorMessage } from '~/modules/auth/auth-error-message'
import { getSyncPreferenceState, setSyncPreferenceByUser } from '~/modules/auth/sync-preferences'
import { useAuth } from '~/modules/auth/useAuth'
import {
  getRuntimeNexusBaseUrl,
  getRuntimeServerMode,
  resetUserNexusBaseUrl,
  setRuntimeServerMode,
  setUserNexusBaseUrl,
  type NexusBaseUrlSaveError
} from '~/modules/nexus/runtime-base'
import { appSetting } from '~/modules/storage/app-storage'
import { resolveLoginManualHint } from './login-recovery-display'

const { t } = useI18n()
const transport = useTuffTransport()
const {
  loginWithBrowser,
  reopenBrowserLogin,
  cancelPendingBrowserLogin,
  logout,
  signOut,
  runSyncBootstrap,
  authLoadingState
} = useAuth()
const { isLoggedIn, displayName, displayEmail, avatarUrl, displayInitial } = useUserIdentity()

const profileEditorVisible = ref(false)
const loginDialogVisible = ref(false)
const nexusBaseUrlDialogVisible = ref(false)
const loginErrorMessage = ref('')
const loginLinkCopyState = ref<'idle' | 'pending' | 'success' | 'failed'>('idle')
const loginCodeCopyState = ref<'idle' | 'pending' | 'success' | 'failed'>('idle')

function ensureSecuritySettings() {
  if (!appSetting.security) {
    appSetting.security = {
      machineCodeHash: '',
      machineCodeAttestedAt: ''
    }
  }
}

ensureSecuritySettings()

const syncEnabled = computed({
  get: () => getSyncPreferenceState().enabled,
  set: (val: boolean) => {
    const enabled = Boolean(val)
    setSyncPreferenceByUser(enabled)
    if (enabled && isLoggedIn.value) {
      void runSyncBootstrap().catch(() => {
        // ignore sync bootstrap failure on manual toggle
      })
    }
  }
})

const syncToggleDescription = computed(() => {
  const sync = getSyncPreferenceState()
  if (syncEnabled.value) {
    return sync.autoEnabledAt
      ? t('settingUser.syncDescriptions.autoEnabled')
      : t('settingUser.syncDescriptions.enabled')
  }
  return sync.userOverridden
    ? t('settingUser.syncDescriptions.userDisabled')
    : t('settingUser.syncDescriptions.disabled')
})

const showRuntimeApiServer = computed(() => isDevEnv() && !isLoggedIn.value)

const useLocalServer = computed({
  get: () => getRuntimeServerMode() === 'local',
  set: (val: boolean) => {
    setRuntimeServerMode(val ? 'local' : 'production')
  }
})

const runtimeServerDescription = computed(() => getRuntimeNexusBaseUrl())

/**
 * What the renderer can tell about the stored address: it either is the one in effect, or it is
 * not. `TUFF_NEXUS_BASE_URL` is resolved inside the main process, so the page cannot observe it and
 * states its precedence as a rule instead of claiming to have detected it.
 */
const nexusBaseUrlStored = computed(() => {
  const stored = appSetting.auth?.nexusBaseUrl
  return typeof stored === 'string' ? stored.trim() : ''
})
const nexusBaseUrlSource = computed<'custom' | 'stale' | 'default'>(() => {
  if (!nexusBaseUrlStored.value) {
    return 'default'
  }
  return nexusBaseUrlStored.value === runtimeServerDescription.value ? 'custom' : 'stale'
})
const nexusBaseUrlInput = ref(nexusBaseUrlStored.value)
const nexusBaseUrlSaving = ref(false)
const nexusBaseUrlDescription = computed(() => {
  const source =
    nexusBaseUrlSource.value === 'custom'
      ? t('settingUser.nexusBaseUrlSourceCustom', '自定义地址')
      : nexusBaseUrlSource.value === 'stale'
        ? t('settingUser.nexusBaseUrlSourceStale', '已保存的地址未生效')
        : t('settingUser.nexusBaseUrlSourceDefault', '运行时服务地址')
  return `${source} · ${runtimeServerDescription.value}`
})

const loginDialogTitle = computed(() => {
  if (authLoadingState.loginStage === 'failed') {
    return t('settingUser.loginDialogFailedTitle')
  }
  if (authLoadingState.loginStage === 'success') {
    return t('settingUser.loginDialogSuccessTitle')
  }
  if (authLoadingState.loginStage === 'waiting') {
    return t('settingUser.loginDialogWaitingTitle')
  }
  return t('settingUser.loginDialogPreparingTitle')
})
const loginDialogDescription = computed(() => {
  if (authLoadingState.loginStage === 'failed') {
    return loginErrorMessage.value || t('settingUser.loginDialogFailedDesc')
  }
  if (authLoadingState.loginStage === 'success') {
    return t('settingUser.loginDialogSuccessDesc')
  }
  if (authLoadingState.loginStage === 'waiting') {
    return t('settingUser.loginDialogWaitingDesc', {
      seconds: authLoadingState.loginTimeRemaining || ''
    })
  }
  return t('settingUser.loginDialogPreparingDesc')
})
const loginManualHint = computed(() => {
  return resolveLoginManualHint(
    {
      authorizeUrl: authLoadingState.loginAuthorizeUrl,
      userCode: authLoadingState.loginUserCode,
      browserOpenFailed: authLoadingState.loginBrowserOpenFailed
    },
    t
  )
})

async function handleLogin() {
  loginDialogVisible.value = true
  loginErrorMessage.value = ''
  try {
    const result = await loginWithBrowser()
    if (result.success) {
      window.setTimeout(() => {
        loginDialogVisible.value = false
      }, 700)
      return
    }
    loginErrorMessage.value = resolveAuthErrorMessage(result.error, 'AUTH_ERROR', t)
  } catch (error) {
    loginErrorMessage.value = resolveAuthErrorMessage(error, 'AUTH_ERROR', t)
    toast.error(t('settingUser.loginError'))
  }
}

async function handleReopenLogin() {
  try {
    await reopenBrowserLogin()
  } catch {
    toast.error(t('settingUser.loginError'))
  }
}

async function copyLoginAuthorizeUrl() {
  if (!authLoadingState.loginAuthorizeUrl) {
    return
  }
  loginLinkCopyState.value = 'pending'
  try {
    await transport.send(ClipboardEvents.write, {
      type: 'text',
      value: authLoadingState.loginAuthorizeUrl
    })
    loginLinkCopyState.value = 'success'
    toast.success(t('settingUser.loginLinkCopied'))
  } catch {
    loginLinkCopyState.value = 'failed'
    toast.error(t('settingUser.loginLinkCopyFailed'))
  }
}

async function copyLoginUserCode() {
  if (!authLoadingState.loginUserCode) {
    return
  }
  loginCodeCopyState.value = 'pending'
  try {
    await transport.send(ClipboardEvents.write, {
      type: 'text',
      value: authLoadingState.loginUserCode
    })
    loginCodeCopyState.value = 'success'
    toast.success(t('settingUser.loginCodeCopied'))
  } catch {
    loginCodeCopyState.value = 'failed'
    toast.error(t('settingUser.loginCodeCopyFailed'))
  }
}

function handleCancelLogin() {
  cancelPendingBrowserLogin()
  loginDialogVisible.value = false
  toast.info(t('settingUser.loginCancelled'))
}

async function handleLogout() {
  try {
    await logout()
    toast.success(t('settingUser.logoutSuccess'))
  } catch {
    toast.error(t('settingUser.logoutFailed'))
  }
}

function resolveNexusBaseUrlError(error: NexusBaseUrlSaveError): string {
  switch (error) {
    case 'empty':
      return t('settingUser.nexusBaseUrlErrorEmpty', '请输入 Nexus 服务地址')
    case 'invalid-url':
      return t('settingUser.nexusBaseUrlErrorInvalid', '地址格式无效，请填写完整的 http(s) 地址')
    case 'unsupported-protocol':
      return t('settingUser.nexusBaseUrlErrorProtocol', '仅支持 http(s) 协议')
    case 'insecure-transport':
      return t(
        'settingUser.nexusBaseUrlErrorInsecure',
        '远程地址必须使用 https（http 仅限 localhost/127.0.0.1）'
      )
    case 'embedded-credentials':
      return t(
        'settingUser.nexusBaseUrlErrorCredentials',
        '地址中不能包含用户名或密码，请只填写服务地址'
      )
    case 'unsupported-path':
      return t(
        'settingUser.nexusBaseUrlErrorPath',
        '地址不能带路径，请填写到域名（含端口），例如 https://tuff.tagzxia.com'
      )
    default:
      return t('settingUser.nexusBaseUrlErrorSave', '保存失败，请重试')
  }
}

/**
 * Applies a base-URL change, or `null` for "restore default".
 *
 * A changed address must invalidate the stored account credential: the tokens were issued by the
 * old origin and cannot be replayed at the new one. The sign-out goes through the shared auth
 * channel instead of a local `isLoggedIn` check, because main can still hold a session the renderer
 * has already forgotten about.
 */
async function applyNexusBaseUrl(input: string | null): Promise<boolean> {
  if (nexusBaseUrlSaving.value) {
    return false
  }
  nexusBaseUrlSaving.value = true
  try {
    const result = input === null ? await resetUserNexusBaseUrl() : await setUserNexusBaseUrl(input)
    if (!result.ok) {
      toast.error(resolveNexusBaseUrlError(result.error))
      return false
    }

    nexusBaseUrlInput.value = result.value
    if (!result.changed) {
      toast.info(t('settingUser.nexusBaseUrlUnchanged', '当前生效地址未变化'))
      return true
    }

    try {
      await signOut()
    } catch {
      toast.error(
        t(
          'settingUser.nexusBaseUrlSignOutFailed',
          '地址已更新，但退出登录失败，请手动退出后重新登录'
        )
      )
      // The address did land; only the session teardown did not. Keeping the dialog open would
      // invite a second save that changes nothing.
      return true
    }
    toast.success(t('settingUser.nexusBaseUrlUpdated', '服务地址已更新，请重新登录'))
    return true
  } finally {
    nexusBaseUrlSaving.value = false
  }
}

/** Opens the editor on the stored address, so an abandoned edit does not survive the close. */
function openNexusBaseUrlDialog(): void {
  nexusBaseUrlInput.value = nexusBaseUrlStored.value
  nexusBaseUrlDialogVisible.value = true
}

async function submitNexusBaseUrl(input: string | null): Promise<void> {
  if (await applyNexusBaseUrl(input)) {
    nexusBaseUrlDialogVisible.value = false
  }
}

function openProfileEditor() {
  profileEditorVisible.value = true
}
</script>

<template>
  <TuffGroupBlock
    :name="t('settingUser.groupTitle')"
    :description="t('settingUser.groupDesc')"
    default-icon="i-carbon-user"
    active-icon="i-carbon-user-avatar"
    memory-name="setting-user"
  >
    <TuffBlockSlot
      v-if="isLoggedIn"
      :title="formatCompactAccountLabel(displayName) || t('settingUser.defaultName')"
      :description="formatCompactEmail(displayEmail) || t('settingUser.loggedIn')"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
      @click="openProfileEditor"
    >
      <template #icon>
        <div class="user-avatar">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            :alt="displayName || displayEmail || 'User'"
            class="user-avatar-image"
          />
          <div v-else class="user-avatar-placeholder">
            {{ displayInitial }}
          </div>
        </div>
      </template>

      <template #tags>
        <span class="user-tag">
          <span class="i-carbon-checkmark-filled text-xs text-green-500" />
          {{ t('settingUser.verified') }}
        </span>
      </template>

      <div class="user-actions">
        <TxButton variant="flat" size="sm" @click.stop="openProfileEditor">
          {{ t('settingUser.editProfile') }}
        </TxButton>
        <TxButton variant="flat" type="danger" size="sm" @click.stop="handleLogout">
          {{ t('settingUser.logout') }}
        </TxButton>
      </div>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-if="isLoggedIn"
      v-model="syncEnabled"
      :title="t('settingUser.syncEnabledTitle')"
      :description="syncToggleDescription"
      default-icon="i-carbon-cloud-satellite-config"
      active-icon="i-carbon-cloud-satellite"
    />

    <TuffBlockSlot
      v-else
      :title="t('settingUser.noAccount')"
      :description="t('settingUser.noAccountDesc')"
      default-icon="i-carbon-face-satisfied"
      active-icon="i-carbon-face-satisfied"
    >
      <TxButton
        variant="flat"
        type="primary"
        :loading="authLoadingState.isLoggingIn"
        :disabled="authLoadingState.isLoggingIn"
        @click="handleLogin"
      >
        {{ t('settingUser.login') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSwitch
      v-if="showRuntimeApiServer"
      v-model="useLocalServer"
      :title="t('settingUser.runtimeApiServer')"
      :description="runtimeServerDescription"
      default-icon="i-carbon-development"
      active-icon="i-carbon-development"
    />

    <TuffBlockSlot
      :title="t('settingUser.nexusBaseUrlTitle', 'Nexus 服务地址')"
      :description="nexusBaseUrlDescription"
      default-icon="i-carbon-network-4"
      active-icon="i-carbon-network-4"
    >
      <TxButton
        variant="flat"
        size="sm"
        data-testid="nexus-base-url-edit"
        @click="openNexusBaseUrlDialog"
      >
        {{ t('settingUser.nexusBaseUrlEdit', '修改') }}
      </TxButton>
    </TuffBlockSlot>
  </TuffGroupBlock>

  <CreditsSummaryBlock context="settings" />

  <TModal v-model="loginDialogVisible" :title="loginDialogTitle">
    <div class="login-dialog" data-testid="login-recovery-dialog">
      <div class="login-dialog__icon" :class="`is-${authLoadingState.loginStage}`">
        <span
          :class="
            authLoadingState.loginStage === 'failed'
              ? 'i-carbon-warning-filled'
              : authLoadingState.loginStage === 'success'
                ? 'i-carbon-checkmark-filled'
                : 'i-carbon-circle-dash animate-spin'
          "
        />
      </div>
      <p data-testid="login-recovery-description">{{ loginDialogDescription }}</p>
      <p
        v-if="loginManualHint"
        class="login-dialog__manual-hint"
        data-testid="login-recovery-manual-hint"
      >
        {{ loginManualHint }}
      </p>
    </div>
    <template #footer>
      <TxButton
        v-if="authLoadingState.loginAuthorizeUrl"
        variant="ghost"
        data-testid="login-recovery-copy-link"
        :data-copy-state="loginLinkCopyState"
        @click="copyLoginAuthorizeUrl"
      >
        {{ t('settingUser.copyLoginLink') }}
      </TxButton>
      <TxButton
        v-if="authLoadingState.loginUserCode"
        variant="ghost"
        data-testid="login-recovery-copy-code"
        :data-copy-state="loginCodeCopyState"
        @click="copyLoginUserCode"
      >
        {{ t('settingUser.copyLoginCode') }}
      </TxButton>
      <TxButton
        v-if="authLoadingState.loginStage === 'waiting'"
        variant="ghost"
        data-testid="login-recovery-reopen"
        @click="handleReopenLogin"
      >
        {{ t('settingUser.reopenLogin') }}
      </TxButton>
      <TxButton
        v-if="authLoadingState.loginStage === 'failed'"
        variant="flat"
        type="primary"
        data-testid="login-recovery-retry"
        @click="handleLogin"
      >
        {{ t('settingUser.retryLogin') }}
      </TxButton>
      <TxButton
        v-if="authLoadingState.isLoggingIn"
        variant="ghost"
        type="danger"
        data-testid="login-recovery-cancel"
        @click="handleCancelLogin"
      >
        {{ t('settingUser.cancelLogin') }}
      </TxButton>
      <TxButton v-else variant="ghost" @click="loginDialogVisible = false">
        {{ t('common.close') }}
      </TxButton>
    </template>
  </TModal>

  <TModal
    v-model="nexusBaseUrlDialogVisible"
    :title="t('settingUser.nexusBaseUrlTitle', 'Nexus 服务地址')"
  >
    <div class="nexus-endpoint">
      <TxInput
        v-model="nexusBaseUrlInput"
        class="nexus-endpoint__input"
        :disabled="nexusBaseUrlSaving"
        :placeholder="t('settingUser.nexusBaseUrlPlaceholder', 'https://tuff.tagzxia.com')"
      />
      <p class="nexus-endpoint__hint">
        {{
          t(
            'settingUser.nexusBaseUrlEnvHint',
            '构建期环境变量 TUFF_NEXUS_BASE_URL 优先级最高，存在时会覆盖此处设置。'
          )
        }}
      </p>
      <p v-if="nexusBaseUrlSource === 'stale'" class="nexus-endpoint__warning">
        {{
          t('settingUser.nexusBaseUrlStaleHint', '已保存的地址当前未生效，请重新保存或恢复默认。')
        }}
      </p>
    </div>
    <template #footer>
      <TxButton
        variant="ghost"
        :disabled="nexusBaseUrlSaving"
        @click="nexusBaseUrlDialogVisible = false"
      >
        {{ t('common.cancel') }}
      </TxButton>
      <TxButton
        variant="ghost"
        data-testid="nexus-base-url-reset"
        :disabled="nexusBaseUrlSaving"
        @click="submitNexusBaseUrl(null)"
      >
        {{ t('settingUser.nexusBaseUrlReset', '恢复默认') }}
      </TxButton>
      <TxButton
        variant="flat"
        type="primary"
        data-testid="nexus-base-url-save"
        :loading="nexusBaseUrlSaving"
        :disabled="nexusBaseUrlSaving"
        @click="submitNexusBaseUrl(nexusBaseUrlInput)"
      >
        {{ t('settingUser.nexusBaseUrlSave', '保存') }}
      </TxButton>
    </template>
  </TModal>

  <TModal v-model="profileEditorVisible" :title="t('userProfile.editTitle', 'Edit profile')">
    <UserProfileEditor :visible="profileEditorVisible" />
    <template #footer>
      <TxButton variant="ghost" @click="profileEditorVisible = false">
        {{ t('common.close') }}
      </TxButton>
    </template>
  </TModal>
</template>

<style scoped>
.user-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: color-mix(in srgb, var(--tx-color-success) 15%, transparent);
  color: var(--tx-color-success);
}

.user-tag + .user-tag {
  margin-left: 6px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--tx-color-primary-light-8);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-avatar-placeholder {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-color-primary);
  background: var(--tx-color-primary-light-8);
}

.user-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.login-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 8px 4px 12px;
  text-align: center;
  color: var(--tx-text-color-secondary);
}

.login-dialog__icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tx-color-primary);
  background: color-mix(in srgb, var(--tx-color-primary) 14%, transparent);
  font-size: 26px;
}

.login-dialog__icon.is-success {
  color: var(--tx-color-success);
  background: color-mix(in srgb, var(--tx-color-success) 14%, transparent);
}

.login-dialog__icon.is-failed {
  color: var(--tx-color-danger);
  background: color-mix(in srgb, var(--tx-color-danger) 14%, transparent);
}

.login-dialog__manual-hint {
  max-width: 420px;
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--tx-text-color-placeholder);
}

.nexus-endpoint {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.nexus-endpoint__input {
  width: 100%;
}

.nexus-endpoint__hint,
.nexus-endpoint__warning {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  color: var(--tx-text-color-placeholder);
}

.nexus-endpoint__warning {
  color: var(--tx-color-warning);
}
</style>
