<script lang="ts" setup>
import { FMessage } from 'fighting-design'
import { ref } from 'vue'

const value1 = ref('')

function onEnter(): void {
  FMessage({ type: 'success', message: '开始搜索' })
}
</script>

<template>
  <f-input v-model="value1" type="text" placeholder="Input here...." :on-enter="onEnter" />
</template>

<style lang="scss" scoped>
.f-input {
  width: 200px;
}
</style>
