<script setup lang="ts">
import RemixIcon from '~/components/icon/RemixIcon.vue'
import { IUseSearch } from '@renderer/modules/box/adapter/types'
import { IProviderActivate } from '@talex-touch/utils'

defineProps<{
  providers: IUseSearch['activeActivations']['value']
}>()

const emit = defineEmits<{
  (e: 'deactivate-provider', id: string): void
}>()

function getUniqueKey(provider: IProviderActivate): string {
  if (provider.id === 'plugin-features' && provider.meta?.pluginName) {
    return `${provider.id}:${provider.meta.pluginName}`
  }
  return provider.id
}
</script>

<template>
  <div class="ActivatedProvidersContainer">
    <div
      v-for="provider in providers"
      :key="getUniqueKey(provider)"
      class="activated-provider-pill"
    >
      <div class="Activated-Provider-PillBorder">
        <svg xmlns="http://www.w3.org/2000/svg" class="pill-border-svg">
          <rect class="border-bg" x="1" y="1" rx="12" />
          <rect class="border-main" x="1" y="1" rx="12" />
        </svg>
      </div>

      <div class="Activated-Provider-PillMajor fake-background">
        <PluginIcon
          :icon="provider.icon || provider.meta?.pluginIcon"
          :alt="provider.name || provider.meta?.pluginName"
        />
        <span>{{ provider.name || provider.meta?.pluginName || provider.id }}</span>
      </div>
      <div class="Activated-Provider-PillVice fake-background">
        <span v-if="provider.meta?.feature">{{ provider.meta.feature.render?.basic?.title }}</span>
        <RemixIcon
          cursor-pointer
          name="close-line"
          @click="emit('deactivate-provider', getUniqueKey(provider))"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ActivatedProvidersContainer {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.Activated-Provider-PillMajor {
  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    inset: 0;
    opacity: 0.5;
    border-radius: 12px 0 0 12px;
    background: linear-gradient(100deg, var(--el-color-primary-light-7) 95%, #0000 95%);
  }
  position: relative;
  margin-right: -0.25rem;
  padding: 0.5rem 0.5rem;

  display: flex;
  align-items: center;
  gap: 0.25rem;

  --fake-inner-opacity: 0.25;
}

.Activated-Provider-PillVice {
  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    inset: 0;
    opacity: 0.25;
    border-radius: 0 12px 12px 0;
    background: linear-gradient(-80deg, var(--el-color-primary-light-7) 90%, #0000 90%);
  }
  position: relative;
  padding: 0.5rem 0.75rem;

  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--el-color-primary);

  --fake-inner-opacity: 0.125;
}

.activated-provider-pill {
  position: relative;

  display: flex;
  align-items: center;
  font-size: 0.8rem;
  white-space: nowrap;
}

.Activated-Provider-PillBorder {
  z-index: -1;
  position: absolute;
  inset: 0;
  opacity: 0.25;
  transform: scale(1.025);
  border-radius: 12px;

  .pill-border-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .border-bg,
  .border-main {
    width: calc(100% - 2px);
    height: calc(100% - 2px);
    fill: transparent;
    stroke-width: 2;
  }

  .border-bg {
    stroke: rgba(255, 255, 255, 0.1);
  }

  .border-main {
    stroke: var(--el-color-primary);
    stroke-linecap: round;
    // 1st value: dash length. 2nd value: gap length.
    // To prevent overlap, the gap must be >= the path length (~350).
    stroke-dasharray: 200 250;
    animation: cometScroll 3s linear infinite;
    filter: drop-shadow(0 0 5px var(--el-color-primary));
    transition: all 0.3s ease;
  }
}

@keyframes cometScroll {
  from {
    stroke-dashoffset: 0;
  }
  to {
    // Animate by the total pattern length (100 + 350 = 450) for a seamless loop.
    stroke-dashoffset: -450;
  }
}
</style>
