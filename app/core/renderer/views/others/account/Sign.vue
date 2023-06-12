<template>
  <div :class="{ close }" class="TouchSign-Wrapper">
    <div class="TouchSign-Aside">
      <img src="@assets/logo.svg" alt="logo" />
    </div>

    <div class="TouchSign-Container fake-background">
      <p class="TouchSign-Title">TalexTouch</p>

      <div ref="content" class="TouchSign-Content">
        <div class="TouchSign-Content-Wrapper fake-background">
          <LoadingIcon />
        </div>
        <div>
          <component :is="component" />
        </div>
      </div>

      <span class="TouchSign-Copyright">
<!--        generate a text copyright-->
        <span>©</span>
        2022 - {{ new Date().getFullYear() }} <a href="https://tagzxia.com">TalexTouch</a> All Rights Reserved.
      </span>
    </div>
  </div>
</template>

<script>
export default {
  name: "TouchSign"
}
</script>

<script setup>
import { onMounted, provide, reactive, ref } from "vue";
import { sleep } from '@talex-touch/utils/common';
import AccountView from "~/views/others/account/AccountView.vue";
// import AccountView from "~/views/others/account/SignSucceed.vue";
import LoadingIcon from "@comp/icon/LoadingIcon.vue";
import { forDialogMention } from "@modules/mention/dialog-mention";

const content = ref()
const close = ref(false)
const component = ref()
const props = defineProps(['close'])

const form = reactive({})
provide('form', () => form)

async function step(func) {
  const el = content.value
  if( !el ) return
  const wrapper = el.children[0]
  const inner = el.children[1]

  await sleep(100)

  el.style.transform = 'scale(.8) translateX(0)'

  await sleep(200)

  inner.style.opacity = '0'
  wrapper.style.opacity = '1'

  await sleep(100)

  const [info, data, callback] = func()

  if ( !info.pass ) {
    wrapper.style.pointerEvents = 'all'

    if ( info.message )
      await forDialogMention("验证失败", info.message, "#error-warning")
    else if ( info.loading ) return

  } else {
    if( data ) Object.assign(form, data)
    component.value = info.comp

  }

  await sleep(300)

  // el.style.opacity = '1'
  inner.style.opacity = '1'
  wrapper.style.opacity = '0'
  wrapper.style.pointerEvents = 'none'
  // el.style.transform = 'scale(.8) translateX(10%)'

  await sleep(100)

  el.style.transform = 'scale(.8) translateX(0)'

  await sleep(200)

  el.style.transform = 'scale(1) translateX(0)'

  callback?.()
}

async function signDone() {
  const el = content.value
  if( !el ) return
  const wrapper = el.children[0]
  const inner = el.children[1]

  await sleep(100)

  el.style.transform = 'scale(.8) translateX(0)'

  await sleep(200)

  inner.style.opacity = '0'
  wrapper.style.opacity = '1'

  await sleep(300)

  await destroy()
}

provide('step', step)
provide('close', signDone)

onMounted(() => {
  const app = document.getElementById('app')

  Object.assign(app.style, {
    transition: '.75s',
    transform: 'scale(1.25)',
    opacity: '.75'
  })

  step(() => [{ pass: true, comp: AccountView }])
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
</script>

<style lang="scss">
.TouchSign-Content {
  .TouchSign-Content-Wrapper {
    z-index: 1;
    position: absolute;
    display: flex;

    justify-content: center;
    align-items: center;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    border-radius: 8px;
    transition: .25s;
    box-shadow: 0 0 2px 1px var(--el-fill-color);
    backdrop-filter: blur(18px) saturate(180%) brightness(180%);
  }
  position: relative;
  padding: 0 5px;
  display: flex;

  flex-direction: column;

  justify-content: center;
  align-items: center;

  width: 100%;
  height: calc(100% - 100px);

  transition: .2s;
  box-sizing: border-box;
}

@keyframes logoBreathing {
  from {
    transform: scale(.8) rotate(0)
  }
  to {
    transform: scale(1) rotate(15deg)
  }
}

@keyframes titleInitial {
  from {
    transform: skewX(-15deg) scale(0) translateX(-100%);
  }
  to {
    transform: skewX(-15deg) scale(1) translateX(0);
  }
}

.TouchSign-Title {
  &:before {
    z-index: -1;
    content: '';
    position: absolute;

    left: 0;
    top: 50%;

    width: 100%;
    height: 50%;
    border-radius: 4px;

    opacity: .35;
    transform: skewX(-15deg);
    animation: titleInitial .85s;
    background-color: var(--el-color-primary-dark-2);
  }
  z-index: 0;
  position: relative;
  margin: 10px 0 40px;

  font-weight: 600;
  font-size: 24px;

  text-align: center;
}

.blow-outer {
  animation: blow-outer .35s forwards;
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

.TouchSign-Aside {
  img {
    filter: hue-rotate(-45deg);

    animation: logoBreathing ease-out .65s infinite alternate;
  }
  position: relative;
  padding: 50px 60px;

  width: 440px;
  height: 400px;

  border-radius: 8px 0 0 8px;
  background: linear-gradient(-60deg, var(--el-color-primary-light-5), var(--el-color-primary-light-5), var(--el-color-primary));
  box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.2);

  transition: .35s;
  animation: blow .35s;
  filter: hue-rotate(45deg);
  box-sizing: border-box;
}

.TouchSign-Container {
  position: relative;
  padding: 50px 60px;

  width: 380px;
  height: 400px;

  border-radius: 0 8px 8px 0;
  box-shadow: var(--el-box-shadow);
  box-sizing: border-box;
  //background-color: var(--el-fill-color-light);

  --fake-radius: 0 8px 8px 0;

  transition: .35s;
  animation: blow .35s;
  -webkit-app-region: no-drag;
}

.close .TouchSign-Container {
  opacity: 0;
  transform: scale(0);
}

.TouchSign-Wrapper {
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
  -webkit-app-region: drag;
  user-select: none;
  backdrop-filter: blur(18px) saturate(1.8);
  transition: .35s;
  animation: fade-in .35s;
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

.TouchSign-Copyright {
  a {
    color: var(--el-color-primary-info-2);
  }
  position: absolute;

  bottom: 10px;
  left: 0;

  width: 100%;
  height: 30px;
  line-height: 30px;

  opacity: .25;

  font-size: 12px;
  text-align: center;
  color: var(--el-color-primary-dark-2);
}
</style>