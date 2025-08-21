<script setup lang="ts" name="BoxInput">
import { BoxMode } from '../../modules/box/adapter'

interface Props {
  modelValue: string
  boxOptions: {
    mode: BoxMode
    data?: {
      feature?: {
        desc?: string
        name?: string
      }
    }
  }
}

interface Emits {
  (e: 'update:modelValue', value: string): void
}

const slots = useSlots()
const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const inputEl = ref<HTMLInputElement | null>(null)

defineExpose({
  inputEl,
  focus: () => inputEl.value?.focus()
})

const options = reactive({
  focus: false
})

const inputValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

const placeholder = computed(() => {
  return props.boxOptions.mode === BoxMode.FEATURE
    ? (props.boxOptions.data?.feature?.desc ?? props.boxOptions.data?.feature?.name)
    : 'Everything in tuff.'
})
</script>

<template>
  <div class="BoxInput-Wrapper">
    <span :class="{ hidden: inputValue }" class="BoxInput-Placeholder transition-cubic">{{
      placeholder
    }}</span>
    <input
      id="core-box-input"
      ref="inputEl"
      v-model="inputValue"
      @focus="options.focus = true"
      @blur="options.focus = false"
    />
    <div class="BoxInput-Display">
      <span class="opacity-0">{{ modelValue }}</span>
      <div v-show="slots.completion" class="BoxInput-Display-Completion fake-background">
        <slot name="completion" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.BoxInput-Wrapper {
  position: relative;

  flex: 1;
  display: flex;
  align-items: center;
  font-size: 22px;
  height: 52px !important;
}

.BoxInput-Display {
  position: absolute;
  display: flex;
  align-items: center;

  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  //transform: translateY(-50%);

  pointer-events: none;
}

.BoxInput-Display-Completion {
  position: relative;
  margin: 0 0.25rem;
  padding: 0 0.5rem;

  font-size: 18px;
  line-height: 38px;
  opacity: 0.4;
  --fake-inner-opacity: 0.7;
  --fake-color: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.BoxInput-Placeholder {
  &.hidden {
    opacity: 0;
    filter: blur(5px);
  }
  position: absolute;

  top: 50%;
  left: 0;
  transform: translateY(-50%);

  pointer-events: none;
  color: var(--el-text-color-placeholder);
  opacity: 0.75;
}

input {
  position: absolute;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  outline: none;
  border: none;

  font-size: 22px;

  border-radius: 8px;
  background-color: transparent;
  //color: transparent;

  caret-color: var(--el-text-color-primary);

  // opacity: 0;
}
</style>
