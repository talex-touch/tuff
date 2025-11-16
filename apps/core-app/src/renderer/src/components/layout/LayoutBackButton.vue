<template>
  <transition name="layout-nav-fade" mode="out-in">
    <button
      v-if="visible"
      class="LayoutNavButton fake-background"
      type="button"
      aria-label="Back to previous section"
      @click="$emit('click')"
    >
      <span class="LayoutNavButton-Icon i-ri-arrow-left-s-line" />
      <span class="LayoutNavButton-Text">{{ $t('layout.back') }}</span>
    </button>
  </transition>
</template>

<script lang="ts" setup>
import { computed } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

defineEmits<{
  (event: 'click'): void
}>()

const visible = computed(() => props.visible)
</script>

<style lang="scss" scoped>
.LayoutNavButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  gap: 4px;

  border: none;
  overflow: hidden;
  border-radius: 8px;

  color: var(--el-text-color-primary);
  cursor: pointer;
  -webkit-app-region: no-drag;
  --fake-inner-opacity: 0.75;
  --fake-color: var(--el-bg-color);

  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    opacity 0.2s ease;
}

.LayoutNavButton:hover,
.LayoutNavButton:focus-visible {
  --fake-inner-opacity: 0.5;
  outline: none;
}

.LayoutNavButton:active {
  opacity: 0.8;
}

.LayoutNavButton-Icon {
  font-size: 18px;
  line-height: 1;
}

.LayoutNavButton-Text {
  font-size: 13px;
  line-height: 1;
}

.layout-nav-fade-enter-active,
.layout-nav-fade-leave-active {
  transition:
    opacity 0.52s cubic-bezier(0.7, 0, 0.3, 1),
    filter 0.58s cubic-bezier(0.65, 0, 0.35, 1),
    transform 0.55s cubic-bezier(0.7, 0, 0.3, 1);
}

.layout-nav-fade-enter-from,
.layout-nav-fade-leave-to {
  opacity: 0;
  filter: blur(10px);
  transform: translateX(-18px);
}

.layout-nav-fade-enter-to,
.layout-nav-fade-leave-from {
  opacity: 1;
  filter: blur(0);
  transform: translateX(0);
}
</style>