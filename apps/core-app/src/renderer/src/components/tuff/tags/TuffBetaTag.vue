<script lang="ts" name="TuffBetaTag" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import TuffBlockTag from './TuffBlockTag.vue'

const props = withDefaults(
  defineProps<{
    label?: string
  }>(),
  {},
)

const { t } = useI18n()
const text = computed(() => {
  const label = props.label ?? ''
  const fallback = t('settings.platformTags.beta', 'Beta')
  return label || fallback || 'Beta'
})
</script>

<template>
  <TuffBlockTag :label="text" icon="i-carbon-bee" color="#ff6f00" size="sm" />
</template>
