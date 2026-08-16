<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      hover: '悬停下划线（记录名列）',
      always: '常驻下划线（链接列）',
      external: '外部链接（带箭头）',
      idle: '尚未打开任何链接',
      opened: (href: string) => `宿主收到 open 事件：${href}`,
    }
  }

  return {
    hover: 'Hover underline (record name column)',
    always: 'Persistent underline (link column)',
    external: 'External link (with arrow)',
    idle: 'No link opened yet',
    opened: (href: string) => `Host received open: ${href}`,
  }
})

const lastOpened = ref<string | null>(null)

function onOpen(payload: { href: string }): void {
  // Nothing navigates until the host says so — that is the whole contract.
  lastOpened.value = payload.href
}
</script>

<template>
  <div class="cell-link-demo">
    <div class="cell-link-demo__row">
      <span class="cell-link-demo__caption">{{ copy.hover }}</span>
      <TxCellLink href="https://aurora-scoops.example" label="Aurora Scoops" muted @open="onOpen" />
    </div>

    <div class="cell-link-demo__row">
      <span class="cell-link-demo__caption">{{ copy.always }}</span>
      <TxCellLink href="https://kumo-creamery.example" label="kumo-creamery.example" underline="always" @open="onOpen" />
    </div>

    <div class="cell-link-demo__row">
      <span class="cell-link-demo__caption">{{ copy.external }}</span>
      <TxCellLink href="https://maple-orbit.example" label="maple-orbit.example" external @open="onOpen" />
    </div>

    <p class="cell-link-demo__readout" aria-live="polite">
      {{ lastOpened ? copy.opened(lastOpened) : copy.idle }}
    </p>
  </div>
</template>

<style scoped>
.cell-link-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.cell-link-demo__row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cell-link-demo__caption {
  font-size: 11px;
  color: var(--tx-text-color-placeholder);
}

.cell-link-demo__readout {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
