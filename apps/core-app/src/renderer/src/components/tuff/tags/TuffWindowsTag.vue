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
  <TuffBlockTag :label="text" icon="i-simple-icons-windows" color="#0f6feb" size="sm" />
</template>
