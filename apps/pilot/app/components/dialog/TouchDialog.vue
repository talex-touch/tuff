<script setup lang="ts">
import { ZINDEX_INJECTION_KEY, useZIndex } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
  loading?: boolean
  header?: boolean
  footer?: boolean
}>()

const emits = defineEmits(['update:modelValue'])

const indexManager = useZIndex()

const zIndex = ref(indexManager.nextZIndex())
const visible = useVModel(props, 'modelValue', emits)

watch(visible, (val) => {
  if (val) {
    nextTick(() => {
      zIndex.value = indexManager.nextZIndex()
    })
  }
})

const dialogOptions = reactive({
  forbidden: false,
})

async function handleClickOutside() {
  dialogOptions.forbidden = true

  await sleep(100)

  dialogOptions.forbidden = false
}

const dom = ref<HTMLElement>()

// 允许触控下拉Floater关闭页面
interface Options {
  thresholdDistance: number // 触发关闭的阈值距离
  elasticity: number // 弹性系数
  elasticityClose: number // 触发关闭的阈值力度
}

function listen(el: HTMLElement, options: Options) {
  const parentEl = el.parentElement! as HTMLElement
  const { thresholdDistance, elasticity, elasticityClose } = options

  const _options = {
    touch: false,
    lastY: -1,
    startY: -1,
  }

  function onTouchStart(e: TouchEvent) {
    // 如果触控点不止一个不触发
    if (e.touches.length !== 1)
      return

    const targetElement = e.composedPath()[0] as HTMLElement

    if (targetElement !== el) {
      const scrollbar = parentEl.querySelector('.el-scrollbar .el-scrollbar__wrap')
      const top = scrollbar?.scrollTop || 0

      if (top !== 0)
        return
    }

    e.stopPropagation()

    el.classList.add('active')

    _options.startY = _options.lastY = e.touches[0].clientY

    _options.touch = true

    parentEl.style.transition = 'none'
  }

  el.addEventListener('touchstart', onTouchStart)
  parentEl.addEventListener('touchstart', onTouchStart)

  parentEl.addEventListener('touchend', async (e) => {
    if (!_options.touch)
      return

    e.stopPropagation()

    _options.touch = false

    parentEl.style.transition = ''

    el.classList.remove('active')

    if (visible.value) {
      // 根据弹性系数计算回弹距离
      const diff = _options.lastY - _options.startY
      const elasticDistance = diff * elasticity

      // console.log("end", elasticDistance)

      if (elasticDistance > elasticityClose) {
        parentEl.style.transition = '0.25s'
        parentEl.style.transform = 'translateY(0) scaleY(1) translateY(1000px)'

        await sleep(200)

        visible.value = false

        parentEl.style.transform = ''
        parentEl.style.transition = ''
        return
      }

      parentEl.style.transition = '0.25s'
      parentEl.style.transform = `translateY(0) scaleY(1) translateY(-${elasticDistance}px)`

      setTimeout(async () => {
        parentEl.style.transform = `translateY(0) scaleY(1) translateY(0px)`

        await sleep(200)

        parentEl.style.transition = ''
      }, 200)
    }
  })

  const scaleRange = [1, 0.85]

  parentEl.addEventListener('touchmove', async (e) => {
    if (!_options.touch)
      return

    e.stopPropagation()

    const touch = e.touches[0]

    const { clientY } = touch
    // const diff = clientY - _options.lastY
    _options.lastY = clientY

    const totalDiff = clientY - _options.startY
    if (totalDiff < 0)
      return

    if (totalDiff >= thresholdDistance) {
      parentEl.style.transition = '0.25s'
      parentEl.style.transform = 'translateY(0) scaleY(1) translateY(1000px)'

      await sleep(200)

      visible.value = false

      parentEl.style.transform = ''
      parentEl.style.transition = ''

      return
    }

    // 将 0 - totalDiff 映射到 scaleRange
    const scale = (totalDiff / thresholdDistance) * (scaleRange[1] - scaleRange[0]) + scaleRange[0]

    visible.value = true
    parentEl.style.transform = `translateY(0) scaleY(${scale}) translateY(${totalDiff * (0.9 + elasticity)}px)`

    // console.log("totalDiff", totalDiff, scale)
  })
}

const _options: Options = {
  thresholdDistance: window.innerHeight * 0.8, // 设置阈值距离为100px
  elasticity: 0.15,
  elasticityClose: 20,
}

onMounted(() => {
  listen(dom.value!, _options)
})
</script>

