<template>
  <div class="TalexDialog-Container">
    <div v-if="hasDisplay" @click="visible = true">
      <slot name="display">
        <el-button class="rounder-button" text :icon="Plus"></el-button>
      </slot>
    </div>

    <teleport :to="to">
      <div ref="wrapperRef" @click="_activator" class="TalexDialog-Wrapper transition-cubic" :class="{ visible }">
        <div class="TalexDialog-Main transition-cubic">
<!--          <div class="TalexCoverDialog-Wrapper">-->
            <slot />
<!--          </div>-->
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { defineProps, ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { sleep, useModelWrapper } from '~/plugins/Common.ts'

const props = defineProps({
  modelValue: Boolean, hasDisplay: Boolean, activator: Boolean, to: String
})
const emits = defineEmits(['update:modelValue'])

const visible = useModelWrapper(props, emits)

const wrapperRef = ref(null)

async function _activator(e) {
  const el = wrapperRef.value

  if( e?.path[0] !== el ) return
  if( !props.activator ) {
    return visible.value = false
  }

  const { style } = el.firstChild

  style.border = '2px solid var(--el-color-danger)'
  style.transform = 'translate(-50%, -58%) scale(1.005)'

  await sleep(300)

  style.border = ''
  style.transform = 'translate(-50%, -50%)'
}

// onMounted(() => {
//
//   const el = wrapperRef.value
//
//   el.parentNode.removeNode(el)
//
//   document.querySelector(props.to).insertNode(el)
//
// })
</script>

<script>
export default {
  name: 'TalexCoverDialog',
}
</script>

<style lang="scss">
.TalexCoverDialog-Wrapper {
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;
}

.TalexDialog-Wrapper {
  &:before {
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    border-radius: 8px;
    background-color: var(--el-overlay-color);
    opacity: .75;
    filter: invert(100%);
  }
  z-index: 100;
  position: absolute;
  padding: 10px;

  left: -5px;
  top: -5px;

  width: 100%;
  height: 100%;

  box-sizing: border-box;
  border-radius: 8px;
  backdrop-filter: saturate(180%) blur(5px);
  pointer-events: none;
  //transform: scale(1.2);
  opacity: 0;
  user-select: none;
  overflow: hidden;
}

.TalexDialog-Main {
  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    border-radius: 8px;
    //background-color: var(--el-bg-color-page);
    filter: brightness(150%);
    opacity: .45;
    transition: .3s cubic-bezier(.25,.8,.25,1);
  }
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 8px;

  //min-width: 480px;
  //width: 60%;
  height: 40%;
  //min-height: 200px;

  left: 50%;
  top: 50%;

  backdrop-filter: saturate(180%) blur(20px);
  border-radius: 8px;
  transform: translate(-50%, -50%) scale(1.125, 1.25) translateY(-30px);
  opacity: 0;
  overflow: hidden;
  transition: .35s cubic-bezier(.25,.8,.25,1);
}

.TalexDialog-Wrapper.visible {
  .TalexDialog-Main {
    transform: translate(-50%, -50%) scale(1, 1) translateY(0px);
    opacity: 1;
  }
  //transform: scale(1);
  opacity: 1;
  pointer-events: unset;
}

.dark {
  .TalexDialog-Wrapper {
    &:before {

      background-color: var(--el-overlay-color-lighter);
      filter: brightness(80%) !important;

    }
  }
}
</style>
