<script setup>
import html2canvas from 'html2canvas'
import * as echarts from 'echarts'

const props = defineProps(['node'])

let chart
const loading = ref(false)
const innerRef = ref()
const error = ref('')
const colorMode = useColorMode()

onMounted(() => {
  const innerDom = innerRef.value

  watchEffect(() => {
    chart?.dispose()

    if (colorMode.preference === 'dark')
      chart = echarts.init(innerDom, 'dark')
    else
      chart = echarts.init(innerDom)

    const node = props.node

    try {
      const obj = JSON.parse(node.textContent)

      nextTick(() => {
        chart.setOption({
          ...obj,
          backgroundColor: 'transparent',
        })
      })
    }
    catch (e) {
      error.value = e
    }
  })
})

async function download() {
  if (!chart)
    return

  loading.value = true

  const url = chart.getDataURL({
    type: 'png',
    pixelRatio: 2,
    backgroundColor: colorMode.preference === 'dark' ? '#212121' : '#fff',
  })

  const a = document.createElement('a')
  a.download = 'Charts.png'
  a.href = url
  a.click()

  a.remove()

  loading.value = false
}

useResizeObserver(innerRef, () => {
  chart?.resize({
    animation: {
      duration: 200,
    },
  })
})
</script>

<template>
  <div v-loader="loading" class="EditorCharts">
    <div class="EditorCharts-Inner">
      <div ref="innerRef" class="EditorCharts-Inner" />

      <div class="EditorCharts-TextWaterMark">
        ThisAI
      </div>

      <div class="EditorCharts-WaterMark">
        <img src="/logo.svg">
      </div>
    </div>

    <div class="EditorCharts-Toolbar transition-cubic fake-background">
      <div i-carbon:download @click="download" />
      <!-- <div i-carbon:reset @click="mm.fit()" /> -->
    </div>
  </div>
</template>

<style lang="scss">
.EditorCharts-TextWaterMark {
  z-index: 0;
  position: absolute;

  width: max-content;

  left: 50%;
  bottom: 50%;

  font-size: 8rem;
  font-weight: 600;
  letter-spacing: 1rem;
  transform: translate(-50%, 50%);

  opacity: 0.01;
  pointer-events: none;
}

.EditorCharts-WaterMark {
  z-index: 1;
  position: absolute;

  width: 32px;
  height: 32px;

  left: 0;
  bottom: 0;

  opacity: 0.1;
  filter: invert(0.5);
  pointer-events: none;
}

.EditorCharts {
  &:hover {
    .EditorCharts-Toolbar {
      opacity: 1;
    }
  }

  &-Toolbar {
    z-index: 1;
    position: absolute;
    display: flex;
    padding: 0.5rem 0.5rem;

    gap: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;

    opacity: 0;
    cursor: pointer;
    font-size: 12px;
    overflow: hidden;
    border-radius: 8px;
    --fake-color: var(--theme-color-light);
    backdrop-filter: blur(18px) saturate(180%);
  }

  &-Inner,
  svg {
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    color: var(--el-text-color-primary);
  }

  &-Inner {
    div {
      cursor: auto;
    }

    position: relative;

    min-width: 20vw;
    min-height: 24vh;

    cursor: grab;
    overflow: hidden;
    border-radius: 12px;
  }

  position: relative;
  padding: 0.5rem;

  min-width: 20vw;
  min-height: 24vh;

  overflow: hidden;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  box-shadow: 0 0 8px 1px var(--theme-color-light);
}
</style>
