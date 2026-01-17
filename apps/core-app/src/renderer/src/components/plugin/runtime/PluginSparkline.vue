<script lang="ts" setup name="PluginSparkline">
import { computed } from 'vue'

interface Point {
  x: number
  y: number
}

const props = withDefaults(
  defineProps<{
    values: number[]
    width?: number
    height?: number
    stroke?: string
    strokeWidth?: number
    padding?: number
    showArea?: boolean
  }>(),
  {
    width: 120,
    height: 38,
    stroke: 'var(--el-color-primary)',
    strokeWidth: 2,
    padding: 4,
    showArea: true
  }
)

const gradientId = `plugin-sparkline-fill-${Math.random().toString(36).slice(2)}`

const normalized = computed(() => {
  const values = (props.values || []).filter((v) => Number.isFinite(v))
  const max = values.length ? Math.max(...values) : 1
  const min = values.length ? Math.min(...values) : 0
  const range = max - min
  return { values, min, max, range: range > 0 ? range : 1 }
})

const points = computed<Point[]>(() => {
  const { values, min, range } = normalized.value
  const w = Math.max(1, props.width)
  const h = Math.max(1, props.height)
  const pad = Math.max(0, props.padding)

  if (values.length === 0) {
    return [
      { x: pad, y: h / 2 },
      { x: w - pad, y: h / 2 }
    ]
  }

  if (values.length === 1) {
    const y = pad + (1 - (values[0] - min) / range) * (h - pad * 2)
    return [
      { x: pad, y },
      { x: w - pad, y }
    ]
  }

  const innerW = Math.max(1, w - pad * 2)
  const innerH = Math.max(1, h - pad * 2)
  const stepX = innerW / (values.length - 1)

  return values.map((v, idx) => {
    const x = pad + idx * stepX
    const y = pad + (1 - (v - min) / range) * innerH
    return { x, y }
  })
})

const polyline = computed(() => points.value.map((p) => `${p.x},${p.y}`).join(' '))

const areaPath = computed(() => {
  if (!props.showArea) return ''
  const pts = points.value
  if (pts.length < 2) return ''
  const h = Math.max(1, props.height)
  const pad = Math.max(0, props.padding)
  const start = `M ${pts[0].x} ${h - pad}`
  const line = pts.map((p) => `L ${p.x} ${p.y}`).join(' ')
  const end = `L ${pts[pts.length - 1].x} ${h - pad} Z`
  return `${start} ${line} ${end}`
})
</script>

<template>
  <svg
    class="PluginSparkline"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <linearGradient :id="gradientId" x1="0" y1="0" :x2="0" :y2="height">
        <stop offset="0%" :stop-color="stroke" stop-opacity="0.22" />
        <stop offset="100%" :stop-color="stroke" stop-opacity="0" />
      </linearGradient>
    </defs>

    <path v-if="areaPath" :d="areaPath" :fill="`url(#${gradientId})`" />

    <polyline
      :points="polyline"
      :stroke="stroke"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style lang="scss" scoped>
.PluginSparkline {
  display: block;
}
</style>
