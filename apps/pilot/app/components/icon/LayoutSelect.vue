<!--
  - Copyright (c) 2022. TalexDreamSoul
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  -     http://www.apache.org/licenses/LICENSE-2.0
  -
  - Unless required by applicable law or agreed to in writing, software
  - distributed under the License is distributed on an "AS IS" BASIS,
  - WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - See the License for the specific language governing permissions and
  - limitations under the License.
  -->

<template>
  <div @click="model = model === 0 ? 1 : 0" :class="{ 'list-layout': model === 0 }" class="LayoutSelect-Container">
    <div class="layout-block" v-for="i in 3" :key="i" />
  </div>
</template>

<script>
export default {
  name: "LayoutSelect"
}
</script>

<script setup>
import { ref } from 'vue'
import { useModelWrapper } from '@plugins/Common'

const props = defineProps(['modelValue'])
const emits = defineEmits(['update:modelValue'])

const model = useModelWrapper(props, emits)
// const layout = ref(0)

// function changeLayout() {
//   emits('change-layout', layout.value = layout.value === 0 ? 1 : 0)
// }
</script>

<style lang="scss" scoped>
.LayoutSelect-Container {
  position: relative;
  margin: 0 4px;
  display: inline-flex;
  flex-direction: column;
  justify-content: space-between;
  //align-items: center;

  width: 24px;
  height: 24px;

  cursor: pointer;

  &:hover .layout-block {
    --layout-select-color: var(--el-text-color-secondary);
  }

  .layout-block {
    &:before, &:after {
      content: "";
      position: absolute;

      width: 5px;
      height: 5px;

      background-color: var(--layout-select-color);
      transition: .15s;
    }
    &:before {

      margin-left: 10px;

    }
    &:after {

      margin-left: 20px;

    }
    width: 5px;
    height: 5px;

    background-color: var(--layout-select-color);
    transition: .15s;
  }

  &.list-layout {
    .layout-block:before {
      opacity: 0;
    }
    .layout-block:after {

      height: 3px;
      width: 90%;

      transform: translate(-12px, 1px);
    }
  }
  opacity: .85;
  transform: scale(.7);
  --layout-select-color: var(--el-text-color-primary);
}
</style>
