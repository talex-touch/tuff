<script setup lang="ts">
import { hasWindow } from '../../../../utils/env'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

defineOptions({ name: 'TxCol' })

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    span?: number
    offset?: number
    xs?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
  }>(),
  {
    span: 24,
    offset: 0,
    xs: undefined,
    sm: undefined,
    md: undefined,
    lg: undefined,
    xl: undefined,
  },
)

const width = ref<number>(hasWindow() ? window.innerWidth : 1024)

function getBp(w: number): Breakpoint {
  if (w < 640) return 'xs'
  if (w < 768) return 'sm'
  if (w < 1024) return 'md'
  if (w < 1280) return 'lg'
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

function resolveSpan(): number {
  const bp = getBp(width.value)
  const map: Record<Breakpoint, number | undefined> = {
    xs: props.xs,
    sm: props.sm,
    md: props.md,
    lg: props.lg,
    xl: props.xl,
  }

  const v = map[bp] ?? props.span
  const n = Number(v)
  if (!Number.isFinite(n)) return 24
  return Math.min(24, Math.max(0, n))
}

const spanValue = computed(() => resolveSpan())

const style = computed<Record<string, string>>(() => {
  const gutter = 'var(--tx-row-gutter, 0px)'
  const span = spanValue.value
  const offset = Math.min(24, Math.max(0, Number(props.offset ?? 0)))

  const basis = `${(span / 24) * 100}%`
  const marginLeft = offset ? `${(offset / 24) * 100}%` : undefined

  return {
    paddingLeft: `calc(${gutter} / 2)`,
    paddingRight: `calc(${gutter} / 2)`,
    flex: `0 0 ${basis}`,
    maxWidth: basis,
    marginLeft,
    boxSizing: 'border-box',
  }
})
</script>

<template>
  <div class="tx-col" :style="style">
    <slot />
  </div>
</template>

<style scoped lang="scss">
.tx-col {
  min-width: 0;
}
</style>
