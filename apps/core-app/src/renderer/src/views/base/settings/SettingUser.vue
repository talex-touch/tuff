<script setup lang="ts" name="SettingUser">
import { TxButton } from '@talex-touch/tuffex/button'
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
  setRuntimeServerMode
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
  runSyncBootstrap,
  authLoadingState
} = useAuth()
const { isLoggedIn, displayName, displayEmail, avatarUrl, displayInitial } = useUserIdentity()

const profileEditorVisible = ref(false)
const loginDialogVisible = ref(false)
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
</style>
