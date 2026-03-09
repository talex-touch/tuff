<script setup lang="ts">
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'
import { models } from '~/components/model/model'
import { QuotaModel } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  modelValue: string
  done: boolean
  page: number
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'retry', model?: QuotaModel): void
}>()

const expand = ref(!false)
const hover = ref(false)
const hoverMode = debouncedRef(hover, 200)
const model = useVModel(props, 'modelValue', emits)

const modelInfo = reactive([
  {
    icon: 'i-carbon:flash-filled',
    name: '标准',
    label: '标准模型',
    value: 'this-normal',
    model: QuotaModel.QUOTA_THIS_NORMAL,
    desc: '快到极致，迅猛如电',
  },
  {
    icon: 'i-carbon:circle-filled',
    name: '强化',
    label: '强化模型',
    value: 'this-normal-turbo',
    desc: '复杂任务的好手，更应手',
    model: QuotaModel.QUOTA_THIS_NORMAL_TURBO,
    lock: () => userStore.value?.subscription?.type === 'STANDARD' || userStore.value?.subscription?.type === 'ULTIMATE',
  },
  {
    icon: 'i-carbon:watsonx-ai',
    name: '高级',
    label: '高级模型',
    value: 'this-normal-ultimate',
    desc: '不只是模态能力，来试试',
    model: QuotaModel.QUOTA_THIS_NORMAL_ULTRA,
    lock: () => userStore.value?.subscription?.type === 'ULTIMATE',
  },
])

const curModel = computed(() => models.find(_model => _model.key === model.value))

const modelSelector = ref()
const modelFloating = ref()

const { floatingStyles } = useFloating(modelSelector, modelFloating, {
  middleware: [offset(10), flip()],
  whileElementsMounted: autoUpdate,
})

watchEffect(() => {
  const _ = props.page

  if (props.done) {
    setTimeout(async () => {
      if (!curModel.value?.name)
        return
      expand.value = true

      await sleep(1200)

      expand.value = false
    }, 500)
  }
})

async function handleRetry(model?: any) {
  await sleep(400)

  const lockable = model?.lock?.() ?? true
  if (!lockable)
    return

  emits('retry', model?.model)
}
</script>

<template>
  <span
    ref="modelSelector" :class="{ expand: expand || hoverMode }" class="ItemModelSelector"
    @mouseenter="hoverMode = hover = true" @mouseleave="hover = false"
  >
    <i i-carbon:renew op-50 />
    <span v-if="curModel" class="model-name transition-cubic">
      {{ curModel.name }}
    </span>
    <i style="font-size: 10px;opacity: 0.5" i-carbon:chevron-down />
  </span>

  <teleport to="#teleports">
    <div
      ref="modelFloating" :class="{ hover: hoverMode }" :style="floatingStyles" class="ItemModelSelector-Floating"
      @mouseenter="hoverMode = hover = true" @mouseleave="hover = false"
    >
      <div class="ItemModelSelector-Popover">
        <p mb-2 op-50>
          选择模型
        </p>
        <div class="model-selector-content">
          <div
            v-for="_model in modelInfo" :key="_model.value" v-wave :class="{ lock: !(_model.lock?.() ?? true) }"
            class="model-popover-item" @click="handleRetry(_model)"
          >
            <div class="icon fake-background">
              <i :class="_model.icon" />
            </div>
            <div class="main">
              <p class="title">
                {{ _model.label }}
              </p>
              <p class="desc">
                {{ _model.desc }}
              </p>
            </div>

            <div class="lock">
              <div i-carbon:locked />
            </div>
          </div>
        </div>
        <template v-if="curModel">
          <el-divider style="margin: 12px 0" />
          <div v-wave class="model-selector-content" @click="handleRetry()">
            <div class="model-popover-item">
              <div class="icon fake-background">
                <i i-carbon:renew />
              </div>
              <div class="main">
                <p class="title">
                  再次尝试
                </p>
                <p class="desc">
                  {{ curModel.label }}
                </p>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.ItemModelSelector-Popover {
  .model-selector-content {
    display: flex;
    flex-direction: column;

    gap: 0.5rem;
  }
  .model-popover-item {
    .lock {
      display: none;
    }

    &.lock .lock {
      position: absolute;
      display: flex;

      align-items: center;
      justify-content: center;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      font-size: 20px;
      font-weight: 600;

      opacity: 0;
      transition: 0.25s;
      background-color: var(--el-color-danger);
    }

    .icon {
      i {
        display: block;
      }
      // z-index: 1;
      position: relative;
      display: flex;

      align-items: center;
      justify-content: center;

      width: 32px;
      height: 32px;

      overflow: hidden;
      border-radius: 50%;
      --fake-opacity: 0;
      --fake-color: var(--theme-color);
      // background-color: var(--el-bg-color);
    }
    .main p.desc {
      opacity: 0.75;
      font-size: 12px;
    }
    position: relative;
    display: flex;
    padding: 0.75rem;

    width: 100%;
    height: 64px;

    gap: 0.5rem;
    align-items: center;

    cursor: pointer;
    overflow: hidden;
    border-radius: 8px;
    &:hover {
      .lock {
        opacity: 0.75;

        backdrop-filter: blur(18px);
      }
      .icon {
        --fake-opacity: 1;
      }
      &::after {
        opacity: 0.5;
      }
    }
    &::after {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0;
      filter: blur(18px);
      background-color: var(--el-overlay-color);
    }
  }

  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    filter: blur(8px);
    background-color: var(--el-bg-color);
  }
  position: absolute;
  padding: 1rem;

  // left: 0;
  // top: 2rem;

  // width: 248px;
  // min-height: 248px;

  border-radius: 16px;
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--el-border-color);

  opacity: 0;
  transform: scale(0.9) translateY(10%);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;
  transform-origin: center 10%;

  backdrop-filter: blur(18px) saturate(180%);

  .hover & {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.ItemModelSelector-Floating {
  .mobile & {
    display: none;
  }
  &.hover {
    pointer-events: all;
  }
  z-index: 1;
  position: absolute;

  width: 248px;
  height: 365px;

  transition: 0.25s;
  pointer-events: none;
}

.ItemModelSelector {
  &:hover,
  &.expand {
    .model-name {
      opacity: 0.5;
      max-width: 150px;

      transition: 0.5s;
    }

    background-color: var(--el-bg-color-page);
  }
  .model-name {
    position: relative;

    max-width: 0;

    opacity: 0;

    font-size: 12px;

    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  position: relative;
  display: flex;
  padding: 0.25rem;

  gap: 0.25rem;
  align-items: center;
  justify-content: space-between;

  width: max-content;

  cursor: pointer;
  border-radius: 8px;
  transition: 0.15s;
}
</style>
