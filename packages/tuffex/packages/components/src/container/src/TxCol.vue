<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { hasWindow } from '../../../../utils/env'

defineOptions({ name: 'TxCol' })

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

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

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

function resolveSpan(): number {
  const order: Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl']
  const map: Record<Breakpoint, number | undefined> = {
    xs: props.xs,
    sm: props.sm,
    md: props.md,
    lg: props.lg,
    xl: props.xl,
  }

  // Cascade from the active breakpoint down to the nearest smaller declared one
  // so a column keeps its width as the viewport grows; only fall back to `span`
  // when no smaller breakpoint is set. Iterating (rather than indexing) keeps the
  // key typed as `Breakpoint` under the stricter `noUncheckedIndexedAccess` that
  // nexus compiles this source with.
  let v: number | undefined
  for (const key of order.slice(0, order.indexOf(getBp(width.value)) + 1).reverse()) {
    const candidate = map[key]
    if (candidate != null) {
      v = candidate
      break
    }
  }
  if (v == null)
    v = props.span

  const n = Number(v)
  if (!Number.isFinite(n))
    return 24
  return Math.min(24, Math.max(0, n))
}

const spanValue = computed(() => resolveSpan())

const style = computed<Record<string, string>>(() => {
  const gutter = 'var(--tx-row-gutter, 0px)'
  const span = spanValue.value
  const offset = Math.min(24, Math.max(0, Number(props.offset ?? 0)))

  const basis = `${(span / 24) * 100}%`
  const out: Record<string, string> = {
    paddingLeft: `calc(${gutter} / 2)`,
    paddingRight: `calc(${gutter} / 2)`,
    flex: `0 0 ${basis}`,
    maxWidth: basis,
    boxSizing: 'border-box',
  }

  if (offset)
    out.marginLeft = `${(offset / 24) * 100}%`

  return out
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
