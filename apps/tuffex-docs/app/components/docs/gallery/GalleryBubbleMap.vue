<script setup lang="ts">
import { TxBubbleMap } from '@talex-touch/tuffex/charts/src/maps'
import { computed, ref } from 'vue'
import { useWorldGeo } from './use-world-geo'

interface EdgeNode { id: string, city: string, lon: number, lat: number, requests: number }

const sites = [
  { id: 'sjc', lon: -121.89, lat: 37.34, requests: 9200 },
  { id: 'iad', lon: -77.49, lat: 39.04, requests: 12400 },
  { id: 'gru', lon: -46.63, lat: -23.55, requests: 4100 },
  { id: 'fra', lon: 8.68, lat: 50.11, requests: 10800 },
  { id: 'jnb', lon: 28.05, lat: -26.2, requests: 2100 },
  { id: 'sin', lon: 103.82, lat: 1.35, requests: 7800 },
  { id: 'nrt', lon: 139.69, lat: 35.69, requests: 8900 },
  { id: 'syd', lon: 151.21, lat: -33.87, requests: 3400 },
]

const worldGeo = useWorldGeo()
const selectedId = ref<string | null>(null)
const { locale } = useI18n()

const copy = computed(() => locale.value === 'zh'
  ? {
      cities: ['圣何塞', '阿什本', '圣保罗', '法兰克福', '约翰内斯堡', '新加坡', '东京', '悉尼'],
      unit: 'req/s',
      hint: '点击气泡查看边缘节点 · 拖拽平移缩放',
      selected: (city: string, value: number) => `${city} · ${value.toLocaleString('zh-CN')} req/s`,
      labels: {
        map: '全球边缘节点气泡地图',
        instructions: '拖拽或用方向键平移。双指捏合、按住 Control 或 Command 滚动，或按加号减号缩放。双击或按 0 复位。',
      },
    }
  : {
      cities: ['San Jose', 'Ashburn', 'São Paulo', 'Frankfurt', 'Johannesburg', 'Singapore', 'Tokyo', 'Sydney'],
      unit: 'req/s',
      hint: 'Click a bubble to inspect node · Drag to pan',
      selected: (city: string, value: number) => `${city} · ${value.toLocaleString('en-US')} req/s`,
      labels: { map: 'Global edge nodes bubble map' },
    })

const nodes = computed<EdgeNode[]>(() =>
  sites.map((site, index) => ({ city: copy.value.cities[index]!, ...site })),
)
const selected = computed<EdgeNode | null>(() =>
  selectedId.value ? nodes.value.find(node => node.id === selectedId.value) ?? null : null,
)
</script>

<template>
  <div class="docs-gallery__block">
    <TxBubbleMap
      :geo-json="worldGeo"
      :data="nodes"
      lng="lon"
      lat="lat"
      value="requests"
      name="city"
      :zoom="1.08"
      :height="192"
      :min-radius="5"
      :max-radius="15"
      bubble-color="var(--tx-chart-categorical-1, #4290f0)"
      bubble-border-color="var(--tx-bg-color, #ffffff)"
      :bubble-border-width="1"
      :value-format="(value: number) => `${value.toLocaleString(locale)} ${copy.unit}`"
      :labels="copy.labels"
      @bubble-click="selectedId = $event.id"
    />
    <p class="gallery-hint">
      {{ selected ? copy.selected(selected.city, selected.requests) : copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.gallery-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--docs-muted);
  text-align: center;
}
</style>
