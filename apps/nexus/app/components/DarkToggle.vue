<script setup lang="ts">
import { computed } from 'vue'
import { useTheme } from '~/composables/useTheme'

const { color, toggleDark } = useTheme()

useHead({
  meta: [{
    id: 'theme-color',
    name: 'theme-color',
    content: () => color.value === 'dark' ? '#222222' : '#ffffff',
  }],
})

const isDark = computed(() => color.value === 'dark')

function handleClick(event: MouseEvent) {
  toggleDark(color.value === 'dark' ? 'light' : 'dark', event)
}

function handleKeyboardToggle() {
  toggleDark(color.value === 'dark' ? 'light' : 'dark')
}
</script>

<template>
  <div
    role="switch"
    class="toggle-switch"
    tabindex="0"
    :aria-checked="isDark"
    @click="handleClick"
    @keydown.enter.prevent="handleKeyboardToggle"
    @keydown.space.prevent="handleKeyboardToggle"
  >
    <label class="switch-label">
      <input
        type="checkbox"
        class="checkbox"
        :checked="isDark"
      >
      <span class="slider" />
    </label>
  </div>
</template>

<style scoped>
.toggle-switch {
  position: relative;
  width: 48px;
  height: 24px;
  --light: #d8dbe0;
  --dark: #28292c;
  --link: rgb(27, 129, 112);
  --link-hover: rgb(24, 94, 82);
}

.switch-label {
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: var(--dark);
  border-radius: 12px;
  cursor: pointer;
  border: 2px solid var(--dark);
}

.checkbox {
  position: absolute;
  display: none;
}

.slider {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 12px;
  -webkit-transition: 0.3s;
  transition: 0.3s;
}

.checkbox:checked ~ .slider {
  background-color: var(--light);
}

.slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  -webkit-box-shadow: inset 6px -3px 0px 0px var(--light);
  box-shadow: inset 6px -3px 0px 0px var(--light);
  background-color: var(--dark);
  -webkit-transition: 0.3s;
  transition: 0.3s;
}

.checkbox:checked ~ .slider::before {
  -webkit-transform: translateX(24px);
  -ms-transform: translateX(24px);
  transform: translateX(24px);
  background-color: var(--dark);
  -webkit-box-shadow: none;
  box-shadow: none;
}
</style>
