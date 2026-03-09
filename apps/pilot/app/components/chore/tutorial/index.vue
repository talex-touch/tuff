<script setup lang="ts">
import Welcome from './addon/Welcome.vue'
import type { TutorialOption } from './tutorial-types'
import { $event } from '~/composables/events'

const show = ref(false)
const router = useRouter()

const main = ref<HTMLElement>()
const options = reactive<TutorialOption>({
  component: null,
  data: {},
})

async function handleNext(next: TutorialOption) {
  const el = main.value
  if (!el) {
    nextTick(() => handleNext(next))
    return
  }

  if (next.data?.tour) {
    show.value = false
    return
  }
  else {
    show.value = true
  }

  el.style.opacity = '0'
  await sleep(200)

  if (!next.component) {
    userConfig.value.pri_info.info.tutorial = true

    saveUserConfig()

    show.value = false

    return
  }

  options.component = next.component
  Object.assign(options.data, next.data)

  await sleep(200)
  el.style.opacity = '1'
}

onMounted(() => {
  watchEffect(() => {
    const tutorial = userConfig.value.pri_info.info.tutorial

    setTimeout(() => {
      show.value = !tutorial
      if (!show.value)
        return

      if (document.body.classList.contains('mobile'))
        return

      handleNext({
        component: Welcome,
        data: {},
      })

      router.push('/')

      $event.emit('REQUEST_TOGGLE_SIDEBAR', false)
    })
  })
})

function handleClose() {
  handleNext({
    component: null,
    data: {},
  })
}

provide('handleNext', handleNext)
</script>

<template>
  <div :class="{ show }" class="Tutorial">
    <div class="TutorialMain">
      <div ref="main" class="TutorialInner transition-cubic">
        <component :is="options.component" v-if="options.component" />
      </div>

      <div class="TutorialDialog-Close" @click="handleClose">
        跳过引导
      </div>
    </div>
  </div>
</template>

<style lang="scss">
.TutorialInner {
  position: absolute;
  padding: 2rem;
  display: flex;

  align-items: center;
  justify-content: center;
  flex-direction: column;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;
}

.TutorialDialog-Close {
  &:hover {
    opacity: 0.75;
  }
  position: absolute;

  top: 1rem;
  right: 1rem;

  opacity: 0.5;
  cursor: pointer;
  color: var(--el-text-color-secondary);
}

.Tutorial {
  &Main {
    .show & {
      transform: translate(-50%, -50%) scale(1);

      transition: 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
    }
    position: absolute;

    top: 50%;
    left: 50%;

    width: 720px;
    max-width: 85%;
    height: 580px;
    max-height: 75%;

    border-radius: 16px;
    box-shadow: var(--el-box-shadow);
    transform: translate(-50%, -50%) scale(1.25);
    background-color: var(--el-bg-color);

    transition: 0.35s cubic-bezier(0.25, 0.8, 0.25, 1);
  }

  &.show {
    opacity: 1;
    transform: scale(1);

    pointer-events: all;
  }
  z-index: 10;
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  opacity: 0;
  pointer-events: none;
  transform: scale(1.25);
  background-color: var(--el-overlay-color);

  transition:
    opacity 0.5s cubic-bezier(0.25, 0.8, 0.25, 1),
    transform 2s cubic-bezier(0.25, 0.8, 0.25, 1);
}
</style>
