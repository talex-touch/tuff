<script lang="ts" name="FloatingNav" setup>
import { ref } from 'vue'
import TuffIcon from '~/components/base/TuffIcon.vue'

const open = ref(false)

function toggle() {
  open.value = !open.value
}
</script>

<template>
  <div class="FloatingNav">
    <button
      type="button"
      class="FloatingNav-Trigger"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="toggle"
    >
      <TuffIcon name="i-ri-menu-line" class="FloatingNav-TriggerIcon" />
    </button>
    <Transition name="floating-nav">
      <div v-show="open" class="FloatingNav-Panel" role="menu">
        <div class="FloatingNav-PanelInner">
          <slot />
        </div>
      </div>
    </Transition>
    <div v-show="open" class="FloatingNav-Backdrop" aria-hidden="true" @click="open = false" />
  </div>
</template>

<style lang="scss" scoped>
.FloatingNav {
  position: fixed;
  left: 12px;
  bottom: 20px;
  z-index: 1001;
}

.FloatingNav-Trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: var(--el-bg-color-overlay);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.FloatingNav-Trigger:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}

.FloatingNav-TriggerIcon {
  font-size: 20px;
}

.FloatingNav-Panel {
  position: absolute;
  left: 0;
  bottom: 56px;
  min-width: 180px;
  max-height: 70vh;
  overflow-y: auto;
  border-radius: 12px;
  background: var(--el-bg-color-overlay);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 8px;
}

.FloatingNav-PanelInner {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.FloatingNav-Backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: transparent;
}

.floating-nav-enter-active,
.floating-nav-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.floating-nav-enter-from,
.floating-nav-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
