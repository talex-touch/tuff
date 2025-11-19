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
const text = computed(() => props.label || t('settings.platformTags.beta', 'Beta'))
</script>

<template>
  <TuffBlockTag :label="text" icon="i-carbon-bee" color="#ff6f00" size="sm" />
</template>
