<script setup lang="ts">
import type { IUseSearch } from '~/modules/box/adapter/types'
import ActivatedProviders from './ActivatedProviders.vue'
import PrefixIcon from './PrefixIcon.vue'

defineProps<{
  providers: IUseSearch['activeActivations']['value']
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'deactivate-provider', id: string): void
}>()
</script>

<template>
  <div class="prefix-part-container">
    <ActivatedProviders
      v-if="providers && providers.length > 0"
      :providers="providers"
      @deactivate-provider="emit('deactivate-provider', $event)"
    />
    <div v-else class="CoreBox-Icon">
      <PrefixIcon @close="emit('close')" />
    </div>
  </div>
</template>

<style lang="scss">
.prefix-part-container {
  display: flex;
  align-items: center;
  height: 100%;
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
