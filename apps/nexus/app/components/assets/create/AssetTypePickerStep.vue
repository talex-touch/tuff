<script setup lang="ts">
import type { AssetTypeOption } from './types'
import { TxStatusBadge } from '@talex-touch/tuffex'

const props = defineProps<{
  options: AssetTypeOption[]
}>()

const emit = defineEmits<{
  (e: 'select', option: AssetTypeOption): void
}>()

function handleSelect(option: AssetTypeOption) {
  if (option.disabled)
    return
  emit('select', option)
}
</script>

<template>
  <div class="AssetTypePickerStep">
    <TxCard variant="plain" background="mask" :radius="18" :padding="14" class="AssetTypePickerStep-CardShell">
      <div class="AssetTypePickerStep-Grid">
        <button
          v-for="option in props.options"
          :key="option.type"
          class="AssetTypePickerStep-Card"
          :class="{ disabled: option.disabled }"
          type="button"
          :disabled="option.disabled"
          @click="handleSelect(option)"
        >
          <div class="AssetTypePickerStep-CardHeader">
            <span :class="[option.icon, 'AssetTypePickerStep-Icon']" />
            <div class="AssetTypePickerStep-Tags">
              <TxStatusBadge v-if="option.beta" text="Beta" status="warning" size="sm" />
              <TxStatusBadge v-if="option.disabled" text="Locked" status="info" size="sm" />
            </div>
          </div>

          <p class="AssetTypePickerStep-Title">
            {{ option.title }}
          </p>
          <p class="AssetTypePickerStep-Desc">
            {{ option.description }}
          </p>
        </button>
      </div>
    </TxCard>
  </div>
</template>

<style scoped>
.AssetTypePickerStep {
  width: min(760px, 90vw);
  padding: 12px;
}

.AssetTypePickerStep-CardShell {
  width: 100%;
}

.AssetTypePickerStep-Grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.AssetTypePickerStep-Card {
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  padding: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

  &:hover:not(:disabled) {
    border-color: rgba(0, 0, 0, 0.2);
    transform: translateY(-2px);
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.08);
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .dark & {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);

    &:hover:not(:disabled) {
      border-color: rgba(255, 255, 255, 0.26);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.32);
    }
  }
}

.AssetTypePickerStep-CardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.AssetTypePickerStep-Icon {
  font-size: 20px;
  color: rgba(0, 0, 0, 0.7);

  .dark & {
    color: rgba(255, 255, 255, 0.76);
  }
}

.AssetTypePickerStep-Tags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.AssetTypePickerStep-Title {
  margin: 10px 0 0;
  font-size: 15px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);

  .dark & {
    color: rgba(255, 255, 255, 0.9);
  }
}

.AssetTypePickerStep-Desc {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.55);

  .dark & {
    color: rgba(255, 255, 255, 0.56);
  }
}
</style>
