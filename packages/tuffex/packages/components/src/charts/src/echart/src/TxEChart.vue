<script setup lang="ts">
// Adapted from Cloudflare kumo (https://github.com/cloudflare/kumo), © Cloudflare, Inc.,
// MIT — packages/kumo/src/components/chart/EChart.tsx.
//
// The lifecycle is the same one kumo proved out: init into a measured box,
// apply the theme and then the caller's option, bind a fixed event set, resize
// with the container, dispose on unmount. The differences are Vue-shaped —
// the option is a prop instead of a render input, the theme is read from the
// tuffex chart tokens instead of an `isDarkMode` flag, and a host without
// `echarts` installed gets a visible note instead of a blank rectangle.

import type { ECharts } from 'echarts/core'
import type { EChartEmits, EChartEventParams, EChartProps } from './core/types'
import type { EChartsRuntime } from './core/loader'
import type { EChartMode, EChartThemeTokens } from './core/theme'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useAutoTheme } from '../../../../stream-markdown/src/use-auto-theme'
import { loadECharts } from './core/loader'
import { decorateChartOption } from './core/shared'
import { echartThemeOption, readEChartThemeTokens } from './core/theme'

defineOptions({ name: 'TxEChart' })

const props = withDefaults(defineProps<EChartProps>(), {
  height: 320,
  theme: 'auto',
  update: 'replace',
  ariaLabel: undefined,
  loading: false,
})

const emit = defineEmits<EChartEmits>()

const rootRef = ref<HTMLElement | null>(null)
const instance = shallowRef<ECharts | null>(null)
const tokens = ref<EChartThemeTokens | null>(null)
const missingRuntime = ref(false)

const mode = useAutoTheme(() => props.theme)
const heightStyle = computed(() => typeof props.height === 'number' ? `${props.height}px` : props.height)

const emitters: Record<string, (params: EChartEventParams) => void> = {
  click: params => emit('click', params),
  dblclick: params => emit('dblclick', params),
  mouseover: params => emit('mouseover', params),
  mouseout: params => emit('mouseout', params),
  legendselectchanged: params => emit('legendselectchanged', params),
  datazoom: params => emit('datazoom', params),
}

const bound = new Map<string, (...args: unknown[]) => void>()

/**
 * ECharts hands the handler one event object whose fields mirror
 * `EChartEventParams`; anything else carries no field this family exposes.
 */
function toEventParams(payload: unknown): EChartEventParams {
  return typeof payload === 'object' && payload !== null ? payload as EChartEventParams : {}
}
let observer: ResizeObserver | null = null

/**
 * A host without `echarts`, or one whose runtime cannot paint, gets the note
 * and a console line instead of an empty box. Called from the mount path only —
 * the loading promise is the one place a rejection is expected.
 */
function reportUnavailable(error: unknown): void {
  missingRuntime.value = true
  console.error('[tuffex/charts] TxEChart could not start the ECharts runtime. Install `echarts` in the host application.', error)
}

function applyOption(): void {
  const chart = instance.value
  if (!chart || !tokens.value)
    return

  chart.setOption(echartThemeOption(tokens.value), { notMerge: true })
  chart.setOption(decorateChartOption(props.option, tokens.value), {
    notMerge: false,
    lazyUpdate: true,
    ...(props.update === 'replace' ? { replaceMerge: ['series'] } : {}),
  })
}

function applyLoading(): void {
  const chart = instance.value
  const theme = tokens.value
  if (!chart || !theme)
    return
  if (props.loading)
    chart.showLoading('default', { text: '', color: theme.palette[0], maskColor: 'transparent', spinnerRadius: 9, lineWidth: 2 })
  else
    chart.hideLoading()
}

function bindEvents(): void {
  const chart = instance.value
  if (!chart)
    return
  for (const [name, emitter] of Object.entries(emitters)) {
    const handler = (...args: unknown[]) => emitter(toEventParams(args[0]))
    chart.on(name, handler)
    bound.set(name, handler)
  }
}

function unbindEvents(): void {
  const chart = instance.value
  if (!chart)
    return
  for (const [name, handler] of bound)
    chart.off(name, handler)
  bound.clear()
}

function resize(): void {
  instance.value?.resize()
}

function reapplyTheme(): void {
  tokens.value = readEChartThemeTokens(rootRef.value, mode.value as EChartMode)
  applyOption()
}

onMounted(async () => {
  let runtime: EChartsRuntime
  try {
    runtime = await loadECharts()
  }
  catch (error) {
    reportUnavailable(error)
    return
  }

  const el = rootRef.value
  if (!el)
    return

  try {
    tokens.value = readEChartThemeTokens(el, mode.value as EChartMode)
    const chart = runtime.init(el)
    instance.value = chart
    applyOption()
    bindEvents()
    emit('ready', chart)
  }
  catch (error) {
    reportUnavailable(error)
    return
  }

  if (typeof ResizeObserver !== 'undefined') {
    // The first observer callback fires for the initial layout, and resizing
    // there would cut the enter animation short.
    let initial = true
    observer = new ResizeObserver(() => {
      if (initial) {
        initial = false
        return
      }
      resize()
    })
    observer.observe(el)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  unbindEvents()
  instance.value?.dispose()
  instance.value = null
})

watch(() => props.option, applyOption)
watch(() => props.update, applyOption)
watch(mode, reapplyTheme)
watch(() => props.loading, applyLoading)

defineExpose({ instance, resize, redraw: applyOption })
</script>

<template>
  <div
    ref="rootRef"
    class="tx-echart"
    :style="{ height: heightStyle }"
    :role="ariaLabel ? 'img' : undefined"
    :aria-label="ariaLabel"
  >
    <p v-if="missingRuntime" class="tx-echart__note">
      ECharts is unavailable — install <code>echarts</code> in the host application.
    </p>
  </div>
</template>

<style lang="scss">
.tx-echart {
  position: relative;
  width: 100%;
  min-height: 0;

  &__note {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    margin: 0;
    font-size: 12px;
    color: var(--tx-chart-text-secondary, #9ca3af);
  }
}
</style>
