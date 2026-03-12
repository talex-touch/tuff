<script lang="ts" setup>
import html2canvas from 'html2canvas'
import type { RenderResult } from 'mermaid'
import mermaid from 'mermaid'
import { DataUri, Graph, Shape } from '@antv/x6'
import { Scroller } from '@antv/x6-plugin-scroller'
import { Export } from '@antv/x6-plugin-export'

const props = defineProps(['node'])
const colorMode = useColorMode()
const diagram = ref<RenderResult>()
const id = ref(`mermaid-${randomStr(8)}`)

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })

function initGraph(innerDom: HTMLElement, color: 'light' | 'dark', watermark: boolean = true) {
  const graph = new Graph({
    container: innerDom,
    width: innerDom.clientWidth,
    height: innerDom.clientHeight,
    // grid: {
    //   size: 10,
    //   visible: true,
    // },
    panning: {
      enabled: true,
      eventTypes: ['leftMouseDown', 'rightMouseDown', 'mouseWheel'],
    },
    // scroller: {
    //   enabled: true,
    //   pannable: true,
    //   pageVisible: true,
    //   pageBreak: false,
    // },
    mousewheel: {
      enabled: true,
      modifiers: ['ctrl', 'meta'],
    },
    autoResize: true,
  })

  if (watermark) {
    graph.drawBackground({
      image: 'https://files.catbox.moe/erepvk.png',
      repeat: 'watermark',
      size: '32px',
      opacity: 0.05,
      color: color === 'dark' ? '#1a1a1a' : '#fff',
    })
  }
  // else {
  //   graph.drawBackground({
  //     image: 'https://files.catbox.moe/erepvk.png',
  //     repeat: 'watermark',
  //     size: '0',
  //     opacity: 0,
  //     color: color === 'dark' ? '#1a1a1a' : '#fff',
  //   })
  // }

  graph.use(
    new Scroller({
      enabled: true,
    }),
  )

  graph.use(new Export())

  return graph
}

function initRender(color: 'light' | 'dark') {
  return mermaid.render(id.value, `---\nconfig:\n  theme: ${color}\n  look: handDrawn\n---\n${props.node.textContent}`)
}

function postRender(graph: Graph, svgContent: string) {
  Shape.HTML.register({
    shape: 'mermaid-html',
    width: 780,
    height: 480,
    html() {
      const wrap = document.createElement('div')
      wrap.className = 'EditorCharts-InnerContentWrapper'
      wrap.style.width = '100%'
      wrap.style.height = '100%'
      // wrap.style.background = '#f0f0f0'
      wrap.style.display = 'flex'
      wrap.style.justifyContent = 'center'
      wrap.style.alignItems = 'center'

      wrap.innerHTML = svgContent

      return wrap
    },
  })

  graph.getNodes().forEach(node => node.dispose())

  graph.addNode({
    x: 0,
    y: 0,
    shape: 'mermaid-html',
  })
}

const error = ref('')
const loading = ref(false)
const innerRef = ref()
const graph = ref<Graph>()

async function render(innerDom: HTMLElement, svgContent: string, color: 'light' | 'dark', watermark: boolean = true) {
  loading.value = true

  const graph = initGraph(innerDom, color, watermark)

  try {
    // res.bindFunctions?.(innerDom)

    postRender(graph, svgContent)

    // graph.zoomToFit()
    graph.fitToContent()

    error.value = ''
  }
  catch (e: any) {
    error.value = e?.message || e

    console.error(e)
  }

  loading.value = false

  return graph
}

const previewDom = ref()
const downloadPreview = ref<{
  graph: Graph | null
  visible: boolean
  loading: boolean
  model: {
    watermark: string
    format: 'svg' | 'png'
    quality: number
    theme: 'light' | 'dark'
    name: string
  }
}>({
  graph: null,
  visible: false,
  loading: false,
  model: {
    watermark: 'true',
    format: 'png',
    quality: 1,
    theme: colorMode.value === 'light' ? 'light' : 'dark',
    name: 'picture',
  },
})

let timer: any
async function displayRender() {
  diagram.value = await initRender(colorMode.value === 'light' ? 'light' : 'dark')

  if (graph.value)
    graph.value.dispose()

  graph.value = await render(innerRef.value, diagram.value!.svg, colorMode.value === 'light' ? 'light' : 'dark')

  await sleep(200)

  graph.value.zoomToFit()

  await sleep(200)

  graph.value.fitToContent()
}

