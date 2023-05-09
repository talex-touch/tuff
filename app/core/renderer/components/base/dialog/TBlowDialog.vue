<template>
  <div :class="{ close }" class="TBlowDialog-Wrapper">
    <div class="TBlowDialog-Container">
      <component v-if="renderComp" :is="renderComp" />
      <component v-else-if="comp" :is="comp" />
      <template v-else>
        <p>{{ title }}</p>
        <div class="TBlowDialog-Content">
          <span style="position: relative;height: 100%;" v-html="message"></span>
        </div>
        <div @click="destroy" v-wave class="TBlowDialog-Confirm">
          {{ $t('base.confirm') }}
        </div>
      </template>
    </div>
  </div>
</template>

<script>
export default {
  name: "TBlowDialog"
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

  const app = document.getElementById('app')

  Object.assign(app.style, {
    transition: '.75s',
    transform: 'scale(1.25)',
    opacity: '.75'
  })

})

async function destroy() {
  const app = document.getElementById('app')

  Object.assign(app.style, {
    transform: 'scale(1)',
    opacity: '1'
  })

  close.value = true

  await sleep(550)

  app.style.cssText = ''

  props.close()
}

provide('destroy', destroy)
</script>

<style lang="scss">
.blow-outer {
  animation: blow-outer .55s forwards;
}

.blow-outer-reverse {
  animation-direction: reverse;
}

@keyframes blow-outer {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: .75;
    transform: scale(1.25);
  }
}

.TBlowDialog-Container {
  .TBlowDialog-Content {
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

  .TBlowDialog-Confirm {
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
  padding: 8px 20px;

  min-width: 320px;
  min-height: 200px;
  max-height: 80%;

  border-radius: 8px;
  box-shadow: var(--el-box-shadow);
  box-sizing: border-box;
  background-color: var(--el-fill-color-light);

  transition: .5s;
  animation: blow .5s;
}

.close .TBlowDialog-Container {
  opacity: 0;
  transform: scale(0);
}

.TBlowDialog-Wrapper {
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

  //background-color: #000000aa;
  backdrop-filter: blur(5px);
  transition: .5s;
  animation: fade-in .5s;
}

@keyframes blow {
  0% {
    transform: scale(0);
  }
  100% {
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