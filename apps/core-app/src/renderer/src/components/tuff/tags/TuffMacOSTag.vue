<script lang="ts" name="TuffMacOSTag" setup>
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
const text = computed(() => props.label || t('settings.platformTags.macOnly', 'macOS Only'))
</script>

<template>
  <TuffBlockTag
    :label="text"
    icon="i-simple-icons-apple"
    color="#0a84ff"
    size="sm"
  />
</template>
