<script setup lang="ts">
const { toasts, remove } = useToast()

const iconMap = {
  success: 'i-carbon-checkmark-filled',
  error: 'i-carbon-close-filled',
  warning: 'i-carbon-warning-filled',
  info: 'i-carbon-information-filled',
}

const colorMap = {
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  error: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400',
}

const iconColorMap = {
  success: 'text-emerald-500',
  error: 'text-rose-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none">
      <TransitionGroup
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="opacity-0 translate-x-8 scale-95"
        enter-to-class="opacity-100 translate-x-0 scale-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="opacity-100 translate-x-0 scale-100"
        leave-to-class="opacity-0 translate-x-8 scale-95"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-xl max-w-sm"
          :class="colorMap[toast.type]"
        >
          <span :class="[iconMap[toast.type], iconColorMap[toast.type], 'text-lg shrink-0 mt-0.5']" />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm text-black dark:text-white">{{ toast.title }}</p>
            <p v-if="toast.message" class="text-xs mt-0.5 opacity-80 break-words">{{ toast.message }}</p>
          </div>
          <button
            class="shrink-0 opacity-60 hover:opacity-100 transition"
            @click="remove(toast.id)"
          >
            <span class="i-carbon-close text-sm" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
