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
  <el-scrollbar>
    <div mx-10 my-6>

      <div pb-5 mb-10 border-b-1 border-b-solid border-gray-500>
        <slot name="Header">
          <p my-4 font-extrabold text-2xl>{{ title }}</p>
          <span text="base" op-75 font-normal>{{ description }}</span>
        </slot>
      </div>

      <slot>
        <p>Content</p>
      </slot>

    </div>
  </el-scrollbar>
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