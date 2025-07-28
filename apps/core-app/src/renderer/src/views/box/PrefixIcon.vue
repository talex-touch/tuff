<script setup lang="ts">
import AppIcon from "~/assets/logo.svg";
import { SearchItem } from './search-box';

const props = defineProps<{
  feature?: SearchItem
}>()

const emits = defineEmits(['close'])

const originFeature = computed(() => props.feature?.originFeature)
</script>

<template>
  <div :class="{ feature }" class="PrefixIcon transition-cubic">
    <img class="transition-cubic" v-if="!feature" :src="AppIcon" />

    <div @click="emits('close')" v-wave v-else class="PrefixIcon-Feature fake-background cursor-pointer hover:op-75 flex gap-2 items-center transition-cubic">
      <PluginIcon v-if="originFeature" :icon="originFeature.icon" :alt="originFeature.name" />
      <span>{{ feature?.name }}</span>
      <div i-ri-close-line />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.PrefixIcon.feature img {
  transform: scale(0);
}

.PrefixIcon.feature .PrefixIcon-Feature {
  transform: scale(1)
}

.PrefixIcon-Feature {
  :deep(.PluginIcon-Container) {
    width: 1.25em;
  }
  padding: 0.25rem 0.5rem;

  border-radius: 12px;
  transform: scale(0)
}
</style>