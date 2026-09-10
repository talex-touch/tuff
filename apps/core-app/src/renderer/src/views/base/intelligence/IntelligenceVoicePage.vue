<script lang="ts" name="IntelligenceVoicePage" setup>
import { TxDrawer } from '@talex-touch/tuffex/drawer'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import VoiceInsights from '../VoiceInsights.vue'
import VoiceRecognitionStatus from '../settings/VoiceRecognitionStatus.vue'
import SettingSpeechRecognition from '../settings/SettingSpeechRecognition.vue'

/**
 * The page is the insight. Everything else is a drawer.
 *
 * A year of charts is what someone comes here for; the recognition settings underneath were a
 * screen's worth of controls that most visits scrolled straight past on the way to nothing. Behind
 * a drawer they cost nothing until asked for, and closing one puts the reader back where they
 * were instead of somewhere down a long page.
 */
const { t } = useI18n()
const settingsOpen = ref(false)
</script>

<template>
  <SettingsPage>
    <VoiceInsights
      :eyebrow="t('settingsIntelligenceHub.voice')"
      @open-settings="settingsOpen = true"
    >
      <!-- Status rides the header row. It says nothing at all while dictation works. -->
      <template #status>
        <VoiceRecognitionStatus />
      </template>
    </VoiceInsights>

    <TxDrawer
      v-model:visible="settingsOpen"
      :title="t('settingSpeechRecognition.title')"
      size="560px"
      data-testid="voice-settings-drawer"
    >
      <SettingSpeechRecognition />
    </TxDrawer>
  </SettingsPage>
</template>
