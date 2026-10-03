<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'

/**
 * The filter row of an administrator list: labelled fields (`AdminFilterField`)
 * that wrap by width, then `#trailing` (applied-filter chips and the like) and
 * one "Clear filters" action, which stays disabled until a filter is in effect.
 */
withDefaults(defineProps<{
  /** A filter differs from its default. */
  active?: boolean
  /** Overrides the localized "Clear filters". */
  clearLabel?: string
}>(), {
  active: false,
})

const emit = defineEmits<{
  clear: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="AdminFilterBar">
    <div class="AdminFilterBar-Fields">
      <slot />
    </div>
    <div class="AdminFilterBar-Trailing">
      <slot name="trailing" />
      <TxButton variant="ghost" size="sm" :disabled="!active" @click="emit('clear')">
        {{ clearLabel || t('dashboard.sections.adminKit.filters.clear', 'Clear filters') }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.AdminFilterBar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
  min-width: 0;
}

.AdminFilterBar-Fields {
  display: flex;
  flex: 1 1 480px;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 16px;
  min-width: 0;
}

.AdminFilterBar-Trailing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
  margin-left: auto;
}
</style>
