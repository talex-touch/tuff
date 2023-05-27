<script setup name="FormTemplate" lang="ts">
const props = defineProps({
  title: {
    type: String,
    default: 'FormTemplate'
  },
  description: {
    type: String,
    default: 'This is a form template.'
  }
});
</script>

<template>
  <div mx-10 my-5>
    <div border-b-1 border-b-solid border-gray-300>
      <slot name="Header">
        <p my-4 font-bold text-2xl>{{ title }}</p>
        <span text="base" op-75 font-normal>{{ description }}</span>
      </slot>
    </div>

    <slot name="Content">
      <p>Content</p>
    </slot>

  </div>
</template>

<style scoped lang="scss">

.FormTemplate-Container {
  position: relative;
  margin: 2% 10%;

  width: 80%;
  height: 96%;

  left: 0;
  top: 0;

  box-sizing: border-box;
}
</style>