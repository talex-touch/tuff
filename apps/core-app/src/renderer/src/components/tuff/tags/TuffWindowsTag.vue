<script lang="ts" name="TuffWindowsTag" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockTag from './TuffBlockTag.vue'

const props = withDefaults(
  defineProps<{
    label?: string
  }>(),
  {}
)

const { t } = useI18n()
const text = computed(() => {
  const label = props.label ?? ''
  const fallback = t('settings.platformTags.windowsOnly', 'Windows Only')
  return label || fallback || 'Windows Only'
})
</script>

<template>
  <!--
    Neutral rather than the vendor colour: these sit next to permission status chips, where
    green/red/grey already carry meaning. A blue or green platform badge competed with that,
    and the glyph alone left the label reading "Only" with no noun.
  -->
  <TuffBlockTag :label="text" color="var(--tx-text-color-secondary)" size="sm" />
</template>