<template>
  <teleport to="#teleports">
    <div
      :style="`z-index: ${zIndex}`" :class="{ visible, forbidden: dialogOptions.forbidden, loading }"
      class="TouchDialog transition-cubic" @click="handleClickOutside"
    >
      <div class="TouchDialog-Main Main" @click.stop="">
        <div class="TouchDialog-Close" @click="visible = false">
          <div i-carbon:close />
        </div>
        <div ref="dom" class="slider only-pe-display" />

        <slot name="Main">
          <div v-if="header" class="TouchDialog-Title">
            <slot name="Title" />
          </div>

          <el-scrollbar>
            <div class="TouchDialog-Content">
              <slot />
            </div>
          </el-scrollbar>

          <div v-if="footer" class="TouchDialog-Footer">
            <slot name="Footer" />
          </div>
        </slot>
      </div>

      <div class="TouchDialog-Main Loading" @click.stop="">
        <ChoreLogo class="Logo" />
        <span class="text">准备中...</span>
        <IconCircleLoader class="Loader" />
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.TouchDialog-Main.Loading {
  .loading & {
    .Logo {
      left: 10%;

      transition: 0.35s 0.5s;
    }

    .text {
      opacity: 1;

      transition: 0.5s 0.75s;
    }

    .Loader {
      opacity: 1;

      transform: scale(0.75);
      transition: 0.5s 0.75s;
    }

    transform: translate(-50%, -50%) scale(1);
  }

  .Loader {
    position: absolute;

    right: calc(10% - 12px);

    opacity: 0;
    transition: cubic-bezier(0.6, -0.28, 0.735, 0.045) 0.35s;
  }

  .Logo {
    position: absolute;

    top: 50%;
    left: 50%;

    transform: translate(-50%, -50%);
    transition: 0.25s;
  }

  .text {
    position: absolute;

    top: 50%;
    left: 50%;

    opacity: 0;
    transform: translate(-50%, -50%);
    transition: 0.25s;
  }

  transform: translate(-50%, -50%) scale(0);
  transition: cubic-bezier(0.6, -0.28, 0.735, 0.045) 0.25s;
}

.TouchDialog-Main {
  .el-scrollbar {
    width: 100%;
  }

  &.Main {
    .visible & {
      pointer-events: auto;
    }

    .loading & {
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(1.05);

      transition: 0.35s;
    }

    .TouchDialog-Title {
      padding: 1.5rem;
      display: flex;

      gap: 0.5rem;
      align-items: center;

      font-size: 20px;

      width: 100%;

      border-bottom: 1px solid var(--el-border-color);
    }

    .TouchDialog-Content {
      .mobile & {
        padding: 0.125rem;
      }

      padding: 1rem;
      display: flex;

      flex-direction: column;
      gap: 0.5rem;

      max-width: 100%;
      max-height: 80%;

      // overflow: hidden;
    }

    .TouchDialog-Footer {
      display: flex;
      padding: 1rem;

      width: 100%;

      justify-content: flex-end;

      border-top: 1px solid var(--el-border-color);
    }

    padding: 0 0.25rem;
    display: flex;

    flex-direction: column;

    max-height: 80%;

    opacity: 1;
    transition: 0.35s 0.25s;
    transform: translate(-50%, -50%) scale(1);
  }

  max-height: calc(100% - 48px);
  width: auto;
  min-width: max(280px, 10%);
  max-width: calc(100% - 48px);
  height: auto;

  display: flex;
  justify-content: center;
  align-items: center;

  min-height: 60px;
  position: absolute;
  contain: layout;

  top: 50%;
  left: 50%;

  box-sizing: border-box;
  transform: translate(-50%, -50%) scale(0);

  transition: 0.125s;
  border-radius: 16px;
  pointer-events: none;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);
}

.mobile .TouchDialog-Main.Main {
  padding-top: 2rem;
  padding-bottom: 1rem;

  top: unset;
  left: 0;
  bottom: 0;

  width: 100%;
  max-width: 100%;

  height: auto;
  max-height: 90%;

  border-radius: 36px 36px 0 0;
  transform: translateY(100%);
}

.mobile .visible .TouchDialog-Main.Main {
  transform: translateY(0);
}

.mobile .loading .TouchDialog-Main.Main {
  transform: translateY(100%);
}

.TouchDialog .slider {
  &:hover,
  &.active {
    opacity: 1;
    transform: scale(1.1, 1.05);
  }

  position: absolute;
  margin: 0 auto;

  top: 1rem;

  width: 100px;
  height: 8px;

  opacity: 0.5;
  border-radius: 12px;
  background-color: var(--el-border-color);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;
}

.TouchDialog {
  &.visible {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  &.forbidden {
    div.Main {
      box-shadow:
        var(--el-box-shadow),
        0 0 8px 1px var(--el-color-danger);

      transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.05s;
    }

    transform: scale(1.025);
  }

  position: absolute;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
  transform: scale(1.05);
  background-color: var(--el-overlay-color-lighter);
}

.TouchDialog-Close {
  .mobile & {
    display: none;
  }

  &:hover {
    color: var(--el-color-danger);
  }

  z-index: 10000;
  position: absolute;
  display: flex;

  top: 0;
  right: 0;

  width: 24px;
  height: 24px;

  cursor: pointer;

  align-items: center;
  justify-content: center;

  border-radius: 50%;
  transform: translate(50%, -50%);
  background-color: var(--el-bg-color);
}
</style>
