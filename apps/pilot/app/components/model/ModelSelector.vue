<script setup lang="ts">
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'
import { models } from './model'

const props = defineProps<{
  modelValue: string
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const hover = ref(false)
const hoverMode = debouncedRef(hover, 200)

const model = useVModel(props, 'modelValue', emits)

const curSelect = computed(() => models.find(item => item.key === model.value))

const modelSelector = ref()
const modelFloating = ref()

const isMobile = document.body.classList.contains('mobile')

const { floatingStyles } = useFloating(modelSelector, modelFloating, {
  placement: isMobile ? 'bottom' : 'top-start',
  middleware: [offset(10, /* ({ rects }) => ({
    crossAxis: -rects.floating.width / 2,
  }) */), flip()],
  whileElementsMounted: autoUpdate,
})
</script>

<template>
  <div
    ref="modelSelector" :class="{ expand: hoverMode }" class="ModelSelector" @mouseenter="hoverMode = hover = true"
    @mouseleave="hover = false"
  >
    <span class="model-name" :class="[curSelect!.key]">
      <img :src="curSelect!.img">{{ curSelect!.name }}
      <div i-carbon-chevron-up />
    </span>
  </div>

  <teleport to="#teleports">
    <div
      ref="modelFloating" :class="{ hover: hoverMode }" :style="floatingStyles" class="ModelSelector-Floating"
      @mouseenter="hoverMode = hover = true" @mouseleave="hover = false"
    >
      <div class="ModelSelector-Selections fake-background">
        <p mb-0 class="title">
          模型列表
        </p>

        <ModelInner v-model="model" />
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.ModelSelector-Selections {
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

  width: 100%;
  height: 100%;

  border-radius: 16px;
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--el-border-color);

  opacity: 0;
  transform: scale(0.9) translateY(-10%);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;
  transform-origin: center 10%;

  backdrop-filter: blur(18px) saturate(180%);

  .hover & {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.ModelSelector-Floating {
  &.hover {
    pointer-events: all;
  }

  z-index: 1;
  position: absolute;

  width: 300px;
  height: 365px;
  max-height: 60vh;

  transition: 0.25s;
  pointer-events: none;
}

.ModelSelector {
  &:hover {
    .model-name div {
      transform: rotate(180deg);
    }

    cursor: pointer;
  }

  .model-name {
    &::before {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      right: 0;

      width: 100%;
      height: 100%;

      opacity: 0.05;
      filter: blur(5px);
      background-color: #00000050;
    }

    .wallpaper & {
      &::before {
        opacity: 1;
      }
    }

    img {
      width: 24px;
      height: 24px;
    }

    &.this-normal-turbo {
      color: #348475;
      font-weight: 600;
      text-shadow: 0 0 2px #34847500;
    }

    &.this-normal-ultra {
      color: #9b5122;
      font-weight: 600;
      text-shadow: 0 0 2px #34847500;
    }

    div {
      transition: 0.25s;
    }
    position: relative;
    display: flex;

    gap: 0.5rem;
    align-items: center;

    text-shadow: 0 0 2px currentColor;
  }

  .mobile & {
    font-size: 14px;
  }

  position: relative;

  top: 0;
  right: 0;

  user-select: none;
}
</style>
