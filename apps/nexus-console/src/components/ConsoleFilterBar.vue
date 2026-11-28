<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { useI18n } from 'vue-i18n'

withDefaults(defineProps<{
  active?: boolean
}>(), {
  active: false,
})

const emit = defineEmits<{
  clear: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="ConsoleFilterBar">
    <div class="ConsoleFilterBar-Fields">
      <slot />
    </div>
    <div class="ConsoleFilterBar-Trailing">
      <slot name="trailing" />
      <TxButton variant="ghost" size="sm" :disabled="!active" @click="emit('clear')">
        {{ t('common.clearFilters') }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.ConsoleFilterBar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  min-width: 0;
}

.ConsoleFilterBar-Fields {
  display: flex;
  flex: 1 1 420px;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  min-width: 0;
}

.ConsoleFilterBar-Trailing {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
</style>
