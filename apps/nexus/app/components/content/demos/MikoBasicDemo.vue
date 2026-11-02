<script setup lang="ts">
import { ref } from 'vue'

const currentState = ref<'idle' | 'working' | 'thinking' | 'success'>('idle')

function toggleState() {
  const states: ('idle' | 'working' | 'thinking' | 'success')[] = ['idle', 'working', 'thinking', 'success']
  const next = (states.indexOf(currentState.value) + 1) % states.length
  currentState.value = states[next]
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
        <span class="miko-basic-demo__label">LG (64px)</span>
        <TxMiko size="lg" :state="currentState" />
      </div>
      <div class="miko-basic-demo__item">
        <span class="miko-basic-demo__label">Cyan (#199FFE)</span>
        <TxMiko size="md" color="#199FFE" :state="currentState" />
      </div>
    </div>
    <div class="miko-basic-demo__footer">
      <button class="miko-basic-demo__btn" @click="toggleState">
        切换状态 (当前: {{ currentState }})
      </button>
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

.miko-basic-demo__footer {
  margin-top: 8px;
}

.miko-basic-demo__btn {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--tx-border-color, #333);
  background: var(--tx-bg-color-overlay, #222);
  color: var(--tx-text-color-primary, #fff);
  cursor: pointer;
}
</style>
