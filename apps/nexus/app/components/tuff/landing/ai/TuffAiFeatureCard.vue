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
      <h3 class="ai-feature-card__title">
        {{ title }}
      </h3>
      <p class="ai-feature-card__copy">
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
  gap: 1.25rem;
  padding: 1.75rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  backdrop-filter: blur(10px);
  transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  cursor: pointer;
  overflow: hidden;
}

.ai-feature-card:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.1);
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
}

.ai-feature-card.is-active {
  background: linear-gradient(145deg, rgba(30, 27, 75, 0.6), rgba(17, 24, 39, 0.6));
  border-color: rgba(139, 92, 246, 0.3);
  box-shadow: 
    0 0 0 1px rgba(139, 92, 246, 0.1) inset,
    0 20px 40px -10px rgba(0, 0, 0, 0.5);
}

.ai-feature-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 1.75rem;
  transition: all 0.3s ease;
}

.ai-feature-card.is-active .ai-feature-card__icon {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
  border-color: rgba(139, 92, 246, 0.2);
  color: #fff;
  box-shadow: 0 8px 16px -4px rgba(139, 92, 246, 0.3);
}

.ai-feature-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ai-feature-card__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.3;
  letter-spacing: -0.01em;
  transition: color 0.3s ease;
}

.ai-feature-card.is-active .ai-feature-card__title {
  color: #fff;
}

.ai-feature-card__copy {
  margin: 0;
  font-size: 0.9375rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  transition: color 0.3s ease;
}

.ai-feature-card.is-active .ai-feature-card__copy {
  color: rgba(255, 255, 255, 0.7);
}

.ai-feature-card__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
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
