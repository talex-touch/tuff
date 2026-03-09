<script setup>
import html2canvas from 'html2canvas'
import abcjs from 'abcjs'
import 'abcjs/abcjs-audio.css'

const props = defineProps(['node'])

const loading = ref(false)
const innerRef = ref()

onMounted(() => {
  const innerDom = innerRef.value

  watchEffect(async () => {
    loading.value = true

    abcjs.renderAbc(innerDom, props.node.textContent, {
      afterParsing: () => loading.value = false,
      responsive: 'resize',
    })
  })
})

async function download() {
  loading.value = true

  const canvas = await html2canvas(innerRef.value)

  const url = canvas.toDataURL('image/png')

  const a = document.createElement('a')
  a.download = 'score.png'
  a.href = url
  a.click()

  a.remove()

  loading.value = false
}
</script>

<template>
  <div v-loader="loading" class="EditorAbc">
    <div class="EditorAbc-Inner">
      <div ref="innerRef" class="EditorAbc-Inner" />

      <div class="EditorAbc-TextWaterMark">
        ThisAI
      </div>

      <div class="EditorAbc-WaterMark">
        <img src="/logo.svg">
      </div>
    </div>

    <div class="EditorAbc-Toolbar transition-cubic fake-background">
      <div i-carbon:download @click="download" />
      <!-- <div i-carbon:reset @click="mm.fit()" /> -->
    </div>
  </div>
</template>

<style lang="scss">
.EditorAbc-TextWaterMark {
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

.EditorAbc-WaterMark {
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

.EditorAbc {
  &:hover {
    .EditorAbc-Toolbar {
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
    background-color: var(--el-fill-color);
  }

  &-Inner {
    div {
      cursor: auto;
    }

    position: relative;

    min-width: 20vw;
    min-height: 24vh;

    cursor: grab;
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
