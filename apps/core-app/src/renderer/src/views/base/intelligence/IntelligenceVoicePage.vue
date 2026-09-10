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
 * The heading is the page's, not the insight card's. It used to be two stacked headings — the
 * nav label, then the page's own line, with a gap between them — which is a page introducing
 * itself twice. The nav label is now the eyebrow above the line that says what the page is for.
 *
 * Status rides the same row: it says nothing at all while dictation works, and a band that is
 * empty most of the time is a gap in the page that only makes sense on the days it is filled.
 */
const { t } = useI18n()
</script>

<template>
  <SettingsPage :eyebrow="t('settingsIntelligenceHub.voice')" :title="t('voiceInsights.headline')">
    <template #titleAside>
      <VoiceRecognitionStatus />
    </template>
    <VoiceInsights />
    <SettingSpeechRecognition />
  </SettingsPage>
</template>
