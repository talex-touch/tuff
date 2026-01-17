<script setup lang="ts">
import type { TimelineContext, TimelineLayout } from './types'
import { provide } from 'vue'

interface Props {
  layout?: TimelineLayout
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'vertical',
})

provide<TimelineContext>('timeline', {
  layout: props.layout,
})
</script>

<template>
  <div class="tx-timeline" :class="[`tx-timeline--${layout}`]">
    <slot />
  </div>
</template>

<style scoped>
.tx-timeline {
  position: relative;
}

.tx-timeline--vertical {
  padding-left: 40px;
}

.tx-timeline--horizontal {
  display: flex;
  align-items: center;
  padding: 20px 0;
  overflow-x: auto;
}
</style>
