<script setup lang="ts">
const props = defineProps<{
  text: string
}>()

const text = ref<HTMLElement>()
const transformedText = ref('') // computed(() => props.text.replace(/([A-Z])/g, ' $1').trim())

async function render() {
  if (!text.value || !transformedText.value) {
    // fallback
    transformedText.value = props.text
    return
  }

  const el = text.value

  Object.assign(el.style, {
    opacity: '0',
    filter: 'blur(5px)',
    transform: 'translateX(-100px)',
  })

  await sleep(200)

  transformedText.value = props.text

  el.style.transform = 'translateX(100px)'

  await sleep(200)

  Object.assign(el.style, {
    opacity: '1',
    filter: 'blur(0)',
    transform: 'translateX(0px)',
  })
}

watchEffect(() => {
  const _text = props.text

  nextTick(render)
})
</script>

<template>
  <span class="TextTransformer">
    <span ref="text" class="transition-cubic text" v-text="transformedText" />
  </span>
</template>

<style lang="scss" scoped>
.TextTransformer {
  display: flex;
}
</style>
