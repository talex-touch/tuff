<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  copy: string
  icon?: string
  active?: boolean
  progress?: number
}>()

const cardClass = computed(() => ({
  'ai-feature-card': true,
  'is-active': props.active,
}))

const progressStyle = computed(() => ({
  transform: `scaleX(${props.progress || 0})`,
}))
</script>

<template>
  <article :class="cardClass">
    <div v-if="icon" class="ai-feature-card__icon">
      <span :class="icon" />
    </div>
    <div class="ai-feature-card__content">
      <p class="ai-feature-card__copy">
        <span class="font-bold text-white">{{ title }}</span>
        {{ copy }}
      </p>
    </div>
    <div class="ai-feature-card__progress">
      <div class="ai-feature-card__progress-bar" :style="progressStyle" />
    </div>
  </article>
</template>

<style scoped>
.ai-feature-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  overflow: hidden;
}

.ai-feature-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.ai-feature-card.is-active {
  background: linear-gradient(145deg, rgba(30, 27, 75, 0.5), rgba(17, 24, 39, 0.5));
  border-color: rgba(139, 92, 246, 0.25);
  box-shadow:
    0 0 0 1px rgba(139, 92, 246, 0.1) inset,
    0 12px 24px -6px rgba(0, 0, 0, 0.4);
}

.ai-feature-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 1rem;
  transition: all 0.3s ease;
}

.ai-feature-card.is-active .ai-feature-card__icon {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
  border-color: rgba(139, 92, 246, 0.2);
  color: #fff;
  box-shadow: 0 4px 12px -2px rgba(139, 92, 246, 0.25);
}

.ai-feature-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.ai-feature-card.is-active .ai-feature-card__title {
  color: #fff;
}

.ai-feature-card__copy {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.45;
  transition: color 0.3s ease;
}

.ai-feature-card.is-active .ai-feature-card__copy {
  color: rgba(255, 255, 255, 0.65);
}

.ai-feature-card__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.05);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.ai-feature-card.is-active .ai-feature-card__progress {
  opacity: 1;
}

.ai-feature-card__progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #3b82f6);
  transform-origin: left;
  will-change: transform;
}
</style>
