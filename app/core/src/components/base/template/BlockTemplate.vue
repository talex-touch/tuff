<script name="BlockTemplate" setup lang="ts">
const props = defineProps({
  title: {
    type: String,
    default: "BlockTemplate",
  },
  style: {
    type: String,
    default: "",
  },
});
</script>

<template>
  <div pb-6 mb-10 border-b-1 border-b-solid border-gray-500>
    <p font-bold>
      <slot name="title">
        {{ title }}
      </slot>
    </p>
    <div :style="style">
      <slot />
    </div>
  </div>
</template>
