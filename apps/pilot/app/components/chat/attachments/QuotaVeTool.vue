<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import BingSearch from './ve-tool/BingSearch.vue'
import Calculator from './ve-tool/Calculator.vue'
import Data from './ve-tool/Data.vue'
import Flight from './ve-tool/Flight.vue'
import Imagable from './ve-tool/Imagable.vue'
import Job from './ve-tool/Job.vue'
import Music from './ve-tool/Music.vue'
import Weather from './ve-tool/Weather.vue'

const props = defineProps<{
  block: IInnerItemMeta
}>()
const emits = defineEmits<{
  (e: 'expand', expand: boolean): void
}>()

const data = computed(() => props.block.data ? JSON.parse(props.block.data) : {})
const value = computed(() => {
  if (props.block.value) {
    try {
      return JSON.parse(props.block.value)
    }
    catch {
      return {}
    }
  }

  return {}
})
const isEnd = computed(() => !!props.block.extra?.end)

const compMapper = reactive({
  'ts-ThisAI_StandardImagable-ThisAI_StandardImagable': {
    icon: 'i-carbon:image',
    comp: Imagable,
  },
  'ts-ThisAI_TurboImagable-ThisAI_TurboImagable': {
    icon: 'i-carbon:image',
    comp: Imagable,
  },
  'ts-ThisAI_TurboImagable_Person-ThisAI_TurboImagable_Person': {
    icon: 'i-carbon:image',
    comp: Imagable,
  },
  'biyingsousuo-bingWebSearch': {
    icon: 'i-carbon:search',
    comp: BingSearch,
    expandable: true,
    query: computed(() => data.value.arguments?.query || data.value.name),
  },
  'Wolfram_Alpha-calculate': {
    icon: 'i-carbon:calculation',
    comp: Calculator,
    expandable: true,
    query: computed(() => data.value.arguments?.input || data.value.name),
  },
  'AIledui-lyrics_to_song': {
    icon: 'i-carbon:music',
    comp: Music,
    expandable: true,
    query: computed(() => isEnd.value ? '已生成' : '生成中'),
  },
  'mojitianqi-DayWeather': {
    icon: 'i-carbon:cloud',
    comp: Weather,
    expandable: true,
    query: computed(() => ((data.value.arguments?.province || '') + (data.value.arguments?.city || '') + (data.value.arguments?.towns || '')) || data.value.name),
  },
  'feichangzhun-getRoute': {
    icon: 'i-carbon:plane',
    comp: Flight,
    expandable: true,
    query: computed(() => `${data.value.arguments.dep} ➜ ${data.value.arguments.arr}` || data.value.name),
  },
  'liepin-job_recommendation': {
    icon: 'i-carbon:recommend',
    comp: Job,
    expandable: true,
    query: computed(() => isEnd.value ? '已完成搜索' : '搜索中'),
  },
  'ts-ThisAI_Standard-ThisAI_Standard': {
    icon: 'i-carbon:unknown',
    comp: Data,
    expandable: true,
    query: computed(() => isEnd.value ? '已思考完成' : '思考中'),
  },
  'ts-CrossCheck_2-CrossCheck_2': {
    icon: 'i-carbon:unknown',
    comp: Data,
    expandable: true,
    query: computed(() => isEnd.value ? '命题求证完成' : '命题求证中'),
  },
})

const curItem = computed(() => {
  const compName: string = data.value.name

  if (!compName)
    return compMapper['ts-ThisAI_Standard-ThisAI_Standard']

  // console.log('comp', compName, props)
  if (!Object.keys(compMapper).includes(compName)) {
    console.log('comp', compName, props)

    return compMapper['ts-ThisAI_Standard-ThisAI_Standard']
  }

  return compMapper[compName]
})

const timeCost = computed(() => {
  const start = props.block.extra?.start || -1
  const end = props.block.extra?.end || -1

  if (start === -1 || end === -1)
    return 0

  return (end - start)
})
const timeCostText = computed(() => `耗时: ${(timeCost.value / 1000).toFixed(2)}s`)
</script>

<template>
  <div :class="{ 'done': block.extra?.end, 'fake-background': curItem?.expandable }" class="QuotaVeTool">
    <template v-if="curItem">
      <template v-if="curItem?.expandable">
        <ChatQueryCollapse @expand="emits('expand', $event)">
          <template #Header>
            <div class="Tool-Header">
              <div class="Tool-Header-Icon">
                <div :class="curItem.icon" />
              </div>
              <div class="Tool-Header-Content">
                <OtherTextShaving v-if="!block.extra?.end" :text="curItem.query" />
                <p v-else>
                  {{ curItem.query }}
                </p>
              </div>
              <div class="Tool-Header-Status">
                <IconCircleLoader class="Loader" />
                <el-tooltip placement="top" :content="timeCostText">
                  <div class="_dot" />
                </el-tooltip>
              </div>
            </div>
          </template>

          <div class="Tool-Inner">
            <el-scrollbar>
              <component :is="curItem.comp" :time-cost="timeCost" :is-end="isEnd" :data="data" :value="value" />
            </el-scrollbar>
          </div>
        </ChatQueryCollapse>
      </template>
      <template v-else>
        <component :is="curItem.comp" :time-cost="timeCost" :is-end="isEnd" :data="data" :value="value" />
      </template>
    </template>
    <template v-else>
      <OtherTextShaving text="无法获取对应数据" />
      {{ data }}
    </template>
  </div>
</template>

<style lang="scss" scoped>
.QuotaVeTool {
  position: relative;
  padding: 0.25rem 0.75rem;

  width: 100%;
  height: 100%;

  overflow: hidden;
  transition: 0.25s;
  border-radius: 12px;
}
</style>
