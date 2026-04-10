<script setup name="StoreItem" lang="ts">
import type { StorePluginListItem } from '~/composables/store/useStoreData'
import { useI18n } from 'vue-i18n'

interface StoreItemProps {
  item: StorePluginListItem
}

defineProps<StoreItemProps>()
const { t } = useI18n()
</script>

<template>
  <li class="StoreItem-Container fake-background">
    <div v-if="typeof item === 'object'">
      <h3>{{ item.name || t('store.unnamedItem') }}</h3>
      <p>{{ item.description || t('store.noDescription') }}</p>
    </div>
    <div v-else>
      {{ item }}
    </div>
  </li>
</template>

<style scoped lang="scss">
.StoreItem-Container {
  &:hover {
    box-shadow: var(--tx-box-shadow-lighter);
  }
  position: relative;

  width: 240px;
  height: 100px;

  border: 1px solid var(--tx-border-color);

  cursor: pointer;
  border-radius: 8px;
  //transition: all 0.2s ease-in-out;
}
</style>
