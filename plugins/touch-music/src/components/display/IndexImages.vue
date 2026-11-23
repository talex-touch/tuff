<script setup lang="ts">
import { axios } from '@modules/axios'
import { sleep } from '@modules/utils'
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const img1 = ref<HTMLElement>()
const img2 = ref<HTMLElement>()
const banners = reactive([])
let rafId: number | null = null
let active = true

const banner = reactive({
  now: 0,
  t: {
    n: 0,
    m: 500,
  },
})

onMounted(async () => {
  rafId = requestAnimationFrame(refresh)
  try {
    const res = await axios.get('/banner')
    if (!active || res?.code !== 200 || !Array.isArray(res.banners))
      return

    Object.assign(banners, res.banners)
  }
  catch {
    // Fail closed without unhandled rejection when network.internet is denied or unavailable.
  }
})

onBeforeUnmount(() => {
  active = false
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
})

async function setImage() {
  const _1 = img1.value
  const _2 = img2.value
  if (!_1 || !_2)
    return

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
  if (!active)
    return

  if (banners.length) {
    if (banner.t.n <= 0) {
      banner.t.n = banner.t.m

      await setImage()
    }
    else {
      banner.t.n -= 1
    }
  }

  if (active) {
    rafId = requestAnimationFrame(refresh)
  }
}
</script>

<template>
  <div class="IndexImages-Container">
    <div ref="img1" class="IndexImages-Item img1 cubic-transition" />
    <div ref="img2" class="IndexImages-Item img2 cubic-transition" />

    <div :style="`--p: ${banner.t.n / banner.t.m * 100}%`" class="IndexImages-Progressbar" />
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
  background-color: var(--tx-fill-color-darker);
}

.IndexImages-Container {
  position: relative;

  width: 100%;
  height: 25%;

  //aspect-ratio: 16 / 4;
  filter: drop-shadow(0 0 16px var(--tx-fill-color-light));

  overflow: hidden;
  border-radius: 12px;
  box-sizing: border-box;
  background-color: var(--tx-fill-color-light);
}
</style>
