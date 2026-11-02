<script setup lang="ts">
import type { MikoState } from '@talex-touch/tuffex/miko'
import { ref } from 'vue'

const currentState = ref<MikoState>('idle')
const lastClickedState = ref<MikoState | null>(null)
const isDemonActive = ref(false)

function onStateChange(state: MikoState) {
  lastClickedState.value = state
}

function onMutate(mutated: boolean) {
  isDemonActive.value = mutated
}
</script>

<template>
  <div class="miko-basic-demo">
    <div class="miko-basic-demo__row">
      <div class="miko-basic-demo__item">
        <span class="miko-basic-demo__label">XS (24px)</span>
        <TxMiko size="xs" :state="currentState" />
      </div>
      <div class="miko-basic-demo__item">
        <span class="miko-basic-demo__label">SM (32px)</span>
        <TxMiko size="sm" :state="currentState" />
      </div>
      <div class="miko-basic-demo__item">
        <span class="miko-basic-demo__label">MD (48px)</span>
        <TxMiko size="md" :state="currentState" />
      </div>
      <div class="miko-basic-demo__item">
        <span class="miko-basic-demo__label">闪光恶魔变异体</span>
        <TxMiko size="md" demon />
      </div>
      <div class="miko-basic-demo__item">
        <span class="miko-basic-demo__label">交互 + 随机 + 突变</span>
        <TxMiko
          size="md"
          interactive
          random
          color="#199FFE"
          @state-change="onStateChange"
          @mutate="onMutate"
        />
      </div>
    </div>
    <div class="miko-basic-demo__hint">
      点击右侧 Miko 触发互动反馈；有概率突变为带恶魔犄角、蝙蝠羽翼的「闪光恶魔」。连续快速点击 4 次可触发眩晕彩蛋。
      <span v-if="lastClickedState" class="miko-basic-demo__state-tag">当前动作: {{ lastClickedState }}</span>
      <span v-if="isDemonActive" class="miko-basic-demo__state-tag is-demon-tag">✦ 闪光恶魔变异中 ✦</span>
    </div>
  </div>
</template>

<style scoped>
.miko-basic-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.miko-basic-demo__row {
  display: flex;
  align-items: flex-end;
  gap: 24px;
  flex-wrap: wrap;
}

.miko-basic-demo__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.miko-basic-demo__label {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #8b88a8);
}

.miko-basic-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #8b88a8);
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.miko-basic-demo__state-tag {
  padding: 2px 8px;
  font-size: 11px;
  border-radius: 4px;
  background: var(--tx-bg-color-overlay, rgba(255, 255, 255, 0.06));
  border: 1px solid var(--tx-border-color, rgba(255, 255, 255, 0.1));
  color: var(--tx-text-color-primary, #fff);
}

.miko-basic-demo__state-tag.is-demon-tag {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.45);
  color: #f87171;
  font-weight: 600;
}
</style>
