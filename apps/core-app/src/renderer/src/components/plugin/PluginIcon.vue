<script lang="ts" name="PluginIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { computed } from 'vue'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'

const props = defineProps<{
  icon?: ITuffIcon | null
  alt?: string
}>()

const resolvedIcon = computed<ITuffIcon>(() => {
  return props.icon ?? { type: 'class', value: 'i-carbon-plug' }
})

const resolvedAlt = computed(() => props.alt || 'Plugin')
</script>

<template>
  <TuffIcon colorful :icon="resolvedIcon" :alt="resolvedAlt" />
</template>
