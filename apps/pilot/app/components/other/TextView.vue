<script setup lang="ts">
const props = defineProps<{
  text: string
}>()

const dom = ref()
const _text = ref('')

watch(
  () => props.text,
  (text) => {
    nextTick(async () => {
      if (!_text.value)
        return (_text.value = text)

      dom.value.style.filter = 'blur(5px)'
      dom.value.style.opacity = '0.75'

      await sleep(250)

      _text.value = text

      dom.value.style.filter = 'blur(0)'
      dom.value.style.opacity = '1'
    })
  },
  { immediate: true },
)
</script>

<template>
  <div ref="dom" class="TextView">
    <span class="display">{{ _text }}</span>
  </div>
</template>

<style style="scss">
.TextView {
  position: relative;
  overflow: hidden;

  transition: 0.25s;
}
</style>
