<template>
  <button class="touch-button" :class="{ 'touch-button--loading': loading }" :disabled="disabled || loading">
    <div class="touch-button__content">
      <slot></slot>
      <div v-if="loading" class="touch-button__spinner"></div>
    </div>
  </button>
</template>

<script setup lang="ts">
interface Props {
  loading?: boolean;
  disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
  loading: false,
  disabled: false
});
</script>

<style scoped>
.touch-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: 500;
  border-radius: 12px;
  cursor: pointer;
  outline: none;
  transition: all 0.3s ease;
  overflow: hidden;
  border: none;
  background: transparent;
  color: white;
  min-height: 48px;
  min-width: 120px;

  backdrop-filter: blur(18px) saturate(180%) brightness(200%);
}

/* 模糊玻璃质感背景 */
.touch-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  opacity: .25;
  border: 1px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.1);
  border-radius: inherit;
  z-index: -1;
  transition: all 0.3s ease;
}

/* 流光溢彩的边框效果 */
.touch-button::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: inherit;
  z-index: -2;
  background: linear-gradient(45deg, 
    rgba(255, 0, 150, 0.5), 
    rgba(0, 255, 255, 0.5), 
    rgba(255, 255, 0, 0.5), 
    rgba(0, 255, 0, 0.5));
  background-size: 300% 300%;
  animation: gradientShift 3s ease infinite;
  filter: blur(5px);
  opacity: 0.2;
}

/* 按钮内容区域 */
.touch-button__content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* 加载动画 */
.touch-button__spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 悬停效果 */
.touch-button:not(:disabled):not(.touch-button--loading):hover::before {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px);
}

.touch-button:not(:disabled):not(.touch-button--loading):hover {
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

/* 点击效果 */
.touch-button:not(:disabled):not(.touch-button--loading):active {
  box-shadow: 0 5px 10px rgba(0, 0, 0, 0.1);
}

/* 禁用状态 */
.touch-button:disabled,
.touch-button--loading {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 流光动画 */
@keyframes gradientShift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

/* 旋转动画 */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .touch-button {
    padding: 10px 20px;
    font-size: 14px;
    min-height: 44px;
    min-width: 100px;
  }
}

@media (max-width: 480px) {
  .touch-button {
    padding: 8px 16px;
    font-size: 13px;
    min-height: 40px;
    min-width: 80px;
  }
}
</style>