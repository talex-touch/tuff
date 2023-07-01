<script name="BlockTemplate" setup lang="ts">
const props = defineProps({
  title: {
    type: String,
    default: 'BlockTemplate'
  },
  style: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <div pb-6 mb-10 border-b-1 border-b-solid border-gray-500>
    <p font-bold>
      {{ title }}
    </p>
    <div :style="style">
      <slot />
    </div>
  </div>
</template>