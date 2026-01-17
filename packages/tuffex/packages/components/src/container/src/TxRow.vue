<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { hasWindow } from '../../../../utils/env'

defineOptions({ name: 'TxRow' })

const props = withDefaults(
  defineProps<{
    gutter?: Gutter
    align?: 'top' | 'middle' | 'bottom' | 'stretch'
    justify?: 'start' | 'end' | 'center' | 'space-around' | 'space-between' | 'space-evenly'
    wrap?: boolean
  }>(),
  {
    gutter: 0,
    align: 'stretch',
    justify: 'start',
    wrap: true,
  },
)

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

type Gutter = number | Partial<Record<Breakpoint, number>>

const width = ref<number>(hasWindow() ? window.innerWidth : 1024)

function getBp(w: number): Breakpoint {
  if (w < 640)
    return 'xs'
  if (w < 768)
    return 'sm'
  if (w < 1024)
    return 'md'
  if (w < 1280)
    return 'lg'
  return 'xl'
}

function resolveGutter(g: Gutter): number {
  if (typeof g === 'number')
    return Math.max(0, g)
  const bp = getBp(width.value)
  const v = g[bp] ?? g.md ?? g.sm ?? g.xs ?? 0
  return Math.max(0, Number(v))
}

function onResize() {
  if (!hasWindow())
    return
  width.value = window.innerWidth
}

onMounted(() => {
  if (hasWindow()) {
    window.addEventListener('resize', onResize, { passive: true })
  }
})

onBeforeUnmount(() => {
  if (hasWindow()) {
    window.removeEventListener('resize', onResize)
  }
})

const gutterPx = computed(() => resolveGutter(props.gutter as any))

const style = computed<Record<string, string>>(() => {
  const g = gutterPx.value
  return {
    '--tx-row-gutter': `${g}px`,
  }
})

const cls = computed(() => {
  const alignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
    stretch: 'stretch',
  }

  const justifyMap: Record<string, string> = {
    'start': 'flex-start',
    'end': 'flex-end',
    'center': 'center',
    'space-around': 'space-around',
    'space-between': 'space-between',
    'space-evenly': 'space-evenly',
  }

  return {
    align: alignMap[props.align] ?? 'stretch',
    justify: justifyMap[props.justify] ?? 'flex-start',
  }
})
</script>

<template>
  <div
    class="tx-row"
    :style="[style, { alignItems: cls.align, justifyContent: cls.justify, flexWrap: wrap ? 'wrap' : 'nowrap' }]"
  >
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-row {
  display: flex;
  width: 100%;
  min-width: 0;
  margin-left: calc(var(--tx-row-gutter, 0px) / -2);
  margin-right: calc(var(--tx-row-gutter, 0px) / -2);
}
</style>
