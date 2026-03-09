<script setup>
// import Mention from '~/components/common/icon/Mention.vue'

const props = defineProps({
  list: Object,
  close: Function,
})
const dom = ref(null)
const nowStatus = ref()

// const _type = ref() //computed(() => props.type.value || props.type)

onMounted(async () => {
  while (props.list[0])

    await mention(props.list.pop())

  props.close()
})

async function mention(tip) {
  nowStatus.value = tip.type

  const el = dom.value
  const style = el.style

  await sleep(50)

  style.transform = 'translate(-50%, 0)'

  await sleep(100)

  style.setProperty('--radius', '4px')

  await sleep(150)

  for (const c of [...tip.content]) {
    el.innerText += c

    await sleep(20)
  }

  await sleep(150)

  if (tip?.emphasis) {
    style.boxShadow = '0 0 4px 2px var(--theme-color)'

    await sleep(150)
  }

  await sleep(tip.time)

  style.boxShadow = ''

  await sleep(150)

  while (el.innerText) {
    el.innerText = el.innerText.substring(0, el.innerText.length - 1)

    await sleep(20)
  }

  await sleep(150)

  style.setProperty('--radius', '50%')

  await sleep(100)

  style.transform = 'translate(-50%, 0) translateY(100px) scale(0)'

  await sleep(200)
}
</script>

<script>
export default {
  name: 'WikiMentioner',
}
</script>

<template>
  <teleport to="body">
    <div
      ref="dom" class="WikiMentioner-Wrapper"
      :class="{ 'info-tip': nowStatus === TipType.INFO,
                'warn-tip': nowStatus === TipType.WARNING,
                'error-tip': nowStatus === TipType.ERROR,
                'success-tip': nowStatus === TipType.SUCCESS }"
    >
      <!--      <Mention v-if="nowStatus" :mode="nowStatus"/> -->
      <!--      <div class="WikiMentioner-Container"> -->

      <!--      </div> -->
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.WikiMentioner-Wrapper {
  &:before {
    content: '';
    position: absolute;

    left: 0;
    bottom: 0;

    width: 100%;
    height: 100%;

    opacity: 0.45;
    filter: invert(5%);
    border-radius: var(--radius);
    background-color: var(--theme-color, var(--el-text-color-regular));
    box-shadow:
      0 0 1px 2px var(--theme-color, var(--el-text-color-regular)) inset,
      var(--el-box-shadow-light);
    transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  }
  z-index: 10000;
  position: absolute;
  padding: 4px 8px;
  display: flex;

  left: 50%;
  bottom: 80px;

  width: max-content;
  min-width: 24px;
  height: 32px;
  line-height: 34px;

  user-select: none;
  user-focus: -1;
  color: var(--theme-color, var(--el-text-color-regular));
  --radius: 50%;
  border-radius: var(--radius);
  backdrop-filter: saturate(200%) blur(10px);
  transform: translate(-50%, 0) translateY(100px) scale(0);
  transition: 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.success-tip {
  --theme-color: #629168;
}

.info-tip {
  --theme-color: #284f90;
}

.warn-tip {
  --theme-color: #f0a732;
}

.error-tip {
  --theme-color: #d0493c;
}
</style>
