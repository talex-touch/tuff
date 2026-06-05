<script lang="ts" name="SectionItem" setup>
import { useRouter } from 'vue-router'
import { createThemeDetailRoute } from './section-route'

const props = defineProps<{
  title: string
  label?: string
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
  if (props.disabled) return

  router.push(createThemeDetailRoute(props.title))
}
</script>

<template>
  <div
    relative
    h-full
    flex
    items-center
    justify-center
    :class="{ disabled, active: value === title }"
    class="SectionItem-Container transition-cubic"
  >
    <button
      type="button"
      class="SectionItem-Display SectionItem-Action fake-background"
      :class="title"
      :disabled="disabled"
      :aria-pressed="value === title"
      @click="handleClick"
    >
      <span v-shared-element:[`theme-preference-${title}-img`] />
    </button>
    <button
      type="button"
      class="SectionItem-Bar px-2 flex items-center cursor-pointer gap-2"
      :disabled="disabled"
      @click="goRouter"
    >
      <div w-3 h-3 rounded-full class="bg-[var(--section-active-color)]" />
      <span v-shared-element:[`theme-preference-${title}`]>
        {{ label ?? title }}
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
.SectionItem-Display {
  position: relative;

  width: 100%;
  height: 100%;

  appearance: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &::before {
    z-index: 1;
  }

  span {
    display: block;
    position: relative;

    width: 100%;
    height: 100%;

    background-size: cover;
    background-image: url('~/assets/bg/apparent.jpg');
  }
}

.SectionItem-Container {
  &:hover {
    border: 2px solid var(--tx-color-primary-light-3);
  }

  &.active {
    cursor: default;
    box-shadow: 0 0 8px 0 var(--tx-color-primary-light-5);
    border: 2px solid var(--tx-color-primary);

    --section-active-color: var(--tx-color-primary);
  }

  &.disabled {
    .SectionItem-Display {
      opacity: 0.25;
      cursor: not-allowed;
    }
    cursor: not-allowed;
    border: 2px solid var(--tx-color-danger-light-3);
  }

  width: 100%;
  min-width: 0;
  height: 11rem;

  overflow: hidden;
  user-select: none;
  border-radius: 8px;
  border: 2px solid var(--tx-border-color);
  --section-active-color: var(--tx-color-info);
}

.SectionItem-Action:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: -3px;
}

.SectionItem-Bar {
  appearance: none;
  padding: 0 0.5rem;
  border: 0;
  color: inherit;
  background: transparent;
  z-index: 100;
  position: absolute;

  bottom: 0;

  height: 2rem;
  width: 100%;

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary);
    outline-offset: -2px;
  }
}
</style>
