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
 * pushed the insight below the fold. Settings go last because nobody arrives here to change them.
 *
 * Status rides the title row rather than taking a band of its own: it says nothing at all while
 * dictation works, and a band that is empty most of the time is a gap in the page that only
 * makes sense on the days it is filled.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :title="t('settingsIntelligenceHub.voice')">
    <template #titleAside>
      <VoiceRecognitionStatus />
    </template>
    <VoiceInsights />
    <SettingSpeechRecognition />
  </SettingsPage>
</template>
