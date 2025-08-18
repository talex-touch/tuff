<template>
  <div class="FlatCodeInput-Container">
    <span
      @click="inputCode(i)"
      :class="{
        active: codes.indexOf(i) !== -1,
        disabled: codes.length > 0 && codes[codes.length - 1] !== i
      }"
      class="FlatCodeInput-Item"
      v-for="i in 9"
      v-text="i"
    />
  </div>
</template>

<script>
import FlatButton from '@comp/base/button//FlatButton.vue'

export default {
  name: 'FlatCodeInput',
  components: { FlatButton }
}
</script>

<script setup>
import { reactive, ref, watch } from 'vue'

const emits = defineEmits(['input'])

const codes = reactive([])

function inputCode(code) {
  const i = codes.indexOf(code)
  if (i !== -1) {
    codes.splice(i, 1)
  } else {
    codes.push(code)
  }
}

watch(codes, (val) => {
  if (val.length === 6) {
    emits('input', val.join(''))
  }
})
</script>

<style lang="scss" scoped>
.FlatCodeInput-Container {
  .FlatCodeInput-Item {
    &.active {
      opacity: 0.5;

      box-shadow: var(--el-box-shadow-lighter);
      background-color: var(--el-fill-color-dark);
    }
    &.active.disabled {
      opacity: 0.25;
      pointer-events: none;
    }
    position: relative;
    display: flex;

    justify-content: center;
    align-items: center;

    width: 48px;
    height: 48px;

    font-size: 18px;
    font-weight: 600;

    opacity: 0.75;
    cursor: pointer;
    border-radius: 8px;
    transition: 0.2s;
    box-shadow: var(--el-box-shadow-light);
    background-color: var(--el-fill-color-light);
  }
  position: relative;
  padding: 10px 16px;

  display: grid;

  align-items: center;

  grid-template-columns: repeat(3, 1fr);

  gap: 30px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
}
</style>
