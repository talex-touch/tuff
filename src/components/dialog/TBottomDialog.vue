<template>
  <teleport to="body">
    <div ref="wholeDom" class="TBottomDialog-Wrapper fake-background" :style="`z-index: ${index + 10000}`">
      <div class="TBottomDialog-Container">
        <p v-text="title" class="dialog-title" />
        <div class="dialog-content" v-text="message" />

        <div class="dialog-btns">
          <span v-for="(btn, index) in btnArray" :key="index"
              @click="clickBtn(btn)" :class="{ 'info-tip': btn.value?.type === 'info',
              'warn-tip': btn.value?.type === 'warning',
              'error-tip': btn.value?.type === 'error',
              'success-tip': btn.value?.type === 'success', 'loading-tip': btn.value.loading }"
              class="btn-item">
              <span class="TDialogTip-Btn-Item-Loading">
                <Loading />
              </span>
              <span v-if="btn.value.time" class="TDialogTip-Container-Btn-Item-Text">{{ btn.value.content }} ({{ btn.value.time }}s)</span>
              <span v-else class="TDialogTip-Container-Btn-Item-Text">{{ btn.value.content }}</span>
          </span>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script>
export default {
  name: "TBottomDialog"
}
</script>

<script setup>
import Loading from './../icon/LoadingIcon.vue'
import { defineProps, onMounted, ref, watchEffect } from 'vue'
import { sleep } from '@modules/utils'

const props = defineProps({
  title: String, message: String, stay: Number, close: Function,
  btns: Array, icon: String, index: Number
})

const btnArray = ref([])

const wholeDom = ref(null)

const forClose = ref(async () => {

  const style = wholeDom.value?.style

  style.transform = 'translate(-50%, 0) scale(.8) translateY(100%)'

  await sleep(50)

  style.opacity = '0'

  await sleep(100)

  props.close()

  window.removeEventListener('scroll', listener)

})

const clickBtn = async (btn) => {

  btn.value.loading = true

  await sleep(200)

  if( await btn.value.onClick() ) {

    forClose.value()

  }

  btn.value.loading = false

}

watchEffect(() => {

  const array = [];

  ([ ...props.btns ]).forEach(btn => {

    const obj = ref({
      loading: false,
      ...btn
    })

    if( btn.loading ) {

      obj.value.loading = true

      btn.loading(() => {

        obj.value.loading = false

      })

    }

    if( btn.time ) {

      const _clickBtn = clickBtn

      function refresh() {

        setTimeout(() => {

          obj.value.time -= 1

          if ( obj.value.time <= 0 ) {

            _clickBtn(obj)

            return

          }

          refresh()

        }, 1000)

      }

      refresh()

    }

    array.push(obj)

  })

  btnArray.value = array

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
.TBottomDialog-Container {
  .dialog-title {
    font-weight: 600;
    font-size: 20px;
  }
  .dialog-content {
    position: relative;
    display: flex;
    padding: 4px 8px;

    align-items: center;

    width: max-content;

    border-radius: 8px;
    box-sizing: border-box;
    //background-color: var(--el-fill-color-light);
  }
  .dialog-btns {
    .btn-item {
      .TDialogTip-Btn-Item-Loading {
        position: absolute;
        display: inline-block;
        top: -10px;
        left: 50%;

        width: 16px;
        height: 16px;

        transform: scale(0) translateX(-50%);
        opacity: 0;
        --bg-color: var(--theme-color);
      }
      &:before {
        z-index: -1;
        content: '';
        position: absolute;
        top: 0;
        left: 0;

        width: 100%;
        height: 100%;

        border-radius: 8px;
        opacity: .5;
        background-color: var(--theme-color, var(--el-color-info));
      }
      z-index: 10;
      position: relative;
      margin: 8px 0;
      padding: 8px 4px;

      text-align: center;
      left: 10%;
      width: 80%;

      color: #eee;
      border-radius: 8px;
      box-sizing: border-box;
      transition: .25s;
      user-select: none;
      &:hover {
        cursor: pointer;
        &:before {
          opacity: .75;
        }
      }
    }
    position: absolute;
    display: flex;

    flex-direction: column;

    bottom: 5%;

    width: 80%;
  }
  &:before {
    content: '';
    position: absolute;
    top: 60%;
    left: 15%;

    width: 30%;
    height: 30%;

    border-radius: 8px;
    background-color: var(--el-color-primary-light-3);
    opacity: .125;
    transform: scale(2);
    filter: saturate(180%) blur(20px);
  }
  &:after {
    content: '';
    position: absolute;
    top: 10%;
    left: 65%;

    width: 30%;
    height: 30%;

    border-radius: 8px;
    background-color: var(--el-color-warning-light-3);
    opacity: .125;
    transform: scale(2);
    filter: saturate(180%) blur(20px);
  }
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;

  width: 100%;
  height: 100%;

  transition: .25S;
}

.TBottomDialog-Wrapper {
  z-index: 10000;
  position: absolute;

  left: 50%;
  bottom: 2%;

  width: 35%;
  height: auto;
  min-height: 260px;

  --fake-opacity: 0.25;
  --fake-color: var(--el-fill-color-light);

  border-radius: 8px;
  box-shadow: var(--el-box-shadow-light);
  //background-color: var(--el-fill-color-light);
  backdrop-filter: blur(18px) saturate(180%) brightness(1.8);
  transform: translateX(-50%);
  animation: enter .2s ease-in-out;
  overflow: hidden;
  transition: .25S;
}

@keyframes enter {
  0% {
    opacity: 0;
    transform: scale(.8) translateX(-50%) translateY(100%);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateX(-50%) translateY(0);
  }
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
</style>