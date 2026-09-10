<script setup lang="ts" name="VoiceRecognitionStatus">
import { TxButton } from '@talex-touch/tuffex/button'
import {
  createVoiceSdk,
  type VoiceRecognitionStatus
} from '@talex-touch/utils/transport/sdk/domains/voice'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useTuffTransport } from '@talex-touch/utils/transport'

/**
 * Says nothing when dictation works, and interrupts when it does not.
 *
 * A working recogniser has nothing to tell anyone: this page is about how much has been
 * dictated, and a permanent "已就绪" line is a row of chrome the reader learns to skip — which is
 * exactly the row a real failure would then appear in. Rendering nothing keeps that position
 * free, so anything that does show up there is by definition a problem.
 *
 * Loading renders nothing for the same reason. There is no state between "fine" and "broken"
 * worth a placeholder, and a skeleton here would flash a warning-shaped box on every visit.
 */

const { t } = useI18n()
const router = useRouter()
const voiceSdk = createVoiceSdk(useTuffTransport())

const status = ref<VoiceRecognitionStatus | null>(null)
const loading = ref(true)
const loadFailed = ref(false)
let disposed = false

/**
 * A failed status read is not a failed recogniser.
 *
 * "We could not ask" and "it is not configured" send the user to different places, so the
 * unreadable case keeps its own sentence and offers a retry rather than a trip to Settings.
 */
const unreadable = computed(() => loadFailed.value)
const visible = computed(() => !loading.value && (unreadable.value || status.value?.ready !== true))

const message = computed(() => {
  if (unreadable.value) return t('settingSpeechRecognition.unavailable.description')
  switch (status.value?.reason) {
    case 'VOICE_ASR_NOT_CONFIGURED':
      return t('settingSpeechRecognition.asr.notConfigured')
    case 'VOICE_ASR_CREDENTIAL_UNAVAILABLE':
      return t('settingSpeechRecognition.reasons.credentialMissing')
    default:
      return t('settingSpeechRecognition.reasons.unavailable')
  }
})

const title = computed(() =>
  unreadable.value
    ? t('settingSpeechRecognition.unavailable.title')
    : t('settingSpeechRecognition.asr.notReady')
)

async function loadStatus(): Promise<void> {
  loading.value = true
  loadFailed.value = false
  try {
    const next = await voiceSdk.getRecognitionStatus()
    // Only ASR decides this. File transcription is not on this page, so an STT binding nobody
    // asked for must not raise an alert over a dictation setup that works.
    if (!disposed) status.value = next.asr
  } catch {
    if (!disposed) loadFailed.value = true
  } finally {
    if (!disposed) loading.value = false
  }
}

function openCapabilities(): void {
  void router.push('/setting/intelligence/capabilities')
}

onMounted(() => {
  void loadStatus()
})

onBeforeUnmount(() => {
  disposed = true
})
</script>

<template>
  <div v-if="visible" class="VoiceRecognitionStatus" data-testid="voice-status-alert" role="alert">
    <span class="VoiceRecognitionStatus-Icon i-carbon-warning-filled" aria-hidden="true" />
    <span class="VoiceRecognitionStatus-Title">{{ title }}</span>
    <!--
      Only when it adds something. "Could not read the status" needs no second sentence — the
      title says what happened and the button says what to do, and a line restating the title in
      between is the thing that made this pill too long to read at a glance.
    -->
    <span v-if="message" class="VoiceRecognitionStatus-Message">{{ message }}</span>
    <!--
      One button, and it does the thing the sentence names. An unreadable status is retried here;
      a missing binding is fixed where bindings live.
    -->
    <TxButton
      v-if="unreadable"
      size="small"
      variant="ghost"
      data-testid="voice-status-retry"
      @click="loadStatus"
    >
      {{ t('settingSpeechRecognition.refresh') }}
    </TxButton>
    <TxButton
      v-else
      size="small"
      variant="ghost"
      data-testid="voice-status-configure"
      @click="openCapabilities"
    >
      {{ t('settingSpeechRecognition.capabilities.action') }}
    </TxButton>
  </div>
</template>

<style scoped lang="scss">
/*
 * Danger, not warning. Dictation is the feature this page exists to report on; when it cannot
 * run, every number below is a record of something that has stopped happening.
 *
 * It lives in the page's title row, so it is one line — a stacked card up there would push the
 * heading around. The sentence is what gets dropped when the row runs out of width: the title
 * and the button are what the user needs, and the sentence only elaborates on the title.
 */
.VoiceRecognitionStatus {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 5px 6px 5px 12px;
  border: 1px solid var(--tx-color-danger-light-7, var(--tx-color-danger));
  border-radius: 999px;
  background: var(--tx-color-danger-light-9, var(--tx-fill-color-light));
  gap: 8px;
}

.VoiceRecognitionStatus-Icon {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--tx-color-danger);
}

.VoiceRecognitionStatus-Title {
  flex: none;
  color: var(--tx-text-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.VoiceRecognitionStatus-Message {
  overflow: hidden;
  min-width: 0;
  color: var(--tx-text-color-regular);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
