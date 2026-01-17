<script name="TouchMenu" lang="ts" setup>
import { sleep } from '@talex-touch/utils/common'
import { nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import { useRouter } from 'vue-router'

const pointer = ref<HTMLElement | null>(null)
const router = useRouter()
let removeGuard: (() => void) | undefined

provide<(el: HTMLElement) => void>('changePointer', (el: HTMLElement) => {
  nextTick(() => fixPointer(el))
})

function hidePointer(): void {
  const pointerEl = pointer.value
  if (!pointerEl) return

  pointerEl.style.transition = 'opacity .25s'
  pointerEl.style.opacity = '0'
}

async function fixPointer(targetEl: HTMLElement): Promise<void> {
  const pointerEl = pointer.value
  if (!pointerEl || !targetEl) return

  const pointerStyle = pointerEl.style

  const pointerRect = pointerEl.getBoundingClientRect()
  const nodeRect = targetEl.getBoundingClientRect()

  const parentEl = targetEl.parentElement
  const diffTop = parentEl ? -parentEl.offsetTop - nodeRect.height + 5 : -nodeRect.height + 5

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

    pointerStyle.top = `${nodeRect.top + nodeRect.height * 0.2 + diffTop}px`
    pointerStyle.height = `${nodeRect.height * 0.6}px`
  } else {
    pointerStyle.transform = `translate(0, -${nodeRect.height * 0.2}px)`
    pointerStyle.height = `${nodeRect.height * 0.8}px`

    await sleep(100)

    pointerStyle.transition = 'all 0'
    pointerStyle.opacity = '0'

    await sleep(100)
    pointerStyle.transform = ''
    pointerStyle.top = `${nodeRect.top + nodeRect.height * 0.2 + diffTop}px`

    await sleep(100)

    pointerStyle.transition = 'all .25s'
    pointerStyle.opacity = '1'

    await sleep(100)

    pointerStyle.height = `${nodeRect.height * 0.6}px`
  }
}

onMounted(() => {
  const setIndicator = () => {
    const dom = document.querySelector('.TouchMenuItem-Container.active')
    if (dom) {
      fixPointer(dom as HTMLElement)
    } else {
      hidePointer()
    }
  }

  // 立即执行一次
  setIndicator()

  // 延迟执行一次，确保DOM完全渲染
  setTimeout(setIndicator, 100)

  // 再次延迟执行，确保路由完全加载
  setTimeout(setIndicator, 500)

  removeGuard = router.afterEach(async () => {
    await nextTick()
    setIndicator()
  })
})

onBeforeUnmount(() => {
  removeGuard?.()
})
</script>

<template>
  <div flex-col w-full h-full box-border>
    <slot />
    <div
      ref="pointer"
      absolute
      left="-3.5px"
      w="5px"
      opacity-0
      transition=".25s"
      border-rounded
      class="bg-[color:var(--el-color-primary)]"
    />
  </div>
</template>

<style lang="scss"></style>
