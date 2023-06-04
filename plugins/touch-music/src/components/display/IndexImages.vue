<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { axios } from "@modules/axios";
import { sleep } from "@modules/utils";

const img1 = ref<HTMLElement>()
const img2 = ref<HTMLElement>()
const banners = reactive([])

const banner = reactive({
  now: 0,
  t: {
    n: 0,
    m: 500
  }
})

onMounted(async () => {
  const res = await axios.get('/banner')
  if ( res['code'] !== 200 ) return

  Object.assign(banners, res['banners'])
})

async function setImage() {
  const _1 = img1.value
  const _2 = img2.value
  if ( !_1 || !_2 ) return

  const now = banner.now
  const next = (now + 2) % banners.length

  _2.style.transition = 'none'
  _2.style.opacity = '0'
  _2.style.transform = 'translateY(100%) scale(.8)'
  _2.style.backgroundImage = `url(${banners[next].imageUrl})`

  await sleep(250)

  _1.style.transform = 'translateY(-100%) scale(.8)'
  _1.style.opacity = '0'

  await sleep(50)

  _2.style.transition = ''
  _2.style.transform = 'translateY(0) scale(1)'
  _2.style.opacity = '1'

  await sleep(250)

  _1.style.transform = 'translateY(0) scale(1)'
  _1.style.backgroundImage = `url(${banners[next].imageUrl})`

  await sleep(250)

  _1.style.opacity = '1'

  banner.now = next

}

async function refresh() {
  if ( banners.length ) {
    if ( banner.t.n <= 0 ) {
      banner.t.n = banner.t.m

      await setImage()
    } else {
      banner.t.n -= 1
    }

  }

  requestAnimationFrame(refresh)
}

requestAnimationFrame(refresh)
</script>

<template>
  <div class="IndexImages-Container">
    <div ref="img1" class="IndexImages-Item img1 cubic-transition"></div>
    <div ref="img2" class="IndexImages-Item img2 cubic-transition"></div>

    <div :style="`--p: ${banner.t.n / banner.t.m * 100}%`" class="IndexImages-Progressbar">

    </div>
  </div>
</template>

<style scoped lang="scss">
.IndexImages-Item {
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.IndexImages-Progressbar {
  z-index: 10;
  position: absolute;

  left: 0;
  bottom: 0;

  width: var(--p);
  height: 5px;

  transition: .125s linear;
  opacity: .75;
  border-radius: 12px;
  background-color: var(--el-fill-color-darker);
}

.IndexImages-Container {
  position: relative;

  width: 100%;
  height: 25%;

  //aspect-ratio: 16 / 4;
  filter: drop-shadow(0 0 16px var(--el-fill-color-light));

  overflow: hidden;
  border-radius: 12px;
  box-sizing: border-box;
  background-color: var(--el-fill-color-light);
}
</style>