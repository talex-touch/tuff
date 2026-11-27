<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const colorMode = useColorMode()

const metalTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'))

const copy = computed(() => (locale.value === 'zh'
  ? {
      button: '按钮',
      circle: '圆形按钮',
      text: '文字',
      badge: '徽标',
      upgrade: '升级到 Pro',
      plan: '方案',
      send: '发送',
      hint: '同一页面所有金属共用一份材质，因此只挑一个预设，并把金属元素彼此拉开。',
    }
  : {
      button: 'Button',
      circle: 'Circle button',
      text: 'Text',
      badge: 'Badge',
      upgrade: 'Upgrade to Pro',
      plan: 'Plan',
      send: 'Send',
      hint: 'Every metal element on a page shares one material — pick one preset and keep them apart.',
    }))
</script>

<template>
  <TxFlex direction="column" gap="26px" class="metal-fx-demo">
    <TxFlex direction="column" gap="10px">
      <span class="metal-fx-demo__label">{{ copy.button }}</span>
      <TxMetalFx preset="chromatic" :theme="metalTheme">
        <a href="#" class="metal-fx-demo__cta">{{ copy.upgrade }}</a>
      </TxMetalFx>
    </TxFlex>

    <TxFlex direction="column" gap="10px">
      <span class="metal-fx-demo__label">{{ copy.circle }}</span>
      <TxMetalFx variant="circle" preset="chromatic" :theme="metalTheme" inner-shadow :strength="0.9">
        <button
          type="button"
          :aria-label="copy.send"
          class="metal-fx-demo__icon"
        >
          ↑
        </button>
      </TxMetalFx>
    </TxFlex>

    <TxFlex direction="column" gap="10px">
      <span class="metal-fx-demo__label">{{ copy.text }}</span>
      <span class="metal-fx-demo__plan">
        {{ copy.plan }}
        <TxMetalText font="500 28px/1.2 Inter, system-ui, sans-serif" color="#e2e2e2">
          Pro
        </TxMetalText>
      </span>
    </TxFlex>

    <TxFlex direction="column" gap="10px">
      <span class="metal-fx-demo__label">{{ copy.badge }}</span>
      <TxFlex align="center" gap="10px">
        <span>Live mode</span>
        <TxMetalBadge>New</TxMetalBadge>
      </TxFlex>
    </TxFlex>

    <p class="metal-fx-demo__hint">
      {{ copy.hint }}
    </p>
  </TxFlex>
</template>

<style scoped>
.metal-fx-demo {
  padding: 24px 8px;
}

.metal-fx-demo__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.metal-fx-demo__cta {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 14px;
  color: inherit;
  text-decoration: none;
}

.metal-fx-demo__icon {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  font-size: 18px;
  line-height: 1;
}

.metal-fx-demo__plan {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  font-size: 22px;
}

.metal-fx-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
