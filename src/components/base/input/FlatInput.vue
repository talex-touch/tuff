<template>
  <div @keydown="onKeyDown" class="FlatInput-Container fake-background">
    <span class="FlatInput-Prefix">
      <slot>
        <RemixIcon :name="icon" :style="`line`" />
      </slot>
    </span>
    <input v-model="value" :type="password ? 'password' : 'text'" />
      <el-tag v-if="password" v-show="lapsLock" type="danger" effect="plain">
        Caps Lock
      </el-tag>
  </div>
</template>

<script>
export default {
  name: "FlatInput"
}
</script>

<script setup>
import RemixIcon from "@comp/icon/RemixIcon.vue";
import { useModelWrapper } from "@modules/utils";
import { ref } from "vue";

const props = defineProps(['icon', 'password', 'modelValue'])
const emit = defineEmits(['update:modelValue'])

const lapsLock = ref(false)
const value = useModelWrapper(props, emit)

function onKeyDown(e) {
  if ( !props.password ) return

  const valueCapsLock = e.keyCode ? e.keyCode : e.which; // 按键
  const valueShift = e.shiftKey ? e.shiftKey : ((valueCapsLock === 16) ); // shift键是否按住

  lapsLock.value = ((valueCapsLock >= 65 && valueCapsLock <= 90 ) && !valueShift) // 输入了大写字母，并且shift键没有按住，说明Caps Lock打开
    || ((valueCapsLock >= 97 && valueCapsLock <= 122 ) && valueShift)

}
</script>

<style lang="scss" scoped>
.FlatInput-Container {
  :deep(.el-tag) {
    position: absolute;

    top: -30px;
  }

  &:hover {
    border-color: var(--el-color-primary-light-3);
    box-shadow:
            0 0 2px 1px var(--el-color-primary-light-5)
    ;
  }
  &:focus-within {
    border-color: var(--el-color-primary);
    box-shadow:
            0 0 2px 1px var(--el-color-primary-light-3),
            0 0 4px 2px var(--el-color-primary-light-5)
  ;
  }
  .FlatInput-Prefix {
    :deep(.remix) {
      position: absolute;

      left: 12px;

      width: 100%;
      height: 100%;

      top: -0.15em;
    }
    position: relative;

    font-size: 18px;
    color: var(--el-text-color-primary)
  }
  input {
    position: relative;

    height: calc(100% - 2px);
    width: calc(100% - 15px);

    outline: none;
    border: none;

    font-size: 16px;

    border-radius: 0 6px 6px 0;
    background-color: transparent;
  }
  position: relative;
  padding-top: 2px;
  padding-right: 5px;
  margin-bottom: 20px;
  display: grid;

  grid-template-columns: 1fr 5fr;

  width: 100%;
  height: 32px;
  line-height: 32px;

  border-radius: 6px;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color);

  --fake-radius: 6px;
  transition: border-color .25s, box-shadow .25s;
}
</style>