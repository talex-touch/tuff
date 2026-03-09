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
  <div class="CheckList-Container">
    <p>{{ title }}</p>
    <CheckBox value-mode v-model="modelValue" :title="item.label || item.title || item" :disabled="item.disable || false" v-for="(item, index) in data" :key="index" />
  </div>
</template>

<script>
export default {
  name: "CheckList"
}
</script>

<script setup>
import CheckBox from '@components/common/checkbox/CheckBox.vue'
import { useModelWrapper } from '@plugins/Common.ts'

const props = defineProps({ title: String, data: Array, modelValue: String })
const emits = defineEmits(['update:modelValue'])

const modelValue = useModelWrapper(props, emits)
</script>

<style lang="scss" scoped>
.CheckList-Container {
  p {
    font-size: 18px;
  }
  :deep(.CheckBox-Wrapper) {
    &.disabled {
      opacity: .4;
    }
    margin: 5px 0 5px 5px;
    padding: 5px 0 5px 5px;

    width: calc(100% - 10px);
    box-sizing: border-box;

    .CheckBox-Container {
      &:before, &:after {
        background-color: var(--el-color-primary);
      }
      top: 3px;

      border: 0;
      background-color: transparent;
    }

    span {
      top: -1px;

      height: 24px;

      font-size: 14px;
    }

    &:hover {
      background-color: var(--el-fill-color-dark);
    }
  }
}
</style>
