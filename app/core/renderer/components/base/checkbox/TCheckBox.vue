<template>
  <div :class="{ 'select': value }" @click="value = !value" class="TCheckBox-Container" role="checkbox">
    <span class="TCheckBox-Inner">
      <svg viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
        <polyline fill="none" stroke-width="24" points="88,214 173,284 304,138" stroke-linecap="round" stroke-linejoin="round" class="tick" />
      </svg>
    </span>
    <span class="TCheckBox-Text">
      <slot />
    </span>
  </div>
</template>

<script>
export default {
  name: "TCheckBox"
}
</script>

<script setup>
import { useModelWrapper } from "@modules/utils";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})
const emits = defineEmits(["update:modelValue"])

const value = useModelWrapper(props, emits, "modelValue")
</script>

<style lang="scss" scoped>
.TCheckBox-Container {
  &.select .TCheckBox-Inner {
    svg {
      stroke: var(--el-fill-color-light);
      stroke-dashoffset: 0;
    }

    background: var(--el-color-primary);
  }
  .TCheckBox-Inner {
    svg {
      position: relative;

      top: -1px;

      stroke-dashoffset: 306.2691345214844;
      stroke-dasharray: 306.2691345214844;
      transition: .5s;
    }
    position: relative;

    width: 16px;
    height: 16px;

    border-radius: 4px;
    border: var(--el-border);
    transition: .25s;
  }
  .TCheckBox-Text {
    position: relative;

    left: 5px;

    margin-top: -0.17em;
    opacity: .75;
  }
  display: flex;
  margin: 20px 0;

  cursor: pointer;
  user-select: none;
}
</style>