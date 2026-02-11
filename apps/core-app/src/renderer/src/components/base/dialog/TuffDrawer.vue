<script lang="ts" setup>
import { useModelWrapper } from '@talex-touch/utils/renderer'
import TouchScroll from '../TouchScroll.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    visible: boolean
  }>(),
  {
    title: 'Drawer'
  }
)

const emits = defineEmits(['update:visible', 'close'])

const display = useModelWrapper(props, emits, 'visible')

function handleClose(): void {
  display.value = false
  emits('close')
}
</script>

<template>
  <teleport to="body">
    <div class="TuffDrawer z-1998 absolute inset-0 transition-cubic" :class="{ display }">
      <div
        class="TuffDrawer-Mask fake-background absolute inset-0 transition-cubic"
        @click="handleClose"
      />

      <div
        class="TuffDrawer-Main overflow-hidden absolute top-0 right-0 bottom-0 z-[999] w-[60%] transition-cubic fake-background shadow-2xl flex flex-col"
      >
        <TouchScroll class="absolute inset-0">
          <template #header>
            <header class="p-4 border-b border-[--el-border-color]">
              <h2 class="text-xl font-bold">
                {{ title }}
              </h2>
            </header>
          </template>
          <slot />
        </TouchScroll>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.TuffDrawer {
  &.display {
    --tuff-drawer-xoffset: 0;
    --tuff-drawer-opacity: 1;
    pointer-events: auto;
  }

  &-Mask {
    --fake-inner-opacity: 0.75;
    opacity: var(--tuff-drawer-opacity);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &-Main {
    transform: translateX(var(--tuff-drawer-xoffset));
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }

  --tuff-drawer-xoffset: 100%;
  --tuff-drawer-opacity: 0;
  pointer-events: none;
}
</style>
