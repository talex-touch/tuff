<script setup name="MarketItem" lang="ts">
interface MarketItemProps {
  item: any;
}

defineProps<MarketItemProps>()
</script>

<template>
  <li class="MarketItem-Container fake-background">
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
.MarketItem-Container {
  &:hover {
    box-shadow: var(--el-box-shadow-lighter);
  }
  position: relative;

  width: 240px;
  height: 100px;

  border: 1px solid var(--el-border-color);

  cursor: pointer;
  border-radius: 8px;
  //transition: all 0.2s ease-in-out;
}
</style>
