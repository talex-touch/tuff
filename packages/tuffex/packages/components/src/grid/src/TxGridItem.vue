<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'TxGridItem' })

const props = withDefaults(
  defineProps<{
    colSpan?: number
    rowSpan?: number
    justifySelf?: string
    alignSelf?: string
  }>(),
  {
    colSpan: 1,
    rowSpan: 1,
    justifySelf: '',
    alignSelf: '',
  },
)

const style = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {
    gridColumn: `span ${Math.max(1, props.colSpan ?? 1)} / span ${Math.max(1, props.colSpan ?? 1)}`,
    gridRow: `span ${Math.max(1, props.rowSpan ?? 1)} / span ${Math.max(1, props.rowSpan ?? 1)}`,
  }

  if (props.justifySelf)
    out.justifySelf = props.justifySelf
  if (props.alignSelf)
    out.alignSelf = props.alignSelf

  return out
})
</script>

<template>
  <div class="tx-grid-item" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-grid-item {
  min-width: 0;
}
</style>
