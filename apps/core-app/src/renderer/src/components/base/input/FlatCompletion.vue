<template>
  <div class="FlatInput-Container" ref="completionInput">
    <FlatInput placeholder="Search..." v-model="value" :icon="icon" />
  </div>
  <teleport to="body">
    <div @click="value = ''" class="FlatInput-Completion" ref="completionWrapper">
      <!--      <el-scrollbar>-->
      <div
        v-wave
        class="FlatInput-Completion-Item fake-background"
        :style="`--d: ${index * 0.125}s`"
        v-for="(item, index) in _res"
        :key="item"
      >
        <slot :item="item">
          {{ item }}
        </slot>
      </div>
      <!--      </el-scrollbar>-->
    </div>
  </teleport>
</template>

<script setup name="FlatCompletion">
import FlatInput from '@comp/base/input/FlatInput.vue'
import { sleep } from '@talex-touch/utils/common/utils'
import { computePosition } from '@floating-ui/vue'

const props = defineProps({
  icon: {
    type: String,
    default: 'search'
  },
  fetch: {
    type: Function,
    require: true
  }
})

const _res = ref([])
const res = ref([])
const completionInput = ref()
const completionWrapper = ref()
const value = ref()

watch(
  () => value.value,
  () => {
    nextTick(blur)
  },
  { deep: true, immediate: true }
)

watch(
  () => res.value,
  async () => {
    const el = completionWrapper.value

    for (const item of [...el.children].reverse()) {
      setTimeout(async () => {
        item.classList.add('remove')
        // // opacity: 0 !important;
        // // filter: blur(10px) !important;
        // // transform: translateY(10px) scaleY(1.1) !important;
        //
        // Object.assign(item.style, {
        //   // opacity: 0,
        //   // filter: "blur(10px)",
        //   // transform: "translateY(10px) scaleY(1.1)",
        //   // reverse the animation
        //   animationDirection: "reverse",
        //   // remove animation forwards
        //   animationFillMode: "none",
        // })

        await sleep(500)
        item?.remove()
      })
      await sleep(125)
    }

    await sleep(600)

    _res.value = res.value
  }
)

function blur() {
  if (!value.value) value.value = ''
  res.value = props.fetch(value.value)

  if (res.value.length > 8) res.value = res.value.slice(0, 8)

  nextTick(async () => {
    const floating = await computePosition(completionInput.value, completionWrapper.value)

    Object.assign(completionWrapper.value.style, {
      top: `${floating.y}px`,
      left: `${floating.x}px`
    })
  })
}
</script>

<style lang="scss" scoped>
.FlatInput-Completion {
  z-index: 100;
  position: absolute;
  display: flex;
  padding: 10px;

  flex-direction: column;
  justify-content: center;
  align-items: center;

  max-height: 380px;
  //background-color: var(--el-fill-color-extra-light);
  border-radius: 50px;
  //box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.2);
  overflow: hidden;

  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

  .FlatInput-Completion-Item {
    position: relative;
    margin: 5px 0;
    padding: 10px;
    cursor: pointer;

    width: max-content;

    opacity: 0;

    animation: fade-in 0.5s var(--d) cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;
    transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

    --fake-opacity: 0.5;
    --fake-radius: 4px;
    border-radius: var(--fake-radius);
    box-sizing: border-box;
    backdrop-filter: blur(16px) saturate(180%);
    &:hover {
      --fake-opacity: 0.8;
    }
    &.remove {
      animation: fade-out 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86) forwards;
    }
  }
}

@keyframes fade-out {
  from {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scaleY(1);
  }
  to {
    opacity: 0;
    filter: blur(10px);
    transform: translateY(10px) scaleY(1.1);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
    filter: blur(10px);
    transform: translateY(10px) scaleY(1.1);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scaleY(1);
  }
}
</style>
