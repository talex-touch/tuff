<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

interface Row {
  name: string
  org: string
  health: 'healthy' | 'risk' | 'unhealthy'
  ago: string
}

const rows: Row[] = [
  { name: 'Lucas Anderson', org: 'Veridian', health: 'unhealthy', ago: '5h' },
  { name: 'Amelia Carter', org: 'Orbit Works', health: 'risk', ago: '5h' },
  { name: 'Maya Patel', org: 'Northstar Labs', health: 'healthy', ago: '5h' },
  { name: 'Daniel Kim', org: 'Vertex Systems', health: 'risk', ago: '5h' },
]

const incoming: Row = { name: 'Theo Morgan', org: 'Pioneer Cloud', health: 'healthy', ago: '5h' }

const copy = computed(() => (zh.value
  ? {
      health: { healthy: '健康', risk: '有风险', unhealthy: '不健康' },
      ago: (h: string) => `${h} 前`,
      replay: '重新播放',
      aria: '最新信号',
    }
  : {
      health: { healthy: 'Healthy', risk: 'At risk', unhealthy: 'Unhealthy' },
      ago: (h: string) => `${h} ago`,
      replay: 'Replay',
      aria: 'Latest signal',
    }))

// The arrival is a demo timeline, not a component behaviour: TxToastPanel is
// controlled and only reads `open`.
const open = ref(true)

function replay() {
  open.value = false
  window.setTimeout(() => { open.value = true }, 420)
}
</script>

<template>
  <div class="toast-panel-demo">
    <div class="toast-panel-demo__window">
      <span class="toast-panel-demo__chrome">
        <i /><i /><i />
      </span>
      <ul class="toast-panel-demo__list">
        <li v-for="row in rows" :key="row.name">
          <span class="toast-panel-demo__avatar" aria-hidden="true">{{ row.name[0] }}</span>
          <span class="toast-panel-demo__who">
            <strong>{{ row.name }}</strong>
            <small>{{ row.org }}</small>
          </span>
          <span class="toast-panel-demo__health" :class="`is-${row.health}`">
            {{ copy.health[row.health] }}
          </span>
          <span class="toast-panel-demo__ago">{{ copy.ago(row.ago) }}</span>
        </li>
      </ul>
    </div>

    <TxToastPanel :open="open" :stack="1" :aria-label="copy.aria">
      <div class="toast-panel-demo__incoming">
        <span class="toast-panel-demo__avatar" aria-hidden="true">{{ incoming.name[0] }}</span>
        <span class="toast-panel-demo__who">
          <strong>{{ incoming.name }}</strong>
          <small>{{ incoming.org }}</small>
        </span>
        <span class="toast-panel-demo__ago">{{ copy.ago(incoming.ago) }}</span>
      </div>
    </TxToastPanel>

    <TxButton size="sm" variant="secondary" @click="replay">
      {{ copy.replay }}
    </TxButton>
  </div>
</template>

<style scoped>
.toast-panel-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
}

.toast-panel-demo__window {
  width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow:
    0 0 0 1px var(--tx-border-color-lighter, #ebeef5),
    4px 8px 24px rgba(0, 0, 0, 0.08);
}

.toast-panel-demo__chrome {
  display: flex;
  gap: 5px;
  padding: 9px 11px;
}

.toast-panel-demo__chrome i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tx-fill-color, #f3f4f6);
}

.toast-panel-demo__chrome i:first-child { background: #ff5f57; }
.toast-panel-demo__chrome i:nth-child(2) { background: #febc2e; }
.toast-panel-demo__chrome i:nth-child(3) { background: #28c840; }

.toast-panel-demo__list {
  margin: 0;
  padding: 0 4px 6px;
  list-style: none;
}

.toast-panel-demo__list li,
.toast-panel-demo__incoming {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 8px;
}

.toast-panel-demo__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: 7px;
  background: var(--tx-fill-color, #f3f4f6);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11px;
  font-weight: 600;
}

.toast-panel-demo__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.toast-panel-demo__who strong {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--tx-text-color-primary, #303133);
}

.toast-panel-demo__who small {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #909399);
}

.toast-panel-demo__health {
  flex: none;
  font-size: 11.5px;
}

.toast-panel-demo__health.is-healthy { color: var(--tx-color-success, #67c23a); }
.toast-panel-demo__health.is-risk { color: var(--tx-color-warning, #e6a23c); }
.toast-panel-demo__health.is-unhealthy { color: var(--tx-color-danger, #f56c6c); }

.toast-panel-demo__ago {
  flex: none;
  font-size: 11.5px;
  color: var(--tx-text-color-secondary, #909399);
  font-variant-numeric: tabular-nums;
}
</style>
