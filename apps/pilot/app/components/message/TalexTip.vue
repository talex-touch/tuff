<script setup>
// import Mention from '~/components/common/icon/Mention.vue'

const props = defineProps({
  message: String | Object,
  stay: Number,
  close: Function,
  type: TipType,
  loading: Boolean,
  left: Boolean,
})

// const mode = toRef(props, 'type')

// const msg = computed(() => props.message.value || props.message)
const shade = ref(false)
const msg = ref('')
const _type = computed(() => props.type.value || props.type)

watchEffect(async () => {
  shade.value = true

  const content = props.message.value || props.message
  await sleep(200)
  msg.value = content
  await sleep(300)

  shade.value = false
})
onMounted(async () => {
  if (props.stay <= 0)
    return

  await sleep(props.stay)

  props.close()
})
</script>

<script>
export default {
  name: 'TalexTip',
}
</script>

<template>
  <div
    :message="msg" class="TalexTip-Container"
    :class="{ 'info-tip': _type === TipType.INFO,
              left,
              'warn-tip': _type === TipType.WARNING,
              'error-tip': _type === TipType.ERROR,
              'success-tip': _type === TipType.SUCCESS,
              'loading-tip': loading || _type === 'loading',
              'text-shade': shade }"
  >
    {{ msg }}
    <div class="TalexTip-Icon-Wrapper">
      <Mention :mode="_type" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@keyframes whole-shade {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0;
    transform: scale(0.75);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes text-shade {
  0% {
    opacity: 1;
    transform: translate(-17px, -50%) translateX(0);
  }
  25% {
    opacity: 0;
    transform: translate(-17px, -50%) translateX(5px);
  }
  75% {
    opacity: 0;
    transform: translate(-17px, -50%) translateX(-5px);
  }
  100% {
    opacity: 1;
    transform: translate(-17px, -50%) translateX(0);
  }
}

@keyframes text-shade-left {
  0% {
    opacity: 1;
    transform: translate(15px, -50%) translateX(0);
  }
  25% {
    opacity: 0;
    transform: translate(15px, -50%) translateX(-5px);
  }
  75% {
    opacity: 0;
    transform: translate(15px, -50%) translateX(5px);
  }
  100% {
    opacity: 1;
    transform: translate(15px, -50%) translateX(0);
  }
}

.TalexTip-Container {
  .TalexTip-Icon-Wrapper {
    position: relative;
    display: inline-block;

    top: -5px;
    left: 0px;

    width: 16px;
    height: 16px;

    transform: scale(0.5);
    --bg-color: var(--theme-color);
  }
  &:before {
    z-index: 0;
    content: '';
    position: absolute;

    width: 100%;
    height: 100%;

    top: 0;
    left: 0;

    border-radius: 8px;
    //background-color: var(--el-bg-color);
    filter: invert(5%);
    box-shadow: var(--el-box-shadow-light);
    backdrop-filter: contrast(200%) saturate(180%) blur(10px);
    transition: 0.5s;
  }
  &:after {
    z-index: 10;
    content: attr(message);
    position: absolute;

    width: 100%;
    //height: 100%;

    top: 50%;
    left: 0;

    text-align: center;
    //color: var(--el-text-color-primary);
    transform: translate(-17px, -50%);
    transition: 0.25s;
  }

  position: relative;
  padding: 8px 25px 8px 6px;

  max-width: 100%;
  width: max-content;
  height: 30px;
  font-size: 18px;
  line-height: 30px;
  text-indent: 10px;

  color: var(--theme-color, var(--el-text-color-primary));
  border-radius: 8px;
  user-select: none;
  transition:
    box-shadow 0.5s,
    0.25s;
  //background-color: var(--el-bg-color);
}

.TalexTip-Container.text-shade {
  &:after {
    animation: text-shade 0.5s;
  }
  animation: whole-shade 0.05s 0.1s;
}

.TalexTip-Container.left.text-shade {
  &:after {
    animation: text-shade-left 0.5s !important;
  }
  animation: whole-shade 0.1s 0.05s;
}

.TalexTip-Container.left {
  padding: 8px 11px 8px 25px;
  .TalexTip-Icon-Wrapper {
    left: calc(-100% + 5px);

    width: 16px;
    height: 16px;

    transform: scale(0.5);
    --bg-color: var(--theme-color);
  }
  &:after {
    transform: translate(15px, -50%);
  }
}

.success-tip {
  --theme-color: var(--el-color-success);
  --theme-light-color: var(--el-color-success-light-5);
}

.info-tip {
  --theme-color: var(--el-color-primary);
  --theme-light-color: var(--el-color-primary-light-5);
}

.warn-tip {
  --theme-color: var(--el-color-warning);
  --theme-light-color: var(--el-color-warning-light-5);
}

.error-tip {
  --theme-color: var(--el-color-error);
  --theme-light-color: var(--el-color-error-light-5);
}

//.loading-tip {
//
//  box-shadow: 0 0 2px 0 var(--theme-color) inset,
//  0 0 4px 2px var(--theme-light-color);
//
//}
</style>
