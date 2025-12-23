<template>
  <div class="tx-timeline" :class="[`tx-timeline--${layout}`]">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { provide } from 'vue'
import type { TimelineLayout, TimelineContext } from './types'

interface Props {
  layout?: TimelineLayout
}

const props = withDefaults(defineProps<Props>(), {
  layout: 'vertical'
})

provide<TimelineContext>('timeline', {
  layout: props.layout
})
</script>

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
