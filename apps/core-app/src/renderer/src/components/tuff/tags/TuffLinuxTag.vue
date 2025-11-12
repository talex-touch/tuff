<script lang="ts" name="TuffLinuxTag" setup>
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
const text = computed(() => props.label || t('settings.platformTags.linuxOnly', 'Linux Only'))
</script>

<template>
  <TuffBlockTag
    :label="text"
    icon="i-simple-icons-linux"
    color="#24a148"
    size="sm"
  />
</template>
