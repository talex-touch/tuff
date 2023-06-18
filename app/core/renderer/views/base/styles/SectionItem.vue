<template>
  <div @mouseenter="handleEnter" @mouseleave="handleLeave" relative cursor-pointer h-full border-rounded flex items-center
    justify-center :class="{ disabled, active: value === title }" class="SectionItem-Container transition-cubic">
    <div class="SectionItem-Display" :class="title">
      <div v-shared-element:[`theme-preference-${title}-img`] :style="`filter: ${filter}`" />
    </div>
    <div @click="goRouter" flex items-center cursor-pointer justify-center class="SectionItem-Bar fake-background">
      <span v-shared-element:[`theme-preference-${title}`]>
        {{ title }}
      </span>
    </div>
  </div>
</template>

<script name="SectionItem" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer/ref';
import { useRouter } from 'vue-router';

const router = useRouter()

const props = defineProps({
  modelValue: {
    type: String,
    default: false
  },
  title: {
    type: String,
    default: 'Section'
  },
  filter: {
    type: String,
    default: 'blur(0px)'
  },
  disabled: {
    type: Boolean,
    default: false
  }
})
const emits = defineEmits([
  'update:modelValue'
])
const mention = inject('mention')

const value = useModelWrapper(props, emits)

function goRouter() {
  router.push({
    name: 'Theme',
    query: {
      theme: props.title
    }
  })
}

function handleEnter() {
  if (!props.disabled)
    return

  mention("<span style='color: var(--el-color-danger)'>Your device not support this feature.</span>")
}

function handleLeave() {
  if (!props.disabled)
    return

  mention()
}
</script>

<style lang="scss">
.SectionItem-Display {
  position: relative;

  width: 100%;
  height: 100%;

  div {
    position: relative;

    width: 100%;
    height: 100%;

    background-size: cover;
    background-image: url("@assets/bg/apparent.jpg");
  }
}

.SectionItem-Container {
  &:hover {
    border: 2px solid var(--el-color-primary);
  }

  &.active {
    cursor: default;
    box-shadow: 0 0 8px 0 var(--el-color-primary-light-5);
    border: 2px solid var(--el-color-primary);
  }

  &.disabled {
    opacity: .25;
    filter: blur(1px);
    cursor: not-allowed;
    border: 2px solid var(--el-color-danger);
  }

  flex: 1;

  width: 100%;
  height: 100%;

  user-select: none;
  border: 2px solid var(--el-border-color);
}

.SectionItem-Bar {
  z-index: 100;
  position: absolute;

  bottom: 0;

  height: 2rem;
  width: 100%;

  --fake-radius: 8px 8px 0 0;
}
</style>