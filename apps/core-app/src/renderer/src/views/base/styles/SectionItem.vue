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
  <div :class="{ disabled, active: value === title }" class="SectionItem-Container">
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
    <button type="button" class="SectionItem-Bar" :disabled="disabled" @click="goRouter">
      <span class="SectionItem-Radio" />
      <span v-shared-element:[`theme-preference-${title}`]>
        {{ label ?? title }}
      </span>
    </button>
  </div>
</template>

<style lang="scss" scoped>
/**
 * Artboard `E0C1Zz` · 窗口效果: the tile is a bare preview with the radio and label sitting
 * underneath it, on the card surface — not a bordered box with a caption bar floating inside.
 */
.SectionItem-Container {
  display: flex;
  flex-direction: column;
  gap: 9px;

  width: 100%;
  min-width: 0;

  user-select: none;

  &.active {
    cursor: default;
  }

  &.disabled {
    cursor: not-allowed;

    .SectionItem-Display {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }
}

.SectionItem-Display {
  position: relative;

  width: 100%;
  height: 150px;

  appearance: none;
  overflow: hidden;
  padding: 0;
  /* 2px so the selected ring can swap the colour without shifting the preview. */
  border: 2px solid var(--shell-border);
  --fake-radius: var(--shell-radius-md);
  border-radius: var(--shell-radius-md);
  background: var(--shell-surface-2);
  color: inherit;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;

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

.SectionItem-Container:not(.disabled):not(.active) .SectionItem-Display:hover {
  border-color: var(--shell-border-strong);
}

.SectionItem-Container.active .SectionItem-Display {
  border-color: var(--shell-primary);
}

.SectionItem-Action:focus-visible {
  outline: 2px solid var(--shell-primary);
  outline-offset: 2px;
}

.SectionItem-Bar {
  display: flex;
  align-items: center;
  gap: 7px;

  appearance: none;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius-sm);
  color: var(--shell-text-secondary);
  background: transparent;
  font-family: inherit;
  font-size: var(--shell-fs-body);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--shell-primary);
    outline-offset: 3px;
  }
}

.SectionItem-Container.active .SectionItem-Bar {
  color: var(--shell-text-primary);
  font-weight: 500;
}

.SectionItem-Radio {
  flex: 0 0 auto;

  width: 12px;
  height: 12px;

  box-sizing: border-box;
  border: 1px solid var(--shell-border-strong);
  border-radius: var(--shell-radius-full);
}

.SectionItem-Container.active .SectionItem-Radio {
  border-color: var(--shell-primary);
  background: var(--shell-primary);
}
</style>
