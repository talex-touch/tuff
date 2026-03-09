<script name="NumberTransformer" setup lang="ts">
const props = defineProps<{
  value: number
}>()

const dom = ref<HTMLElement>()
const num = ref(props.value)

async function transforming() {
  const el = dom.value
  if (!el)
    return num.value = props.value

  const displayDom = el.querySelector('span.display')! as HTMLElement
  const originDom = el.querySelector('span.origin')! as HTMLElement

  // 获得 displayDom 的宽度
  const width = originDom.scrollWidth
  const height = originDom.scrollHeight

  Object.assign(displayDom.style, {
    opacity: '0',
    transform: 'translateY(-30%)',
    transition: '0.25s',
  })

  Object.assign(originDom.style, {
    opacity: '0',
    transform: 'translateY(30%)',
    transition: '',
  })

  await sleep(200)

  el.style.width = `${width}px`
  el.style.height = `${height}px`

  await sleep(200)

  num.value = props.value

  Object.assign(originDom.style, {
    opacity: '1',
    transform: 'translateY(0%)',
    transition: '0.25s',
  })

  await sleep(200)

  Object.assign(displayDom.style, {
    opacity: '1',
    transform: 'translateY(0%)',
    transition: '',
  })

  originDom.style.opacity = '0'
}

watch(() => props.value, () => nextTick(transforming), { immediate: true })
</script>

<template>
  <p ref="dom" class="NumberTransformer transition-cubic">
    <span class="display">{{ num }}</span>
    <span class="origin">{{ props.value }}</span>
    <span class="real" op-0>{{ num }}</span>
  </p>
</template>

<style lang="scss" scoped>
.NumberTransformer {
  span.display,
  span.origin {
    position: absolute;
  }

  position: relative;
}
</style>
