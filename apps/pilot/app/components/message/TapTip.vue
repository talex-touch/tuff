<script lang="ts" name="TipTap" setup>
import Mention from '../icon/Mention.vue'
import { TipType } from '#imports'
import type { ITip } from '~/composables/tip/tipper'
import { useRequestAnimationFrame } from '~/composables/common'

const props = defineProps < {

  close: Function

  tip: ITip
} >()
const msg = ref('')
const dom = ref<HTMLElement>()

async function _parseContent() {
  const el = dom.value
  if (!el)
    return

  const lastWidth = el.style.width || '0px'

  el.style.width = ''
  msg.value = props.tip.message

  await useRequestAnimationFrame()

  const w = el.scrollWidth

  el.style.width = lastWidth

  await useRequestAnimationFrame()

  el.style.width = `calc(${w}px + 0.5rem)`
}

const parseContent = useDebounceFn(() => nextTick(_parseContent))

watchEffect(async () => {
  const _content = props.tip.message

  parseContent()
})

let timer: any
async function stayTimer(time: number) {
  clearTimeout(timer)

  if (time <= 0)
    return

  timer = setTimeout(() => {
    if (props.tip.loading)
      return

    props.close()
  }, time)
}

watchEffect(() => {
  const { stay, loading } = props.tip

  if (stay > 0 && !loading)
    stayTimer(stay)
})

const type = computed(() => props.tip.type)
</script>

<template>
  <div
    ref="dom" :message="msg" class="TapTip fake-background transition-cubic" :class="{
      'info-tip': type === TipType.INFO,
      'warn-tip': type === TipType.WARNING,
      'error-tip': type === TipType.ERROR,
      'success-tip': type === TipType.SUCCESS,
      'loading-tip': tip.loading,
    }"
  >
    <IconLoadingIcon />
    <p>{{ msg }}</p>
  </div>
</template>

<style lang="scss">
.TapTip {
  .LoadingIcon-Container {
    margin-right: -32px;
    opacity: 0;

    transition: 0.25s;
  }

  &.loading-tip .LoadingIcon-Container {
    margin-right: 0;
    opacity: 1;
  }

  p {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  position: relative;
  display: flex;
  padding: 1rem 0;

  max-width: 100%;
  height: 40px;
  font-size: 18px;
  // line-height: 30px;

  gap: 0.5rem;
  align-items: center;
  justify-content: center;

  opacity: 1;
  border-radius: 18px;
  user-select: none;
  overflow: hidden;
  color: var(--theme-color, var(--el-text-color-primary));
  backdrop-filter: blur(18px) saturate(180%);

  --fake-opacity: 0.75;
  --bg-color: currentColor;
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

.loading-tip {
  box-shadow:
    0 0 2px 0 var(--theme-color) inset,
    0 0 4px 2px var(--theme-light-color);
}
</style>
