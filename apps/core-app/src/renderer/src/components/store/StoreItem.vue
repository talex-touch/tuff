<script setup name="StoreItem" lang="ts">
import type { StorePluginListItem } from '~/composables/store/useStoreData'
interface StoreItemProps {
  item: StorePluginListItem
}

defineProps<StoreItemProps>()
</script>

<template>
  <li class="StoreItem-Container fake-background">
    <div v-if="typeof item === 'object'">
      <h3>{{ item.name || 'Unnamed Item' }}</h3>
      <p>{{ item.description || 'No description available' }}</p>
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