onMounted(() => {
  watchEffect(() => {
    const _ = [colorMode.value]

    loading.value = true
    clearTimeout(timer)

    timer = setTimeout(async () => {
      await displayRender()

      loading.value = false
    }, 2000)
  })
})

function convertImage(graph: any, type: 'png' | 'svg'): Promise<string> {
  return new Promise((resolve) => {
    if (type === 'png') {
      graph.toPNG(async (dataUrl: string) => {
        resolve(dataUrl)
      })
    }
    else if (type === 'svg') {
      graph.toSVG(async (dataUrl: string) => {
        resolve(dataUrl)
      })
    }
  })
}

async function download() {
  loading.value = true

  const model = downloadPreview.value.model

  let dataUrl = ''

  if (model.format === 'png') {
    if (model.quality === 10) {
      const canvas = await html2canvas(previewDom.value)

      dataUrl = canvas.toDataURL('image/png')
    }
    else {
      const graph = downloadPreview.value.graph!

      // graph.fitToContent()
      // graph.zoomToFit()
      // graph.centerContent()

      graph.exportPNG(model.name, {
        backgroundColor: model.theme === 'dark' ? '#1a1a1a' : '#fff',
        padding: 8,
      })

      await sleep(200)

      loading.value = false

      ElMessage({
        message: '下载成功！',
        type: 'success',
        plain: true,
      })

      downloadPreview.value.visible = false

      return
    }
  }
  else if (model.format === 'svg') {
    const graph = downloadPreview.value.graph!

    dataUrl = await convertImage(graph, 'svg')
  }

  const a = document.createElement('a')
  a.download = model.name
  a.href = dataUrl
  a.click()

  a.remove()

  ElMessage({
    message: '下载成功！',
    type: 'success',
    plain: true,
  })

  downloadPreview.value.visible = false

  loading.value = false
}

async function copy() {
  loading.value = true

  graph.value?.fitToContent()

  const canvas = await html2canvas(innerRef.value)

  const url = canvas.toDataURL('image/png')

  const blob = dataUrlToBlob(url)
  const ClipboardItem = window.ClipboardItem
  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob,
    }),
  ])

  loading.value = false
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta = '', data = ''] = dataUrl.split(',', 2)
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'application/octet-stream'
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

async function refreshPreview() {
  const el = previewDom.value
  if (!el)
    return

  if (downloadPreview.value.graph)
    downloadPreview.value.graph.dispose()

  downloadPreview.value.loading = true

  await sleep(500)

  const diagram = await initRender(downloadPreview.value.model.theme)

  downloadPreview.value.graph = await render(el, diagram.svg, downloadPreview.value.model.theme, downloadPreview.value.model.watermark === 'true')

  await sleep(500)

  downloadPreview.value.loading = false
}

watch(() => downloadPreview.value.visible, (val) => {
  if (!val)
    return

  nextTick(refreshPreview)
})

watch(() => [downloadPreview.value.model.theme, downloadPreview.value.model.watermark], refreshPreview)
const { width, height } = useWindowSize()
watch(() => [width, height], refreshPreview)
</script>

