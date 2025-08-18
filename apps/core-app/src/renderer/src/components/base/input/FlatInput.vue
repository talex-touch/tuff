<script name="FlatInput" setup>
import RemixIcon from '@comp/icon/RemixIcon.vue'
import { useModelWrapper } from '@talex-touch/utils/renderer/ref'
import { ref } from 'vue'

const props = defineProps(['placeholder', 'icon', 'password', 'modelValue', 'nonWin', 'area'])
const emit = defineEmits(['update:modelValue'])

const lapsLock = ref(false)
const value = useModelWrapper(props, emit)

function onKeyDown(e) {
  if (!props.password) return

  const valueCapsLock = e.keyCode ? e.keyCode : e.which // 按键
  const valueShift = e.shiftKey ? e.shiftKey : valueCapsLock === 16 // shift键是否按住

  lapsLock.value =
    (valueCapsLock >= 65 && valueCapsLock <= 90 && !valueShift) || // 输入了大写字母，并且shift键没有按住，说明Caps Lock打开
    (valueCapsLock >= 97 && valueCapsLock <= 122 && valueShift)
}
</script>

<template>
  <div
    tabindex="0"
    class="FlatInput-Container fake-background"
    :class="{ 'none-prefix': !$slots?.default, win: nonWin !== true, area }"
    @keydown="onKeyDown"
  >
    <span v-if="$slots.default" class="FlatInput-Prefix">
      <slot>
        <RemixIcon :name="icon" style="line" />
      </slot>
    </span>
    <textarea v-if="area" v-model="value" resize="false" :placeholder="placeholder" relative />
    <input
      v-else
      v-model="value"
      :placeholder="placeholder"
      relative
      :type="password ? 'password' : 'text'"
    />
    <el-tag v-if="password" v-show="lapsLock" type="danger" effect="plain"> Caps Lock </el-tag>
  </div>
</template>

<style lang="scss" scoped>
.FlatInput-Container {
  :deep(.el-tag) {
    position: absolute;

    top: -30px;
  }

  &:hover {
    border-color: var(--el-color-primary-light-3);
    box-shadow: 0 0 2px 1px var(--el-color-primary-light-5);
  }

  &:focus-within {
    border-color: var(--el-color-primary);
    box-shadow:
      0 0 2px 1px var(--el-color-primary-light-3),
      0 0 4px 2px var(--el-color-primary-light-5);
  }

  .FlatInput-Prefix {
    position: relative;
    padding-left: 6px;
    display: flex;

    margin-bottom: 0.15rem;
    align-items: center;

    font-size: 18px;
    color: var(--el-text-color-primary);
  }

  input,
  textarea {
    height: calc(100% - 4px);
    width: calc(100% - 2px);

    outline: none;
    border: none;

    font-size: 16px;

    border-radius: 0 6px 6px 0;
    background-color: transparent;
  }

  textarea {
    width: 100%;

    resize: none;
  }

  &.none-prefix {
    padding: 0 5px;
    grid-template-columns: 1fr;
  }

  &.area {
    height: 10rem;
  }

  position: relative;
  padding-top: 2px;
  padding-right: 5px;
  //margin-bottom: 20px;
  display: grid;

  grid-template-columns: 1fr 5fr;

  width: 100%;
  height: 32px;
  line-height: 32px;

  border-radius: 6px;
  box-sizing: border-box;
  border: 1px solid var(--el-border-color);

  --fake-radius: 6px;
  transition:
    border-color 0.25s,
    box-shadow 0.25s;
}

div.FlatInput-Container.win {
  &:before {
    filter: invert(0.25);
    --fake-opacity: 0.25;
    --fake-inner-opacity: 0.25;
  }

  &:hover {
    &:before {
      --fake-opacity: 0.35;
      --fake-inner-opacity: 0.35;
    }

    border-color: var(--el-border-color);
    border-bottom: 1px solid var(--el-border-color);
    box-shadow: none;
  }

  &:focus-within {
    &:before {
      filter: invert(0.05);
      --fake-opacity: 0.5;
      --fake-inner-opacity: 0.5;
    }

    border-color: var(--el-border-color);
    border-bottom: 2px solid var(--el-color-primary);
    box-shadow: none;
  }

  border-radius: 4px;
  --fake-radius: 4px !important;
  border-bottom: 1px solid var(--el-border-color);
}
</style>
