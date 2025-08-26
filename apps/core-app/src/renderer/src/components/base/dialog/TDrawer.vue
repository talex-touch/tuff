<template>
  <teleport to="body">
    <transition
      enter-active-class="transition-opacity duration-300 ease-in-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-300 ease-in-out"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fake-background fixed inset-0 z-[998] backdrop-blur-sm bg-black/20"
        @click="handleClose"
      ></div>
    </transition>
    <transition
      enter-active-class="transition-transform duration-300 ease-in-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-300 ease-in-out"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="visible"
        class="fixed top-0 right-0 bottom-0 z-[999] w-96 bg-base-100/80 backdrop-blur-lg shadow-2xl flex flex-col"
      >
        <header class="p-4 border-b border-base-300/50">
          <h2 class="text-xl font-bold">{{ title }}</h2>
        </header>
        <main class="flex-1 p-4 overflow-y-auto">
          <slot></slot>
        </main>
      </div>
    </transition>
  </teleport>
</template>

<script lang="ts" setup>
defineProps({
  visible: {
    type: Boolean,
    required: true
  },
  title: {
    type: String,
    default: 'Drawer'
  }
})

const emit = defineEmits(['update:visible', 'close'])

const handleClose = (): void => {
  emit('update:visible', false)
  emit('close')
}
</script>
]]>
