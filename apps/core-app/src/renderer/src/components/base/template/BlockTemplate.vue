<script name="BlockTemplate" setup lang="ts">
const props = defineProps({
  title: {
    type: String,
    default: 'BlockTemplate'
  },
  style: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean
  }
})

provide(
  'disabled',
  computed(() => props.disabled)
)
</script>

<template>
  <div mb-4 pb-4 border-b-1 border-b-solid border-gray-300>
    <p my-2 font-bold>
      <slot name="title">
        {{ title }}
      </slot>
    </p>
    <div :style="style">
      <slot />
    </div>
  </div>
</template>
