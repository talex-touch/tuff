<script setup lang="ts">
import Button from '~/components/ui/Button.vue'
import { useToast } from '~/composables/useToast'

const { toasts, remove } = useToast()

function toneClass(type: string) {
  switch (type) {
    case 'success':
      return 'border-emerald-500/20 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'error':
      return 'border-red-500/20 bg-red-500/15 text-red-700 dark:text-red-300'
    default:
      return 'border-blue-500/20 bg-blue-500/15 text-blue-700 dark:text-blue-300'
  }
}
</script>

<template>
  <div class="fixed right-6 top-6 z-[9999] flex w-full max-w-xs flex-col gap-3">
    <TransitionGroup name="toast-fade" tag="div" class="flex flex-col gap-3">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="rounded-2xl border px-4 py-3 text-sm shadow-sm backdrop-blur"
        :class="toneClass(toast.type)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-black dark:text-white">
              {{ toast.title }}
            </p>
            <p v-if="toast.message" class="mt-1 text-xs text-black/70 dark:text-white/70">
              {{ toast.message }}
            </p>
          </div>
          <Button
            variant="bare"
            size="mini"
            circle
            icon="i-carbon-close"
            aria-label="Dismiss"
            @click="remove(toast.id)"
          />
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.2s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
