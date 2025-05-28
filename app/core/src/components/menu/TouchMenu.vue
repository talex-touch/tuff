<script name="TouchMenu" lang="ts" setup>
import { sleep } from '@talex-touch/utils/common';

const pointer = ref<HTMLElement>()

provide('changePointer', (el: HTMLElement) => {
  nextTick(() => fixPointer(el))
})

async function fixPointer(targetEl: HTMLElement) {
  const pointerEl = pointer.value
  if (!pointerEl || !targetEl)
    return

  const pointerStyle = pointerEl.style

  const pointerRect = pointerEl.getBoundingClientRect()
  const nodeRect = targetEl.getBoundingClientRect()

  const diffTop = -targetEl.parentElement!.offsetTop - nodeRect.height + 12

  if (nodeRect.top > pointerRect.top) {
    pointerStyle.height = `${nodeRect.height * 0.8}px`
    pointerStyle.transition = 'all 0'
    pointerStyle.opacity = '0'

    await sleep(100)

    pointerStyle.top = `${nodeRect.top + diffTop}px`

    await sleep(100)

    pointerStyle.transition = 'all .25s'
    pointerStyle.opacity = '1'

    await sleep(100)

    pointerStyle.top = `${nodeRect.top + (nodeRect.height * 0.2) + diffTop}px`
    pointerStyle.height = `${nodeRect.height * 0.6}px`
  }
  else {
    pointerStyle.transform = `translate(0, -${nodeRect.height * 0.2}px)`
    pointerStyle.height = `${nodeRect.height * 0.8}px`

    await sleep(100)

    pointerStyle.transition = 'all 0'
    pointerStyle.opacity = '0'

    await sleep(100)
    pointerStyle.transform = ''
    pointerStyle.top = `${nodeRect.top + (nodeRect.height * 0.2) + diffTop}px`

    await sleep(100)

    pointerStyle.transition = 'all .25s'
    pointerStyle.opacity = '1'

    await sleep(100)

    pointerStyle.height = `${nodeRect.height * 0.6}px`
  }
}

onMounted(() => {
  setTimeout(() => {
    const dom = document.querySelector('.TouchMenuItem-Container.active')

    if (dom) {
      fixPointer(dom)
    }
  }, 500)
})
</script>

<template>
  <div flex-col w-full h-full box-border>
    <slot />
    <div absolute left="-3.5px" w="5px" opacity-0 transition=".25s" border-rounded
      class="bg-[color:var(--el-color-primary)]" ref="pointer" />
  </div>
</template>

<style lang="scss"></style>