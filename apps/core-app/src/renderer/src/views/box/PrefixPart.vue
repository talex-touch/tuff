<script setup lang="ts">
import RemixIcon from '~/components/icon/RemixIcon.vue'
import PrefixIcon from './PrefixIcon.vue'
import { IUseSearch } from '@renderer/modules/box/adapter/types'
import { IBoxOptions } from '@renderer/modules/box/adapter'

defineProps<{
  providers: IUseSearch['activatedProviders']['value']
  feature: IBoxOptions['data']['feature']
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'deactivate-provider', id: string): void
}>()
</script>

<template>
  <div v-if="providers && providers.length > 0" class="activated-providers-container">
    <div v-for="provider in providers" :key="provider.uniqueId" class="activated-provider-pill">
      <span>{{ provider.name || provider.uniqueId }}</span>
      <RemixIcon name="close-line" @click="emit('deactivate-provider', provider.uniqueId)" />
    </div>
  </div>
  <div v-else class="CoreBox-Icon">
    <PrefixIcon :feature="feature" @close="emit('close')" />
  </div>
</template>

<style lang="scss">
.activated-providers-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.5rem;
}

.activated-provider-pill {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background-color: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-5);
  border-radius: 999px;
  font-size: 0.8rem;
  color: var(--el-color-primary);
  white-space: nowrap;

  .remix-icon {
    cursor: pointer;
    font-size: 1rem;
  }
}

.CoreBox-Icon {
  position: relative;
  user-select: none;

  img {
    width: 52px;
    height: 52px;
  }
}
</style>
