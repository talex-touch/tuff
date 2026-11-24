<script setup lang="ts" name="SettingBetaFeatures">
import { TxButton } from '@talex-touch/tuffex/button'
import {
  appSettingOriginData,
  DEFAULT_HERDR_CORE_SETTINGS,
  normalizeHerdrCoreSettings
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBetaTag from '~/components/tuff/tags/TuffBetaTag.vue'
import TuffBlockInput from '~/components/tuff/TuffBlockInput.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { useHerdrRuntime } from '~/modules/herdr/useHerdrRuntime'
import { appSetting } from '~/modules/storage/app-storage'
import { isBetaFeatureEnabled } from '../../../../../shared/beta-features'

const { t } = useI18n()
const herdr = useHerdrRuntime()

const reconnecting = ref(false)
const ensuringStarted = ref(false)

const browserWorkspaceEnabled = computed(() => isBetaFeatureEnabled(appSetting, 'browserWorkspace'))
const herdrRuntimeEnabled = computed(() => isBetaFeatureEnabled(appSetting, 'herdrRuntime'))

const herdrAutoStart = computed(() =>
  typeof appSetting.herdrCore?.autoStart === 'boolean'
    ? appSetting.herdrCore.autoStart
    : DEFAULT_HERDR_CORE_SETTINGS.autoStart
)

const herdrSocketPath = computed(() =>
  typeof appSetting.herdrCore?.socketPath === 'string'
    ? appSetting.herdrCore.socketPath
    : DEFAULT_HERDR_CORE_SETTINGS.socketPath
)

const herdrSession = computed(() =>
  typeof appSetting.herdrCore?.session === 'string'
    ? appSetting.herdrCore.session
    : DEFAULT_HERDR_CORE_SETTINGS.session
)

type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const connectionStatusMeta = computed<{ label: string; tone: StatusTone; icon: string }>(() => {
  const conn = herdr.connection.value
  const owner = herdr.ownership.value
  if (conn === 'connected') {
    if (owner === 'external') {
      return {
        label: t('settings.herdrCore.status.connectedExternal'),
        tone: 'success',
        icon: 'i-ri-checkbox-circle-line'
      }
    }
    if (owner === 'managed') {
      return {
        label: t('settings.herdrCore.status.connectedManaged'),
        tone: 'success',
        icon: 'i-ri-checkbox-circle-line'
      }
    }
    return {
      label: t('settings.herdrCore.status.connected'),
      tone: 'success',
      icon: 'i-ri-checkbox-circle-line'
    }
  }
  if (conn === 'fallback-pty') {
    return {
      label: t('settings.herdrCore.status.fallbackPty'),
      tone: 'warning',
      icon: 'i-ri-alert-line'
    }
  }
  if (conn === 'unavailable') {
    return {
      label: t('settings.herdrCore.status.unavailable'),
      tone: 'danger',
      icon: 'i-ri-error-warning-line'
    }
  }
  if (
    conn === 'discovering' ||
    conn === 'bootstrapping' ||
    conn === 'connecting' ||
    conn === 'handshaking' ||
    conn === 'reconnecting'
  ) {
    return {
      label: t('settings.herdrCore.status.connecting'),
      tone: 'info',
      icon: 'i-ri-loader-4-line'
    }
  }
  return {
    label: t('settings.herdrCore.status.disconnected'),
    tone: 'muted',
    icon: 'i-ri-plug-line'
  }
})

const connectionDescription = computed(() => {
  const snap = herdr.snapshot.value
  if (snap?.error) {
    return t('settings.herdrCore.connection.errorInfo', { error: snap.error })
  }
  if (snap?.connection === 'connected' && snap.socketPath) {
    return t('settings.herdrCore.connection.socketInfo', {
      session: snap.session || DEFAULT_HERDR_CORE_SETTINGS.session,
      socketPath: snap.socketPath
    })
  }
  return t('settings.herdrCore.connection.desc')
})

function ensureBetaFeaturesObject(): void {
  appSetting.betaFeatures ??= { ...appSettingOriginData.betaFeatures }
}

function ensureHerdrCoreObject(): void {
  appSetting.herdrCore ??= normalizeHerdrCoreSettings(appSetting.herdrCore)
}

function updateBrowserWorkspace(enabled: boolean): void {
  ensureBetaFeaturesObject()
  appSetting.betaFeatures.browserWorkspace = enabled
}

function updateHerdrRuntime(enabled: boolean): void {
  ensureBetaFeaturesObject()
  appSetting.betaFeatures.herdrRuntime = enabled
}

function updateHerdrAutoStart(enabled: boolean): void {
  ensureHerdrCoreObject()
  appSetting.herdrCore.autoStart = enabled
}

function updateHerdrSocketPath(value: string | number): void {
  ensureHerdrCoreObject()
  appSetting.herdrCore.socketPath = String(value)
}

function normalizeSocketPathOnBlur(): void {
  ensureHerdrCoreObject()
  appSetting.herdrCore.socketPath = appSetting.herdrCore.socketPath.trim()
}

function updateHerdrSession(value: string | number): void {
  ensureHerdrCoreObject()
  appSetting.herdrCore.session = String(value)
}

function normalizeSessionOnBlur(): void {
  ensureHerdrCoreObject()
  const trimmed = appSetting.herdrCore.session.trim()
  appSetting.herdrCore.session = trimmed || DEFAULT_HERDR_CORE_SETTINGS.session
}

async function handleReconnect(): Promise<void> {
  if (reconnecting.value || ensuringStarted.value) return
  reconnecting.value = true
  try {
    await herdr.reconnect()
  } catch {
    toast.error(t('terminal.failed'))
  } finally {
    reconnecting.value = false
  }
}

async function handleEnsureStarted(): Promise<void> {
  if (reconnecting.value || ensuringStarted.value) return
  ensuringStarted.value = true
  try {
    const normalized = normalizeHerdrCoreSettings(appSetting.herdrCore)
    await herdr.ensureStarted({
      forceBootstrap: true,
      socketPath: normalized.socketPath,
      session: normalized.session
    })
  } catch {
    toast.error(t('terminal.failed'))
  } finally {
    ensuringStarted.value = false
  }
}
</script>

<template>
  <div class="SettingBetaFeatures-Stack">
    <TuffGroupBlock
      :name="t('settings.betaFeatures.title')"
      :description="t('settings.betaFeatures.desc')"
      :collapsible="false"
    >
      <TuffBlockSwitch
        data-testid="beta-feature-browser-workspace"
        :model-value="browserWorkspaceEnabled"
        :title="t('settings.betaFeatures.browserWorkspace.title')"
        :description="t('settings.betaFeatures.browserWorkspace.desc')"
        @update:model-value="updateBrowserWorkspace"
      >
        <template #tags>
          <TuffBetaTag />
        </template>
      </TuffBlockSwitch>

      <TuffBlockSwitch
        data-testid="beta-feature-herdr-runtime"
        :model-value="herdrRuntimeEnabled"
        :title="t('settings.betaFeatures.herdrRuntime.title')"
        :description="t('settings.betaFeatures.herdrRuntime.desc')"
        @update:model-value="updateHerdrRuntime"
      >
        <template #tags>
          <TuffBetaTag />
        </template>
      </TuffBlockSwitch>
    </TuffGroupBlock>

    <TuffGroupBlock
      data-testid="herdr-core-settings-group"
      :name="t('settings.herdrCore.title')"
      :description="t('settings.herdrCore.desc')"
      :collapsible="false"
    >
      <TuffBlockSlot
        :title="t('settings.herdrCore.connection.title')"
        :description="connectionDescription"
        :disabled="!herdrRuntimeEnabled"
      >
        <template #tags>
          <span
            class="SettingHerdrCore-StatusPill"
            :class="`is-${connectionStatusMeta.tone}`"
            role="status"
            aria-live="polite"
            data-testid="herdr-connection-status"
          >
            <span
              class="SettingHerdrCore-StatusIcon"
              :class="connectionStatusMeta.icon"
              aria-hidden="true"
            />
            <span>{{ connectionStatusMeta.label }}</span>
          </span>
        </template>

        <div class="SettingHerdrCore-Actions">
          <TxButton
            size="sm"
            variant="ghost"
            :loading="reconnecting"
            :disabled="!herdrRuntimeEnabled || ensuringStarted"
            data-testid="herdr-reconnect-btn"
            @click="handleReconnect"
          >
            {{
              reconnecting
                ? t('settings.herdrCore.actions.reconnecting')
                : t('settings.herdrCore.actions.reconnect')
            }}
          </TxButton>

          <TxButton
            size="sm"
            variant="primary"
            :loading="ensuringStarted"
            :disabled="!herdrRuntimeEnabled || reconnecting"
            data-testid="herdr-ensure-started-btn"
            @click="handleEnsureStarted"
          >
            {{
              ensuringStarted
                ? t('settings.herdrCore.actions.starting')
                : t('settings.herdrCore.actions.ensureStarted')
            }}
          </TxButton>
        </div>
      </TuffBlockSlot>

      <TuffBlockSwitch
        data-testid="herdr-autostart-switch"
        :model-value="herdrAutoStart"
        :disabled="!herdrRuntimeEnabled"
        :title="t('settings.herdrCore.autoStart.title')"
        :description="t('settings.herdrCore.autoStart.desc')"
        @update:model-value="updateHerdrAutoStart"
      />

      <TuffBlockInput
        data-testid="herdr-socket-path-input"
        :model-value="herdrSocketPath"
        :disabled="!herdrRuntimeEnabled"
        :title="t('settings.herdrCore.socketPath.title')"
        :description="t('settings.herdrCore.socketPath.desc')"
        :placeholder="t('settings.herdrCore.socketPath.placeholder')"
        clearable
        @update:model-value="updateHerdrSocketPath"
        @blur="normalizeSocketPathOnBlur"
      />

      <TuffBlockInput
        data-testid="herdr-session-input"
        :model-value="herdrSession"
        :disabled="!herdrRuntimeEnabled"
        :title="t('settings.herdrCore.session.title')"
        :description="t('settings.herdrCore.session.desc')"
        :placeholder="t('settings.herdrCore.session.placeholder')"
        @update:model-value="updateHerdrSession"
        @blur="normalizeSessionOnBlur"
      />
    </TuffGroupBlock>
  </div>
</template>

<style lang="scss" scoped>
.SettingBetaFeatures-Stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.SettingHerdrCore-StatusPill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1;

  &.is-success {
    background: var(--tx-color-success-light-9);
    color: color-mix(in srgb, var(--tx-color-success) 45%, var(--tx-text-color-primary));
  }

  &.is-warning {
    background: var(--tx-color-warning-light-9);
    color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-text-color-primary));
  }

  &.is-danger {
    background: var(--tx-color-danger-light-9);
    color: color-mix(in srgb, var(--tx-color-danger) 55%, var(--tx-text-color-primary));
  }

  &.is-info {
    background: var(--tx-color-primary-light-9);
    color: color-mix(in srgb, var(--tx-color-primary) 50%, var(--tx-text-color-primary));
  }

  &.is-muted {
    background: var(--tx-fill-color);
    color: var(--tx-text-color-regular);
  }
}

.SettingHerdrCore-StatusIcon {
  display: inline-flex;
  flex-shrink: 0;
  font-size: 13px;
}

.SettingHerdrCore-Actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
