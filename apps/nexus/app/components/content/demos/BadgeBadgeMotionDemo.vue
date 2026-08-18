<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const open = ref(true)
const count = ref(8)

const copy = computed(() => {
  if (locale.value === 'zh') {
    return { inbox: '收件箱', toggle: '弹出 / 收起', plus: '+1', minus: '-1' }
  }
  return { inbox: 'Inbox', toggle: 'Pop in / out', plus: '+1', minus: '-1' }
})
</script>

<template>
  <TxFlex align="center" gap="20px" wrap="wrap" class="badge-motion">
    <span class="badge-motion__anchor">
      <TxButton variant="secondary">
        {{ copy.inbox }}
      </TxButton>
      <TxBadge
        variant="error"
        :value="count"
        :open="open"
        class="badge-motion__badge"
      />
    </span>
    <TxFlex align="center" gap="8px">
      <TxSwitch v-model="open" />
      <span class="badge-motion__hint">{{ copy.toggle }}</span>
    </TxFlex>
    <TxFlex gap="8px">
      <TxButton size="sm" round @click="count++">
        {{ copy.plus }}
      </TxButton>
      <TxButton size="sm" round @click="count = Math.max(0, count - 1)">
        {{ copy.minus }}
      </TxButton>
    </TxFlex>
  </TxFlex>
</template>

<style scoped>
.badge-motion {
  padding: 12px 0;
}

/* The badge anchors itself: a relative wrapper + absolute placement.
   TxBadge stays a plain inline pill — positioning belongs to the consumer. */
.badge-motion__anchor {
  position: relative;
  display: inline-flex;
}

.badge-motion__badge {
  position: absolute;
  top: -8px;
  right: -10px;
  pointer-events: none;
}

.badge-motion__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
