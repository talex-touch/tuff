<script setup>
import { defineProps, ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { sleep, useModelWrapper } from '~/plugins/Common.ts'

const props = defineProps({
  modelValue: Boolean,
  hasDisplay: Boolean,
  activator: Boolean,
})
const emits = defineEmits(['update:modelValue'])

const visible = useModelWrapper(props, emits)

const wrapperRef = ref(null)

async function _activator(e) {
  const el = wrapperRef.value

  if (e?.path[0] !== el)
    return
  if (!props.activator)
    return visible.value = false

  const { style } = el.firstChild

  style.border = '2px solid var(--el-color-danger)'
  style.transform = 'translate(-50%, -58%) scale(1.005)'

  await sleep(100)

  style.border = ''
  style.transform = 'translate(-50%, -50%)'
}
</script>

<script>
export default {
  name: 'TalexDialog',
}
</script>

<template>
  <div class="TalexDialog-Container">
    <div v-if="hasDisplay" @click="visible = true">
      <slot name="display">
        <el-button class="rounder-button" text :icon="Plus" />
      </slot>
    </div>
    <teleport to="body">
      <div ref="wrapperRef" class="TalexDialog-Wrapper transition-cubic" :class="{ visible }" @click="_activator">
        <div class="TalexDialog-Main transition-cubic">
          <slot />
        </div>
      </div>
    </teleport>
  </div>
</template>

<style lang="scss" scoped>
.TalexDialog-Wrapper {
  z-index: 100;
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  background-color: var(--el-overlay-color-light);
  pointer-events: none;
  //transform: scale(1.2);
  opacity: 0;
  user-select: none;
  overflow: hidden;
}

.TalexDialog-Container {
  position: relative;

  top: 8px;
}

.TalexDialog-Main {
  &:before {
    z-index: -1;
    content: '';
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    border-radius: 8px;
    background-color: var(--el-fill-color);
    opacity: 0.85;
    transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  position: absolute;
  display: inline-block;
  padding: 8px;

  //min-width: 480px;
  width: auto;
  height: auto;
  //min-height: 400px;

  left: 50%;
  top: 50%;

  backdrop-filter: saturate(180%) brightness(120%) blur(20px);
  border-radius: 8px;
  transform: translate(-50%, -50%) scale(0) translateY(-30px);
  opacity: 0;
  //overflow: hidden;
}

.TalexDialog-Wrapper.visible {
  .TalexDialog-Main {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }

  //transform: scale(1);
  opacity: 1;
  pointer-events: unset;
}
</style>
