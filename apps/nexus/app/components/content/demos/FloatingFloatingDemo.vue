<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div class="floating-demo">
    <TxFloating class="floating-demo__stage" :sensitivity="0.55" :easing-factor="0.08">
      <TxFloatingElement class-name="floating-demo__orb floating-demo__orb--primary" :depth="0.12" />
      <TxFloatingElement class-name="floating-demo__orb floating-demo__orb--accent" :depth="-0.08" />
      <TxFloatingElement class-name="floating-demo__panel" :depth="0.04">
        <div class="floating-demo__eyebrow">
          {{ locale === 'zh' ? '交互层' : 'Interaction layer' }}
        </div>
        <strong>{{ locale === 'zh' ? '鼠标移动时元素会按深度缓动' : 'Elements ease by depth as the pointer moves' }}</strong>
        <span>{{ locale === 'zh' ? '适合做轻量视差、状态卡片和背景装饰。' : 'Useful for subtle parallax, status cards, and background accents.' }}</span>
      </TxFloatingElement>
    </TxFloating>
  </div>
</template>

<style scoped>
.floating-demo {
  width: min(100%, 560px);
}

.floating-demo__stage {
  position: relative;
  height: 260px;
  overflow: hidden;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--tx-color-primary) 10%, transparent), transparent 48%),
    var(--tx-bg-color);
}

:deep(.floating-demo__orb) {
  width: 130px;
  height: 130px;
  border-radius: 999px;
  filter: blur(1px);
}

:deep(.floating-demo__orb--primary) {
  left: 44px;
  top: 42px;
  background: color-mix(in srgb, var(--tx-color-primary) 34%, transparent);
}

:deep(.floating-demo__orb--accent) {
  right: 54px;
  bottom: 34px;
  background: color-mix(in srgb, var(--tx-color-success) 28%, transparent);
}

:deep(.floating-demo__panel) {
  left: clamp(24px, 18%, 96px);
  top: 78px;
  width: min(78%, 360px);
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 80%, transparent);
  border-radius: 16px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay) 88%, transparent);
  box-shadow: var(--tx-box-shadow-light, 0 12px 34px rgba(15, 23, 42, 0.12));
}

:deep(.floating-demo__panel strong) {
  display: block;
  color: var(--tx-text-color-primary);
  font-size: 16px;
  line-height: 1.45;
}

:deep(.floating-demo__panel span) {
  display: block;
  margin-top: 8px;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

:deep(.floating-demo__eyebrow) {
  margin-bottom: 10px;
  color: var(--tx-color-primary);
  font-size: 12px;
  font-weight: 700;
}
</style>
