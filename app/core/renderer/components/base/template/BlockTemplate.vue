<script name="BlockTemplate" setup lang="ts">
const props = defineProps({
  title: {
    type: String,
    default: 'BlockTemplate'
  }
})
</script>

<template>
  <div pb-6 mb-10 border-b-1 border-b-solid border-gray-500>
    <p font-bold>
      {{ title }}
    </p>
    <div px-6>
      <slot />
    </div>
  </div>
</template>