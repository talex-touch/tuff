<template>
  <div class="TouchTip-Wrapper transition-cubic">
    <div class="TouchTip-Container fake-background" ref="wholeDom" :class="{ 'loading-tip': loading }">
      <h1 v-text="title"></h1>

      <span class="TDialogTip-Content" v-html="message.replace('\n', '<br /><br />')" />

      <div class="TDialogTip-Btn">
        <div v-for="(btn, index) in btnArray" :key="index" v-wave @click="clickBtn(btn)" :class="{
            'info-tip': btn.value?.type === 'info',
            'warn-tip': btn.value?.type === 'warning',
            'error-tip': btn.value?.type === 'error',
            'success-tip': btn.value?.type === 'success', 'loading-tip': btn.value.loading
          }" class="TDialogTip-Btn-Item">
          <span class="TDialogTip-Btn-Item-Loading">
            <Loading />
          </span>
          <span class="TDialogTip-Container-Btn-Item-Text">{{ btn.value.content }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import VWave from 'v-wave'
export default {
  name: "TouchTip",
  directives: {
    VWave
  }
}
</script>

<script setup>
import Loading from '@comp/icon/LoadingIcon.vue'
import { onMounted, ref, watchEffect } from 'vue'
import { sleep } from 'utils/common'

const props = defineProps({
  title: String, message: String, buttons: Array, close: Function
})

const btnArray = ref([])

const wholeDom = ref(null)

const forClose = ref(async () => {
  const el = wholeDom.value
  if (!el) return
  
  const style = el.style

  await sleep(100)

  style.transform = 'translate(-50%, -50%) scale(1.125)'
  style.opacity = '0'

  el.parentNode.style.opacity = '0'

  await sleep(400)

  props.close()

  window.removeEventListener('scroll', listener)

})

watchEffect(() => {

  const array = [];

  ([...props.buttons]).forEach(btn => {

    const obj = ref({
      loading: false,
      ...btn
    })

    if (btn.loading) {

      obj.value.loading = true

      btn.loading(() => {

        obj.value.loading = false

      })

    }

    array.push(obj)

  })

  btnArray.value = array

})

const clickBtn = ref(async (btn) => {

  btn.value.loading = true

  await sleep(200)

  if (await btn.value.onClick()) {

    forClose.value()

  }

  btn.value.loading = false

})

// couldn't move
let listener = (e) => {

  window.scrollTo({
    top: 0
  })

}

onMounted(() => {

  window.addEventListener('scroll', listener)

})

</script>

<style lang="scss" scoped>
.TDialogTip-Content {
  position: relative;

  align-self: center;
  justify-self: center;
  text-align: center;

  width: 80%;
  height: calc(100% - 30px);
}

.loading-tip {

  .TDialogTip-Btn-Item-Loading {

    opacity: .75 !important;

    transform: scale(.5) translateX(-50%) !important;

  }

  .TDialogTip-Container-Btn-Item-Text {

    opacity: .25;

    transform: scale(.65);

  }

  pointer-events: none;

}

.success-tip {

  --theme-color: var(--el-color-success);

}

.info-tip {

  --theme-color: var(--el-color-primary);

}

.warn-tip {

  --theme-color: var(--el-color-warning);

}

.error-tip {

  --theme-color: var(--el-color-danger);

}

.TDialogTip-Container-Btn-Item-Text {
  position: relative;

  left: 0;
  top: 0;

  width: 320px;
  height: 180px;

  text-align: center;
  border-radius: 4px;

  cursor: pointer;

  color: var(--theme-color, var(--el-text-color-regular));
  transition: .3s cubic-bezier(.25, .8, .25, 1);
}

.TouchTip-Container {
  .TDialogTip-Btn-Item-Loading {
    position: relative;
    display: inline-block;
    margin: -8px;

    top: -10px;
    left: 50%;

    width: 16px;
    height: 16px;

    transform: scale(0) translateX(-50%);
    opacity: 0;
    --bg-color: var(--theme-color);
    transition: .3s cubic-bezier(.25, .8, .25, 1);
  }

  .TDialogTip-Btn {
    position: absolute;
    display: flex;

    justify-content: space-around;
    align-items: center;

    bottom: 1rem;

    width: 80%;
    height: 28px;

    text-align: center;
    user-select: none;
  }

  h1 {
    position: absolute;

    top: 1rem;

    width: max-content;
    height: 32px;
    line-height: 32px;

    color: var(--theme-color, var(--el-text-color-primary));
    font-size: 18px;
    font-weight: bold;
  }

  position: absolute;
  display: flex;

  flex-direction: column;

  justify-content: center;
  align-items: center;

  left: 50%;
  top: 50%;

  min-width: 420px;
  min-height: 260px;

  color: var(--theme-color, var(--el-text-color-primary));
  box-shadow: var(--el-box-shadow-lighter);
  border-radius: 8px;

  --fake-opacity: .75;
  --fake-inner-opacity: .75;

  -webkit-app-region: no-drag;
  transform: translate(-50%, -50%);
  transition: .35s cubic-bezier(.25, .8, .25, 1);
  animation: enter .35s ease-in-out;
  backdrop-filter: blur(16px) saturate(150%) brightness(1.5);

}

@keyframes enter {

  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.25);
  }

  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

}

.TouchTip-Wrapper {
  z-index: 1000;
  position: absolute;

  width: 100%;
  height: 100%;

  top: 0;
  left: 0;

  &:before {
    z-index: -1;
    content: "";
    position: absolute;

    left: 0;
    top: 0;

    width: 100%;
    height: 100%;

    background-color: var(--el-overlay-color);
    opacity: .35;
    animation: fadeIn .5s;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: .35;
  }
}
</style>
