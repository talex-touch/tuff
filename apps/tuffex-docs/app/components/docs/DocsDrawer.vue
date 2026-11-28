<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  visible: boolean
  title?: string
  direction?: 'left' | 'right'
}>(), {
  title: '',
  direction: 'left',
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

function close() {
  emit('update:visible', false)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

watch(
  () => props.visible,
  (open) => {
    if (!import.meta.client)
      return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open)
      window.addEventListener('keydown', handleKeydown)
    else
      window.removeEventListener('keydown', handleKeydown)
  },
)

onBeforeUnmount(() => {
  if (!import.meta.client)
    return
  document.body.style.overflow = ''
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition :name="`docs-drawer-${props.direction}`">
      <div
        v-if="props.visible"
        class="docs-drawer-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title || 'Drawer'"
        @click.self="close"
      >
        <div class="docs-drawer-panel" :class="`docs-drawer-panel--${props.direction}`">
          <div class="docs-drawer-head">
            <span class="docs-drawer-title">{{ props.title }}</span>
            <button type="button" class="docs-drawer-close" aria-label="Close" @click="close">
              <span class="i-carbon-close" aria-hidden="true" />
            </button>
          </div>
          <div class="docs-drawer-body">
            <slot />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.docs-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  background: rgba(10, 12, 16, 0.45);
}

.docs-drawer-panel {
  width: min(320px, 84vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--docs-surface, #ffffff);
  color: var(--docs-ink);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.25);
}

.docs-drawer-panel--right {
  margin-left: auto;
}

.docs-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--docs-border-light);
}

.docs-drawer-title {
  font-size: 14px;
  font-weight: 600;
}

.docs-drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--docs-ink-regular);
  font-size: 16px;
  cursor: pointer;
}

.docs-drawer-close:hover {
  background: var(--docs-surface-subtle);
  color: var(--docs-ink);
}

.docs-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 28px;
}

.docs-drawer-left-enter-active,
.docs-drawer-left-leave-active,
.docs-drawer-right-enter-active,
.docs-drawer-right-leave-active {
  transition: opacity 180ms ease;
}

.docs-drawer-left-enter-active .docs-drawer-panel,
.docs-drawer-left-leave-active .docs-drawer-panel,
.docs-drawer-right-enter-active .docs-drawer-panel,
.docs-drawer-right-leave-active .docs-drawer-panel {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.docs-drawer-left-enter-from,
.docs-drawer-left-leave-to,
.docs-drawer-right-enter-from,
.docs-drawer-right-leave-to {
  opacity: 0;
}

.docs-drawer-left-enter-from .docs-drawer-panel,
.docs-drawer-left-leave-to .docs-drawer-panel {
  transform: translateX(-100%);
}

.docs-drawer-right-enter-from .docs-drawer-panel,
.docs-drawer-right-leave-to .docs-drawer-panel {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .docs-drawer-left-enter-active,
  .docs-drawer-left-leave-active,
  .docs-drawer-right-enter-active,
  .docs-drawer-right-leave-active,
  .docs-drawer-left-enter-active .docs-drawer-panel,
  .docs-drawer-left-leave-active .docs-drawer-panel,
  .docs-drawer-right-enter-active .docs-drawer-panel,
  .docs-drawer-right-leave-active .docs-drawer-panel {
    transition: none;
  }
}
</style>
