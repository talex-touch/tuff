<script setup lang="ts">
import type { IChatInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'

interface ThInputCapabilities {
  thinking: boolean
  websearch: boolean
  file: boolean
}

interface InputOption {
  icon: string
  type: 'button' | 'checkbox' | 'slider'
  label: string
  info: string
  onclick?: () => void
  checked?: () => boolean
  disabled?: () => boolean
  disabledTip?: string
  model?: number
}

const props = defineProps<{
  hide: boolean
  modelValue: IChatInnerItemMeta
  capabilities?: Partial<ThInputCapabilities>
  pilotMode?: boolean
}>()

const emits = defineEmits<{
  (name: 'update:modelValue', data: IChatInnerItemMeta): void
  (event: 'file'): void
  (event: 'togglePilotMode'): void
}>()

const hover = ref(false)
const hoverMode = debouncedRef(hover, 200)

const stareMode = ref(false)
const property = useVModel(props, 'modelValue', emits)
const normalizedCapabilities = computed<ThInputCapabilities>(() => ({
  thinking: props.capabilities?.thinking !== false,
  websearch: props.capabilities?.websearch !== false,
  file: props.capabilities?.file !== false,
}))

const { isSupported, isActive, request, release } = useWakeLock()
const { charging, level } = useBattery()

watchEffect(() => {
  if (!charging.value && level.value <= 0.2) {
    if (stareMode.value) {
      release()
      stareMode.value = false

      ElNotification({
        title: '已自动取消凝视模式',
        message: '设备电量过低，已自动取消凝视模式。您可在设备充电或电量大于等于20%时重新打开。',
        duration: 30000,
      })
    }
  }
})

const now = useTimestamp()
let startTime = -1

watch(isActive, () => {
  stareMode.value = isActive.value

  if (!stareMode.value) {
    release()

    ElNotification({
      title: '凝视模式已失效',
      message: '退出页面会导致凝视模式失效，请重新打开。',
      duration: 30000,
    })
  }
  else {
    startTime = Date.now()
  }
})

watch(() => now.value - startTime, (val) => {
  if (startTime !== -1 && val >= 45 * 60 * 1000) {
    startTime = -1

    ElNotification({
      title: '凝视模式已取消',
      message: '凝视模式单次最长可用 45分钟，若需更多时间，请重新打开。',
      duration: 30000,
    })
  }
})

const options = computed<InputOption[]>(() => {
  const rows: Array<InputOption | undefined> = [
    {
      icon: 'i-carbon-document-attachment',
      type: 'button',
      label: '分析文件',
      info: '选择图片、文档、表格、PDF 等文件进行分析。',
      onclick: () => {
        emits('file')
      },
      disabled: () => !normalizedCapabilities.value.file,
      disabledTip: '当前模型组未开启文件分析能力。',
    },
    {
      icon: 'i-carbon-ibm-cloud-internet-services',
      type: 'checkbox',
      label: '联网能力',
      info: '联网能力将允许模型访问互联网，以获取更准确的结果。',
      onclick: () => {
        property.value.internet = !property.value.internet
      },
      checked: () => normalizedCapabilities.value.websearch && property.value.internet !== false,
      disabled: () => !normalizedCapabilities.value.websearch,
      disabledTip: '当前模型组未开启联网能力。',
    },
    {
      icon: 'i-carbon:flash',
      type: 'checkbox',
      label: '思考模式',
      info: '开启后优先使用支持 thinking 的模型能力，复杂问题通常更稳。可随时关闭。',
      onclick: () => {
        property.value.thinking = !property.value.thinking
      },
      checked: () => normalizedCapabilities.value.thinking && property.value.thinking !== false,
      disabled: () => !normalizedCapabilities.value.thinking,
      disabledTip: '当前模型组未开启 thinking 能力。',
    },
    {
      icon: 'i-carbon-machine-learning-model',
      type: 'checkbox',
      label: 'Pilot 模式',
      info: '开启后优先走 Pilot 编排链路（Graph 优先），用于复杂任务协同。',
      onclick: () => {
        emits('togglePilotMode')
      },
      checked: () => props.pilotMode === true,
    },
    isSupported.value
      ? {
          icon: 'i-carbon:cube-view',
          type: 'checkbox',
          label: '凝视模式',
          info: '凝视模式会阻止屏幕息屏，在电量过低时会自动取消。',
          onclick: () => {
            const curMode = stareMode.value

            if (curMode) {
              release()

              stareMode.value = false
            }
            else {
              request('screen')

              if (isActive.value)
                stareMode.value = true
            }
          },
          checked: () => stareMode.value,
        }
      : undefined,
    {
      icon: 'i-carbon:temperature-celsius-alt',
      type: 'slider',
      label: '随机性',
      info: '随机性越大，模型越容易产生不连贯的文本，但同时，它也会更难理解。',
      model: property.value.temperature,
    },
  ]
  return rows.filter((item): item is InputOption => Boolean(item))
})

function handleOptionClick(option: InputOption) {
  if (option.disabled?.()) {
    if (option.disabledTip) {
      ElMessage.warning(option.disabledTip)
    }
    return
  }
  option.onclick?.()
}

const buttonTrigger = ref()
const popoverFloating = ref()

const { floatingStyles, update } = useFloating(buttonTrigger, popoverFloating, {
  placement: 'top',
  middleware: [offset(25), flip()],
  whileElementsMounted: autoUpdate,
})

watch(hoverMode, update)
</script>

<template>
  <div :class="{ hide }" class="ThInput-Plus fake-background" @mouseenter="hoverMode = hover = true" @mouseleave="hover = false">
    <div ref="buttonTrigger" class="button" i-carbon-add-large />
  </div>

  <teleport to="body">
    <div ref="popoverFloating" :class="{ hover: hoverMode }" :style="floatingStyles" class="ThInput-PlusWrapper">
      <div class="ThInput-Plus-Option fake-background">
        <div
          v-for="option in options" :key="option.label" v-wave :class="{ checked: option.checked?.(), disabled: option.disabled?.() }"
          class="ThInput-Plus-Option-Item" @mouseenter="hoverMode = hover = true" @mouseleave="hover = false"
          @click="handleOptionClick(option)"
        >
          <template v-if="option.type === 'button'">
            <div :class="option.icon" />
            <div>{{ option.label }}</div>
          </template>
          <template v-else-if="option.type === 'checkbox'">
            <div :class="option.icon" />
            <div>{{ option.label }}</div>

            <div class="checkbox-status">
              <div i-carbon-checkmark />
            </div>
          </template>
          <template v-else-if="option.type === 'slider'">
            <InputOptionSlider v-model="option.model" />
            <!-- <el-slider v-model="option.model" /> -->

            <div :class="option.icon" />
            <div class="slider-wrapper">
              <span>{{ option.label }}</span>

              <div style="opacity: .75;font-size: 14px" class="checkbox-status">
                {{ option.model }}%
              </div>
            </div>
          </template>

          <div class="ThInput-Plus-Option-ItemInfo">
            <p>{{ option.info }}</p>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.ThInput-PlusWrapper {
  &.hover {
    pointer-events: all;
  }
  z-index: 2;

  width: 190px;
  height: auto;

  pointer-events: none;
}

.ThInput-Plus-Option {
  &-Item {
    &Info {
      position: absolute;
      padding: 1rem;
      margin-left: 1rem;

      top: 0;
      left: 100%;

      width: max-content;
      max-width: 100%;

      height: auto;
      max-height: 120px;

      font-size: 14px;
      overflow-y: scroll;
      border-radius: 18px;
      box-shadow: var(--el-box-shadow);
      background-color: var(--el-bg-color);

      transform: scale(0) translateY(10%);
      transition: 0.25s;
      transform-origin: top left;
    }

    &:hover {
      .ThInput-Plus-Option-ItemInfo {
        transform: scale(1) translateY(0);
        opacity: 1;
      }
    }

    .slider-wrapper {
      .checkbox-status {
        top: 4px;
        right: 0.25rem;
      }

      > span {
        position: absolute;

        top: 0;
        left: 0;

        width: max-content;
      }

      position: relative;

      top: 0;

      width: 100%;
      height: calc(40px - 1rem);

      pointer-events: none;
    }

    // .el-slider {
    //   z-index: 1;
    //   position: absolute;

    //   top: 0;
    //   left: 0;

    //   height: 100%;

    //   opacity: 0.25;
    //   // --el-slider-height: 100%;
    //   // --el-slider-border-radius: 12px;

    //   // &__bar {
    //   //   border-radius: 12px;
    //   // }

    //   // &__button-wrapper {
    //   //   // visibility: hidden;
    //   // }
    // }

    .checkbox-status {
      z-index: 1;
      position: absolute;

      top: 0.75rem;
      right: 1rem;

      opacity: 0;
      transition: 0.25s;
    }

    &:hover {
      color: var(--el-color-primary);

      cursor: pointer;

      border-radius: 12px;
      background-color: var(--el-border-color-extra-light);
    }

    &.disabled {
      opacity: 0.45;
      cursor: not-allowed;
      pointer-events: auto;
      color: var(--el-text-color-secondary);

      &:hover {
        color: var(--el-text-color-secondary);
        background-color: transparent;
      }
    }

    &.checked {
      color: var(--el-color-success);

      .checkbox-status {
        opacity: 1;
      }
    }

    position: relative;
    margin: 0.25rem 0;
    padding: 0.5rem 0.5rem;
    display: flex;

    gap: 0.5rem;
    align-items: center;

    user-select: none;
  }

  .hover & {
    opacity: 1;
    transform: translate(50%) translateX(-24px) scale(1) translateY(0);
  }

  position: absolute;
  padding: 0.5rem 0.5rem;

  width: 100%;
  height: auto;

  border-radius: 18px;
  box-shadow: var(--el-box-shadow);

  opacity: 0;
  --fake-opacity: 0.5;
  transform: translateX(50%) translateX(-24px) scale(0.9) translateY(10%);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;

  backdrop-filter: blur(18px) saturate(180%);
}

.ThInput-Plus {
  &:hover {
    .ThInput-Plus-Option {
      opacity: 1;
      transform: translateY(-50px) translateY(0%) scale(1);
    }

    cursor: pointer;
    --fake-opacity: 0.5;
    // background: var(--el-border-color-extra-light);
  }

  .button:active {
    transform: scale(0.75);
    transition: 0.25s;
  }

  &.hide {
    margin-right: 0;
    width: 0;
  }

  z-index: 20;
  position: relative;
  margin-right: 0.5rem;
  display: flex;

  align-items: center;
  justify-content: center;

  width: 32px;
  height: 32px;

  border-radius: 12px;
  transition: 0.25s;

  --fake-opacity: 0;

  .generating & {
    opacity: 0;
  }
}
</style>
