<template>
  <div class="CheckBox-Wrapper" @click="!props.disabled && (() => value = valueMode ? title : (value ? yesValue || !value : noValue || !value))()"
       :class="{ 'checked': valueMode ? value === title : ((value && yesValue) ? value === yesValue : value), disabled }">
    <div class="CheckBox-Container">
    </div>
    <slot>
      <span :data-title="title"></span>
    </slot>
  </div>
</template>

<script setup>
import { useModelWrapper } from '~/plugins/Common.ts'

const emits = defineEmits(['update:modelValue'])
const props = defineProps({ modelValue: Boolean, title: String, disabled: Boolean, valueMode: Boolean, yesValue: Object, noValue: Object })

const value = useModelWrapper(props, emits)

</script>

<script>
export default {
  name: "CheckBox"
}
</script>

<style lang="scss" scoped>
.CheckBox-Wrapper.checked {
  span {
    &:before {
      --leftA: var(--el-color-primary);
      --leftB: var(--el-color-primary);
      transition: .45s --leftA, .45s --leftB .2s;
    }
    opacity: 1;
    //color: var(--el-color-primary);

  }
  .CheckBox-Container {

    &:before {
      transform: rotate(-30deg);
      transition: .3s cubic-bezier(.25,.8,.25,1);
    }
    &:after {
      transform: scaleX(-1) rotate(-40deg);
      transition: all .25s .25s;
    }

    background-color: var(--el-color-primary);

  }

}

.CheckBox-Wrapper {
  display: inline-flex; // inline-block -> flex 布局 (layout)
  span {
    &:before {
      content: attr(data-title);
      position: absolute;

      left: 0;
      top: 0;

      width: max-content;
      height: 100%;

      --leftA: var(--el-text-color-primary);
      --leftB: var(--el-text-color-primary);


      background: linear-gradient(to right bottom, var(--leftA), var(--leftB));
      background-clip: text;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      transition: .45s --leftA .2s, .45s --leftB;
    }
    position: relative;
    left: 5px;
    width: max-content;

    font-size: 12px;
    line-height: 21px;
    //opacity: .65;

    transition: all 5.25s;
  }
  cursor: pointer;

  width: 100%;
}
.CheckBox-Container {
  &:before {
    content: "";
    position: absolute;

    left: 4px;
    top: 6px;

    width: 2px;
    height: 7px;

    border-radius: 3px;
    background-color: var(--el-bg-color);
    transform: rotate(-30deg)  translateY(-4px) scaleY(0);
    transition: all .25s .25s;
  }
  &:after {
    content: "";
    position: absolute;

    left: 9px;
    top: 2px;

    width: 2px;
    height: 12px;

    border-radius: 3px;
    background-color: var(--el-bg-color);

    transform: scaleX(-1) rotate(-40deg) translateY(6px) scaleY(0);
    transition: .3s cubic-bezier(.25,.8,.25,1);
  }
  position: relative;
  display: inline-block;

  width: 16px;
  height: 16px;

  opacity: .85;
  border: 1px solid var(--el-color-primary);
  border-radius: 4px;
  transition: all .55s;
  &:hover {

    opacity: 1;

  }

}

.CheckBox-Wrapper.disabled {
  opacity: .35;
  cursor: not-allowed;
}

@property --leftA {
  syntax: '<color>';
  inherits: false;
  initial-value: rgba(0, 0, 0, 0);
}

@property --leftB {
  syntax: '<color>';
  inherits: false;
  initial-value: rgba(0, 0, 0, 0);
}
</style>
