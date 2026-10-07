<script setup lang="ts">
import type { MapGeoJson } from '@talex-touch/tuffex/charts'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxBubbleMap } from '@talex-touch/tuffex/charts'
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { computed } from 'vue'
import { useTypedFetch } from '~/utils/request'

export interface GeoPoint {
  id: string
  label: string
  latitude: number | null
  longitude: number | null
  value?: number
  color?: string
}

const props = withDefaults(defineProps<{
  points: GeoPoint[]
  height?: number
}>(), { height: 260 })

const emit = defineEmits<{
  'point-click': [point: GeoPoint]
}>()

const { t } = useI18n()
const validPoints = computed(() => props.points.filter(point =>
  Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
))
const worldUrl: string = '/geo/world-countries.geo.json'
const { data: world, error, refresh } = useTypedFetch<MapGeoJson | null>(worldUrl, { server: false, default: () => null })
const pointValue = (point: GeoPoint): number => Number.isFinite(point.value) ? Number(point.value) : 0
const pointColor = (point: GeoPoint): string => point.color || 'var(--tx-chart-categorical-1, #4290F0)'
</script>

<template>
  <div
    class="relative w-full overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.1]"
    :style="{ height: `${height}px` }"
  >
    <div v-if="!validPoints.length || error" class="h-full flex flex-col items-center justify-center">
      <TxEmptyState
        variant="no-data"
        size="small"
        :title="t(error ? 'common.error' : 'ui.geoMap.empty')"
        :description="error ? t('ui.geoMap.failed') : ''"
      />
      <TxButton v-if="error" size="sm" variant="bare" @click="refresh()">
        {{ t('common.retry') }}
      </TxButton>
    </div>
    <TxBubbleMap
      v-else-if="world"
      :geo-json="world"
      :data="validPoints"
      lng="longitude"
      lat="latitude"
      :value="pointValue"
      name="label"
      :height="height"
      :min-radius="6"
      :max-radius="22"
      :bubble-color="pointColor"
      :bubble-border-color="pointColor"
      :bubble-border-width="1"
      roam
      @bubble-click="emit('point-click', $event)"
    >
      <template #tooltip="{ row }">
        <strong>{{ row.label }}</strong>
        <span v-if="Number.isFinite(row.value)"> · {{ row.value }}</span>
      </template>
    </TxBubbleMap>
    <TxSkeleton v-else width="100%" :height="height" />
  </div>
</template>
