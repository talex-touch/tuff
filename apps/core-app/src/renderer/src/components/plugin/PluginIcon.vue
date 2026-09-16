<script lang="ts" name="PluginIcon" setup>
import type { ITuffIcon } from '@talex-touch/utils'
import { computed } from 'vue'
import { TxIcon as TuffIcon } from '@talex-touch/tuffex/icon'

const props = defineProps<{
  icon?: ITuffIcon | null
  alt?: string
  /**
   * Forwarded to `TxIcon`, where it lands on `font-size` - every box inside the icon is sized in
   * `em`. Without it the glyph falls back to the inherited body size and renders small inside
   * whatever fixed-size container the caller drew around it.
   */
  size?: number
}>()

const resolvedIcon = computed<ITuffIcon>(() => {
  return props.icon ?? { type: 'class', value: 'i-carbon-plug' }
})

const resolvedAlt = computed(() => props.alt || 'Plugin')
</script>

<template>
  <TuffIcon colorful :icon="resolvedIcon" :alt="resolvedAlt" :size="props.size" />
</template>
