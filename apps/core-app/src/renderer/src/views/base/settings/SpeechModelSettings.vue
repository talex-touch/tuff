<script setup lang="ts" name="SpeechModelSettings">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxTag } from '@talex-touch/tuffex/tag'
import {
  createVoiceSdk,
  type VoiceInstalledSpeechModel,
  type VoiceSpeechModelCatalog,
  type VoiceSpeechModelEntry,
  type VoiceSpeechModelInstallProgress
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'

/**
 * On-device speech models: what the cloud offers, and what this machine has.
 *
 * The two halves are read separately on purpose. "Installed" is a fact about local disk and
 * always answers; "installable" depends on a catalog that needs the network and a signed-in
 * account, and can fail on its own. Folding them into one state would make a failed catalog read
 * look like an empty catalog — the reader would conclude nothing is available, which is the one
 * conclusion that is not true.
 *
 * Install progress is polled rather than streamed: a bundle is tens to hundreds of megabytes, and
 * a percentage is the difference between waiting and wondering whether it is stuck.
 */

const { t } = useI18n()
const voiceSdk = createVoiceSdk(useTuffTransport())

const installed = ref<VoiceInstalledSpeechModel[]>([])
const catalog = ref<VoiceSpeechModelCatalog | null>(null)
const catalogError = ref<string | null>(null)
const catalogLoading = ref(true)
const busyKey = ref<string | null>(null)
const actionError = ref<string | null>(null)
const progress = ref<VoiceSpeechModelInstallProgress | null>(null)
let pollTimer: number | null = null
let disposed = false

function keyOf(id: string, version: string): string {
  return `${id}@${version}`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function progressPercent(value: VoiceSpeechModelInstallProgress | null): number | null {
  if (!value || !value.total) return null
  return Math.min(100, Math.round((value.received / value.total) * 100))
}

async function loadInstalled(): Promise<void> {
  try {
    installed.value = await voiceSdk.listInstalledSpeechModels()
  } catch {
    installed.value = []
  }
}

async function loadCatalog(): Promise<void> {
  catalogLoading.value = true
  try {
    catalog.value = await voiceSdk.getSpeechModelCatalog()
    catalogError.value = null
  } catch (error) {
    catalog.value = null
    catalogError.value = error instanceof Error ? error.message : String(error)
  } finally {
    catalogLoading.value = false
  }
}

function stopPolling(): void {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
  progress.value = null
}

function startPolling(): void {
  stopPolling()
  pollTimer = window.setInterval(() => {
    void voiceSdk
      .getSpeechModelProgress()
      .then((value) => {
        if (!disposed) progress.value = value
      })
      .catch(() => undefined)
  }, 700)
}

async function install(entry: VoiceSpeechModelEntry): Promise<void> {
  const key = keyOf(entry.id, entry.version)
  busyKey.value = key
  actionError.value = null
  startPolling()
  try {
    await voiceSdk.installSpeechModel({ id: entry.id, version: entry.version })
    await Promise.all([loadInstalled(), loadCatalog()])
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    stopPolling()
    busyKey.value = null
  }
}

async function uninstall(entry: VoiceSpeechModelEntry): Promise<void> {
  const key = keyOf(entry.id, entry.version)
  busyKey.value = key
  actionError.value = null
  try {
    await voiceSdk.uninstallSpeechModel({ id: entry.id, version: entry.version })
    await Promise.all([loadInstalled(), loadCatalog()])
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busyKey.value = null
  }
}

const recommendedKey = computed(() =>
  catalog.value?.recommended
    ? keyOf(catalog.value.recommended.id, catalog.value.recommended.version)
    : null
)

/**
 * Rows come from the catalog when it is readable, and from the local store when it is not: a user
 * whose network is down must still be able to see and remove what is installed.
 */
const rows = computed(() => {
  if (catalog.value) return catalog.value.models
  return installed.value.map<VoiceSpeechModelEntry>((model) => ({
    id: model.id,
    version: model.version,
    name: model.name,
    engine: model.engine,
    languages: [],
    bytes: model.bytes,
    installed: true,
    runnable: true,
    needsRuntime: null
  }))
})

const catalogNeedsAccount = computed(
  () => catalogError.value?.includes('SPEECH_CATALOG_AUTH_REQUIRED') === true
)

onMounted(() => {
  void loadInstalled()
  void loadCatalog()
})

onBeforeUnmount(() => {
  disposed = true
  stopPolling()
})
</script>

<template>
  <TuffGroupBlock
    class="SpeechModelSettings"
    :name="t('settingSpeechRecognition.models.title')"
    :description="t('settingSpeechRecognition.models.description')"
    default-icon="i-carbon-chip"
    active-icon="i-carbon-chip"
  >
    <TuffBlockSlot
      v-if="catalogLoading"
      :title="t('settingSpeechRecognition.models.loading')"
      default-icon="i-carbon-model"
      data-testid="speech-model-loading"
    />

    <TuffBlockSlot
      v-else-if="catalogError"
      :title="
        catalogNeedsAccount
          ? t('settingSpeechRecognition.models.signInRequired')
          : t('settingSpeechRecognition.models.catalogUnavailable')
      "
      default-icon="i-carbon-warning-alt"
      data-testid="speech-model-error"
    >
      <TxButton size="sm" variant="ghost" @click="loadCatalog">
        {{ t('settingSpeechRecognition.models.retry') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-for="entry in rows"
      :key="keyOf(entry.id, entry.version)"
      :title="entry.name"
      :description="`${formatBytes(entry.bytes)} · ${entry.engine} · ${entry.id}@${entry.version}`"
      default-icon="i-carbon-model"
      :data-testid="`speech-model-${entry.id}`"
    >
      <template #tags>
        <TxTag v-if="recommendedKey === keyOf(entry.id, entry.version)" size="sm" type="info">
          {{ t('settingSpeechRecognition.models.recommended') }}
        </TxTag>
        <TxTag v-if="entry.needsRuntime" size="sm" type="warning">
          {{ t('settingSpeechRecognition.models.needsRuntime', { engine: entry.needsRuntime }) }}
        </TxTag>
        <TxTag v-else-if="entry.installed" size="sm" type="success">
          {{ t('settingSpeechRecognition.models.installed') }}
        </TxTag>
      </template>
      <span
        v-if="progress && busyKey === keyOf(entry.id, entry.version)"
        class="SpeechModelSettings-Hint"
        :data-testid="`speech-model-progress-${entry.id}`"
      >
        {{
          progressPercent(progress) === null
            ? t('settingSpeechRecognition.models.installing')
            : t('settingSpeechRecognition.models.progress', {
                percent: progressPercent(progress),
                size: formatBytes(progress.total)
              })
        }}
      </span>
      <TxButton
        v-if="!entry.installed"
        size="sm"
        :disabled="busyKey !== null"
        :data-testid="`speech-model-install-${entry.id}`"
        @click="install(entry)"
      >
        {{ t('settingSpeechRecognition.models.install') }}
      </TxButton>
      <TxButton
        v-else
        size="sm"
        variant="ghost"
        :disabled="busyKey !== null"
        :data-testid="`speech-model-remove-${entry.id}`"
        @click="uninstall(entry)"
      >
        {{ t('settingSpeechRecognition.models.remove') }}
      </TxButton>
    </TuffBlockSlot>

    <TuffBlockSlot
      v-if="actionError"
      :title="t('settingSpeechRecognition.models.actionFailed', { reason: actionError })"
      default-icon="i-carbon-warning-alt"
      data-testid="speech-model-action-error"
    />
  </TuffGroupBlock>
</template>

<style scoped lang="scss">
.SpeechModelSettings {
  :deep(.TBlockSlot-Container) {
    height: auto;
    min-height: 56px;
    padding-block: 12px;
  }

  :deep(.TBlockSlot-Content) {
    height: auto;
  }

  :deep(.TBlockSlot-TitleRow h5) {
    margin: 0;
  }

  :deep(.TBlockSlot-Label > p) {
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  &-Hint {
    font-size: 12px;
    opacity: 0.7;
  }
}
</style>
