<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const initialCount = 8
const count = ref(initialCount)
const errorDot = ref(true)

const copy = computed(() => locale.value === 'zh'
  ? { samples: '样式预览', count: '数量', state: '状态', add: '新增', decrease: '减少', reset: '重置', dot: '错误圆点' }
  : { samples: 'Variants', count: 'Count', state: 'State', add: 'Add', decrease: 'Decrease', reset: 'Reset', dot: 'Error dot' })

function resetDemo() {
  count.value = initialCount
  errorDot.value = true
}
</script>

<template>
  <div class="badge-variants">
    <div class="badge-variants__group">
      <span class="badge-variants__label">{{ copy.samples }}</span>
      <TxFlex align="center" gap="10px" wrap="wrap" class="badge-variants__samples">
        <TxBadge :value="count" />
        <TxBadge value="New" variant="primary" />
        <TxBadge value="99+" variant="success" />
        <Transition name="badge-variants-dot">
          <TxBadge v-if="errorDot" dot variant="error" />
        </Transition>
      </TxFlex>
    </div>
    <div class="badge-variants__controls">
      <div class="badge-variants__control-group">
        <span class="badge-variants__label">{{ copy.count }}</span>
        <TxFlex align="center" gap="8px">
          <TxButton size="sm" @click="count++">
            {{ copy.add }}
          </TxButton>
          <TxButton size="sm" variant="secondary" :disabled="count === 0" @click="count--">
            {{ copy.decrease }}
          </TxButton>
          <TxButton size="sm" variant="secondary" @click="resetDemo">
            {{ copy.reset }}
          </TxButton>
        </TxFlex>
      </div>
      <div class="badge-variants__control-group">
        <span class="badge-variants__label">{{ copy.state }}</span>
        <TxFlex align="center" gap="8px">
          <TxSwitch v-model="errorDot" :aria-label="copy.dot" />
          <span class="badge-variants__hint">{{ copy.dot }}</span>
        </TxFlex>
      </div>
    </div>
  </div>
</template>

<style scoped>
.badge-variants {
  display: grid;
  gap: 16px;
  padding: 12px 0;
}

.badge-variants__group,
.badge-variants__control-group {
  display: grid;
  gap: 8px;
}

.badge-variants__samples {
  min-height: 28px;
}

.badge-variants__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 16px 24px;
  padding-top: 12px;
  border-top: 1px solid var(--tx-border-color-lighter);
}

.badge-variants__label {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.badge-variants-dot-enter-active,
.badge-variants-dot-leave-active {
  transition:
    opacity 160ms ease-out,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.badge-variants-dot-enter-from,
.badge-variants-dot-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

.badge-variants__hint {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .badge-variants-dot-enter-active,
  .badge-variants-dot-leave-active {
    transition: none;
  }
}
</style>
