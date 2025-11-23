<script lang="ts" name="TuffLinuxTag" setup>
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
  const fallback = t('settings.platformTags.linuxOnly', 'Linux Only')
  return label || fallback || 'Linux Only'
})
</script>

<template>
  <TuffBlockTag
    :label="text"
    icon="i-simple-icons-linux"
    color="#24a148"
    size="sm"
  />
</template>
