<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { hasWindow } from '../../../../utils/env'

defineOptions({ name: 'TxGrid' })

const props = withDefaults(
  defineProps<{
    cols?: number | Responsive<number>
    rows?: number
    gap?:
      | number
      | string
      | { row?: number | string, col?: number | string }
      | Responsive<number | string>
    minItemWidth?: string
    justify?: string
    align?: string
  }>(),
  {
    cols: 0,
    rows: 0,
    gap: 16,
    minItemWidth: '',
    justify: 'stretch',
    align: 'stretch',
  },
)
type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type Responsive<T> = Partial<Record<Breakpoint, T>>

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

function toCssSize(v: any): string {
  if (v == null)
    return ''
  if (typeof v === 'number')
    return `${v}px`
  return String(v)
}

function resolveResponsive<T>(v: Responsive<T>): T | undefined {
  const bp = getBp(width.value)
  return v[bp] ?? v.md ?? v.sm ?? v.xs ?? v.lg ?? v.xl
}

const resolvedCols = computed(() => {
  if (typeof props.cols === 'number')
    return props.cols
  if (props.cols && typeof props.cols === 'object') {
    const n = resolveResponsive<number>(props.cols as any)
    return Number.isFinite(n) ? Number(n) : 0
  }
  return 0
})

const resolvedGap = computed(() => {
  const gap = props.gap as any
  if (gap == null)
    return { row: '16px', col: '16px' }
  if (typeof gap === 'number' || typeof gap === 'string') {
    const s = toCssSize(gap)
    return { row: s, col: s }
  }

  if (typeof gap === 'object') {
    const hasRowCol = 'row' in gap || 'col' in gap
    if (hasRowCol) {
      return {
        row: toCssSize(gap.row ?? 16),
        col: toCssSize(gap.col ?? 16),
      }
    }

    const v = resolveResponsive<number | string>(gap as any)
    const s = toCssSize(v ?? 16)
    return { row: s, col: s }
  }

  const s = toCssSize(gap)
  return { row: s, col: s }
})

const style = computed<Record<string, string>>(() => {
  const rowGap = resolvedGap.value.row
  const colGap = resolvedGap.value.col

  let templateCols = ''
  if (props.minItemWidth) {
    templateCols = `repeat(auto-fit, minmax(${props.minItemWidth}, 1fr))`
  }
  else if ((resolvedCols.value ?? 0) > 0) {
    templateCols = `repeat(${resolvedCols.value}, minmax(0, 1fr))`
  }

  let templateRows = ''
  if ((props.rows ?? 0) > 0) {
    templateRows = `repeat(${props.rows}, minmax(0, 1fr))`
  }

  return {
    display: 'grid',
    gridTemplateColumns: templateCols,
    gridTemplateRows: templateRows,
    rowGap,
    columnGap: colGap,
    justifyItems: props.justify || 'stretch',
    alignItems: props.align || 'stretch',
  }
})
</script>

<template>
  <div class="tx-grid" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-grid {
  width: 100%;
  min-width: 0;
}
</style>
