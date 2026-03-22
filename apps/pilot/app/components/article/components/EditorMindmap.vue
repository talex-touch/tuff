<script setup lang="ts">
import type { MarkmapRenderer } from '~/components/article/renderers/markmap-renderer'
import { createMarkmapRenderer, reportMarkmapError } from '~/components/article/renderers/markmap-renderer'
import html2canvas from 'html2canvas'

const props = defineProps(['node'])

const loading = ref(false)
const fullscreen = ref(false)
const svgRef = ref<SVGSVGElement>()
const fullscreenSvg = ref<SVGSVGElement>()

let mainRenderer: MarkmapRenderer | null = null
let fullscreenRenderer: MarkmapRenderer | null = null

function resolveSource() {
  return String(props.node?.textContent || '')
}

async function ensureRenderer(target: SVGSVGElement | undefined, scope: 'main' | 'fullscreen') {
  if (!target) {
    return null
  }

  if (scope === 'main' && mainRenderer) {
    return mainRenderer
  }
  if (scope === 'fullscreen' && fullscreenRenderer) {
    return fullscreenRenderer
  }

  try {
    const renderer = await createMarkmapRenderer(target)
    if (scope === 'main') {
      mainRenderer = renderer
    }
    else {
      fullscreenRenderer = renderer
    }
    return renderer
  }
  catch (renderError) {
    reportMarkmapError('EditorMindmap', renderError)
    return null
  }
}

async function renderMain() {
  const renderer = await ensureRenderer(svgRef.value, 'main')
  if (!renderer) {
    return
  }

  try {
    renderer.update(resolveSource())
  }
  catch (renderError) {
    reportMarkmapError('EditorMindmap', renderError)
  }
}

async function renderFullscreen() {
  const renderer = await ensureRenderer(fullscreenSvg.value, 'fullscreen')
  if (!renderer) {
    return
  }

  try {
    renderer.update(resolveSource())
  }
  catch (renderError) {
    reportMarkmapError('EditorMindmap', renderError)
  }
}

function resetView() {
  mainRenderer?.resetZoom()
}

async function download() {
  loading.value = true

  mainRenderer?.fit()

  await sleep(500)

  const host = svgRef.value?.parentElement
  if (!host) {
    loading.value = false
    return
  }

  const canvas = await html2canvas(host)

  const url = canvas.toDataURL('image/png')

  const a = document.createElement('a')
  a.download = 'mindmap.png'
  a.href = url
  a.click()

  a.remove()

  loading.value = false
}

function toFullscreen() {
  fullscreen.value = true
}

onMounted(() => {
  void renderMain()

  watch(
    () => props.node?.textContent,
    () => {
      void renderMain()
      if (fullscreen.value) {
        void renderFullscreen()
      }
    },
  )
})

watch(fullscreen, (visible) => {
  if (!visible) {
    return
  }
  nextTick(() => {
    void renderFullscreen()
  })
})

onBeforeUnmount(() => {
  mainRenderer?.destroy()
  mainRenderer = null
  fullscreenRenderer?.destroy()
  fullscreenRenderer = null
})
</script>

<template>
  <div v-loader="loading" class="EditorMindMap">
    <div class="EditorMindMap-Inner">
      <svg ref="svgRef" class="EditorMindMap-Inner">
        <!-- Placeholder -->
      </svg>

      <div class="EditorMindMap-TextWaterMark">
        ThisAI
      </div>

      <div class="EditorMindMap-WaterMark">
        <img src="/logo.svg">
      </div>
    </div>

    <div class="EditorMindMap-Toolbar transition-cubic fake-background">
      <!-- TODO: 代码编辑 -->
      <div i-carbon:fit-to-screen @click="toFullscreen" />
      <div i-carbon:download @click="download" />
      <div i-carbon:reset @click="resetView" />
    </div>

    <DialogTouchDialog v-model="fullscreen">
      <template #Title>
        思维导图
      </template>
      <svg ref="fullscreenSvg" class="EditorMindMap-FullInner">
        <!-- Placeholder -->
      </svg>
    </DialogTouchDialog>
  </div>
</template>

<style lang="scss">
.EditorMindMap-FullInner {
  width: 60vw;
  height: 60vh;
}

.EditorMindMap-TextWaterMark {
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

.EditorMindMap-WaterMark {
  z-index: 1;
  position: absolute;

  width: 32px;
  height: 32px;

  left: 0.5rem;
  bottom: 0.5rem;

  opacity: 0.1;
  filter: invert(0.5);
  pointer-events: none;
}

.EditorMindMap {
  &:hover {
    .EditorMindMap-Toolbar {
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
    div {
      cursor: auto;
    }
    cursor: grab;
    background-color: var(--el-fill-color);
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
  position: relative;

  min-width: 20vw;
  min-height: 24vh;

  overflow: hidden;
  border-radius: 12px;
  box-shadow: 0 0 8px 1px var(--theme-color-light);
}
</style>
