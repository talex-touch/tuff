<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      pure: '纯色',
      mask: '遮罩',
      blur: '模糊',
      glass: '玻璃',
      refraction: '折射',
    }
  }
  return {
    pure: 'Pure',
    mask: 'Mask',
    blur: 'Blur',
    glass: 'Glass',
    refraction: 'Refraction',
  }
})
</script>

<template>
  <div class="base-surface-modes-demo">
    <div class="base-surface-modes-demo__bg">
      <div class="base-surface-modes-demo__stripe base-surface-modes-demo__stripe--1" />
      <div class="base-surface-modes-demo__stripe base-surface-modes-demo__stripe--2" />
      <div class="base-surface-modes-demo__stripe base-surface-modes-demo__stripe--3" />
      <span class="base-surface-modes-demo__text">Background Content</span>
    </div>
    <div class="base-surface-modes-demo__surfaces">
      <TxBaseSurface mode="pure" :radius="10" class="base-surface-modes-demo__item">
        {{ labels.pure }}
      </TxBaseSurface>
      <TxBaseSurface mode="mask" :opacity="0.6" :radius="10" class="base-surface-modes-demo__item">
        {{ labels.mask }}
      </TxBaseSurface>
      <TxBaseSurface mode="blur" :blur="8" :radius="10" class="base-surface-modes-demo__item">
        {{ labels.blur }}
      </TxBaseSurface>
      <TxBaseSurface mode="glass" :blur="11" :radius="10" class="base-surface-modes-demo__item">
        {{ labels.glass }}
      </TxBaseSurface>
      <TxBaseSurface mode="refraction" :blur="11" :displace="0.8" :distortion-scale="-200" :radius="10" class="base-surface-modes-demo__item">
        {{ labels.refraction }}
      </TxBaseSurface>
    </div>
  </div>
</template>

<style scoped>
.base-surface-modes-demo {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  padding: 24px;
}

.base-surface-modes-demo__bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.base-surface-modes-demo__stripe {
  position: absolute;
  border-radius: 50%;
  opacity: 0.5;
}

.base-surface-modes-demo__stripe--1 {
  width: 200px; height: 200px;
  background: #ffd700;
  top: -40px; left: -20px;
}

.base-surface-modes-demo__stripe--2 {
  width: 150px; height: 150px;
  background: #00d2ff;
  bottom: -30px; right: 60px;
}

.base-surface-modes-demo__stripe--3 {
  width: 120px; height: 120px;
  background: #ff6b6b;
  top: 20px; right: -10px;
}

.base-surface-modes-demo__text {
  position: relative;
  color: rgba(255, 255, 255, 0.35);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 2px;
  pointer-events: none;
  user-select: none;
}

.base-surface-modes-demo__surfaces {
  position: relative;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  z-index: 1;
}

.base-surface-modes-demo__item {
  width: 120px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}
</style>