<template>
  <div v-loader="loading" class="EditorCharts">
    <div class="EditorCharts-Inner">
      <div ref="innerRef" class="EditorCharts-InnerContent" />

      <div class="EditorCharts-TextWaterMark">
        ThisAI
      </div>

      <div class="EditorCharts-WaterMark">
        <img src="/logo.svg">
      </div>

      <div class="EditorCharts-Badge">
        {{ diagram?.diagramType }}
      </div>
    </div>

    <div class="EditorCharts-Toolbar transition-cubic fake-background">
      <el-tooltip content="下载图片">
        <div i-carbon:download @click="downloadPreview.visible = true" />
      </el-tooltip>
      <el-tooltip content="复制图片">
        <div i-carbon:copy @click="copy" />
      </el-tooltip>
      <el-tooltip content="复制代码">
        <div v-copy="node.textContent" i-carbon:code />
      </el-tooltip>
    </div>

    <div :class="{ display: error }" class="transition-cubic EditorCharts-Error fake-background">
      <template v-if="error">
        <p v-if="error?.includes('SyntaxError')" class="text-red-500">
          渲染中
        </p>
        <p v-else>
          {{ error }}
        </p>
      </template>
    </div>

    <el-dialog v-model="downloadPreview.visible" center append-to-body title="下载图片">
      <div v-loader="loading" :class="{ darken: downloadPreview.model.theme === 'dark' }" class="MermaidDownloader">
        <div v-loader="downloadPreview.loading" class="MermaidDownloader-Preview">
          <div ref="previewDom" class="MermaidDownloader-Inner" />
        </div>
        <div class="MermaidDownloader-Property">
          <el-scrollbar>
            <p class="title">
              属性设置
            </p>

            <el-form label-position="top" label-width="auto" :model="downloadPreview.model">
              <el-form-item label="水印设置">
                <el-radio-group v-model="downloadPreview.model.watermark" aria-label="水印设置">
                  <el-radio-button value="true">
                    <span block style="height: 16px">标准水印</span>
                  </el-radio-button>
                  <!-- :disabled="!userStore.subscription.type" -->
                  <el-radio-button value="false">
                    <span block style="height: 16px" flex items-center>
                      无水印<span mx-1 style="--scale: 0.85" class="premium-normal">限免</span>
                    </span>
                  </el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="下载图片名">
                <el-input v-model="downloadPreview.model.name" />
              </el-form-item>

              <el-form-item label="输出格式">
                <el-select v-model="downloadPreview.model.format">
                  <el-option v-for="item in ['png', 'svg']" :key="item" :label="item" :value="item" />
                </el-select>
              </el-form-item>

              <el-form-item v-if="downloadPreview.model.format === 'png'" label="输出质量">
                <el-slider
                  v-model="downloadPreview.model.quality" :marks="{ 10: '默认', 20: '超清' }" :min="10" :max="20"
                  :step="10" show-stops mx-4 :show-tooltip="false"
                />
              </el-form-item>

              <br>

              <el-form-item label="输出风格">
                <el-radio-group v-model="downloadPreview.model.theme">
                  <!-- works when >=2.6.0, recommended ✔️ not work when <2.6.0 ❌ -->
                  <el-radio value="light">
                    明亮
                  </el-radio>
                  <el-radio value="dark">
                    暗黑
                  </el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>

            <el-button w-full style="bottom: 1rem;border-radius: 12px" type="primary" @click="download">
              立即下载
            </el-button>
          </el-scrollbar>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style lang="scss">
.MermaidDownloader {
  &-Preview {
    .MermaidDownloader-Inner {
      .darken & {
        background-color: #141414;
      }
      position: absolute;

      width: 100%;
      height: 100%;

      background-color: #fff;
    }
    position: relative;

    width: 70%;
    height: 100%;

    overflow: hidden;
    border-radius: 18px;
    border: 1px solid var(--el-border-color);
  }
  &-Property {
    p.title {
      font-size: 20px;
      font-weight: 600;
    }
    position: relative;
    padding: 1rem;

    width: 30%;

    border-radius: 18px;
    border: 1px solid var(--el-border-color);
  }
  display: flex;

  gap: 1rem;
  height: 50vh;
}

.EditorCharts-Error {
  &.display {
    opacity: 1;
    pointer-events: initial;
  }
  z-index: 2;
  position: absolute;
  display: flex;

  align-items: center;
  justify-content: center;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
  backdrop-filter: blur(18px) saturate(180%);
}

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

.EditorCharts-Badge {
  z-index: 0;
  position: absolute;
  padding: 0.25rem 0.5rem;

  width: max-content;

  top: 0;
  right: 0;

  font-size: 12px;

  border-radius: 0 8px 0 12px;
  background-color: var(--theme-color-light);
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

  &-Inner {
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    color: var(--el-text-color-primary);
  }

  &-Inner {
    &Content {
      position: absolute;
      display: flex;

      height: 100%;
      width: 100%;
      // min-height: 70vh;

      justify-content: center;
    }

    div {
      cursor: auto;
    }

    // height: auto;
    // min-width: 20vw;

    cursor: grab;
    overflow: hidden;
    border-radius: 12px;
  }

  position: relative;
  padding: 0.5rem;

  // width: auto;
  // height: auto;
  min-width: 20vw;
  // min-height: 50vh;
  max-width: 100%;

  overflow: hidden;
  border-radius: 12px;
  background-color: var(--el-fill-color);
  box-shadow: 0 0 8px 1px var(--theme-color-light);
}
</style>
