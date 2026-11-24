<script setup lang="ts" name="SettingBetaFeatures">
import type {
  HerdrBinaryInfo,
  HerdrBinarySource
} from '@talex-touch/utils/transport/sdk/domains/herdr'
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

const herdrBinaryPath = computed(() =>
  typeof appSetting.herdrCore?.binaryPath === 'string'
    ? appSetting.herdrCore.binaryPath
    : DEFAULT_HERDR_CORE_SETTINGS.binaryPath
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

const binaryInfo = computed<HerdrBinaryInfo | null>(() => herdr.snapshot.value?.binary ?? null)

const binarySource = computed<HerdrBinarySource | null>(() => binaryInfo.value?.source ?? null)

const binaryStatusMeta = computed<{ label: string; tone: StatusTone; icon: string }>(() => {
  switch (binarySource.value) {
    case 'custom':
      return {
        label: t('settings.herdrCore.binary.source.custom'),
        tone: 'info',
        icon: 'i-ri-settings-4-line'
      }
    case 'system':
      return {
        label: t('settings.herdrCore.binary.source.system'),
        tone: 'success',
        icon: 'i-ri-terminal-box-line'
      }
    case 'bundle':
      return {
        label: t('settings.herdrCore.binary.source.bundle'),
        tone: 'success',
        icon: 'i-ri-apps-2-line'
      }
    case 'packaged-resource':
      return {
        label: t('settings.herdrCore.binary.source.packagedResource'),
        tone: 'success',
        icon: 'i-ri-box-3-line'
      }
    case 'missing':
      return {
        label: t('settings.herdrCore.binary.source.missing'),
        tone: 'warning',
        icon: 'i-ri-information-line'
      }
    default:
      return {
        label: t('settings.herdrCore.binary.source.detecting'),
        tone: 'muted',
        icon: 'i-ri-search-line'
      }
  }
})

const binaryVersionLabel = computed(() => {
  const raw = binaryInfo.value?.version?.trim()
  if (!raw) return ''
  return raw.startsWith('v') ? raw : `v${raw}`
})

const resolvedBinaryPath = computed(
  () => binaryInfo.value?.path?.trim() || herdr.snapshot.value?.binaryPath?.trim() || ''
)

const isBinaryMissing = computed(() => binarySource.value === 'missing')

const binaryDescription = computed(() => {
  if (isBinaryMissing.value) {
    return t('settings.herdrCore.binary.missingSummary')
  }
  if (binaryInfo.value?.platform && binaryInfo.value?.arch) {
    return t('settings.herdrCore.binary.platformDesc', {
      platform: binaryInfo.value.platform,
      arch: binaryInfo.value.arch
    })
  }
  return t('settings.herdrCore.binary.desc')
})

const missingBinaryCommand = computed(
  () => binaryInfo.value?.installHint?.trim() || t('settings.herdrCore.binary.defaultInstallHint')
)

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

function updateHerdrBinaryPath(value: string | number): void {
  ensureHerdrCoreObject()
  appSetting.herdrCore.binaryPath = String(value)
}

function normalizeBinaryPathOnBlur(): void {
  ensureHerdrCoreObject()
  appSetting.herdrCore.binaryPath = appSetting.herdrCore.binaryPath.trim()
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
      session: normalized.session,
      binaryPath: normalized.binaryPath
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

      <TuffBlockSlot
        data-testid="herdr-binary-status-row"
        :title="t('settings.herdrCore.binary.title')"
        :description="binaryDescription"
        :disabled="!herdrRuntimeEnabled"
      >
        <template #tags>
          <span
            class="SettingHerdrCore-StatusPill"
            :class="`is-${binaryStatusMeta.tone}`"
            role="status"
            data-testid="herdr-binary-source-badge"
          >
            <span
              class="SettingHerdrCore-StatusIcon"
              :class="binaryStatusMeta.icon"
              aria-hidden="true"
            />
            <span>{{ binaryStatusMeta.label }}</span>
          </span>

          <span
            v-if="binaryVersionLabel"
            class="SettingHerdrCore-VersionChip"
            data-testid="herdr-binary-version"
          >
            {{ binaryVersionLabel }}
          </span>
        </template>

        <span
          v-if="resolvedBinaryPath"
          class="SettingHerdrCore-BinaryPath"
          :title="resolvedBinaryPath"
          data-testid="herdr-binary-path"
        >
          {{ resolvedBinaryPath }}
        </span>
      </TuffBlockSlot>

      <div
        v-if="isBinaryMissing && herdrRuntimeEnabled"
        class="SettingHerdrCore-InstallHint"
        role="status"
        aria-live="polite"
        data-testid="herdr-binary-missing-hint"
      >
        <span class="i-ri-information-line SettingHerdrCore-InstallHintIcon" aria-hidden="true" />
        <div class="SettingHerdrCore-InstallHintBody">
          <p class="SettingHerdrCore-InstallHintTitle">
            {{ t('settings.herdrCore.binary.missingHintTitle') }}
          </p>
          <p class="SettingHerdrCore-InstallHintDesc">
            {{ t('settings.herdrCore.binary.missingHintDesc') }}
          </p>
          <code class="SettingHerdrCore-InstallCode" data-testid="herdr-binary-install-cmd">{{
            missingBinaryCommand
          }}</code>
        </div>
      </div>

      <TuffBlockSwitch
        data-testid="herdr-autostart-switch"
        :model-value="herdrAutoStart"
        :disabled="!herdrRuntimeEnabled"
        :title="t('settings.herdrCore.autoStart.title')"
        :description="t('settings.herdrCore.autoStart.desc')"
        @update:model-value="updateHerdrAutoStart"
      />

      <TuffBlockInput
        data-testid="herdr-binary-path-input"
        :model-value="herdrBinaryPath"
        :disabled="!herdrRuntimeEnabled"
        :title="t('settings.herdrCore.binaryPath.title')"
        :description="t('settings.herdrCore.binaryPath.desc')"
        :placeholder="t('settings.herdrCore.binaryPath.placeholder')"
        clearable
        @update:model-value="updateHerdrBinaryPath"
        @blur="normalizeBinaryPathOnBlur"
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

.SettingHerdrCore-VersionChip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 7px;
  border-radius: 6px;
  background: var(--tx-fill-color);
  color: var(--tx-text-color-regular);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

.SettingHerdrCore-BinaryPath {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--tx-text-color-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  user-select: text;
}

.SettingHerdrCore-InstallHint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--tx-color-warning-light-9);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  color: color-mix(in srgb, var(--tx-color-warning) 45%, var(--tx-text-color-primary));
}

.SettingHerdrCore-InstallHintIcon {
  display: inline-flex;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 15px;
}

.SettingHerdrCore-InstallHintBody {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.SettingHerdrCore-InstallHintTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.SettingHerdrCore-InstallHintDesc {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 12px;
  line-height: 1.45;
  text-wrap: pretty;
}

.SettingHerdrCore-InstallCode {
  display: inline-block;
  align-self: flex-start;
  max-width: 100%;
  margin-top: 2px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: inset 0 0 0 1px var(--tx-border-color);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  overflow-x: auto;
  user-select: text;
}

.SettingHerdrCore-Actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
