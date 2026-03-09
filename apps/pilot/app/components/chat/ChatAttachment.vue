<script setup lang="ts">
import type { reduceEachTrailingCommentRange } from 'typescript'
import CalculatorResult from './attachments/CalculatorResult.vue'
import WeatherResult from './attachments/WeatherResult.vue'
import QuotaSearchResult from './attachments/QuotaSearchResult.vue'
import QuotaDateResult from './attachments/QuotaDateResult.vue'
import QuotaSearchImagesResult from './attachments/QuotaSearchImagesResult.vue'
import QuotaSearchVideosResult from './attachments/QuotaSearchVideosResult.vue'
import QuotaVeTool from './attachments/QuotaVeTool.vue'
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  block: IInnerItemMeta
}>()

const typeMapper: Record<string, {
  icon: string
  comp: Component
  query?: any
}> = {
  // weather_result: WeatherResult,
  // Calculator: CalculatorResult,
  // quota_search: QuotaSearchResult,
  // quota_search_images: QuotaSearchImagesResult,
  // quota_search_videos: QuotaSearchVideosResult,

  QuotaSearchAPI: {
    icon: 'i-carbon:search',
    comp: QuotaSearchResult,
  },
  QuotaSearchVideosAPI: {
    icon: 'i-carbon:search',
    comp: QuotaSearchResult,
    query: computed(() => `${props.block.data} 相关视频`),
  },
  QuotaDateAPI: {
    icon: 'i-carbon:time',
    comp: QuotaDateResult,
    query: computed(() => '获取时间'),
  },
}

const container = ref<HTMLElement>()
const curType = computed(() => typeMapper[props.block.name!])

async function handleSizable(expand: boolean) {
  const mainDom = container.value
  if (!mainDom) {
    // nextTick(() => handleSizable(expand))
    return
  }

  const collapseDom = mainDom.querySelector('.QueryCollapse')

  if (!collapseDom)
    return

  if (expand) {
    // const headerDom = collapseDom.querySelector('.QueryCollapse-Header')

    // 获得collapseDom最大宽度
    const prevWidth = mainDom.style.width
    mainDom.style.width = ''

    const maxWidth = mainDom.clientWidth
    const width = Math.min(collapseDom.clientWidth + 24, maxWidth)

    mainDom.style.width = prevWidth
    await sleep(1)
    // Transform code 2 minor task
    mainDom.style.width = `${width}px`
  }
  else {
    await sleep(1)
    const headerDom = collapseDom.querySelector('.QueryCollapse-Header')!

    mainDom.style.width = `${headerDom.clientWidth + 24}px`
  }
}

// const debounceHandleSizable = useDebounceFn(handleSizable, 200)

// lazy watch => block
watchEffect(() => {
  const block = props.block

  setTimeout(async () => {
    await handleSizable(!block.extra?.end)

    await sleep(500)

    await handleSizable(!block.extra?.end)
  })
})
const timeCost = computed(() => {
  const start = props.block.extra?.start || -1
  const end = props.block.extra?.end || -1

  if (start === -1 || end === -1)
    return ''

  return `Costs: ${((end - start) / 1000).toFixed(2)}s`
})
</script>

<template>
  <div ref="container" :class="{ done: block.extra?.end }" class="ChatAttachment">
    <template v-if="block?.name === 'Quota_VE_Tool'">
      <QuotaVeTool :block="block" @expand="handleSizable" />
    </template>
    <div v-else-if="curType" relative transition>
      <ChatQueryCollapse @expand="handleSizable">
        <template #Header>
          <div class="Tool-Header">
            <div class="Tool-Header-Icon">
              <div :class="curType.icon" />
            </div>
            <OtherTextShaving v-if="curType.query && !block.extra?.end" :text="curType.query" />
            <p v-else>
              {{ curType.query || block.data }}
            </p>
            <div class="Tool-Header-Status">
              <IconCircleLoader class="Loader" />
              <el-tooltip placement="top" :content="timeCost">
                <div class="_dot" />
              </el-tooltip>
            </div>
          </div>
        </template>

        <div class="Tool-Inner">
          <el-scrollbar>
            <component :is="curType.comp" :value="block.value" :data="block.data" />
          </el-scrollbar>
        </div>
      </ChatQueryCollapse>
    </div>
    <template v-else>
      <OtherTextShaving text="无法获取对应数据" />
      {{ block }}
    </template>
  </div>
</template>

<style lang="scss">
.Tool-Inner {
  position: relative;

  max-width: 100%;
  max-height: 100%;

  overflow: hidden;
}

.Tool-Header-Content {
  position: relative;

  max-width: 20vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.Tool-Header-Status {
  .done & {
    .Loader {
      transform: scale(0);
    }

    ._dot {
      opacity: 1;
    }
  }

  ._dot {
    position: absolute;

    top: 50%;
    left: 50%;

    width: 10px;
    height: 10px;

    opacity: 0;
    transition: 0.25s;
    border-radius: 50%;
    filter: brightness(90%);
    transform: translate(-50%, -50%);
    background-color: var(--el-color-success);
  }

  position: relative;
  display: flex;

  width: 40px;

  align-items: center;
}

.Tool-Header {
  .Loader {
    transition: 0.25s;
    transform: scale(0.75);
  }

  display: flex;

  gap: 0.5rem;
  align-items: center;
}

.ChatAttachment {
  position: relative;
  display: flex;

  align-items: center;

  margin: 0.25rem 0;
  // padding: 0.25rem 0.75rem;

  gap: 0.25rem;
  width: max-content;
  max-width: 100%;

  overflow: hidden;
  border-radius: 12px;
  --fake-opacity: 0.75;

  transition: 1s cubic-bezier(0.25, 0.8, 0.25, 1);
  // background-color: var(--el-bg-color-page);
}
</style>
