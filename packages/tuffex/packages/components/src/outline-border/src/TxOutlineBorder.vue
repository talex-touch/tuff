<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { OutlineBorderProps, OutlineClipShape, OutlineShape } from './types'
import { computed } from 'vue'

defineOptions({
  name: 'TxOutlineBorder',
})

const props = withDefaults(defineProps<OutlineBorderProps>(), {
  as: 'div',
  variant: 'ring-offset',
  shape: 'circle',
  borderRadius: undefined,
  borderWidth: '1px',
  borderColor: 'var(--tx-border-color)',
  borderStyle: 'solid',
  ringWidth: undefined,
  ringColor: undefined,
  offset: '2px',
  offsetBg: 'var(--tx-bg-color)',
  padding: 0,
  clipMode: 'overflow',
  clipShape: 'auto',
})

function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}

const resolvedRadius = computed(() => {
  if (props.borderRadius !== undefined)
    return toCssUnit(props.borderRadius)

  switch (props.shape) {
    case 'circle':
      return '9999px'
    case 'squircle':
      return '24%'
    case 'rect':
    default:
      return '12px'
  }
})

const resolvedRingWidth = computed(() => toCssUnit(props.ringWidth ?? props.borderWidth))
const resolvedRingColor = computed(() => props.ringColor ?? props.borderColor)

const resolvedOffset = computed(() => toCssUnit(props.offset))

const resolvedClipShape = computed<Exclude<OutlineClipShape, 'auto'>>(() => {
  if (props.clipShape !== 'auto')
    return props.clipShape

  return shapeToClipShape(props.shape)
})

function shapeToClipShape(shape: OutlineShape): Exclude<OutlineClipShape, 'auto'> {
  switch (shape) {
    case 'circle':
      return 'circle'
    case 'squircle':
      return 'squircle'
    case 'rect':
    default:
      return 'rounded'
  }
}

const boxShadow = computed(() => {
  const w = resolvedRingWidth.value
  const c = resolvedRingColor.value
  const o = resolvedOffset.value
  const obg = props.offsetBg

  switch (props.variant) {
    case 'ring':
      return `0 0 0 ${w} ${c}`
    case 'ring-inset':
      return `inset 0 0 0 ${w} ${c}`
    case 'ring-offset':
      return `0 0 0 ${o} ${obg}, 0 0 0 calc(${o} + ${w}) ${c}`
    default:
      return ''
  }
})

const rootStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {
    '--tx-outline-radius': resolvedRadius.value,
    '--tx-outline-padding': toCssUnit(props.padding),
  } as CSSProperties

  if (props.variant === 'border') {
    style.border = `${toCssUnit(props.borderWidth)} ${props.borderStyle} ${props.borderColor}`
  }
  else if (boxShadow.value) {
    style.boxShadow = boxShadow.value
  }

  return style
})

const clipStyle = computed<CSSProperties>(() => {
  const mode = props.clipMode
  if (mode === 'none')
    return {}

  const shape = resolvedClipShape.value
  const style: CSSProperties = {}

  if (mode === 'overflow') {
    style.borderRadius = 'var(--tx-outline-radius)'
    style.overflow = 'hidden'
    return style
  }

  if (mode === 'clipPath') {
    style.clipPath = resolveClipPath(shape)
    return style
  }

  if (mode === 'mask') {
    const svg = resolveMaskSvg(shape)
    if (!svg)
      return {}

    const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    style.WebkitMaskImage = `url("${url}")`
    style.maskImage = `url("${url}")`
    style.WebkitMaskRepeat = 'no-repeat'
    style.maskRepeat = 'no-repeat'
    style.WebkitMaskSize = '100% 100%'
    style.maskSize = '100% 100%'
    style.WebkitMaskPosition = 'center'
    style.maskPosition = 'center'
    return style
  }

  return {}
})

function resolveClipPath(shape: Exclude<OutlineClipShape, 'auto'>): string {
  if (shape === 'circle')
    return 'circle(50% at 50% 50%)'
  if (shape === 'hexagon')
    return 'polygon(50% 1%, 93% 25%, 93% 75%, 50% 99%, 7% 75%, 7% 25%)'
  return 'inset(0 round var(--tx-outline-radius))'
}

function resolveMaskSvg(shape: Exclude<OutlineClipShape, 'auto'>): string | null {
  if (shape === 'circle') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="black"/></svg>'
  }

  if (shape === 'hexagon') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50 1 93 25 93 75 50 99 7 75 7 25" fill="black"/></svg>'
  }

  if (shape === 'squircle') {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 0C16 0 0 16 0 50s16 50 50 50 50-16 50-50S84 0 50 0Z" fill="black"/></svg>'
  }

  return null
}
</script>

<template>
  <component
    :is="as"
    class="tx-outline-border"
    :style="rootStyle"
  >
    <span class="tx-outline-border__content" :style="clipStyle">
      <span class="tx-outline-border__inner">
        <slot />
      </span>
    </span>
  </component>
</template>

<style scoped>
.tx-outline-border {
  position: relative;
  display: inline-block;
  border-radius: var(--tx-outline-radius);
}

.tx-outline-border__content {
  display: block;
  border-radius: var(--tx-outline-radius);
}

.tx-outline-border__inner {
  display: block;
  padding: var(--tx-outline-padding);
}
</style>
