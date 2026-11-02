<script setup lang="ts">
import type { MikoState } from '@talex-touch/tuffex'

const states: { state: MikoState, label: string }[] = [
  { state: 'idle', label: '待命 (Idle)' },
  { state: 'working', label: '踩奶敲代码 (Working)' },
  { state: 'thinking', label: '思考灵感 (Thinking)' },
  { state: 'success', label: '任务成功 (Success)' },
  { state: 'alert', label: '权限警觉 (Alert)' },
  { state: 'error', label: '报错震颤 (Error)' },
  { state: 'sleeping', label: '休眠蜷缩 (Sleeping)' },
  { state: 'juggling', label: '多任务抛球 (Juggling)' },
  { state: 'sweeping', label: '扫地整理 (Sweeping)' },
  { state: 'reading', label: '代码研读 (Reading)' },
  { state: 'dizzy', label: '互动眩晕 (Dizzy)' },
  { state: 'peeking', label: '边栏探头 (Peeking)' },
]
</script>

<template>
  <div class="miko-states-demo">
    <div class="miko-states-demo__grid">
      <div v-for="item in states" :key="item.state" class="miko-states-demo__card">
        <TxMiko :state="item.state" size="md" />
        <span class="miko-states-demo__label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.miko-states-demo {
  padding: 16px;
}

.miko-states-demo__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.miko-states-demo__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 8px;
  background: var(--tx-bg-color-overlay, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--tx-border-color, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
}

.miko-states-demo__label {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #8b88a8);
  text-align: center;
}
</style>
