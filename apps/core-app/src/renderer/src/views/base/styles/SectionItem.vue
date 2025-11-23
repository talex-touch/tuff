<script lang="ts" name="SectionItem" setup>
import { useRouter } from 'vue-router'

const props = defineProps<{
  title: string
  disabled?: boolean
  tip?: string
}>()

const value = defineModel<string>('modelValue')

const router = useRouter()

function handleClick() {
  if (props.disabled) return

  value.value = props.title
}

function goRouter() {
  router.push({
    name: 'Theme',
    query: {
      theme: props.title
    }
  })
}
</script>

<template>
  <div
    relative
    cursor-pointer
    h-full
    flex
    items-center
    justify-center
    :class="{ disabled, active: value === title }"
    class="SectionItem-Container transition-cubic"
    @click="handleClick"
  >
    <div class="SectionItem-Display fake-background" :class="title">
      <div v-shared-element:[`theme-preference-${title}-img`] />
    </div>
    <div class="SectionItem-Bar px-2 flex items-center cursor-pointer gap-2" @click="goRouter">
      <div w-3 h-3 rounded-full class="bg-[var(--section-active-color)]" />
      <span v-shared-element:[`theme-preference-${title}`]>
        {{ title }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.SectionItem-Display {
  position: relative;

  width: 100%;
  height: 100%;

  &::before {
    z-index: 1;
  }

  div {
    position: relative;

    width: 100%;
    height: 100%;

    background-size: cover;
    background-image: url('~/assets/bg/apparent.jpg');
  }
}

.SectionItem-Container {
  &:hover {
    border: 2px solid var(--el-color-primary-light-3);
  }

  &.active {
    cursor: default;
    box-shadow: 0 0 8px 0 var(--el-color-primary-light-5);
    border: 2px solid var(--el-color-primary);

    --section-active-color: var(--el-color-primary);
  }

  &.disabled {
    &-Display {
      opacity: 0.25;
    }
    cursor: not-allowed;
    border: 2px solid var(--el-color-danger-light-3);
  }

  flex: 1;

  width: 100%;
  height: 100%;

  overflow: hidden;
  user-select: none;
  border-radius: 18px;
  border: 2px solid var(--el-border-color);
  --section-active-color: var(--el-color-info);
}

.SectionItem-Bar {
  z-index: 100;
  position: absolute;

  bottom: 0;

  height: 2rem;
  width: 100%;
}
</style>
