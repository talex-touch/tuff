<script setup lang="ts">
import type { BuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { TxButton } from '@talex-touch/tuffex/button'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { isBuildVerificationStatus } from '@talex-touch/utils/transport/events/types'
import { computed, nextTick, onMounted, onScopeDispose, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useUpdateRuntime } from '~/modules/hooks/useUpdateRuntime'
import { useShellSidebar } from '~/modules/layout/useShellSidebar'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { createRendererLogger } from '~/utils/renderer-log'
import ShellNavItem from './ShellNavItem.vue'

const { t } = useI18n()
const router = useRouter()
const transport = useTuffTransport()
const { platform, isMac } = useRendererPlatform()
const { collapsed, toggle } = useShellSidebar()
const { lifecycleSnapshot, getUpdateStatus, installDownloadedUpdate } = useUpdateRuntime()
const updateNoticeLog = createRendererLogger('ShellUpdateNotice')
const dismissedAttemptId = ref<string | null>(null)
const installing = ref(false)
const noticeRoot = ref<HTMLElement | null>(null)
const verificationStatus = ref<BuildVerificationStatus | null>(null)
let disposeVerificationListener: (() => void) | undefined

const readyUpdate = computed(() => {
  const snapshot = lifecycleSnapshot.value
  return snapshot?.phase === 'ready' &&
    snapshot.attemptId &&
    snapshot.taskId &&
    snapshot.targetVersion
    ? snapshot
    : null
})
const expanded = computed(
  () => !collapsed.value && readyUpdate.value?.attemptId !== dismissedAttemptId.value
)
const canInstall = computed(() => {
  if (!isMac.value) return true
  const status = verificationStatus.value
  return Boolean(status?.isOfficialBuild && status.hasOfficialKey && !status.verificationFailed)
})
const description = computed(() => {
  if (isMac.value && !canInstall.value) {
    return t('update.ready_notice.review_conditions')
  }
  if (isMac.value) return t('update.ready_notice.restart_description')
  return t('update.ready_notice.installer_description')
})
const actionLabel = computed(() => {
  if (!canInstall.value) return t('update.ready_notice.view_update')
  if (isMac.value) return t('settings.settingUpdate.actions.restartMac')
  return platform.value === 'win32'
    ? t('settings.settingUpdate.actions.startWindowsInstaller')
    : t('settings.settingUpdate.actions.openLinuxPackage')
})

function showNotice(): void {
  dismissedAttemptId.value = null
  if (collapsed.value) toggle()
  void nextTick(() => noticeRoot.value?.querySelector<HTMLButtonElement>('button')?.focus())
}

function dismissNotice(): void {
  dismissedAttemptId.value = readyUpdate.value?.attemptId ?? null
  void nextTick(() => noticeRoot.value?.querySelector<HTMLButtonElement>('button')?.focus())
}

async function installUpdate(): Promise<void> {
  const snapshot = readyUpdate.value
  if (!snapshot?.taskId || installing.value) return
  if (!canInstall.value) {
    void router.push('/setting/update')
    return
  }

  installing.value = true
  try {
    await installDownloadedUpdate(snapshot.taskId)
  } finally {
    installing.value = false
  }
}

onMounted(() => {
  disposeVerificationListener = transport.on(AppEvents.build.statusUpdated, (status) => {
    if (isBuildVerificationStatus(status)) verificationStatus.value = status
  })
  void transport
    .send(AppEvents.build.getVerificationStatus)
    .then((status) => {
      if (!verificationStatus.value && isBuildVerificationStatus(status)) {
        verificationStatus.value = status
      }
    })
    .catch((error) => updateNoticeLog.warn('Failed to read update installation trust', error))
  void getUpdateStatus().catch((error) => {
    updateNoticeLog.warn('Failed to restore update readiness', error)
  })
})

onScopeDispose(() => disposeVerificationListener?.())
</script>

<template>
  <div v-if="readyUpdate" ref="noticeRoot" class="ShellUpdateNotice">
    <div v-if="expanded" class="ShellUpdateNotice-Expanded">
      <div class="ShellUpdateNotice-Text" role="status" aria-live="polite">
        <span class="ShellUpdateNotice-Title">{{ t('update.update_ready') }}</span>
        <p class="ShellUpdateNotice-Description">{{ description }}</p>
      </div>
      <div class="ShellUpdateNotice-Actions">
        <TxButton
          size="sm"
          variant="flat"
          type="primary"
          :loading="installing"
          :disabled="installing"
          @click="installUpdate"
        >
          {{ actionLabel }}
        </TxButton>
        <TxButton size="sm" variant="bare" :disabled="installing" @click="dismissNotice">
          {{ t('update.ready_notice.later') }}
        </TxButton>
      </div>
    </div>
    <ShellNavItem
      v-else
      icon="i-ri-refresh-line"
      :label="t('update.update_ready')"
      :active="false"
      @select="showNotice"
    />
  </div>
</template>

<style lang="scss" scoped>
.ShellUpdateNotice {
  flex: 0 0 auto;
  width: 100%;
  min-width: 0;
  -webkit-app-region: no-drag;
}

.ShellUpdateNotice-Expanded {
  padding: 10px var(--shell-row-pad-x);
  border-top: 1px solid var(--shell-border);
}

.ShellUpdateNotice-Title {
  color: var(--shell-text-primary);
  font-size: var(--shell-fs-body);
  font-weight: 500;
}

.ShellUpdateNotice-Description {
  margin: 4px 0 10px;
  color: var(--shell-text-regular);
  font-size: var(--shell-fs-body);
  line-height: 1.5;
  text-wrap: pretty;
}

.ShellUpdateNotice-Actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
