<script lang="ts" name="IntelligenceEmptyState" setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div
    class="relative w-full h-full flex flex-col items-center justify-center text-center empty-state-container"
    role="status"
    aria-live="polite"
    aria-label="No provider selected"
  >
    <div
      class="icon-wrapper w-20 h-20 rounded-full bg-gradient-to-br from-[var(--el-color-primary-light-9)] to-[var(--el-color-primary-light-8)] flex items-center justify-center mb-6 shadow-lg"
      aria-hidden="true"
    >
      <i class="i-carbon-watson-machine-learning text-3xl text-[var(--el-color-primary)]" />
    </div>
    <div class="max-w-96 content-wrapper">
      <h3 class="text-lg font-semibold mb-2">
        {{ t('intelligence.empty.title') }}
      </h3>
      <p class="text-[var(--el-text-color-regular)] opacity-80 mb-6">
        {{ t('intelligence.empty.description') }}
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.empty-state-container {
  animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.icon-wrapper {
  animation:
    float 3s ease-in-out infinite,
    scaleIn 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: scale(1.1) rotate(5deg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  }

  i {
    transition: transform 0.3s ease;
  }

  &:hover i {
    transform: scale(1.1);
  }
}

.content-wrapper {
  animation: slideUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.2s both;

  h3 {
    transition: color 0.3s ease;
  }

  p {
    transition: opacity 0.3s ease;
  }

  &:hover {
    h3 {
      color: var(--el-color-primary);
    }

    p {
      opacity: 1;
    }
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
</style>
