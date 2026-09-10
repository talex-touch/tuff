<script lang="ts" name="IntelligenceVoicePage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import VoiceInsights from '../VoiceInsights.vue'
import VoiceRecognitionStatus from '../settings/VoiceRecognitionStatus.vue'
import SettingSpeechRecognition from '../settings/SettingSpeechRecognition.vue'

/**
 * How much it has been used, then where to change it.
 *
 * The insight owns the page's header rather than the shell, because this header is a heading, the
 * date counting started, three actions and a status alert — more than a title row was built to
 * hold. Splitting it across two owners is what kept leaving a band of blank between the title and
 * the buttons, and it made the page name itself twice into the bargain.
 *
 * Settings go last: nobody arrives here to change one.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage>
    <VoiceInsights :eyebrow="t('settingsIntelligenceHub.voice')">
      <!-- Status rides the header row. It says nothing at all while dictation works. -->
      <template #status>
        <VoiceRecognitionStatus />
      </template>
    </VoiceInsights>
    <SettingSpeechRecognition />
  </SettingsPage>
</template>
