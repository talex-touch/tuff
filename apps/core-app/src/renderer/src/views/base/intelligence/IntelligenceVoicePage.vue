<script lang="ts" name="IntelligenceVoicePage" setup>
import { useI18n } from 'vue-i18n'
import SettingsPage from '~/components/settings/SettingsPage.vue'
import VoiceInsights from '../VoiceInsights.vue'
import VoiceRecognitionStatus from '../settings/VoiceRecognitionStatus.vue'
import SettingSpeechRecognition from '../settings/SettingSpeechRecognition.vue'

/**
 * Whether it works, then how much it has been used, then where to change it.
 *
 * The configuration card used to come first, so a page called 音频洞察 opened on plumbing and
 * pushed the insight below the fold. Status leads because it is the one thing that can stop the
 * rest of the page from meaning anything; settings go last because nobody arrives here to change
 * them.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsIntelligenceHub.voice')">
    <VoiceRecognitionStatus />
    <VoiceInsights />
    <SettingSpeechRecognition />
  </SettingsPage>
</template>
