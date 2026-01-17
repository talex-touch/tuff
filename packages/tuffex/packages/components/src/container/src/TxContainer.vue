<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'TxContainer' })

const props = withDefaults(
  defineProps<{
    fluid?: boolean
    responsive?: boolean
    maxWidth?: string
    padding?: PaddingPreset | number
    margin?: 'auto' | string | number
  }>(),
  {
    fluid: false,
    responsive: false,
    maxWidth: '1200px',
    padding: 'medium',
    margin: 'auto',
  },
)

type PaddingPreset = 'small' | 'medium' | 'large'

function paddingToPx(v: PaddingPreset | number): number {
  if (typeof v === 'number')
    return Math.max(0, v)
  if (v === 'small')
    return 12
  if (v === 'large')
    return 24
  return 16
}

function sizeToCss(v: any): string {
  if (typeof v === 'number')
    return `${v}px`
  return String(v)
}

const style = computed<Record<string, string>>(() => {
  const pad = paddingToPx(props.padding as any)
  const maxW = props.fluid ? 'none' : (props.maxWidth || '1200px')
  const margin = props.margin === 'auto' ? '0 auto' : `0 ${sizeToCss(props.margin)}`

  return {
    '--tx-container-padding': `${pad}px`,
    '--tx-container-max-width': maxW,
    margin,
  }
})
</script>

<template>
  <div class="tx-container" :class="{ 'is-fluid': fluid, 'is-responsive': responsive }" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-container {
  width: 100%;
  max-width: var(--tx-container-max-width, 1200px);
  padding-left: var(--tx-container-padding, 16px);
  padding-right: var(--tx-container-padding, 16px);
  box-sizing: border-box;
}

.tx-container.is-fluid {
  max-width: none;
}

.tx-container.is-responsive {
  max-width: 100%;
}

@media (min-width: 640px) {
  .tx-container.is-responsive {
    max-width: 640px;
  }
}

@media (min-width: 768px) {
  .tx-container.is-responsive {
    max-width: 768px;
  }
}

@media (min-width: 1024px) {
  .tx-container.is-responsive {
    max-width: 1024px;
  }
}

@media (min-width: 1280px) {
  .tx-container.is-responsive {
    max-width: 1280px;
  }
}
</style>
