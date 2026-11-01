<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isRestartingForUpdate } from '~/modules/hooks/useUpdateRuntime'

const { t } = useI18n()
</script>

<template>
  <Transition name="update-restart-fade">
    <div
      v-if="isRestartingForUpdate"
      class="update-restart-overlay fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-md select-none text-white pointer-events-auto"
    >
      <div class="relative flex items-center justify-center mb-5">
        <div class="w-14 h-14 rounded-full border-3 border-white/20 border-t-white animate-spin" />
        <div class="absolute inset-0 flex items-center justify-center">
          <i class="i-carbon-renew text-xl text-white/90 animate-pulse" />
        </div>
      </div>
      <div class="text-base font-medium tracking-wide mb-1.5 text-white/95">
        {{ t('settings.settingUpdate.messages.installStarted') }}
      </div>
      <div class="text-xs text-white/60">
        {{ t('settings.settingUpdate.messages.restartingHint') }}
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.update-restart-fade-enter-active,
.update-restart-fade-leave-active {
  transition: opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.update-restart-fade-enter-from,
.update-restart-fade-leave-to {
  opacity: 0;
}
</style>
