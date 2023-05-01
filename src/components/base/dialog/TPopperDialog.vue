<template>
  <div :class="{ close }" class="TPopperDialog-Wrapper">
    <div class="TPopperDialog-Container fake-background">
      <component v-if="renderComp" :is="renderComp" />
      <component v-else-if="comp" :is="comp" />
      <template v-else>
        <p>{{ title }}</p>
        <div class="TPopperDialog-Content">
          <span style="position: relative;height: 100%;" v-html="message"></span>
        </div>
        <div @click="destroy" v-wave class="TPopperDialog-Confirm">
          {{ $t('base.confirm') }}
        </div>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  name: "TPopperDialog"
}
</script>

<script setup>
import { defineComponent, onMounted, provide, ref } from "vue";
import {sleep} from "@modules/utils";
import { $t } from '@modules/lang'

const close = ref(false)
const props = defineProps(['close', 'title', 'message', 'comp', 'render'])

const renderComp = ref(null)

onMounted(() => {
  if ( props.render ) {
    renderComp.value = defineComponent({
      render: props.render
    })
  }

})

async function destroy() {

  close.value = true

  await sleep(550)

  props.close()
}

provide('destroy', destroy)
</script>

<style lang="scss">
.Popper-outer {
  animation: Popper-outer .55s forwards cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

.Popper-outer-reverse {
  animation-direction: reverse;
}

@keyframes Popper-outer {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: .75;
    transform: scale(1.25);
  }
}

.TPopperDialog-Container {
  .TPopperDialog-Content {
    position: relative;
    margin-bottom: 60px;

    top: 0;

    left: 0;
    right: 0;

    height: 100%;
    max-height: 300px;

    overflow: hidden;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .TPopperDialog-Confirm {
    position: absolute;

    width: calc(100% - 40px);

    height: 30px;
    line-height: 30px;
    bottom: 20px;

    cursor: pointer;
    user-select: none;
    text-align: center;

    border-radius: 5px;
    background: linear-gradient(to right, var(--el-color-primary-light-3), var(--el-color-primary-light-5), var(--el-color-primary-light-3));
  }
  p {
    margin: 5px;

    font-size: 1.5rem;
    font-weight: 600;

    text-align: center;
  }
  span {
    width: 100%;
    display: block;
    text-align: center;
  }
  position: relative;
  padding: 12px 20px;

  min-width: 380px;
  max-width: 80%;
  min-height: 200px;
  max-height: 80%;
  //height: 200px;

  --fake-radius: 4px;
  border-radius: 4px;
  box-shadow: var(--el-box-shadow);
  box-sizing: border-box;
  //background-color: var(--el-fill-color-light);

  overflow: hidden;
  backdrop-filter: blur(10px) saturate(180%) brightness(1.5);

  transition: .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
  animation: Popper .5s cubic-bezier(0.785, 0.135, 0.150, 0.860);
}

.close .TPopperDialog-Container {
  opacity: 0;
  transform: scale(1.2);
}

.TPopperDialog-Wrapper {
  &.close {
    opacity: 0;
  }
  position: absolute;
  display: flex;

  justify-content: center;
  align-items: center;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  background-color: #00000055;
  //backdrop-filter: blur(5px);
  transition: cubic-bezier(0.785, 0.135, 0.150, 0.860) .5s;
  animation: cubic-bezier(0.785, 0.135, 0.150, 0.860) .5s;
}

@keyframes Popper {
  0% {
    opacity: 0;
    transform: scale(1.25);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fade-in {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}
</style>