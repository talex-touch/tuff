<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineAsyncComponent, onMounted, ref, shallowRef } from 'vue'
import { ClientOnly as NuxtClientOnly } from '#components'
import { galleryText } from '../gallery-text'
import ClientOnly from '../GallerySpecimenGate.vue'

const props = defineProps<{
  docPath: (slug: string) => string
  cellLabel: (en: string, zh: string) => string
  localeKey: 'en' | 'zh'
}>()

// Every chart specimen below sits inside `<ClientOnly>` and renders only on the client.
// Guarding the async loaders with `import.meta.server` ensures chart runtimes (ECharts,
// d3-geo, mini-world-geo) are never pulled into the Cloudflare Worker SSR bundle.
function clientAsync(loader: () => Promise<{ default: Component }>) {
  return defineAsyncComponent(() => {
    if (import.meta.server)
      return Promise.resolve({ render: () => null } as Component)
    return loader()
  })
}

const galleryAmicroSpecimen = shallowRef<Component | null>(null)
const GalleryChartLegend = clientAsync(() => import('../GalleryChartLegend.vue'))
const GalleryChoroplethMap = clientAsync(() => import('../GalleryChoroplethMap.vue'))
const GalleryCustomChart = clientAsync(() => import('../GalleryCustomChart.vue'))
const GalleryEChart = clientAsync(() => import('../GalleryEChart.vue'))
const GalleryLearningCurve = clientAsync(() => import('../GalleryLearningCurve.vue'))
const GallerySankeyChart = clientAsync(() => import('../GallerySankeyChart.vue'))
const GallerySparkChart = clientAsync(() => import('../GallerySparkChart.vue'))
const GalleryTimeseriesChart = clientAsync(() => import('../GalleryTimeseriesChart.vue'))

onMounted(() => {
  void import('../GalleryAmicroSpecimen.vue').then(({ default: component }) => {
    galleryAmicroSpecimen.value = component
  })
})

const text = computed(() => galleryText[props.localeKey])

const copy = computed(() => (props.localeKey === 'zh'
  ? {
      allocation: [
        { key: 'stable', label: '稳定版', percent: 56, description: '面向所有用户的默认通道' },
        { key: 'beta', label: '测试版', percent: 30, description: '提前体验新特性' },
        { key: 'snapshot', label: '快照版', percent: 14, description: '主分支的每夜构建' },
      ],
      confidence: [
        { value: 1, label: '低', tone: 'var(--tx-color-danger)' },
        { value: 2, label: '中', tone: 'var(--tx-color-warning)' },
        { value: 3, label: '高', tone: 'var(--tx-color-success)' },
      ],
    }
  : {
      allocation: [
        { key: 'stable', label: 'Stable', percent: 56, description: 'Default channel for everyone' },
        { key: 'beta', label: 'Beta', percent: 30, description: 'Early access to new features' },
        { key: 'snapshot', label: 'Snapshot', percent: 14, description: 'Nightly builds off main' },
      ],
      confidence: [
        { value: 1, label: 'Low', tone: 'var(--tx-color-danger)' },
        { value: 2, label: 'Mid', tone: 'var(--tx-color-warning)' },
        { value: 3, label: 'High', tone: 'var(--tx-color-success)' },
      ],
    }))

const CHART_CATEGORICAL_FALLBACKS = ['#4290F0', '#F5B647', '#E8649D', '#8D58EE', '#50C3B6', '#D37536']

function categoricalVar(index: number): string {
  const slot = ((index % CHART_CATEGORICAL_FALLBACKS.length) + CHART_CATEGORICAL_FALLBACKS.length) % CHART_CATEGORICAL_FALLBACKS.length
  return `var(--tx-chart-categorical-${slot + 1}, ${CHART_CATEGORICAL_FALLBACKS[slot]})`
}

const allocationKey = ref('stable')
</script>

<template>
  <div class="docs-gallery__grid">
    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('spark-chart')">
        {{ cellLabel('SparkChart', '迷你折线图') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GallerySparkChart />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('allocation-bar')">
        {{ cellLabel('AllocationBar', '占比条') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxAllocationBar v-model="allocationKey" :segments="copy.allocation" detail v-bind="text.allocationBar" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('signal-meter')">
        {{ cellLabel('SignalMeter', '信号量表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row docs-gallery__row--loose">
            <div v-for="level in copy.confidence" :key="level.value" class="docs-gallery__meter">
              <TxSignalMeter :value="level.value" :max="3" :tone="level.tone" :bar-height="16" :bar-width="5" :label="level.label" />
              <span class="docs-gallery__meter-text">{{ level.label }}</span>
            </div>
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('chart-colors')">
        {{ cellLabel('ChartColors', '图表配色') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <div class="docs-gallery__row">
            <span
              v-for="index in 6"
              :key="index"
              class="docs-gallery__swatch"
              :style="{ background: categoricalVar(index - 1) }"
            />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('charts')">
        {{ cellLabel('Charts', '图表基础') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryChartLegend />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('custom-chart')">
        {{ cellLabel('CustomChart', '自定义图表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryCustomChart />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('maps')">
        {{ cellLabel('Maps', '地图') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 204px">
        <ClientOnly>
          <GalleryChoroplethMap />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('sankey-chart')">
        {{ cellLabel('SankeyChart', '桑基图') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 198px; --docs-gallery-specimen-narrow: 216px">
        <ClientOnly>
          <GallerySankeyChart />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('timeseries-chart')">
        {{ cellLabel('TimeseriesChart', '时序图') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
        <ClientOnly>
          <GalleryTimeseriesChart />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('learning-curve')">
        {{ cellLabel('LearningCurve', '学习曲线') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 150px">
        <ClientOnly>
          <GalleryLearningCurve />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('mono-chart')">
        {{ cellLabel('MonoChart', '单色图表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 290px">
        <NuxtClientOnly>
          <ClientOnly>
          <component :is="galleryAmicroSpecimen" v-if="galleryAmicroSpecimen" kind="mono-chart" />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
          </ClientOnly>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </NuxtClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('diff-table')">
        {{ cellLabel('DiffTable', '差异表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose" style="--docs-gallery-specimen: 119px">
        <ClientOnly>
          <div class="docs-gallery__block">
            <TxDiffTable :columns="text.diffColumns" :rows="text.diffRows" play="auto" />
          </div>
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="docs-gallery__cell">
      <NuxtLink class="docs-gallery__label" :to="docPath('echart-charts')">
        {{ cellLabel('ECharts', 'ECharts 图表') }}
      </NuxtLink>
      <div class="docs-gallery__stage not-prose">
        <ClientOnly>
          <GalleryEChart />
          <template #fallback>
            <div class="docs-gallery__ph" />
          </template>
        </ClientOnly>
      </div>
    </section>
  </div>
</template>
