<!--
  - Copyright (c) 2022. TalexDreamSoul
  -
  - Licensed under the Apache License, Version 2.0 (the "License");
  - you may not use this file except in compliance with the License.
  - You may obtain a copy of the License at
  -
  -     http://www.apache.org/licenses/LICENSE-2.0
  -
  - Unless required by applicable law or agreed to in writing, software
  - distributed under the License is distributed on an "AS IS" BASIS,
  - WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  - See the License for the specific language governing permissions and
  - limitations under the License.
  -->

<template>
  <div class="ImageViewer-Wrapper">
    <div class="ImageViewer-Overlay" ref="overlayRef" @click="closeFunc"></div>
    <div class="ImageViewer-Container" ref="containerRef">

    </div>
  </div>
</template>

<script>
export default {
  name: "ImageViewer"
}
</script>

<script setup>
import { onBeforeMount, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue'

const props = defineProps(['wrapper', 'img', 'close'])

const containerRef = ref()
const overlayRef = ref()

const options = reactive({
  rotate: 0,
  scale: 1,
  origin: {
    x: 0,
    y: 0
  }
})

const closeFunc = (() => {
  let f
  return (func) => {
   return f ? f() : f = func
  }
})()

// TODO 适配改变屏幕大小时 动态改变图片位置

onMounted(async () => {

  // const img = document.createElement('img')
  const img = props.img.cloneNode(true)
  const rect = props.img.getBoundingClientRect()

  options.scale = 1
  options.rotate = 0

  containerRef.value.append(img)

  // img.attributes.src = props.img.attributes.src

  img.className = "ImageViewer-img"
  img.style.width = `${rect.width}px`
  img.style.height = `${rect.height}px`

  // const top = rect.top// /*props.img.x +*/ props.wrapper.offsetTop
  // const left =  ///*props.img.y +*/ props.wrapper.offsetLeft

  img.style.top = `${rect.top}px`
  img.style.left = `${rect.left}px`

  // let scale = (window.innerWidth * 0.5) / rect.width
  // console.log(window.innerWidth , rect.width)
  // if( rect.height * scale > window.innerHeight - 80 ) {
  //   scale = (window.innerHeight - 80) / rect.height
  // }

  function changeStyle(el, arr) {
    const original = el.style.cssText.split(';')
    original.pop()
    el.style.cssText = original.concat(arr).join(';') + ';'
  }

  const originalCenterPoint = { x: rect.width / 2 + rect.left, y: rect.height / 2 + rect.top }
  const winCenterPoint = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  const offsetDistance = { left: winCenterPoint.x - originalCenterPoint.x, top: winCenterPoint.y - originalCenterPoint.y }
  const diffs = { left: rect.width / 2, top: rect.height / 2 }

  const left = diffs.left - (rect.width / 2) + offsetDistance.left
  const top = offsetDistance.top - (rect.height / 2) + diffs.top

  options.origin.x = winCenterPoint.x
  options.origin.y = winCenterPoint.y

  setTimeout(() => {
    props.wrapper.style.opacity = '0'

    changeStyle(img, ['transition: all 0.3s',
      `transform: translate(
    ${left}px,
    ${top}px)`])

    watchEffect(() => {
      changeStyle(img, [
        `transform:
        translate(${left}px, ${top}px)
        scale(${Math.max(options.scale, 0.2)})
        rotate(${options.rotate}deg)`
          , `transform-origin: ${options.origin.x}px ${options.origin.y}px`
      ])
    })
    // setTimeout(() => {
    //   changeStyle(img, [
    //       'left: ' + left + 'px',
    //       'top: ' + top + 'px',
    //       'transform: scale(1)'
    //   ])
    // }, 300)

    img.addEventListener('mousewheel', (e) => {

      options.origin.x = e.offsetX
      options.origin.y = e.offsetY

      options.scale += 0.2 * (e.deltaY < 0 ? 1 : -1)

    })
  }, 100)
  // 动画结束后消除定位重置的偏差
  // setTimeout(() => {
  //   changeStyle(img, ['transition: all 0s', `left: 0`, `top: 0`, `transform: translate(${offsetDistance.left - diffs.left}px, ${offsetDistance.top - diffs.top}px)`])
  //   offset = reactive({ x: offsetDistance.left - diffs.left, y: offsetDistance.top - diffs.top }) // 记录值
  // }, 300)

  closeFunc(() => {

    changeStyle(img, [
      `transform:
        translate(0, 0)
        scale(1)
        rotate(0deg)`
      , `transform-origin: ${winCenterPoint.x}px ${winCenterPoint.y}px`
    ])

    overlayRef.value.style.animation = '.25s .05s fadein forwards reverse'

    setTimeout(() => {
      props.wrapper.style.opacity = ''

      containerRef.value.removeChild(img)
      img.remove?.()

      props.close()
    }, 300)

  })

})

</script>

<style lang="scss">
.ImageViewer-img {
  z-index: 100000;
  position: absolute;

}

.ImageViewer-Overlay {
  background-color: var(--el-overlay-color-light);

  opacity: 0;
  animation: .3s fadein forwards;
}

.ImageViewer-Wrapper, .ImageViewer-Overlay {
  z-index: 10000;
  position: absolute;

  left: 0;
  top: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;
}

@keyframes fadein {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
