<script setup lang="ts" name="VoiceRecordDetails">
import type { VoiceRecognitionRecord } from '@talex-touch/utils/transport/sdk/domains/voice'
import { useI18n } from 'vue-i18n'

/**
 * One recognition record, opened out.
 *
 * Extracted because the log shows this in two places — inline under the table, and full size in
 * the flip dialog — and a second copy of a seven-field list is how the two drift apart.
 */
const props = defineProps<{ record: VoiceRecognitionRecord }>()

const { locale, t } = useI18n()

/** One fraction digit: 1.5 s is a reading, 1.504 s is a log line. */
const secondsFormatter = computed(
  () => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 })
)

/**
 * Seconds and milliseconds, not minutes.
 *
 * The page-level formatter rounds to minutes because it labels totals — a year of dictation, an
 * estimated saving. Applied to one recording it said "less than a minute" for a 45-second clip and
 * the same for its 1.5-second recognition pass, which is two different facts printed identically
 * and neither of them the number the reader came for.
 */
function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return '—'
  if (durationMs < 1_000) {
    return t('voiceInsights.units.milliseconds', { count: Math.round(durationMs) })
  }

  // Branch on the raw value, not on the rounded one: rounding first sends 59.5s through the
  // minutes branch and prints "1 min 0 s" for a clip that never reached a minute.
  if (durationMs < 60_000) {
    return t('voiceInsights.units.seconds', {
      count: secondsFormatter.value.format(durationMs / 1_000)
    })
  }

  // Past a minute the sub-second digit is noise, so the seconds are rounded once, here, and the
  // minutes are divided out of that same rounded number — which is why 59.6s cannot read
  // "0 min 60 s".
  const totalSeconds = Math.round(durationMs / 1_000)
  return t('voiceInsights.units.minutesSeconds', {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60
  })
}

function audioLabel(): string {
  const record = props.record
  if (!record.audioUrl) return t('voiceInsights.records.audioUnavailable')
  return t('voiceInsights.records.audioMeta', {
    duration: record.audioDurationMs ? formatDuration(record.audioDurationMs) : '—',
    bytes: record.audioBytes ?? 0
  })
}

function tokenLabel(): string {
  const record = props.record
  const total = record.totalTokens
  if (total !== undefined) return t('voiceInsights.records.tokensValue', { count: total })
  if (record.inputTokens !== undefined || record.outputTokens !== undefined) {
    return t('voiceInsights.records.tokensSplit', {
      input: record.inputTokens ?? 0,
      output: record.outputTokens ?? 0
    })
  }
  return t('voiceInsights.records.tokensUnavailable')
}
</script>

<template>
  <div class="VoiceRecordDetails">
    <audio
      v-if="record.audioUrl"
      controls
      preload="none"
      :src="record.audioUrl"
      :aria-label="t('voiceInsights.records.audioLabel')"
    />
    <p class="VoiceRecordDetails-AudioMeta">{{ audioLabel() }}</p>
    <dl>
      <div>
        <dt>{{ t('voiceInsights.records.rawText') }}</dt>
        <dd>{{ record.rawText || '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.finalText') }}</dt>
        <dd>{{ record.text || '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.duration') }}</dt>
        <dd>{{ record.audioDurationMs ? formatDuration(record.audioDurationMs) : '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.recognitionDuration') }}</dt>
        <dd>
          {{ record.recognitionDurationMs ? formatDuration(record.recognitionDurationMs) : '—' }}
        </dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.providerLatency') }}</dt>
        <dd>{{ record.providerLatencyMs ? formatDuration(record.providerLatencyMs) : '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.tokens') }}</dt>
        <dd>{{ tokenLabel() }}</dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.channel') }}</dt>
        <dd>{{ record.channel || record.providerId || '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('voiceInsights.records.source') }}</dt>
        <dd>{{ t(`voiceInsights.records.sourceValues.${record.source}`) }}</dd>
      </div>
      <div v-if="record.deliveryMethod">
        <dt>{{ t('voiceInsights.records.delivery') }}</dt>
        <dd>{{ t(`voiceInsights.records.deliveryValues.${record.deliveryMethod}`) }}</dd>
      </div>
      <div v-if="record.errorCode">
        <dt>{{ t('voiceInsights.records.error') }}</dt>
        <dd>{{ record.errorCode }}</dd>
      </div>
    </dl>
  </div>
</template>

<style scoped lang="scss">
.VoiceRecordDetails {
  display: grid;
  gap: var(--shell-space-3);

  audio {
    width: min(100%, 520px);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--shell-space-3) var(--shell-space-5);
    margin: 0;
  }

  dl > div {
    min-width: 0;
  }

  dt {
    color: var(--shell-text-muted);
    font-size: var(--shell-fs-caption);
  }

  dd {
    margin: var(--shell-space-1) 0 0;
    color: var(--shell-text-primary);
    font-size: var(--shell-fs-body);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
}

.VoiceRecordDetails-AudioMeta {
  margin: 0;
  color: var(--shell-text-muted);
  font-size: var(--shell-fs-caption);
}

@media (max-width: 680px) {
  .VoiceRecordDetails dl {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
